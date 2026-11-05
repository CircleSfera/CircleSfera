import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import {
  accessHasExpired,
  isExternalReviewer,
  REVIEWER_SESSION_MAX_MS,
} from '../../admin-auth/external-reviewer.js';
import { getAdminJwtSecret } from '../../common/config/admin-jwt.config.js';
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
  typ?: 'access' | 'refresh';
  mfa?: boolean;
  // An external reviewer's session, and when it began (seconds).
  rev?: boolean;
  sst?: number;
  purpose?: string;
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
    const adminSecret = getAdminJwtSecret(configService);
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
    // Only an access token issued after a verified second factor, or to an
    // external reviewer, opens a staff session. The sign-in step token
    // (purpose) and the refresh token are signed with the same key and must
    // never be accepted here.
    const reviewerToken =
      payload.rev === true && typeof payload.sst === 'number';
    if (
      payload.typ !== 'access' ||
      (payload.mfa !== true && !reviewerToken) ||
      payload.purpose !== undefined
    ) {
      throw new UnauthorizedException('Invalid admin token');
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

    if (admin?.status !== 'ACTIVE' || accessHasExpired(admin.accessExpiresAt)) {
      throw new UnauthorizedException('Admin identity not found or disabled');
    }

    const roles = admin.roles.map((r) => r.role.name);
    const externalReviewer = isExternalReviewer(roles);
    // A reviewer's session holds only while the identity is a reviewer alone,
    // with an end date, within the working day from its sign-in. Any other
    // session needs the second factor, enrolled and verified.
    if (reviewerToken) {
      if (
        !externalReviewer ||
        !admin.accessExpiresAt ||
        (payload.sst as number) * 1000 + REVIEWER_SESSION_MAX_MS <= Date.now()
      ) {
        throw new UnauthorizedException('Admin identity not found or disabled');
      }
    } else if (!admin.totpEnabled) {
      throw new UnauthorizedException('Admin identity not found or disabled');
    }
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
      externalReviewer: reviewerToken,
    };
  }
}
