import { ErrorCode, STAFF_PASSKEYS_MAX } from '@circlesfera/shared';
import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { parseWebAuthnConfig } from '../auth/passkey/passkey.config.js';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '../auth/passkey/simplewebauthn.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

// How long a staff passkey ceremony may take.
export const STAFF_PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

type Scope = 'REGISTRATION' | 'AUTHENTICATION';

// The transports a browser may name; anything else is not kept.
const KNOWN_TRANSPORTS = new Set<string>([
  'ble',
  'cable',
  'hybrid',
  'internal',
  'nfc',
  'smart-card',
  'usb',
]);
type ClientMeta = { ip?: string; userAgent?: string };

/**
 * The origins a staff passkey ceremony may come from: the staff sites only,
 * never the participants' app. STAFF_WEBAUTHN_ORIGIN when set (a comma list);
 * otherwise the Admin Panel and Backoffice hosts under the relying party.
 */
export function staffWebAuthnOrigins(
  config: Pick<ConfigService, 'get'>,
  rpID: string,
): string[] {
  const configured = config
    .get<string>('STAFF_WEBAUTHN_ORIGIN')
    ?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const production = config.get<string>('NODE_ENV') === 'production';
  if (configured?.length) {
    // As for participants' passkeys: production takes https staff hosts only.
    for (const origin of configured) {
      if (
        production &&
        (!origin.startsWith('https://') ||
          origin.includes('localhost') ||
          origin.includes('127.0.0.1'))
      ) {
        throw new Error(
          `Insecure staff WebAuthn origin '${origin}' is forbidden in production; HTTPS required`,
        );
      }
    }
    return configured;
  }
  if (production) {
    return [`https://admin.${rpID}`, `https://backoffice.${rpID}`];
  }
  return [`http://admin.${rpID}:5173`, `http://backoffice.${rpID}:5173`];
}

/**
 * Staff passkeys: kept apart from participants' ones, used only from the
 * staff sites, always with user verification. Sign-in is discoverable: the
 * passkey says whose it is.
 */
@Injectable()
export class StaffPasskeyService {
  private readonly rpID: string;
  private readonly rpName: string;
  private readonly origins: string[];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    const webAuthn = parseWebAuthnConfig(config);
    this.rpID = webAuthn.rpID;
    this.rpName = `${webAuthn.rpName} staff`;
    this.origins = staffWebAuthnOrigins(config, webAuthn.rpID);
  }

  private async keepChallenge(
    challenge: string,
    scope: Scope,
    adminId: string | null,
  ): Promise<void> {
    // Old challenges go as new ones come: the table stays small.
    await this.prisma.adminPasskeyChallenge.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    await this.prisma.adminPasskeyChallenge.create({
      data: {
        challenge,
        scope,
        adminId,
        expiresAt: new Date(Date.now() + STAFF_PASSKEY_CHALLENGE_TTL_MS),
      },
    });
  }

  // Takes a challenge once: the delete that finds it is the only one that
  // counts, so two answers to one challenge cannot both pass.
  private async takeChallenge(
    challenge: string,
    scope: Scope,
    adminId: string | null,
  ): Promise<boolean> {
    const taken = await this.prisma.adminPasskeyChallenge.deleteMany({
      where: {
        challenge,
        scope,
        adminId,
        expiresAt: { gt: new Date() },
      },
    });
    return taken.count === 1;
  }

  private static challengeOf(response: {
    response?: { clientDataJSON?: string };
  }): string | null {
    try {
      const raw = Buffer.from(
        response.response?.clientDataJSON ?? '',
        'base64url',
      ).toString('utf8');
      const parsed = JSON.parse(raw) as { challenge?: unknown };
      return typeof parsed.challenge === 'string' ? parsed.challenge : null;
    } catch {
      return null;
    }
  }

  /** The passkeys of an identity, newest first, without their keys. */
  async list(adminId: string) {
    return this.prisma.adminPasskey.findMany({
      where: { adminId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    });
  }

  async registrationOptions(admin: { adminId: string; email: string }) {
    const existing = await this.prisma.adminPasskey.findMany({
      where: { adminId: admin.adminId },
      select: { credentialID: true },
    });
    if (existing.length >= STAFF_PASSKEYS_MAX) {
      throw AppException.Conflict(
        ErrorCode.PASSKEY_LIMIT_REACHED,
        'Passkey limit reached',
        { max: STAFF_PASSKEYS_MAX },
      );
    }
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(`staff:${admin.adminId}`),
      userName: admin.email,
      userDisplayName: `${admin.email} (staff)`,
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.credentialID,
        type: 'public-key' as const,
      })),
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    });
    await this.keepChallenge(options.challenge, 'REGISTRATION', admin.adminId);
    return options;
  }

  /** Verifies and keeps a new passkey; answers its id. */
  async register(
    adminId: string,
    response: RegistrationResponseJSON,
    name: string | undefined,
    meta: ClientMeta,
  ): Promise<{ id: string }> {
    const challenge = StaffPasskeyService.challengeOf(response);
    if (
      typeof response.id !== 'string' ||
      !challenge ||
      !(await this.takeChallenge(challenge, 'REGISTRATION', adminId))
    ) {
      throw new UnauthorizedException('Passkey challenge not found');
    }
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origins,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
    } catch {
      throw new UnauthorizedException('Passkey not verified');
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new UnauthorizedException('Passkey not verified');
    }
    const { credential } = verification.registrationInfo;
    const transports = (
      Array.isArray(response.response?.transports)
        ? response.response.transports
        : []
    ).filter(
      (t): t is AuthenticatorTransport =>
        typeof t === 'string' && KNOWN_TRANSPORTS.has(t),
    );
    // The identity's row is written first, which locks it until the end:
    // two additions at once are counted in turn, never past the limit.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.adminIdentity.update({
        where: { id: adminId },
        data: { updatedAt: new Date() },
      });
      const count = await tx.adminPasskey.count({ where: { adminId } });
      if (count >= STAFF_PASSKEYS_MAX) {
        throw AppException.Conflict(
          ErrorCode.PASSKEY_LIMIT_REACHED,
          'Passkey limit reached',
          { max: STAFF_PASSKEYS_MAX },
        );
      }
      return tx.adminPasskey.create({
        data: {
          adminId,
          credentialID: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports,
          name: name?.trim() || null,
        },
        select: { id: true },
      });
    });
    await this.audit(adminId, 'ADMIN_PASSKEY_ADDED', created.id, meta);
    return created;
  }

  /** Options for a sign-in with any staff passkey of this device. */
  async authenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'required',
    });
    await this.keepChallenge(options.challenge, 'AUTHENTICATION', null);
    return options;
  }

  /**
   * Verifies a sign-in with a staff passkey and answers which one it is and
   * whose. Any failure is the same refusal, telling nothing about the
   * passkey. Its counter moves on here; when it was used is kept only once
   * the sign-in is accepted (markUsed).
   */
  async authenticate(
    response: AuthenticationResponseJSON,
  ): Promise<{ adminId: string; passkeyId: string }> {
    const refused = () => new UnauthorizedException('Passkey not accepted');
    const challenge = StaffPasskeyService.challengeOf(response);
    if (
      typeof response.id !== 'string' ||
      !challenge ||
      !(await this.takeChallenge(challenge, 'AUTHENTICATION', null))
    ) {
      throw refused();
    }
    const passkey = await this.prisma.adminPasskey.findUnique({
      where: { credentialID: response.id },
    });
    if (!passkey) throw refused();
    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.origins,
        expectedRPID: this.rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialID,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as AuthenticatorTransport[],
        },
      });
    } catch {
      throw refused();
    }
    if (!verification.verified) throw refused();
    await this.prisma.adminPasskey.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) },
    });
    return { adminId: passkey.adminId, passkeyId: passkey.id };
  }

  /** Keeps when a passkey last opened a session. */
  async markUsed(passkeyId: string): Promise<void> {
    await this.prisma.adminPasskey.update({
      where: { id: passkeyId },
      data: { lastUsedAt: new Date() },
    });
  }

  /** Removes one of the identity's own passkeys. */
  async remove(adminId: string, id: string, meta: ClientMeta): Promise<void> {
    const removed = await this.prisma.adminPasskey.deleteMany({
      where: { id, adminId },
    });
    if (removed.count !== 1) throw new NotFoundException('Passkey not found');
    await this.audit(adminId, 'ADMIN_PASSKEY_REMOVED', id, meta);
  }

  private async audit(
    adminId: string,
    action: 'ADMIN_PASSKEY_ADDED' | 'ADMIN_PASSKEY_REMOVED',
    passkeyId: string,
    meta: ClientMeta,
  ): Promise<void> {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType: 'admin_passkey',
        targetId: passkeyId,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  }
}
