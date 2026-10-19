import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { EmailService } from '../email/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

// How long a proof to enrol a staff authenticator lasts.
export const ENROLMENT_PROOF_TTL_MS = 24 * 60 * 60 * 1000;

// The letters of a code from an administrator: no 0/O or 1/I/L, so it can
// be read aloud and typed without doubt.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// A code as staff may type it: any case, with spaces or dashes.
function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * The one proof, beyond the password, that lets a staff identity enrol its
 * authenticator: a link sent to the staff email, or a code an administrator
 * hands over. Only its hash is kept; it works once and for 24 hours, and a
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

  // The stored password of the sign-in behind the staff email, or null.
  private async storedPassword(email: string): Promise<string | null> {
    const signIn = await this.prisma.signIn.findUnique({
      where: { email },
      select: { password: true },
    });
    return signIn?.password || null;
  }

  // A fingerprint of that stored password, made with argon2 like a password:
  // it tells whether the password changed, never what it is.
  private async passwordMark(email: string): Promise<string | null> {
    const stored = await this.storedPassword(email);
    return stored ? argon2.hash(stored) : null;
  }

  private async passwordUnchanged(email: string, mark: string) {
    const stored = await this.storedPassword(email);
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
    await this.keep(
      admin.id,
      sha256(token),
      await this.passwordMark(admin.email),
    );
    const base = (
      this.config.get<string>('ADMIN_BASE_URL') ||
      'https://admin.circlesfera.com'
    ).replace(/\/$/, '');
    await this.email.sendStaffEnrolmentEmail(
      admin.email,
      `${base}/login#enrol=${token}`,
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
   * Uses the proof given, a link token or a code. True only once, while it
   * has not expired; it is spent by the same write that checks it, so two
   * attempts at once cannot both pass.
   */
  async consume(adminId: string, proof: string): Promise<boolean> {
    const given = proof.trim();
    if (!given || given.length > 200) return false;
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
      select: {
        email: true,
        enrolmentProofHash: true,
        enrolmentProofExpiresAt: true,
        enrolmentProofPasswordMark: true,
      },
    });
    const kept = admin?.enrolmentProofHash;
    if (!kept || !admin.enrolmentProofExpiresAt) return false;
    if (admin.enrolmentProofExpiresAt <= new Date()) return false;
    const match = [sha256(given), sha256(normaliseCode(given))].find((h) =>
      timingSafeEqual(Buffer.from(h), Buffer.from(kept)),
    );
    if (!match) return false;
    // A link sent before the password changed no longer works.
    if (
      admin.enrolmentProofPasswordMark &&
      !(await this.passwordUnchanged(
        admin.email,
        admin.enrolmentProofPasswordMark,
      ))
    ) {
      return false;
    }
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
}
