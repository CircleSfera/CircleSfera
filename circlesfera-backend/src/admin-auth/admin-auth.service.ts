import { createHash, randomUUID } from 'node:crypto';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import { ADMIN_JWT_AUDIENCE } from '../auth/strategies/admin-jwt.strategy.js';
import { PrismaService } from '../prisma/prisma.service.js';

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

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  private adminSecret(): string {
    return (
      this.config.get<string>('JWT_ADMIN_SECRET') ||
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  private hashRefresh(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Matches platform auth: argon2 primary, bcrypt legacy with optional upgrade. */
  private async verifyAdminPassword(
    password: string,
    passwordHash: string,
  ): Promise<{ valid: boolean; upgradeToArgon2?: string }> {
    if (passwordHash.startsWith('$argon2')) {
      return { valid: await argon2.verify(passwordHash, password) };
    }
    if (
      passwordHash.startsWith('$2a$') ||
      passwordHash.startsWith('$2b$') ||
      passwordHash.startsWith('$2y$')
    ) {
      const valid = await bcrypt.compare(password, passwordHash);
      if (!valid) return { valid: false };
      return { valid: true, upgradeToArgon2: await argon2.hash(password) };
    }
    return { valid: false };
  }

  /** Safe TOTP check — otplib throws on malformed secrets. */
  private isTotpValid(token: string, secret: string): boolean {
    const code = token.replace(/\s+/g, '').trim();
    if (!/^\d{6}$/.test(code)) return false;
    try {
      return !!verifySync({ token: code, secret })?.valid;
    } catch {
      return false;
    }
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
    | {
        status: 'MFA_SETUP_REQUIRED';
        mfaToken: string;
        otpauthUrl: string;
        secret: string;
        qrCodeDataUrl: string;
      }
    | { status: 'OK'; tokens: AdminTokenPair }
  > {
    const admin = await this.loadAdminByEmail(email);

    const fail = async (adminId?: string) => {
      if (adminId) {
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
            details: 'Invalid credentials',
            ipAddress: meta.ip,
            userAgent: meta.userAgent,
          },
        });
      }
      throw new UnauthorizedException('Invalid credentials');
    };

    if (!admin || admin.status !== 'ACTIVE') {
      await fail(admin?.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked');
    }

    const passwordCheck = await this.verifyAdminPassword(
      password,
      admin.passwordHash,
    );
    if (!passwordCheck.valid) {
      await fail(admin.id);
    }

    await this.prisma.adminIdentity.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        ...(passwordCheck.upgradeToArgon2
          ? { passwordHash: passwordCheck.upgradeToArgon2 }
          : {}),
      },
    });

    if (admin.mfaRequired && !admin.totpEnabled) {
      // Keep an existing enrollment secret so re-login does not invalidate the authenticator.
      const secret = admin.totpSecret || generateSecret();
      if (!admin.totpSecret) {
        await this.prisma.adminIdentity.update({
          where: { id: admin.id },
          data: { totpSecret: secret },
        });
      }
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
      const mfaToken = this.signAdminToken(
        {
          sub: admin.id,
          email: admin.email,
          purpose: 'admin-mfa-setup',
        },
        MFA_TOKEN_TTL,
      );
      return {
        status: 'MFA_SETUP_REQUIRED',
        mfaToken,
        otpauthUrl,
        secret,
        qrCodeDataUrl,
      };
    }

    if (admin.mfaRequired && admin.totpEnabled) {
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

    const tokens = await this.issueSession(admin.id, admin.email, meta);
    return { status: 'OK', tokens };
  }

  async verifyMfa(
    mfaToken: string,
    code: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AdminTokenPair> {
    let payload: { sub: string; email: string; purpose?: string };
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
    });
    if (!admin?.totpSecret || admin.status !== 'ACTIVE') {
      throw new UnauthorizedException('MFA not configured');
    }

    if (!this.isTotpValid(code, admin.totpSecret)) {
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

    return this.issueSession(admin.id, admin.email, meta);
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
      },
    });
    if (!admin || admin.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }
    const { roles, permissions } = this.permissionsOf(admin);
    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      totpEnabled: admin.totpEnabled,
      mfaRequired: admin.mfaRequired,
      roles,
      permissions,
      lastLoginAt: admin.lastLoginAt,
    };
  }

  async refresh(
    rawRefresh: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AdminTokenPair> {
    if (!rawRefresh) {
      throw new UnauthorizedException('Refresh token required');
    }
    let payload: { sub: string; email: string; jti: string; aud?: string };
    try {
      payload = this.jwtService.verify(rawRefresh, {
        secret: this.adminSecret(),
        audience: ADMIN_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
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

  async stepUp(
    adminId: string,
    dto: { password?: string; totpCode?: string },
  ): Promise<{ accessToken: string }> {
    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: adminId },
    });
    if (!admin || admin.status !== 'ACTIVE') {
      throw new UnauthorizedException();
    }

    let ok = false;
    if (dto.password) {
      ok = (await this.verifyAdminPassword(dto.password, admin.passwordHash))
        .valid;
    }
    if (!ok && dto.totpCode && admin.totpSecret) {
      ok = this.isTotpValid(dto.totpCode, admin.totpSecret);
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
        stepUp: true,
        stepUpExp: Math.floor(Date.now() / 1000) + STEP_UP_TTL_SEC,
      },
      ACCESS_TTL,
    );

    return { accessToken };
  }

  private async issueSession(
    adminId: string,
    email: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<AdminTokenPair> {
    const jti = randomUUID();
    const accessToken = this.signAdminToken(
      { sub: adminId, email, jti },
      ACCESS_TTL,
    );
    const refreshToken = this.signAdminToken(
      { sub: adminId, email, jti: randomUUID() },
      '8h',
    );

    await this.prisma.adminRefreshToken.create({
      data: {
        token: this.hashRefresh(refreshToken),
        adminId,
        userAgent: meta.userAgent,
        ipAddress: meta.ip,
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
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
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return { accessToken, refreshToken };
  }
}
