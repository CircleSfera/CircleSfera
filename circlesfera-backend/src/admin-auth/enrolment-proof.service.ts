import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { hasOwnStaffPassword } from '../admin/staff-password.constants.js';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// How long a proof to enrol a staff authenticator lasts.
export const ENROLMENT_PROOF_TTL_MS = 24 * 60 * 60 * 1000;

// The letters of a code from an administrator: no 0/O or 1/I/L, so it can
// be read aloud and typed without doubt.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

// What tells whether the password an identity signs in with has changed.
type StaffCredential = {
  email: string;
  passwordHash?: string | null;
  passwordSetAt?: Date | null;
  linkedUserId?: string | null;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// A code as staff may type it: any case, with spaces or dashes.
function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * The one proof that lets a staff identity set up its access (a password of
 * its own, and for a member of staff an authenticator), or enrol an
 * authenticator after signing in: a link sent to the staff email, or a code
 * an administrator hands over. Only its hash is kept; it works once and for 24 hours, and a
 * new proof replaces the previous one.
 */
@Injectable()
export class EnrolmentProofService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly email: EmailService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private async keep(
    adminId: string,
    hash: string,
    passwordMark: string | null,
  ): Promise<void> {
    await this.prisma.adminIdentity.update({
      where: { id: adminId },
      data: {
        enrolmentProofHash: hash,
        enrolmentProofExpiresAt: new Date(Date.now() + ENROLMENT_PROOF_TTL_MS),
        enrolmentProofPasswordMark: passwordMark,
      },
    });
  }

  // The stored password the identity signs in with, or null: its own staff
  // password, or, until it sets one, the one of the sign-in behind the staff
  // email when that sign-in belongs to its linked account (the old way).
  private async storedPassword(admin: StaffCredential): Promise<string | null> {
    if (hasOwnStaffPassword(admin)) {
      return admin.passwordHash ?? null;
    }
    if (!admin.linkedUserId) return null;
    const signIn = await this.prisma.signIn.findUnique({
      where: { email: admin.email },
      select: { userId: true, password: true },
    });
    return signIn?.userId === admin.linkedUserId
      ? signIn.password || null
      : null;
  }

  // A fingerprint of that stored password, made with argon2 like a password:
  // it tells whether the password changed, never what it is.
  private async passwordMark(admin: StaffCredential): Promise<string | null> {
    const stored = await this.storedPassword(admin);
    return stored ? argon2.hash(stored) : null;
  }

  private async passwordUnchanged(admin: StaffCredential, mark: string) {
    const stored = await this.storedPassword(admin);
    if (!stored) return false;
    try {
      return await argon2.verify(mark, stored);
    } catch {
      return false;
    }
  }

  /**
   * Sends a new link to the staff email. The token goes after a `#`, so it
   * never reaches a server log or the address the app reports on errors,
   * and the link stops working if the password changes after it is sent.
   */
  async sendLink(admin: { id: string; email: string }): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const current = await this.prisma.adminIdentity.findUnique({
      where: { id: admin.id },
      select: { passwordHash: true, passwordSetAt: true, linkedUserId: true },
    });
    await this.keep(
      admin.id,
      sha256(token),
      await this.passwordMark({
        email: admin.email,
        passwordHash: current?.passwordHash,
        passwordSetAt: current?.passwordSetAt,
        linkedUserId: current?.linkedUserId,
      }),
    );
    const base = (
      this.config.get<string>('ADMIN_BASE_URL') ||
      'https://admin.circlesfera.com'
    ).replace(/\/$/, '');
    await this.email.sendStaffEnrolmentEmail(
      admin.email,
      // The email fills in the form the link opens; it is the person's own.
      `${base}/login#${new URLSearchParams({ enrol: token, email: admin.email })}`,
    );
  }

  /** A new code for an administrator to hand over; shown only this once. */
  async issueCode(adminId: string): Promise<string> {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    }
    await this.keep(adminId, sha256(code), null);
    return code.match(/.{4}/g)?.join('-') ?? code;
  }

  /**
   * Checks the proof given, a link token or a code, without spending it:
   * what it matches while it has not expired, or null. A link sent before
   * the password changed matches nothing.
   */
  async check(adminId: string, proof: string): Promise<string | null> {
    const given = proof.trim();
    if (!given || given.length > 200) return null;
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
      select: {
        email: true,
        passwordHash: true,
        passwordSetAt: true,
        linkedUserId: true,
        enrolmentProofHash: true,
        enrolmentProofExpiresAt: true,
        enrolmentProofPasswordMark: true,
      },
    });
    const kept = admin?.enrolmentProofHash;
    if (!kept || !admin.enrolmentProofExpiresAt) return null;
    if (admin.enrolmentProofExpiresAt <= new Date()) return null;
    const match = [sha256(given), sha256(normaliseCode(given))].find((h) =>
      timingSafeEqual(Buffer.from(h), Buffer.from(kept)),
    );
    if (!match) return null;
    if (
      admin.enrolmentProofPasswordMark &&
      !(await this.passwordUnchanged(admin, admin.enrolmentProofPasswordMark))
    ) {
      return null;
    }
    return match;
  }

  /**
   * Spends a proof that check matched. True only for the one attempt whose
   * write finds it still kept and unexpired, so two attempts at once cannot
   * both pass.
   */
  async spend(adminId: string, match: string): Promise<boolean> {
    const spent = await this.prisma.adminIdentity.updateMany({
      where: {
        id: adminId,
        enrolmentProofHash: match,
        enrolmentProofExpiresAt: { gt: new Date() },
      },
      data: {
        enrolmentProofHash: null,
        enrolmentProofExpiresAt: null,
        enrolmentProofPasswordMark: null,
      },
    });
    return spent.count === 1;
  }

  /** Checks the proof given and spends it: true only once. */
  async consume(adminId: string, proof: string): Promise<boolean> {
    const match = await this.check(adminId, proof);
    return match ? this.spend(adminId, match) : false;
  }
}
