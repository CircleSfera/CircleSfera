import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ACCESS_TOKEN_COOKIE } from '../../common/config/cookie.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AccountStateService } from '../services/account-state.service.js';
import {
  pickSessionProfile,
  SESSION_PROFILE_ORDER,
  SESSION_PROFILE_SELECT,
} from '../services/session-profile.util.js';

export interface JwtPayload {
  sub: string;
  email: string;
  profileId?: string;
  // The sign-in that opened the session. Absent in tokens issued before
  // sessions carried it.
  signInId?: string;
  jti?: string;
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
    signInId: string;
    isTestAccount: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    // The session's Profile (rejected below if it is banned or suspended);
    // tokens without a Profile fall back to the oldest usable one.
    const profile = user
      ? pickSessionProfile(
          await this.prisma.profile.findMany({
            where: { userId: user.id },
            orderBy: SESSION_PROFILE_ORDER,
            select: SESSION_PROFILE_SELECT,
          }),
          payload.profileId,
        )
      : undefined;

    this.accountStateService.assertOperational(user, profile);

    // The sign-in of the session, inside this account. A token that names
    // none was issued before sessions carried it and is read with the first
    // sign-in of the account. One that names a sign-in of another account,
    // or one that is gone, is refused.
    const signIn = await this.prisma.signIn.findFirst({
      where: {
        userId: user!.id,
        ...(payload.signInId && { id: payload.signInId }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, email: true },
    });
    if (!signIn) {
      throw new UnauthorizedException();
    }

    const role = (user as { role?: string }).role || 'USER';

    return {
      userId: user!.id,
      email: signIn.email,
      role: role,
      profileId: profile?.id || '',
      signInId: signIn.id,
      isTestAccount: user!.isTestAccount === true,
    };
  }
}
