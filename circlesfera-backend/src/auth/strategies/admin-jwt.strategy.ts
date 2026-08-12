import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ADMIN_ACCESS_TOKEN_COOKIE } from '../../common/config/cookie.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CurrentAdminData } from '../decorators/current-admin.decorator.js';

export const ADMIN_JWT_AUDIENCE = 'circlesfera-admin';
export const ADMIN_JWT_STRATEGY = 'admin-jwt';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  jti: string;
  aud: string;
  stepUp?: boolean;
  stepUpExp?: number;
}

function adminCookieOrHeaderExtractor(req: Request): string | null {
  const cookies = req?.cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.[ADMIN_ACCESS_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(
  Strategy,
  ADMIN_JWT_STRATEGY,
) {
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    const adminSecret =
      configService.get<string>('JWT_ADMIN_SECRET') ||
      configService.getOrThrow<string>('JWT_SECRET');
    super({
      jwtFromRequest: adminCookieOrHeaderExtractor,
      ignoreExpiration: false,
      secretOrKey: adminSecret,
      audience: ADMIN_JWT_AUDIENCE,
    });
  }

  async validate(payload: AdminJwtPayload): Promise<CurrentAdminData> {
    if (payload.aud !== ADMIN_JWT_AUDIENCE) {
      throw new UnauthorizedException('Invalid admin token audience');
    }

    const admin = await this.prisma.adminIdentity.findUnique({
      where: { id: payload.sub },
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
      throw new UnauthorizedException('Admin identity not found or disabled');
    }

    const roles = admin.roles.map((r) => r.role.name);
    const permissions = [
      ...new Set(
        admin.roles.flatMap((r) =>
          r.role.permissions.map((p) => p.permission.key),
        ),
      ),
    ];

    const stepUpVerified =
      payload.stepUp === true &&
      typeof payload.stepUpExp === 'number' &&
      payload.stepUpExp * 1000 > Date.now();

    // Fire-and-forget activity stamp
    void this.prisma.adminIdentity
      .update({
        where: { id: admin.id },
        data: { lastActivityAt: new Date() },
      })
      .catch(() => undefined);

    return {
      adminId: admin.id,
      userId: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      permissions,
      roles,
      stepUpVerified,
    };
  }
}
