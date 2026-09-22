import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as cookie from 'cookie';
import type { Socket } from 'socket.io';
import { AccountStateService } from '../../auth/services/account-state.service.js';
import { ACCESS_TOKEN_COOKIE } from '../../common/config/cookie.config.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface SocketAuthUser extends JwtPayload {
  profileId: string;
}

export interface AuthenticatedClientData {
  user: SocketAuthUser;
  conversationIds: Set<string>;
}

@Injectable()
export class SocketAuthService {
  private readonly logger = new Logger(SocketAuthService.name);

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AccountStateService)
    private readonly accountStateService: AccountStateService,
  ) {}

  /**
   * Extracts JWT token from socket handshake (Cookie first, then Bearer header).
   */
  extractToken(client: Socket): string | undefined {
    const cookieHeader = client.handshake.headers.cookie;

    if (cookieHeader) {
      try {
        const cookies = cookie.parse(cookieHeader);
        if (cookies[ACCESS_TOKEN_COOKIE]) {
          return cookies[ACCESS_TOKEN_COOKIE];
        }
      } catch (parseError: unknown) {
        this.logger.error(
          `Failed to parse socket handshake cookies: ${
            parseError instanceof Error ? parseError.message : 'Unknown'
          }`,
        );
      }
    }

    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    return undefined;
  }

  /**
   * Authenticates a connected Socket.IO client, validating JWT and user active/suspension status.
   */
  async authenticate(client: Socket): Promise<AuthenticatedClientData> {
    const token = this.extractToken(client);
    if (!token) {
      throw new UnauthorizedException('No token found');
    }

    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
      secret,
    });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { profiles: true },
    });

    const profile = user?.profiles?.[0];
    this.accountStateService.assertOperational(user, profile);

    const profileId = profile?.id;
    if (!profileId) {
      throw new UnauthorizedException('Profile not found');
    }

    const userConvs = await this.prisma.participant.findMany({
      where: { profileId, deletedAt: null },
      select: { conversationId: true },
    });

    return {
      user: { ...payload, profileId },
      conversationIds: new Set(userConvs.map((c) => c.conversationId)),
    };
  }
}
