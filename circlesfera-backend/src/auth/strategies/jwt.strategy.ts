import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '../../common/config/cookie.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountStateService } from '../services/account-state.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

// Custom extractor: tries HTTP-only cookie first, then Authorization header.
// This provides backwards compatibility during the migration period.
function cookieOrHeaderExtractor(req: Request): string | null {
  // 1. Try cookie first
  const cookies = req?.cookies as Record<string, string> | undefined;
  const cookieToken = cookies?.[ACCESS_TOKEN_COOKIE];
  if (cookieToken) {
    return cookieToken;
  }
  // 2. Fall back to Authorization: Bearer <token>
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountStateService)
    private readonly accountStateService: AccountStateService,
  ) {
    super({
      jwtFromRequest: cookieOrHeaderExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<{
    userId: string;
    email: string;
    role: string;
    profileId: string;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    const profile = user
      ? await this.prisma.profile.findFirst({
          where: { userId: user.id },
          select: {
            id: true,
            isAccountBanned: true,
            accountBanReason: true,
            suspendedUntil: true,
          },
        })
      : null;

    this.accountStateService.assertOperational(user, profile);

    const role = (user as { role?: string }).role || 'USER';

    return {
      userId: user!.id,
      email: user!.email,
      role: role,
      profileId: profile?.id || '',
    };
  }
}
