import { createHash, randomUUID } from 'node:crypto';
import { ErrorCode } from '@circlesfera/shared';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import { hasOwnStaffPassword } from '../admin/staff-password.constants.js';
import { assertNotLeakedPassword } from '../auth/leaked-passwords/leaked-password.js';
import { passwordMatches } from '../auth/password.util.js';
import { ADMIN_JWT_AUDIENCE } from '../auth/strategies/admin-jwt.strategy.js';
import { getAdminJwtSecret } from '../common/config/admin-jwt.config.js';
import { AppException } from '../common/errors/app.exception.js';
import { CryptoService } from '../common/services/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EnrolmentProofService } from './enrolment-proof.service.js';
import {
  accessHasExpired,
  isExternalReviewer,
  REVIEWER_SESSION_MAX_MS,
  reviewerAccessIsValid,
} from './external-reviewer.js';

// A short fingerprint of an authenticator secret, never the secret.
function secretMark(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 32);
}

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const MFA_TOKEN_TTL = '5m';
const ACCESS_TTL = '10m';
const REFRESH_TTL_MS = 8 * 60 * 60 * 1000;
const STEP_UP_TTL_SEC = 5 * 60;

export type AdminTokenPair = {
  accessToken: string;
  refreshToken: string;
};

type ClientMeta = { ip?: string; userAgent?: string };

// A new authenticator, shown this once, to be confirmed with its first code
// at the MFA step.
export type AuthenticatorSetup = {
  status: 'MFA_SETUP_REQUIRED';
  mfaToken: string;
  otpauthUrl: string;
  secret: string;
  qrCodeDataUrl: string;
};

// An external reviewer's session: when it began, carried through every
// renewal, and when the reviewer's access ends.
type ReviewerSession = { startedAt: number; accessExpiresAt: Date };

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(CryptoService) private readonly cryptoService: CryptoService,
    @Inject(EnrolmentProofService)
    private readonly enrolmentProof: EnrolmentProofService,
  ) {}

  private adminSecret(): string {
    return getAdminJwtSecret(this.config);
  }

  private hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // A staff identity with a password of its own signs in with that one alone.
  // One that has not set it yet (identities made when staff signed in with
  // their CircleSfera account) still signs in the old way: with the password
  // of the sign-in that has the staff email and belongs to its linked User,
  // until it sets its own; from then on that password opens nothing here.
  // In the old way, no such sign-in, or one that must set a new password
  // first, is refused like a wrong password.
  private async passwordIsValid(
    admin: {
      email: string;
      linkedUserId: string | null;
      passwordHash: string;
      passwordSetAt: Date | null;
    },
    password: string,
  ): Promise<boolean> {
    if (hasOwnStaffPassword(admin)) {
      return passwordMatches(admin.passwordHash, password);
    }
    if (!admin.linkedUserId) return false;
    const signIn = await this.prisma.signIn.findUnique({
      where: { email: admin.email },
      select: { userId: true, password: true, passwordResetRequiredAt: true },
    });
    if (
      !signIn ||
      signIn.userId !== admin.linkedUserId ||
      signIn.passwordResetRequiredAt
    ) {
      return false;
    }
    return passwordMatches(signIn.password, password);
  }

  // A failed attempt: counted towards the lockout and written down.
  private async recordFailure(
    adminId: string,
    meta: ClientMeta,
    details: string,
  ): Promise<void> {
    const updated = await this.prisma.adminIdentity.update({
      where: { id: adminId },
      data: { failedLoginCount: { increment: 1 } },
    });
    if (updated.failedLoginCount >= LOCKOUT_THRESHOLD) {
      await this.prisma.adminIdentity.update({
        where: { id: adminId },
        data: {
          lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000),
        },
      });
    }
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'ADMIN_LOGIN_FAILED',
        targetType: 'admin',
        targetId: adminId,
        details,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
  }

  // A new staff password: long enough (checked where it is received), not a
  // known leaked one, and never the password of a CircleSfera account with
  // the staff email, which would join the two again.
  private async assertUsableStaffPassword(
    email: string,
    password: string,
  ): Promise<void> {
    assertNotLeakedPassword(password);
    const signIn = await this.prisma.signIn.findUnique({
      where: { email },
      select: { password: true },
    });
    if (signIn && (await passwordMatches(signIn.password, password))) {
      throw AppException.BadRequest(
        ErrorCode.STAFF_PASSWORD_IS_ACCOUNT_PASSWORD,
        'Choose a password different from the one of your CircleSfera account',
      );
    }
  }

  // Takes an authenticator code for an identity, once: a right code is
  // accepted only if its time step is later than that of the last code the
  // identity used, and that step is kept by the same write that checks it,
  // so a code seen over a shoulder, or sent twice at once, works only once.
  // The same write also requires the stored secret the code was checked
  // against: if the authenticator is reset or replaced meanwhile, the code
  // of the old secret is refused. otplib throws on malformed secrets: that
  // is a wrong code.
  private async useTotpCode(
    adminId: string,
    token: string,
    storedSecret: string,
  ): Promise<boolean> {
    const code = token.replace(/\s+/g, '').trim();
    if (!/^\d{6}$/.test(code)) return false;
    let timeStep: number;
    try {
      const secret = this.cryptoService.decrypt(storedSecret);
      const result = verifySync({ token: code, secret, epochTolerance: 120 });
      // A TOTP result names its time step; anything else is no code here.
      if (
        result?.valid !== true ||
        !('timeStep' in result) ||
        typeof result.timeStep !== 'number'
      ) {
        return false;
      }
      timeStep = result.timeStep;
    } catch {
      return false;
    }
    const taken = await this.prisma.adminIdentity.updateMany({
      where: {
        id: adminId,
        totpSecret: storedSecret,
        OR: [
          { totpLastTimeStep: null },
          { totpLastTimeStep: { lt: timeStep } },
        ],
      },
      data: { totpLastTimeStep: timeStep },
    });
    return taken.count === 1;
  }

  private signAdminToken(
    payload: Record<string, unknown>,
    expiresIn: JwtSignOptions['expiresIn'],
  ): string {
    return this.jwtService.sign(payload, {
      secret: this.adminSecret(),
      expiresIn,
      audience: ADMIN_JWT_AUDIENCE,
    });
  }

  private async loadAdminByEmail(email: string) {
    return this.prisma.adminIdentity.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });
  }

  private permissionsOf(admin: {
    roles: Array<{
      role: {
        name: string;
        permissions: Array<{ permission: { key: string } }>;
      };
    }>;
  }) {
    const roles = admin.roles.map((r) => r.role.name);
    const permissions = [
      ...new Set(
        admin.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.key),
        ),
      ),
    ];
    return { roles, permissions };
  }

  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<
    | { status: 'MFA_REQUIRED'; mfaToken: string }
    | { status: 'ENROLMENT_PROOF_REQUIRED'; mfaToken: string }
  > {
    const admin = await this.loadAdminByEmail(email);

    const fail = async (adminId?: string): Promise<never> => {
      if (adminId) {
        await this.recordFailure(adminId, meta, 'Invalid credentials');
      }
      throw new UnauthorizedException('Invalid credentials');
    };

    // An identity whose access has run out is refused like a disabled one.
    if (admin?.status !== 'ACTIVE' || accessHasExpired(admin.accessExpiresAt)) {
      return fail(admin?.id);
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked');
    }

    if (!(await this.passwordIsValid(admin, password))) {
      await fail(admin.id);
    }

    // An external reviewer signs in only while their access has an end date
    // (see external-reviewer.ts), and then with the second factor like
    // anyone else.
    if (
      isExternalReviewer(this.permissionsOf(admin).roles) &&
      !reviewerAccessIsValid(admin.accessExpiresAt)
    ) {
      return fail(admin.id);
    }

    // A right password clears the failed attempts, except while the
    // identity still has to enrol: then only a right proof does, so wrong
    // proofs reach the lockout however often the password is typed.
    if (admin.totpEnabled) {
      await this.prisma.adminIdentity.update({
        where: { id: admin.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }

    // A second factor is mandatory for every staff identity, external
    // reviewers included (PD-091), with no switch to turn it off. One with no authenticator enrols one only
    // with a proof beyond the password: the link sent to its email or a code
    // from an administrator. Nothing of the authenticator is shown yet.
    if (!admin.totpEnabled) {
      const mfaToken = this.signAdminToken(
        { sub: admin.id, email: admin.email, purpose: 'admin-enrol-proof' },
        MFA_TOKEN_TTL,
      );
      return { status: 'ENROLMENT_PROOF_REQUIRED', mfaToken };
    }

    const mfaToken = this.signAdminToken(
      {
        sub: admin.id,
        email: admin.email,
        purpose: 'admin-mfa',
      },
      MFA_TOKEN_TTL,
    );
    return { status: 'MFA_REQUIRED', mfaToken };
  }

  // The proof beyond the password, given after it: once it is spent, a new
  // authenticator secret is made and shown, this once, to be confirmed with
  // its first code at the MFA step. A wrong proof counts like a wrong
  // password towards the lockout.
  async enrol(
    mfaToken: string,
    proof: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AuthenticatorSetup> {
    let payload: { sub: string; email: string; purpose?: string };
    try {
      payload = this.jwtService.verify(mfaToken, {
        secret: this.adminSecret(),
        audience: ADMIN_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
    if (payload.purpose !== 'admin-enrol-proof') {
      throw new UnauthorizedException('Invalid MFA token purpose');
    }

    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: payload.sub },
    });
    if (admin?.status !== 'ACTIVE' || admin.totpEnabled) {
      throw new UnauthorizedException('Enrolment not available');
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked');
    }

    if (!(await this.enrolmentProof.consume(admin.id, proof))) {
      await this.recordFailure(admin.id, meta, 'Invalid enrolment proof');
      throw new UnauthorizedException('Invalid enrolment proof');
    }

    await this.prisma.adminAuditLog.create({
      data: {
        adminId: admin.id,
        action: 'ADMIN_ENROLMENT_USED',
        targetType: 'admin',
        targetId: admin.id,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    return this.startAuthenticatorSetup(admin);
  }

  // A fresh authenticator secret, kept encrypted and shown this once: one
  // shown before is never shown again. Confirmed with its first code at the
  // MFA step, which turns it on.
  private async startAuthenticatorSetup(admin: {
    id: string;
    email: string;
  }): Promise<AuthenticatorSetup> {
    const secret = generateSecret();
    await this.prisma.adminIdentity.update({
      where: { id: admin.id },
      data: {
        totpSecret: this.cryptoService.encrypt(secret),
        totpEnabled: false,
        // A step belongs to the secret it was taken with.
        totpLastTimeStep: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    const otpauthUrl = generateURI({
      issuer: 'CircleSfera Admin Panel',
      label: admin.email,
      secret,
    });
    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl, {
      margin: 1,
      width: 220,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return {
      status: 'MFA_SETUP_REQUIRED',
      // The token names the secret it was shown with, so it confirms only
      // that one and never a secret made by a later proof.
      mfaToken: this.signAdminToken(
        {
          sub: admin.id,
          email: admin.email,
          purpose: 'admin-mfa-setup',
          secretMark: secretMark(secret),
        },
        MFA_TOKEN_TTL,
      ),
      otpauthUrl,
      secret,
      qrCodeDataUrl,
    };
  }

  async verifyMfa(
    mfaToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AdminTokenPair> {
    let payload: {
      sub: string;
      email: string;
      purpose?: string;
      secretMark?: string;
    };
    try {
      payload = this.jwtService.verify(mfaToken, {
        secret: this.adminSecret(),
        audience: ADMIN_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (
      payload.purpose !== 'admin-mfa' &&
      payload.purpose !== 'admin-mfa-setup'
    ) {
      throw new UnauthorizedException('Invalid MFA token purpose');
    }

    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: payload.sub },
      include: { roles: { select: { role: { select: { name: true } } } } },
    });
    // An external reviewer finishes the second factor like anyone else, but
    // only while their access has an end date; their session is capped.
    const reviewer =
      !!admin && isExternalReviewer(admin.roles.map((r) => r.role.name));
    if (
      !admin?.totpSecret ||
      admin.status !== 'ACTIVE' ||
      accessHasExpired(admin.accessExpiresAt) ||
      (reviewer && !reviewerAccessIsValid(admin.accessExpiresAt))
    ) {
      throw new UnauthorizedException('MFA not configured');
    }

    const rawSecret = admin.totpSecret;
    const decryptedSecret = this.cryptoService.decrypt(rawSecret);
    if (
      payload.purpose === 'admin-mfa-setup' &&
      payload.secretMark !== secretMark(decryptedSecret)
    ) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }

    if (!(await this.useTotpCode(admin.id, code, rawSecret))) {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: 'ADMIN_LOGIN_FAILED',
          targetType: 'admin',
          targetId: admin.id,
          details: 'Invalid MFA code',
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Opportunistic rolling migration for legacy plaintext secrets
    if (!rawSecret.includes(':')) {
      void this.prisma.adminIdentity
        .update({
          where: { id: admin.id },
          data: { totpSecret: this.cryptoService.encrypt(decryptedSecret) },
        })
        .catch(() => undefined);
    }

    if (payload.purpose === 'admin-mfa-setup' && !admin.totpEnabled) {
      await this.prisma.adminIdentity.update({
        where: { id: admin.id },
        data: { totpEnabled: true },
      });
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: 'ADMIN_MFA_ENABLED',
          targetType: 'admin',
          targetId: admin.id,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    }

    return this.issueSession(
      admin.id,
      admin.email,
      meta,
      reviewer ? this.reviewerSession(admin.accessExpiresAt) : undefined,
    );
  }

  /**
   * Sets up a staff identity's access from the link sent to its email, or a
   * code from an administrator: no CircleSfera account and no earlier
   * password are needed. The proof is spent, the password given becomes the
   * identity's own, and every session it had ends. The identity, an external
   * reviewer too, then gets a new authenticator to confirm at the MFA step,
   * which opens the session. A wrong proof counts like a wrong password
   * towards the lockout.
   */
  async setUpAccess(
    email: string,
    proof: string,
    password: string,
    meta: ClientMeta,
  ): Promise<AuthenticatorSetup> {
    // Every refusal before the proof is accepted is the same 401, so this
    // tells nobody whether an email is staff, and nothing about any password
    // is looked at until the proof is right.
    const refused = () => new UnauthorizedException('Invalid access link');
    const admin = await this.loadAdminByEmail(email);
    if (
      admin?.status !== 'ACTIVE' ||
      accessHasExpired(admin.accessExpiresAt) ||
      (admin.lockedUntil && admin.lockedUntil > new Date())
    ) {
      throw refused();
    }
    if (
      isExternalReviewer(this.permissionsOf(admin).roles) &&
      !reviewerAccessIsValid(admin.accessExpiresAt)
    ) {
      throw refused();
    }

    const match = await this.enrolmentProof.check(admin.id, proof);
    if (!match) {
      await this.recordFailure(admin.id, meta, 'Invalid access link');
      throw refused();
    }
    // Only with the right proof: a refused password leaves it unspent, so
    // the person tries another with the same link or code.
    await this.assertUsableStaffPassword(admin.email, password);
    if (!(await this.enrolmentProof.spend(admin.id, match))) {
      throw refused();
    }

    const passwordHash = await argon2.hash(password);
    await this.prisma.$transaction([
      this.prisma.adminIdentity.update({
        where: { id: admin.id },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
          // A new authenticator is set up next; until it is confirmed the
          // identity has none.
          totpSecret: null,
          totpEnabled: false,
          totpLastTimeStep: null,
        },
      }),
      this.prisma.adminRefreshToken.deleteMany({
        where: { adminId: admin.id },
      }),
      // Setting up the access again starts from nothing: no passkey added
      // before (perhaps by whoever took the access) still opens it.
      this.prisma.adminPasskey.deleteMany({ where: { adminId: admin.id } }),
      this.prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: 'ADMIN_PASSWORD_SET',
          targetType: 'admin',
          targetId: admin.id,
          details: 'Password set from an access link',
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      }),
    ]);

    return this.startAuthenticatorSetup(admin);
  }

  /**
   * Changes the password of the identity signed in, or sets its own for the
   * first time (one that still signs in the old way). It takes the password
   * it signs in with now and a code of its authenticator. Every other
   * session of the identity ends; a wrong answer counts towards the lockout.
   */
  async changePassword(
    adminId: string,
    dto: { currentPassword: string; newPassword: string; totpCode?: string },
    meta: ClientMeta & { keepRefreshToken?: string },
  ): Promise<void> {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
    });
    if (admin?.status !== 'ACTIVE' || accessHasExpired(admin.accessExpiresAt)) {
      throw new UnauthorizedException();
    }
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked');
    }

    let ok = await this.passwordIsValid(admin, dto.currentPassword);
    // The new password is checked before the code is spent, so a refused
    // one is tried again with the same code.
    if (ok) await this.assertUsableStaffPassword(admin.email, dto.newPassword);
    if (ok) {
      ok =
        admin.totpEnabled &&
        !!admin.totpSecret &&
        (await this.useTotpCode(
          admin.id,
          dto.totpCode ?? '',
          admin.totpSecret,
        ));
    }
    if (!ok) {
      await this.recordFailure(admin.id, meta, 'Invalid password change');
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    const kept = meta.keepRefreshToken
      ? this.hashRefresh(meta.keepRefreshToken)
      : undefined;
    await this.prisma.$transaction([
      this.prisma.adminIdentity.update({
        where: { id: admin.id },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.adminRefreshToken.deleteMany({
        where: {
          adminId: admin.id,
          ...(kept ? { token: { not: kept } } : {}),
        },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          adminId: admin.id,
          action: 'ADMIN_PASSWORD_SET',
          targetType: 'admin',
          targetId: admin.id,
          details: hasOwnStaffPassword(admin)
            ? 'Password changed by its holder'
            : 'Own password set by its holder',
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      }),
    ]);
  }

  /**
   * Opens a session for the identity whose staff passkey was just verified:
   * the same checks as any sign-in (active, access not over, not locked),
   * and an authenticator still enrolled, since a passkey adds to the second
   * factor and never replaces enrolling one: for an external reviewer too.
   * A reviewer's session is capped as at any reviewer sign-in.
   */
  async signInWithPasskey(
    adminId: string,
    meta: ClientMeta,
  ): Promise<AdminTokenPair> {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
      include: { roles: { select: { role: { select: { name: true } } } } },
    });
    // A refusal of a known identity is written down; it never counts
    // towards the lockout, which is there against guessing a password.
    const refused = async (): Promise<never> => {
      if (admin) {
        await this.prisma.adminAuditLog.create({
          data: {
            adminId: admin.id,
            action: 'ADMIN_LOGIN_FAILED',
            targetType: 'admin',
            targetId: admin.id,
            details: 'Passkey refused',
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        });
      }
      throw new UnauthorizedException('Passkey not accepted');
    };
    // A lockout after wrong passwords does not stop a passkey, which cannot
    // be guessed: anyone who knows a staff email could otherwise lock its
    // holder out of the one factor that is safe.
    if (admin?.status !== 'ACTIVE' || accessHasExpired(admin.accessExpiresAt)) {
      return refused();
    }
    const reviewer = isExternalReviewer(admin.roles.map((r) => r.role.name));
    if (
      !admin.totpEnabled ||
      (reviewer && !reviewerAccessIsValid(admin.accessExpiresAt))
    ) {
      return refused();
    }
    await this.prisma.adminIdentity.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return this.issueSession(
      admin.id,
      admin.email,
      meta,
      reviewer ? this.reviewerSession(admin.accessExpiresAt) : undefined,
      'Signed in with a passkey',
    );
  }

  // An external reviewer's session beginning now. Called only once their
  // access was checked to have an end (reviewerAccessIsValid).
  private reviewerSession(accessExpiresAt: Date | null): ReviewerSession {
    return { startedAt: Date.now(), accessExpiresAt: accessExpiresAt as Date };
  }

  async me(adminId: string) {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
          },
        },
        _count: { select: { passkeys: true } },
      },
    });
    if (admin?.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    const { roles, permissions } = this.permissionsOf(admin);
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      totpEnabled: admin.totpEnabled,
      // False while the identity still signs in the old way, with its
      // linked account's password: the staff sites ask it to set its own.
      ownPassword: hasOwnStaffPassword(admin),
      // The staff sites ask a member of staff with none to add one.
      passkeyCount: admin._count.passkeys,
      roles,
      permissions,
      lastLoginAt: admin.lastLoginAt,
      accessExpiresAt: admin.accessExpiresAt,
      externalReviewer: isExternalReviewer(roles),
    };
  }

  async refresh(
    rawRefresh: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AdminTokenPair> {
    if (!rawRefresh) {
      throw new UnauthorizedException('Refresh token required');
    }
    let payload: {
      sub: string;
      email: string;
      jti: string;
      aud?: string;
      typ?: string;
      mfa?: boolean;
      rev?: boolean;
      sst?: number;
    };
    try {
      payload = this.jwtService.verify(rawRefresh, {
        secret: this.adminSecret(),
        audience: ADMIN_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Only a refresh token issued after a verified second factor renews a
    // session; tokens from before that rule carry no such mark, nor do the
    // tokens external reviewers were given before PD-091.
    const reviewerToken =
      payload.rev === true && typeof payload.sst === 'number';
    if (payload.typ !== 'refresh' || payload.mfa !== true) {
      throw new UnauthorizedException('Sign in again');
    }

    const hashed = this.hashRefresh(rawRefresh);
    const stored = await this.prisma.adminRefreshToken.findUnique({
      where: { token: hashed },
    });
    if (!stored || stored.adminId !== payload.sub) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    if (stored.expiresAt < new Date()) {
      await this.prisma.adminRefreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    await this.prisma.adminRefreshToken.delete({ where: { id: stored.id } });

    // A staff member who is no longer active, whose access ran out, or whose
    // second factor was reset, is not renewed: they sign in again.
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: payload.sub },
      select: {
        status: true,
        totpEnabled: true,
        accessExpiresAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (
      admin?.status !== 'ACTIVE' ||
      accessHasExpired(admin.accessExpiresAt) ||
      !admin.totpEnabled
    ) {
      throw new UnauthorizedException('Sign in again');
    }

    if (reviewerToken) {
      // Still a reviewer only, still with an end date, and within the
      // session's working day counted from its sign-in.
      const startedAt = (payload.sst as number) * 1000;
      if (
        !isExternalReviewer(admin.roles.map((r) => r.role.name)) ||
        !reviewerAccessIsValid(admin.accessExpiresAt) ||
        startedAt + REVIEWER_SESSION_MAX_MS <= Date.now()
      ) {
        throw new UnauthorizedException('Sign in again');
      }
      return this.issueSession(payload.sub, payload.email, meta, {
        startedAt,
        accessExpiresAt: admin.accessExpiresAt,
      });
    }

    // A member of staff's session is never renewed for an identity that is
    // now a reviewer: they sign in as one, with the cap.
    if (isExternalReviewer(admin.roles.map((r) => r.role.name))) {
      throw new UnauthorizedException('Sign in again');
    }
    return this.issueSession(payload.sub, payload.email, meta);
  }

  async logout(
    adminId: string,
    rawRefresh?: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    if (rawRefresh) {
      const hashed = this.hashRefresh(rawRefresh);
      await this.prisma.adminRefreshToken.deleteMany({
        where: { token: hashed, adminId },
      });
    } else {
      await this.prisma.adminRefreshToken.deleteMany({ where: { adminId } });
    }
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'ADMIN_LOGOUT',
        targetType: 'admin',
        targetId: adminId,
        ipAddress: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });
  }

  async listSessions(adminId: string) {
    return this.prisma.adminRefreshToken.findMany({
      where: { adminId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeSession(adminId: string, sessionId: string) {
    await this.prisma.adminRefreshToken.deleteMany({
      where: { id: sessionId, adminId },
    });
  }

  // Proves the second factor again for a sensitive action. An external
  // reviewer steps up only to add or remove their own passkey (nothing they
  // read needs it): within their session, whose start the new token keeps,
  // so its working day still holds.
  async stepUp(
    adminId: string,
    dto: { totpCode: string },
    reviewerSessionStartedAt?: number,
  ): Promise<{ accessToken: string }> {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
      include: { roles: { select: { role: { select: { name: true } } } } },
    });
    if (admin?.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    // Step-up proves the second factor again; a password alone never does.
    // A reviewer's only within a reviewer's session still open, and a
    // member of staff's never within one.
    const reviewer = isExternalReviewer(admin.roles.map((r) => r.role.name));
    const reviewerSessionOpen =
      typeof reviewerSessionStartedAt === 'number' &&
      reviewerSessionStartedAt * 1000 + REVIEWER_SESSION_MAX_MS > Date.now() &&
      reviewerAccessIsValid(admin.accessExpiresAt);
    if (
      !admin.totpEnabled ||
      (reviewer ? !reviewerSessionOpen : reviewerSessionStartedAt !== undefined)
    ) {
      throw new UnauthorizedException('Step-up verification failed');
    }
    let ok = false;
    if (dto.totpCode && admin.totpSecret) {
      const rawSecret = admin.totpSecret;
      const decryptedSecret = this.cryptoService.decrypt(rawSecret);
      ok = await this.useTotpCode(admin.id, dto.totpCode, rawSecret);

      // Opportunistic rolling migration for legacy plaintext secrets
      if (ok && !rawSecret.includes(':')) {
        void this.prisma.adminIdentity
          .update({
            where: { id: admin.id },
            data: { totpSecret: this.cryptoService.encrypt(decryptedSecret) },
          })
          .catch(() => undefined);
      }
    }
    if (!ok) {
      throw new UnauthorizedException('Step-up verification failed');
    }

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'ADMIN_STEP_UP',
        targetType: 'admin',
        targetId: adminId,
      },
    });

    const accessToken = this.signAdminToken(
      {
        sub: admin.id,
        email: admin.email,
        jti: randomUUID(),
        typ: 'access',
        mfa: true,
        ...(reviewer ? { rev: true, sst: reviewerSessionStartedAt } : {}),
        stepUp: true,
        stepUpExp: Math.floor(Date.now() / 1000) + STEP_UP_TTL_SEC,
      },
      ACCESS_TTL,
    );

    return { accessToken };
  }

  // A staff session after the second factor. An external reviewer's also
  // carries when it began and never outlasts its working day nor the
  // reviewer's access (both still ahead: sign-in and renewal check).
  private async issueSession(
    adminId: string,
    email: string,
    meta: { ip?: string; userAgent?: string },
    reviewer?: ReviewerSession,
    details?: string,
  ): Promise<AdminTokenPair> {
    const now = Date.now();
    const mark = reviewer
      ? { mfa: true, rev: true, sst: Math.floor(reviewer.startedAt / 1000) }
      : { mfa: true };
    const refreshTtlMs = reviewer
      ? Math.min(
          REFRESH_TTL_MS,
          reviewer.startedAt + REVIEWER_SESSION_MAX_MS - now,
          reviewer.accessExpiresAt.getTime() - now,
        )
      : REFRESH_TTL_MS;

    const jti = randomUUID();
    const accessToken = this.signAdminToken(
      { sub: adminId, email, jti, typ: 'access', ...mark },
      ACCESS_TTL,
    );
    const refreshToken = this.signAdminToken(
      { sub: adminId, email, jti: randomUUID(), typ: 'refresh', ...mark },
      Math.ceil(refreshTtlMs / 1000),
    );

    await this.prisma.adminRefreshToken.create({
      data: {
        token: this.hashRefresh(refreshToken),
        adminId,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
        expiresAt: new Date(now + refreshTtlMs),
      },
    });

    await this.prisma.adminIdentity.update({
      where: { id: adminId },
      data: { lastLoginAt: new Date(), lastActivityAt: new Date() },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'ADMIN_LOGIN',
        targetType: 'admin',
        targetId: adminId,
        details,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return { accessToken, refreshToken };
  }
}
