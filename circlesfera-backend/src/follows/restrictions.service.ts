import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import type { ProfileWithUser } from './follows.service.js';

// Restricting and unrestricting another Profile, for the active Profile. The
// restricted Profile is never told: nothing here notifies it, and what it
// would notice (comments waiting, a chat in requests, no read receipts, no
// active status) is applied where comments, chats and presence are served.
@Injectable()
export class RestrictionsService {
  private readonly logger = new Logger(RestrictionsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppGateway) private readonly gateway: AppGateway,
  ) {}

  // Restricts a Profile by username. Restricting one already restricted
  // changes nothing.
  async restrict(restricterId: string, username: string) {
    const restrictedId = await this.profileIdOf(username);
    if (restrictedId === restricterId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_RESTRICT_SELF,
        'Cannot restrict yourself',
      );
    }
    await this.prisma.restriction.upsert({
      where: { restricterId_restrictedId: { restricterId, restrictedId } },
      create: { restricterId, restrictedId },
      update: {},
    });
    // Its open connections stop hearing when the restricter comes and goes.
    this.presence(() =>
      this.gateway.server
        .in(`user:${restrictedId}`)
        .socketsLeave(`presence:${restricterId}`),
    );
    return { restricted: true };
  }

  // Unrestricts a Profile by username. Unrestricting one not restricted
  // changes nothing.
  async unrestrict(restricterId: string, username: string) {
    const restrictedId = await this.profileIdOf(username);
    const { count } = await this.prisma.restriction.deleteMany({
      where: { restricterId, restrictedId },
    });
    if (count > 0) {
      // A follower hears again when the restricter comes and goes.
      const follows = await this.prisma.follow.findFirst({
        where: { followerId: restrictedId, followingId: restricterId },
        select: { id: true },
      });
      if (follows) {
        this.presence(() =>
          this.gateway.server
            .in(`user:${restrictedId}`)
            .socketsJoin(`presence:${restricterId}`),
        );
      }
    }
    return { restricted: false };
  }

  // Whether the active Profile restricts this one; it is the active
  // Profile's own choice, so only it is told.
  async status(restricterId: string, username: string) {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!profile) return { restricted: false };
    const row = await this.prisma.restriction.findUnique({
      where: {
        restricterId_restrictedId: { restricterId, restrictedId: profile.id },
      },
      select: { id: true },
    });
    return { restricted: Boolean(row) };
  }

  // The Profiles the active Profile restricts, most recent first.
  async list(restricterId: string): Promise<ProfileWithUser[]> {
    const rows = await this.prisma.restriction.findMany({
      where: { restricterId },
      orderBy: { createdAt: 'desc' },
      include: { restricted: { select: PUBLIC_PROFILE_SELECT } },
    });
    return rows.map((r) => r.restricted);
  }

  private async profileIdOf(username: string): Promise<string> {
    const profile = await this.prisma.profile.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!profile) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    return profile.id;
  }

  // Moving live connections between rooms never fails the change: the next
  // connection reads the rooms from the database anyway.
  private presence(move: () => void) {
    try {
      move();
    } catch (err) {
      this.logger.warn(
        `Could not move live connections after a restriction change: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
