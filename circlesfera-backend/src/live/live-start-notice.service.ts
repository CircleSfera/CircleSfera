import { Inject, Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE = 500;
// A start asked twice at once answers the same live; it is told once.
const REMEMBERED = 200;

// Tells the people who follow a Profile that it has started a live
// broadcast. It runs after the live exists and never holds its start back: a
// follower who is not told is not a reason for the host not to be on air.
@Injectable()
export class LiveStartNoticeService {
  private readonly logger = new Logger(LiveStartNoticeService.name);
  private readonly told: string[] = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NotificationsService)
    private readonly notifications: NotificationsService,
  ) {}

  // Returns how many followers were told.
  async tellFollowers(streamId: string, hostProfileId: string) {
    if (this.told.includes(streamId)) return 0;
    this.told.push(streamId);
    if (this.told.length > REMEMBERED) this.told.shift();

    try {
      const host = await this.prisma.profile.findUnique({
        where: { id: hostProfileId },
        select: { user: { select: { isTestAccount: true } } },
      });
      if (!host) return 0;

      const now = new Date();
      let told = 0;
      let after: string | undefined;
      for (;;) {
        const followers = await this.prisma.follow.findMany({
          where: {
            followingId: hostProfileId,
            status: 'ACCEPTED',
            follower: {
              // Only the host's own audience: a Test Account never reaches
              // a real person, nor the other way round.
              user: {
                isTestAccount: host.user?.isTestAccount ?? false,
                isActive: true,
                deactivatedAt: null,
              },
              // Whoever muted the host asked not to hear from them.
              muting: {
                none: {
                  mutedId: hostProfileId,
                  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                },
              },
            },
          },
          select: { id: true, followerId: true },
          orderBy: { id: 'asc' },
          take: PAGE,
          ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        });
        if (followers.length === 0) break;

        // create() refuses across a block and decides the push by the
        // follower's own switch; it answers null instead of throwing.
        for (const follower of followers) {
          const notice = await this.notifications.create({
            recipientId: follower.followerId,
            senderId: hostProfileId,
            type: NotificationType.LIVE_STARTED,
            notice: { key: 'live_started' },
            targetType: 'live',
            targetId: streamId,
          });
          if (notice) told += 1;
        }
        if (followers.length < PAGE) break;
        after = followers[followers.length - 1].id;
      }
      return told;
    } catch (error) {
      this.logger.error(
        `Followers of the live ${streamId} could not be told`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
