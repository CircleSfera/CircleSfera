import {
  ErrorCode,
  FIRST_PAID_ITEMS_REVIEWED_BY_STAFF,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AdminAction, ModerationStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { staffPassedPaidCount } from '../common/policies/first-paid-review.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './use-cases/content/commands/log-admin-action.use-case.js';

export type FirstPaidItemType = 'POST' | 'STORY';

/** The most items the queue shows at once, oldest first. */
const QUEUE_SIZE = 50;

/** Priced, shown, not on sale yet and not deleted by its author. */
const WAITING = {
  priceCents: { gt: 0 },
  moderationStatus: ModerationStatus.VISIBLE,
  moderationPassedAt: null,
  deletedAt: null,
} as const;

const PROFILE = { select: { id: true, username: true, avatar: true } };

/**
 * The first paid posts and stories of each Profile, which a person on staff
 * passes before they are sold. Removing one goes through ordinary
 * moderation, with its reason and notice.
 */
@Injectable()
export class AdminFirstPaidReviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogAdminActionUseCase)
    private readonly logAdminAction: LogAdminActionUseCase,
  ) {}

  async list() {
    const [posts, stories] = await Promise.all([
      this.prisma.post.findMany({
        where: WAITING,
        orderBy: { createdAt: 'asc' },
        take: QUEUE_SIZE,
        select: {
          id: true,
          caption: true,
          priceCents: true,
          createdAt: true,
          profile: PROFILE,
          media: true,
        },
      }),
      this.prisma.story.findMany({
        where: WAITING,
        orderBy: { createdAt: 'asc' },
        take: QUEUE_SIZE,
        select: {
          id: true,
          priceCents: true,
          createdAt: true,
          url: true,
          thumbnailUrl: true,
          mediaType: true,
          profile: PROFILE,
        },
      }),
    ]);

    const rows = [
      ...posts.map((p) => ({
        type: 'POST' as const,
        id: p.id,
        caption: p.caption,
        priceCents: p.priceCents,
        createdAt: p.createdAt,
        profile: p.profile,
        media: p.media,
      })),
      ...stories.map((s) => ({
        type: 'STORY' as const,
        id: s.id,
        caption: null,
        priceCents: s.priceCents,
        createdAt: s.createdAt,
        profile: s.profile,
        media: [
          { url: s.url, thumbnailUrl: s.thumbnailUrl, type: s.mediaType },
        ],
      })),
    ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Only Profiles still under the threshold wait for a person: once a
    // person has passed enough of them, automatic moderation passes the rest.
    const passed = new Map<string, number>();
    for (const profileId of new Set(rows.map((r) => r.profile.id))) {
      passed.set(profileId, await staffPassedPaidCount(this.prisma, profileId));
    }
    const items = rows
      .filter(
        (r) =>
          (passed.get(r.profile.id) ?? 0) < FIRST_PAID_ITEMS_REVIEWED_BY_STAFF,
      )
      .slice(0, QUEUE_SIZE)
      .map((r) => ({
        ...r,
        passedByStaff: passed.get(r.profile.id) ?? 0,
      }));
    return { items, needed: FIRST_PAID_ITEMS_REVIEWED_BY_STAFF };
  }

  /**
   * A person on staff looked at it and passes it: it goes on sale, counts
   * among its Profile's items passed by a person, and the decision is in the
   * audit log. Only a priced item still shown and waiting can be passed.
   */
  async approve(adminId: string, type: FirstPaidItemType, id: string) {
    const data = {
      moderationPassedAt: new Date(),
      moderationPassedByStaff: true,
    };
    await this.prisma.$transaction(async (tx) => {
      const { count } =
        type === 'POST'
          ? await tx.post.updateMany({ where: { id, ...WAITING }, data })
          : await tx.story.updateMany({ where: { id, ...WAITING }, data });
      if (count === 0) {
        throw AppException.NotFound(
          type === 'POST'
            ? ErrorCode.POST_NOT_FOUND
            : ErrorCode.STORY_NOT_FOUND,
          'Nothing priced and waiting for review here',
        );
      }
      await this.logAdminAction.execute(
        adminId,
        AdminAction.PAID_CONTENT_APPROVED,
        type.toLowerCase(),
        id,
        undefined,
        undefined,
        tx,
      );
    });
    return { approved: true };
  }
}
