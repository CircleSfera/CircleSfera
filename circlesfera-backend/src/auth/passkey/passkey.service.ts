import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type AuthenticatorTransportFuture,
  type GenerateAuthenticationOptionsOpts,
  type GenerateRegistrationOptionsOpts,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type VerifyAuthenticationResponseOpts,
  type VerifyRegistrationResponseOpts,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Service for FIDO2/WebAuthn passkey registration and authentication.
 * Uses @simplewebauthn/server for challenge generation and verification.
 */
@Injectable()
export class PasskeyService {
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

  /**
   * Generate WebAuthn registration options (challenge) for a user.
   * Stores the challenge in the user record for later verification.
   * @param userId - The authenticated user's ID
   * @throws NotFoundException if user not found
   */
  async generateRegistrationOptions(userId: string) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        passkeys: true,
      },
    })) as unknown as {
      id: string;
      email: string;
      profile?: { username?: string | null; fullName?: string | null } | null;
      passkeys: {
        id: string;
        credentialID: string;
        publicKey: Buffer;
        counter: bigint | number;
        transports: AuthenticatorTransportFuture[];
      }[];
      currentChallenge?: string | null;
    } | null;

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const options: GenerateRegistrationOptionsOpts = {
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(user.id),
      userName: user.profile?.username || user.email,
      userDisplayName: user.profile?.fullName || user.email,
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

    // Store challenge
    await this.prisma.user.update({
      where: { id: userId },
      data: { currentChallenge: registrationOptions.challenge },
    });

    return registrationOptions;
  }

  /**
   * Verify a WebAuthn registration response, storing the new passkey credential.
   * @param userId - The authenticated user's ID
   * @param body - The registration response from the client
   * @returns `{ verified: boolean }`
   * @throws BadRequestException if challenge missing or verification fails
   */
  async verifyRegistration(userId: string, body: unknown) {
    const user = (await this.prisma.user.findUnique({
      where: { id: userId },
    })) as unknown as { currentChallenge?: string | null } | null;

    if (!user?.currentChallenge) {
      throw new BadRequestException('Registration challenge not found');
    }

    const expectedChallenge = user.currentChallenge;

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
                transports: AuthenticatorTransportFuture[];
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
                  response: { transports?: AuthenticatorTransportFuture[] };
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

  /**
   * Generate WebAuthn authentication options (challenge) for login.
   * @param email - The user's email address
   * @throws NotFoundException if user not found
   */
  async generateAuthenticationOptions(identifier: string) {
    const user = (await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { profile: { username: identifier } }],
      },
      include: {
        passkeys: true,
      },
    })) as unknown as {
      id: string;
      passkeys: {
        credentialID: string;
        transports?: AuthenticatorTransportFuture[];
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

    // Store challenge
    await this.prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: authenticationOptions.challenge },
    });

    return authenticationOptions;
  }

  /**
   * Verify a WebAuthn authentication response for passwordless login.
   * Updates the passkey counter on success.
   * @param email - The user's email address
   * @param body - The authentication response from the client
   * @returns `{ verified: boolean, userId?: string }`
   * @throws BadRequestException if challenge missing, passkey not found, or verification fails
   */
  async verifyAuthentication(identifier: string, body: unknown) {
    const user = (await this.prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { profile: { username: identifier } }],
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
        transports: AuthenticatorTransportFuture[];
      }[];
      currentChallenge?: string | null;
    } | null;

    if (!user?.currentChallenge) {
      throw new BadRequestException('Authentication challenge not found');
    }

    const passkey = user.passkeys.find(
      (pk) => pk.credentialID === (body as { id: string }).id,
    );
    if (!passkey) {
      throw new BadRequestException('Passkey not found');
    }

    const opts: VerifyAuthenticationResponseOpts = {
      response: body as VerifyAuthenticationResponseOpts['response'],
      expectedChallenge: user.currentChallenge,
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

      console.error(
        'Passkey verification failed (verified: false):',
        verification,
      );
      return { verified: false };
    } catch (error: unknown) {
      console.error('Passkey authentication exception:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        `Passkey authentication failed: ${message}`,
      );
    }
  }

  /** List all registered passkeys for a user (returns safe fields only). */
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

  /** Delete a passkey by its ID (only if it belongs to the user). */
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
