import crypto from 'node:crypto';
import { ErrorCode } from '@circlesfera/shared';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { Cache } from 'cache-manager';
import { FIRST_SIGN_IN_ORDER } from '../../common/auth/sign-in-lookup.js';
import { AppException } from '../../common/errors/app.exception.js';
import { EmailService } from '../../email/email.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PasskeyService } from '../passkey/passkey.service.js';
import { passwordMatches } from '../password.util.js';

/** Who asks: the account and the sign-in of the session. */
export interface SignInSession {
  userId: string;
  signInId?: string;
}

/** The proof that goes with creating or removing a way to sign in. */
export interface SignInProof {
  currentPassword?: string;
  passkeyAssertion?: Record<string, unknown>;
}

// How many new sign-ins one person may create.
export const NEW_SIGN_INS_PER_HOUR = 1;
export const NEW_SIGN_INS_PER_DAY = 5;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// How each Profile of a person signs in, and the two changes a person can
// make: give a Profile an email and a password of its own, or take it back
// to a sign-in it shares. The identity behind stays one.
@Injectable()
export class SignInsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmailService) private readonly emailService: EmailService,
    @Inject(PasskeyService) private readonly passkeys: PasskeyService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** Each Profile of the person with the sign-in it uses. */
  async list(session: SignInSession) {
    const profiles = await this.prisma.profile.findMany({
      where: { userId: session.userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        username: true,
        signIn: {
          select: {
            id: true,
            email: true,
            emailVerified: true,
            _count: { select: { profiles: true } },
          },
        },
      },
    });
    return profiles.map((profile) => ({
      profileId: profile.id,
      username: profile.username,
      signIn: profile.signIn
        ? {
            id: profile.signIn.id,
            email: profile.signIn.email,
            emailVerified: !!profile.signIn.emailVerified,
            // Its own when no other Profile signs in with it.
            shared: profile.signIn._count.profiles > 1,
            // The one this session was opened with.
            current: profile.signIn.id === session.signInId,
          }
        : null,
    }));
  }

  /** Gives a Profile an email and a password of its own. */
  async giveOwn(
    session: SignInSession,
    input: { profileId: string; email: string; password: string },
    proof: SignInProof,
  ) {
    await this.assertProof(session, proof);

    const profile = await this.prisma.profile.findFirst({
      where: { id: input.profileId, userId: session.userId },
      select: {
        id: true,
        signIn: { select: { _count: { select: { profiles: true } } } },
      },
    });
    if (!profile) {
      throw AppException.NotFound(ErrorCode.SIGN_IN_NOT_FOUND);
    }
    // A sign-in no other Profile uses is already its own: giving it another
    // would leave the first with nobody, and the session with it.
    if (!profile.signIn || profile.signIn._count.profiles <= 1) {
      throw AppException.Conflict(ErrorCode.SIGN_IN_ALREADY_OWN);
    }

    const email = input.email.trim().toLowerCase();
    await this.assertEmailFree(email);
    await this.assertWithinLimit(session.userId);

    const password = await argon2.hash(input.password);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    try {
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.signIn.create({
          data: {
            userId: session.userId,
            email,
            password,
            verificationToken,
          },
          select: { id: true },
        });
        await tx.profile.update({
          where: { id: profile.id },
          data: { signInId: created.id },
        });
      });
    } catch (error) {
      // Two requests for the same address at once: the second finds it taken.
      if ((error as { code?: string }).code === 'P2002') {
        throw AppException.Conflict(ErrorCode.SIGN_IN_EMAIL_TAKEN);
      }
      throw error;
    }

    await this.countNewSignIn(session.userId);
    await this.emailService.sendVerificationEmail(email, verificationToken);

    return this.list(session);
  }

  /** Takes a Profile back to a sign-in of the same person. */
  async share(
    session: SignInSession,
    input: { profileId: string; signInId: string },
    proof: SignInProof,
  ) {
    await this.assertProof(session, proof);

    const [profile, target] = await Promise.all([
      this.prisma.profile.findFirst({
        where: { id: input.profileId, userId: session.userId },
        select: { id: true, signInId: true },
      }),
      // Looked for inside the account: a sign-in of someone else is not found.
      this.prisma.signIn.findFirst({
        where: { id: input.signInId, userId: session.userId },
        select: { id: true },
      }),
    ]);
    if (!profile || !target) {
      throw AppException.NotFound(ErrorCode.SIGN_IN_NOT_FOUND);
    }
    if (profile.signInId === target.id) {
      return this.list(session);
    }

    const left = profile.signInId;
    await this.prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profile.id },
        data: { signInId: target.id },
      });
      // A sign-in left with no Profile goes, with its sessions, its passkeys
      // and its second step. The one just chosen always stays.
      if (left) {
        await tx.signIn.deleteMany({
          where: {
            id: left,
            userId: session.userId,
            profiles: { none: {} },
          },
        });
      }
    });

    return this.list(session);
  }

  // A session alone is not enough to create or remove a way to sign in.
  private async assertProof(session: SignInSession, proof: SignInProof) {
    if (!proof.currentPassword && !proof.passkeyAssertion) {
      throw AppException.BadRequest(ErrorCode.SIGN_IN_PROOF_REQUIRED);
    }
    const signIn = await this.prisma.signIn.findFirst({
      where: {
        userId: session.userId,
        ...(session.signInId && { id: session.signInId }),
      },
      orderBy: FIRST_SIGN_IN_ORDER,
      select: { id: true, email: true, password: true },
    });
    if (!signIn) {
      throw AppException.BadRequest(ErrorCode.SIGN_IN_PROOF_INVALID);
    }

    const proven = proof.currentPassword
      ? await passwordMatches(signIn.password, proof.currentPassword)
      : await this.passkeys.provesSignIn(
          { userId: session.userId, signInId: signIn.id, email: signIn.email },
          proof.passkeyAssertion,
        );
    if (!proven) {
      // Not 401: the session is fine, it is the proof that is not. Not 403
      // either: the app answers a 403 by renewing its write token and
      // sending the request again, which would try the wrong proof twice.
      throw AppException.BadRequest(ErrorCode.SIGN_IN_PROOF_INVALID);
    }
  }

  // The answer never says whose the address is.
  private async assertEmailFree(email: string) {
    const [signIn, account] = await Promise.all([
      this.prisma.signIn.findUnique({
        where: { email },
        select: { id: true },
      }),
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);
    if (signIn || account) {
      throw AppException.Conflict(ErrorCode.SIGN_IN_EMAIL_TAKEN);
    }
  }

  private hourKey(userId: string) {
    return `sign-ins:new:hour:${userId}`;
  }

  private dayKey(userId: string) {
    return `sign-ins:new:day:${userId}`;
  }

  // Each new sign-in sends an email to an address the person typed, so the
  // route must not serve to write to strangers.
  private async assertWithinLimit(userId: string) {
    const [hour, day] = await Promise.all([
      this.cache.get<number>(this.hourKey(userId)),
      this.cache.get<number>(this.dayKey(userId)),
    ]);
    if ((hour ?? 0) >= NEW_SIGN_INS_PER_HOUR) {
      throw this.limitReached(HOUR_MS);
    }
    if ((day ?? 0) >= NEW_SIGN_INS_PER_DAY) {
      throw this.limitReached(DAY_MS);
    }
  }

  private limitReached(windowMs: number) {
    return new AppException(
      ErrorCode.SIGN_IN_LIMIT_REACHED,
      HttpStatus.TOO_MANY_REQUESTS,
      undefined,
      { retryAfterSeconds: Math.ceil(windowMs / 1000) },
    );
  }

  private async countNewSignIn(userId: string) {
    const [hour, day] = await Promise.all([
      this.cache.get<number>(this.hourKey(userId)),
      this.cache.get<number>(this.dayKey(userId)),
    ]);
    await Promise.all([
      this.cache.set(this.hourKey(userId), (hour ?? 0) + 1, HOUR_MS),
      this.cache.set(this.dayKey(userId), (day ?? 0) + 1, DAY_MS),
    ]);
  }
}
