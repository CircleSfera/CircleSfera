import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatorTransport,
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  VerifyAuthenticationResponseOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from './simplewebauthn.js';

const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
  private readonly rpName = 'CircleSfera';
  private readonly rpID: string;
  private readonly origin: string;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    this.rpID = this.configService.get<string>('WEBAUTHN_RP_ID') || 'localhost';
    this.origin =
      this.configService.get<string>('WEBAUTHN_ORIGIN') ||
      'http://localhost:5173';
  }

  private async consumeChallenge(
    challenge: string,
    expectedUserId: string,
    expectedScope: 'REGISTRATION' | 'AUTHENTICATION',
    existingUserCurrentChallenge?: string | null,
  ): Promise<string> {
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
          return challenge;
        }
        // Fallback for legacy single-slot User.currentChallenge during transition
        const user = await tx.user.findUnique({
          where: { id: expectedUserId },
        });
        if (user?.currentChallenge === challenge) {
          await tx.user.update({
            where: { id: expectedUserId },
            data: { currentChallenge: null },
          });
          return challenge;
        }
        throw new BadRequestException(
          'Challenge not found or already consumed',
        );
      }

      if (record.userId !== expectedUserId) {
        throw new BadRequestException('Challenge user mismatch');
      }

      if (record.scope !== expectedScope) {
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

      return record.challenge;
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
  async generateRegistrationOptions(userId: string) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profiles: true,
        passkeys: true,
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

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const primaryProfile = user.profiles?.[0];

    const options: GenerateRegistrationOptionsOpts = {
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(user.id),
      userName: primaryProfile?.username || user.email,
      userDisplayName: primaryProfile?.fullName || user.email,
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((pk) => ({
        id: pk.credentialID,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    };

    const registrationOptions = await generateRegistrationOptions(options);

    const prisma = this.prisma as any;
    if (prisma.passkeyChallenge) {
      await prisma.passkeyChallenge.create({
        data: {
          userId,
          scope: 'REGISTRATION',
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
  // Returns `{ verified: boolean }`
  // Throws BadRequestException if challenge missing or verification fails
  async verifyRegistration(userId: string, body: unknown) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
    })) as unknown as { currentChallenge?: string | null } | null;

    const challenge = extractChallengeFromClientResponse(
      body,
      user?.currentChallenge,
    );

    if (!challenge) {
      throw new BadRequestException('Registration challenge not found');
    }

    const expectedChallenge = await this.consumeChallenge(
      challenge,
      userId,
      'REGISTRATION',
      user?.currentChallenge,
    );

    const opts: VerifyRegistrationResponseOpts = {
      response: body as VerifyRegistrationResponseOpts['response'],
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
    };

    try {
      const verification = await verifyRegistrationResponse(opts);

      if (verification.verified && verification.registrationInfo) {
        const { credential } = verification.registrationInfo;
        const { id, publicKey, counter } = credential;

        const prisma = this.prisma as unknown as {
          passkey: {
            create: (args: {
              data: {
                userId: string;
                credentialID: string;
                publicKey: Buffer;
                counter: bigint;
                transports: AuthenticatorTransport[];
              };
            }) => Promise<any>;
          };
        };

        await prisma.passkey.create({
          data: {
            userId,
            credentialID: id,
            publicKey: Buffer.from(publicKey),
            counter: BigInt(counter),
            transports:
              (
                body as {
                  response: { transports?: AuthenticatorTransport[] };
                }
              ).response.transports || [],
          },
        });

        await this.prisma.user.update({
          where: { id: userId },
          data: { currentChallenge: null },
        });

        return { verified: true };
      }

      return { verified: false };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(`Passkey registration failed: ${message}`);
    }
  }

  // Generate WebAuthn authentication options (challenge) for login.
  // Param email: The user's email address
  // Throws NotFoundException if user not found
  async generateAuthenticationOptions(identifier: string) {
    const user = (await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { profiles: { some: { username: identifier } } },
        ],
      },
      include: {
        passkeys: true,
      },
    })) as unknown as {
      id: string;
      passkeys: {
        credentialID: string;
        transports?: AuthenticatorTransport[];
      }[];
      currentChallenge?: string | null;
    } | null;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const opts: GenerateAuthenticationOptionsOpts = {
      rpID: this.rpID,
      allowCredentials: user.passkeys.map((pk) => ({
        id: pk.credentialID,
        type: 'public-key' as const,
        transports: pk.transports || [],
      })),
      userVerification: 'preferred',
    };

    const authenticationOptions = await generateAuthenticationOptions(opts);

    const prisma = this.prisma as any;
    if (prisma.passkeyChallenge) {
      await prisma.passkeyChallenge.create({
        data: {
          userId: user.id,
          scope: 'AUTHENTICATION',
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

  // Verify a WebAuthn authentication response for passwordless login.
  // Updates the passkey counter on success.
  // Param email: The user's email address
  // Param body: The authentication response from the client
  // Returns `{ verified: boolean, userId?: string }`
  // Throws BadRequestException if challenge missing, passkey not found, or verification fails
  async verifyAuthentication(identifier: string, body: unknown) {
    const user = (await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { profiles: { some: { username: identifier } } },
        ],
      },
      include: {
        passkeys: true,
      },
    })) as unknown as {
      id: string;
      passkeys: {
        credentialID: string;
        publicKey: Buffer;
        counter: bigint | number;
        transports: AuthenticatorTransport[];
      }[];
      currentChallenge?: string | null;
    } | null;

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

    const expectedChallenge = await this.consumeChallenge(
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
      expectedChallenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
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

        return { verified: true, userId: user.id };
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

  // List all registered passkeys for a user (returns safe fields only).
  async getUserPasskeys(userId: string) {
    const passkeys = await (
      this.prisma as unknown as {
        passkey: {
          findMany: (args: {
            where: { userId: string };
            select: {
              id: boolean;
              credentialID: boolean;
              transports: boolean;
              createdAt: boolean;
            };
            orderBy: { createdAt: 'desc' };
          }) => Promise<
            {
              id: string;
              credentialID: string;
              transports: string[];
              createdAt: Date;
            }[]
          >;
        };
      }
    ).passkey.findMany({
      where: { userId },
      select: {
        id: true,
        credentialID: true,
        transports: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return passkeys;
  }

  // Delete a passkey by its ID (only if it belongs to the user).
  async deletePasskey(userId: string, passkeyId: string) {
    const passkey = await (
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

    if (!passkey || passkey.userId !== userId) {
      throw new NotFoundException('Passkey not found');
    }

    await (
      this.prisma as unknown as {
        passkey: {
          delete: (args: { where: { id: string } }) => Promise<unknown>;
        };
      }
    ).passkey.delete({
      where: { id: passkeyId },
    });

    return { deleted: true };
  }
}
