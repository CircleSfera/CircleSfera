import { ErrorCode } from '@circlesfera/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatorTransport,
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  VerifyAuthenticationResponseOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  getAssurancePolicy,
  type PasskeySensitivity,
  parseWebAuthnConfig,
} from './passkey.config.js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from './simplewebauthn.js';

const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Passkeys an account may register. One synced passkey covers a whole device
// ecosystem, so a few cover phones, computers and a hardware key.
export const MAX_PASSKEYS_PER_ACCOUNT = 5;

function passkeyLimitReached(): AppException {
  return AppException.Conflict(
    ErrorCode.PASSKEY_LIMIT_REACHED,
    'Passkey limit reached',
    { max: MAX_PASSKEYS_PER_ACCOUNT },
  );
}

function extractChallengeFromClientResponse(
  body: unknown,
  fallbackChallenge?: string | null,
): string | null {
  if (!body || typeof body !== 'object') {
    return fallbackChallenge || null;
  }
  const anyBody = body as {
    response?: { clientDataJSON?: string };
    clientDataJSON?: string;
    challenge?: string;
  };
  if (anyBody.challenge && typeof anyBody.challenge === 'string') {
    return anyBody.challenge;
  }
  const clientDataJSON =
    anyBody.response?.clientDataJSON || anyBody.clientDataJSON;

  if (clientDataJSON && typeof clientDataJSON === 'string') {
    try {
      const raw = Buffer.from(clientDataJSON, 'base64url').toString('utf8');
      const parsed = JSON.parse(raw);
      if (typeof parsed.challenge === 'string') {
        return parsed.challenge;
      }
    } catch {
      // ignore parsing error and fallback
    }
  }

  return fallbackChallenge || null;
}

// Service for FIDO2/WebAuthn passkey registration and authentication.
// Uses @simplewebauthn/server for challenge generation and verification.
@Injectable()
export class PasskeyService {
  private readonly logger = new Logger(PasskeyService.name);
  private readonly rpName: string;
  private readonly rpID: string;
  private readonly origin: string | string[];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    const config = parseWebAuthnConfig(this.configService);
    this.rpID = config.rpID;
    this.rpName = config.rpName;
    this.origin = config.origin;
  }

  // The first sign-in of an account: the one its Profiles share, and the one
  // the passkeys of a signed-in person belong to.
  private async firstSignInOf(
    userId: string,
  ): Promise<{ id: string; email: string } | null> {
    return this.prisma.signIn.findFirst({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, email: true },
    });
  }

  // The sign-in an identifier names, by its email or through the Profile
  // with that username, with its own passkeys and the account behind it.
  // Nothing when there is no such sign-in or its account is missing.
  private async signInFor(identifier: string): Promise<{
    id: string;
    signInId: string;
    passkeys: {
      id: string;
      credentialID: string;
      publicKey: Buffer;
      counter: bigint | number;
      transports: AuthenticatorTransport[];
    }[];
    currentChallenge?: string | null;
  } | null> {
    const withPasskeys = {
      include: {
        passkeys: true,
        user: { omit: { currentChallenge: false } },
      },
    } as const;
    let signIn = await this.prisma.signIn.findUnique({
      where: { email: identifier },
      ...withPasskeys,
    });
    if (!signIn) {
      const profile = await this.prisma.profile.findFirst({
        where: { username: identifier },
        select: { signIn: withPasskeys },
      });
      signIn = profile?.signIn ?? null;
    }
    if (!signIn?.user) return null;
    return {
      id: signIn.userId,
      signInId: signIn.id,
      passkeys: signIn.passkeys as never,
      currentChallenge: signIn.user.currentChallenge,
    };
  }

  private async consumeChallenge(
    challenge: string,
    expectedUserId: string,
    expectedScope: 'REGISTRATION' | 'AUTHENTICATION',
    existingUserCurrentChallenge?: string | null,
  ): Promise<{ challenge: string; isSensitive: boolean }> {
    const prisma = this.prisma as any;

    const executeConsumption = async (tx: any) => {
      let record: any = null;
      if (tx.passkeyChallenge) {
        record = await tx.passkeyChallenge.findUnique({
          where: { challenge },
        });
      }

      if (!record) {
        if (existingUserCurrentChallenge === challenge) {
          await tx.user.update({
            where: { id: expectedUserId },
            data: { currentChallenge: null },
          });
          return { challenge, isSensitive: false };
        }
        // Fallback for legacy single-slot User.currentChallenge during transition
        const user = await tx.user.findUnique({
          where: { id: expectedUserId },
          omit: { currentChallenge: false },
        });
        if (user?.currentChallenge === challenge) {
          await tx.user.update({
            where: { id: expectedUserId },
            data: { currentChallenge: null },
          });
          return { challenge, isSensitive: false };
        }
        throw new BadRequestException(
          'Challenge not found or already consumed',
        );
      }

      if (record.userId !== expectedUserId) {
        throw new BadRequestException('Challenge user mismatch');
      }

      const scopePrefix = `${expectedScope}`;
      if (
        record.scope !== scopePrefix &&
        !record.scope.startsWith(`${scopePrefix}:`)
      ) {
        throw new BadRequestException(
          `Challenge scope mismatch: expected ${expectedScope}, got ${record.scope}`,
        );
      }

      if (
        record.expiresAt &&
        new Date(record.expiresAt).getTime() < Date.now()
      ) {
        await tx.passkeyChallenge
          .delete({ where: { id: record.id } })
          .catch(() => undefined);
        throw new BadRequestException('Challenge has expired');
      }

      // Atomically consume (delete single-use record)
      await tx.passkeyChallenge.delete({
        where: { id: record.id },
      });

      const isSensitive =
        typeof record.scope === 'string' && record.scope.includes(':SENSITIVE');

      return { challenge: record.challenge, isSensitive };
    };

    if (typeof prisma.$transaction === 'function') {
      return prisma.$transaction(executeConsumption);
    }
    return executeConsumption(prisma);
  }

  // Generate WebAuthn registration options (challenge) for a user.
  // Stores a short-lived scoped challenge record for later verification.
  // Param userId: The authenticated user's ID
  // Throws NotFoundException if user not found
  async generateRegistrationOptions(
    userId: string,
    sensitivity: PasskeySensitivity = 'sensitive',
  ) {
    const signIn = await this.firstSignInOf(userId);
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profiles: true,
        // Those of the sign-in: what it may not register twice, and its limit.
        passkeys: { where: { signInId: signIn?.id ?? null } },
      },
    })) as unknown as {
      id: string;
      email: string;
      profiles?: { username?: string | null; fullName?: string | null }[];
      passkeys: {
        id: string;
        credentialID: string;
        publicKey: Buffer;
        counter: bigint | number;
        transports: AuthenticatorTransport[];
      }[];
      currentChallenge?: string | null;
    } | null;

    if (!user || !signIn) {
      throw new NotFoundException('User not found');
    }
    if (user.passkeys.length >= MAX_PASSKEYS_PER_ACCOUNT) {
      throw passkeyLimitReached();
    }

    const primaryProfile = user.profiles?.[0];
    const policy = getAssurancePolicy(sensitivity);

    const options: GenerateRegistrationOptionsOpts = {
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(user.id),
      userName: primaryProfile?.username || signIn.email,
      userDisplayName: primaryProfile?.fullName || signIn.email,
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((pk) => ({
        id: pk.credentialID,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: policy.userVerification,
      },
    };

    const registrationOptions = await generateRegistrationOptions(options);

    const scope =
      sensitivity === 'sensitive' ? 'REGISTRATION:SENSITIVE' : 'REGISTRATION';

    const prisma = this.prisma as any;
    if (prisma.passkeyChallenge) {
      await prisma.passkeyChallenge.create({
        data: {
          userId,
          signInId: signIn.id,
          scope,
          challenge: registrationOptions.challenge,
          expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
        },
      });
    }

    // Retain User.currentChallenge for backwards compatibility
    await this.prisma.user.update({
      where: { id: userId },
      data: { currentChallenge: registrationOptions.challenge },
    });

    return registrationOptions;
  }

  // Verify a WebAuthn registration response, storing the new passkey credential.
  // Param userId: The authenticated user's ID
  // Param body: The registration response from the client
  // Returns `{ verified: boolean, userVerified: boolean }`
  // Throws BadRequestException if challenge missing or verification fails
  async verifyRegistration(userId: string, body: unknown) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { currentChallenge: false },
    })) as unknown as { currentChallenge?: string | null } | null;

    const challenge = extractChallengeFromClientResponse(
      body,
      user?.currentChallenge,
    );

    if (!challenge) {
      throw new BadRequestException('Registration challenge not found');
    }

    const consumed = await this.consumeChallenge(
      challenge,
      userId,
      'REGISTRATION',
      user?.currentChallenge,
    );

    const opts: VerifyRegistrationResponseOpts = {
      response: body as VerifyRegistrationResponseOpts['response'],
      expectedChallenge: consumed.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: consumed.isSensitive,
    };

    try {
      const verification = await verifyRegistrationResponse(opts);

      if (verification.verified && verification.registrationInfo) {
        const { credential } = verification.registrationInfo;
        const { id, publicKey, counter } = credential;
        const userVerified =
          verification.registrationInfo.userVerified !== undefined
            ? verification.registrationInfo.userVerified
            : true;

        if (consumed.isSensitive && userVerified === false) {
          throw new BadRequestException(
            'User verification is required for sensitive operations',
          );
        }

        const signIn = await this.firstSignInOf(userId);
        if (!signIn) {
          throw new BadRequestException('Sign-in not found');
        }
        await this.storePasskeyWithinLimit(userId, {
          userId,
          signInId: signIn.id,
          credentialID: id,
          publicKey: Buffer.from(publicKey),
          counter: BigInt(counter),
          transports:
            (
              body as {
                response: { transports?: AuthenticatorTransport[] };
              }
            ).response.transports || [],
        });

        return { verified: true, userVerified };
      }

      return { verified: false };
    } catch (error: unknown) {
      if (error instanceof AppException) throw error;
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Passkey registration failed: ${message}`);
    }
  }

  // Stores a verified passkey unless the account is already at the limit.
  // The account row is updated first, which locks it until the transaction
  // ends, so simultaneous registrations for one account are counted in turn.
  private async storePasskeyWithinLimit(
    userId: string,
    data: {
      userId: string;
      signInId: string;
      credentialID: string;
      publicKey: Buffer;
      counter: bigint;
      transports: AuthenticatorTransport[];
    },
  ): Promise<void> {
    const prisma = this.prisma as any;
    const store = async (tx: any) => {
      await tx.user.update({
        where: { id: userId },
        data: { currentChallenge: null },
      });
      const registered = await tx.passkey.count({
        where: { signInId: data.signInId },
      });
      if (registered >= MAX_PASSKEYS_PER_ACCOUNT) {
        throw passkeyLimitReached();
      }
      await tx.passkey.create({ data });
    };

    if (typeof prisma.$transaction === 'function') {
      await prisma.$transaction(store);
      return;
    }
    await store(prisma);
  }

  // Generate WebAuthn authentication options (challenge) for login.
  // Param email: The user's email address
  // Throws NotFoundException if user not found
  async generateAuthenticationOptions(
    identifier: string,
    sensitivity: PasskeySensitivity = 'standard',
  ) {
    const user = await this.signInFor(identifier);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const policy = getAssurancePolicy(sensitivity);

    const opts: GenerateAuthenticationOptionsOpts = {
      rpID: this.rpID,
      allowCredentials: user.passkeys.map((pk) => ({
        id: pk.credentialID,
        type: 'public-key' as const,
        transports: pk.transports || [],
      })),
      userVerification: policy.userVerification,
    };

    const authenticationOptions = await generateAuthenticationOptions(opts);

    const scope =
      sensitivity === 'sensitive'
        ? 'AUTHENTICATION:SENSITIVE'
        : 'AUTHENTICATION';

    const prisma = this.prisma as any;
    if (prisma.passkeyChallenge) {
      await prisma.passkeyChallenge.create({
        data: {
          userId: user.id,
          signInId: user.signInId,
          scope,
          challenge: authenticationOptions.challenge,
          expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
        },
      });
    }

    // Store challenge
    await this.prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: authenticationOptions.challenge },
    });

    return authenticationOptions;
  }

  // Verify a WebAuthn authentication response for passwordless login or sensitive operation.
  // Updates the passkey counter on success.
  // Param identifier: The user's email or username
  // Param body: The authentication response from the client
  // Returns `{ verified: boolean, userId?: string, userVerified?: boolean }`
  // Throws BadRequestException if challenge missing, passkey not found, or verification fails
  async verifyAuthentication(identifier: string, body: unknown) {
    const user = await this.signInFor(identifier);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const challenge = extractChallengeFromClientResponse(
      body,
      user.currentChallenge,
    );

    if (!challenge) {
      throw new BadRequestException('Authentication challenge not found');
    }

    const consumed = await this.consumeChallenge(
      challenge,
      user.id,
      'AUTHENTICATION',
      user.currentChallenge,
    );

    const passkey = user.passkeys.find(
      (pk) => pk.credentialID === (body as { id: string }).id,
    );
    if (!passkey) {
      throw new BadRequestException('Passkey not found');
    }

    const opts: VerifyAuthenticationResponseOpts = {
      response: body as VerifyAuthenticationResponseOpts['response'],
      expectedChallenge: consumed.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: consumed.isSensitive,
      credential: {
        id: passkey.credentialID,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
    };

    try {
      const verification = await verifyAuthenticationResponse(opts);

      if (verification.verified) {
        const userVerified =
          verification.authenticationInfo?.userVerified !== undefined
            ? verification.authenticationInfo.userVerified
            : true;

        if (consumed.isSensitive && userVerified === false) {
          throw new BadRequestException(
            'User verification is required for sensitive operations',
          );
        }

        // Update counter
        const prisma = this.prisma as unknown as {
          passkey: {
            update: (args: {
              where: { credentialID: string };
              data: { counter: bigint };
            }) => Promise<any>;
          };
        };

        await prisma.passkey.update({
          where: {
            credentialID: passkey.credentialID,
          },
          data: {
            counter: BigInt(verification.authenticationInfo.newCounter),
          },
        });

        // Clear challenge
        await this.prisma.user.update({
          where: { id: user.id },
          data: { currentChallenge: null },
        });

        return {
          verified: true,
          userId: user.id,
          signInId: user.signInId,
          userVerified,
        };
      }

      this.logger.warn('Passkey verification failed: verified is false');
      return { verified: false };
    } catch (error: unknown) {
      this.logger.error('Passkey authentication exception', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Passkey authentication failed: ${message}`,
      );
    }
  }

  // Whether a passkey answer proves the person behind a session: verified,
  // with user verification (biometric or PIN), by a passkey of that same
  // sign-in. Anything else, and any failure, is a no.
  async provesSignIn(
    session: { userId: string; signInId: string; email: string },
    authenticationResponse: unknown,
  ): Promise<boolean> {
    try {
      const stepUp = await this.verifyAuthentication(
        session.email,
        authenticationResponse,
      );
      return (
        stepUp.verified === true &&
        stepUp.userId === session.userId &&
        stepUp.signInId === session.signInId &&
        stepUp.userVerified === true
      );
    } catch {
      return false;
    }
  }

  // List all registered passkeys for a user (returns safe fields only).
  async getUserPasskeys(userId: string) {
    // Those of the sign-in the person uses: the first of the account.
    const signIn = await this.firstSignInOf(userId);
    if (!signIn) return [];
    return this.prisma.passkey.findMany({
      where: { userId, signInId: signIn.id },
      select: {
        id: true,
        credentialID: true,
        transports: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Step-up for a signed-in user: sensitive authentication options (biometric
  // or PIN required) bound to that user's own passkeys.
  async generateStepUpOptions(userId: string, signInId?: string) {
    return this.generateAuthenticationOptions(
      await this.getEmailForStepUp(userId, signInId),
      'sensitive',
    );
  }

  // The email of the sign-in of the session, looked for inside its account;
  // the first sign-in of the account for a session that names none.
  private async getEmailForStepUp(
    userId: string,
    signInId?: string,
  ): Promise<string> {
    const signIn = signInId
      ? await this.prisma.signIn.findFirst({
          where: { id: signInId, userId },
          select: { id: true, email: true },
        })
      : await this.firstSignInOf(userId);
    if (!signIn?.email) {
      throw new NotFoundException('User not found');
    }
    return signIn.email;
  }

  // Delete a passkey by its ID (only if it belongs to the user). Requires a
  // fresh passkey assertion with user verification from the same user, so a
  // stolen session alone cannot remove credentials.
  async deletePasskey(
    userId: string,
    passkeyId: string,
    authenticationResponse: unknown,
  ) {
    const owned = await (
      this.prisma as unknown as {
        passkey: {
          findUnique: (args: {
            where: { id: string };
          }) => Promise<{ id: string; userId: string } | null>;
        };
      }
    ).passkey.findUnique({
      where: { id: passkeyId },
    });

    if (!owned || owned.userId !== userId) {
      throw new NotFoundException('Passkey not found');
    }

    const stepUp = await this.verifyAuthentication(
      await this.getEmailForStepUp(userId),
      authenticationResponse,
    );
    if (
      !stepUp.verified ||
      stepUp.userId !== userId ||
      stepUp.userVerified !== true
    ) {
      throw new UnauthorizedException(
        'Confirm with your passkey (biometric or PIN) to remove a passkey',
      );
    }

    return this.removePasskey(userId, passkeyId);
  }

  private async removePasskey(userId: string, passkeyId: string) {
    // deleteMany scoped to the owner: a concurrent change cannot make this
    // remove someone else's credential.
    const { count } = await (
      this.prisma as unknown as {
        passkey: {
          deleteMany: (args: {
            where: { id: string; userId: string };
          }) => Promise<{ count: number }>;
        };
      }
    ).passkey.deleteMany({
      where: { id: passkeyId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Passkey not found');
    }

    return { deleted: true };
  }
}
