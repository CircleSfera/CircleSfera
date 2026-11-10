import {
  ErrorCode,
  FIRST_PAID_ITEMS_REVIEWED_BY_STAFF,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AdminAction, ModerationStatus } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import { PASSED_BY_STAFF } from '../common/policies/first-paid-review.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LogAdminActionUseCase } from './use-cases/content/commands/log-admin-action.use-case.js';

export type FirstPaidItemType = 'POST' | 'STORY';

/** One priced post or story waiting for a person, as the queue shows it. */
export type FirstPaidQueueItem = {
  type: FirstPaidItemType;
  id: string;
  caption: string | null;
  priceCents: number;
  createdAt: Date;
  /** When its author last edited it; sent back when passing it. */
  contentEditedAt: Date | null;
  profile: { id: string; username: string; avatar: string | null };
  media: { url: string; thumbnailUrl: string | null; type: string | null }[];
  /** How many priced items of its Profile a person has passed. */
  passedByStaff: number;
};

/** The most items the queue shows at once, oldest first. */
const QUEUE_SIZE = 50;
/** The most waiting items read to find them: paid content is rare. */
const SCAN_LIMIT = 2000;

/** Priced, shown, not on sale yet and not deleted by its author. */
const WAITING = {
  priceCents: { gt: 0 },
  moderationStatus: ModerationStatus.VISIBLE,
  moderationPassedAt: null,
  deletedAt: null,
} as const;

const PROFILE = { select: { id: true, username: true, avatar: true } };
const BRIEF = { id: true, profileId: true, createdAt: true } as const;

type Brief = { id: string; profileId: string; createdAt: Date };

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

  /** How many priced items a person passed, for each of these Profiles. */
  private async passedByProfile(profileIds: string[]) {
    const where = { profileId: { in: profileIds }, ...PASSED_BY_STAFF };
    const [posts, stories] = await Promise.all([
      this.prisma.post.groupBy({ by: ['profileId'], where, _count: true }),
      this.prisma.story.groupBy({ by: ['profileId'], where, _count: true }),
    ]);
    const passed = new Map<string, number>();
    for (const row of [...posts, ...stories]) {
      passed.set(row.profileId, (passed.get(row.profileId) ?? 0) + row._count);
    }
    return passed;
  }

  async list() {
    // Every waiting item first, briefly, so items of Profiles a person has
    // already passed enough of never crowd out a new creator's.
    const [postBriefs, storyBriefs] = await Promise.all([
      this.prisma.post.findMany({
        where: WAITING,
        orderBy: { createdAt: 'asc' },
        take: SCAN_LIMIT,
        select: BRIEF,
      }),
      this.prisma.story.findMany({
        where: WAITING,
        orderBy: { createdAt: 'asc' },
        take: SCAN_LIMIT,
        select: BRIEF,
      }),
    ]);
    const passed = await this.passedByProfile([
      ...new Set([...postBriefs, ...storyBriefs].map((b) => b.profileId)),
    ]);
    const due = (b: Brief) =>
      (passed.get(b.profileId) ?? 0) < FIRST_PAID_ITEMS_REVIEWED_BY_STAFF;
    const chosen = [
      ...postBriefs.filter(due).map((b) => ({ ...b, type: 'POST' as const })),
      ...storyBriefs.filter(due).map((b) => ({ ...b, type: 'STORY' as const })),
    ]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, QUEUE_SIZE);

    const ids = (type: FirstPaidItemType) =>
      chosen.filter((c) => c.type === type).map((c) => c.id);
    const [posts, stories] = await Promise.all([
      this.prisma.post.findMany({
        where: { id: { in: ids('POST') } },
        select: {
          id: true,
          caption: true,
          priceCents: true,
          createdAt: true,
          contentEditedAt: true,
          profile: PROFILE,
          // Every picture and video, in the order its author put them: the
          // person passing it sees all of what is sold.
          media: {
            orderBy: { order: 'asc' },
            select: { url: true, thumbnailUrl: true, type: true },
          },
        },
      }),
      this.prisma.story.findMany({
        where: { id: { in: ids('STORY') } },
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

    const byKey = new Map<string, Omit<FirstPaidQueueItem, 'passedByStaff'>>();
    for (const p of posts) {
      byKey.set(`POST:${p.id}`, { type: 'POST', ...p });
    }
    for (const s of stories) {
      byKey.set(`STORY:${s.id}`, {
        type: 'STORY',
        id: s.id,
        caption: null,
        priceCents: s.priceCents,
        createdAt: s.createdAt,
        contentEditedAt: null,
        profile: s.profile,
        media: [
          { url: s.url, thumbnailUrl: s.thumbnailUrl, type: s.mediaType },
        ],
      });
    }
    const items = chosen.flatMap((c): FirstPaidQueueItem[] => {
      const item = byKey.get(`${c.type}:${c.id}`);
      return item
        ? [{ ...item, passedByStaff: passed.get(c.profileId) ?? 0 }]
        : [];
    });
    return { items, needed: FIRST_PAID_ITEMS_REVIEWED_BY_STAFF };
  }

  /**
   * A person on staff looked at it and passes it: it goes on sale, counts
   * among its Profile's items passed by a person, and the decision is in the
   * audit log. Only a priced item still shown and waiting can be passed. A
   * post is passed only as it was when staff opened it (`seenEditedAt`, its
   * last edit then): one its author edited since is refused, to be looked
   * at again.
   */
  async approve(
    adminId: string,
    type: FirstPaidItemType,
    id: string,
    seenEditedAt: string | null = null,
  ) {
    const data = {
      moderationPassedAt: new Date(),
      moderationPassedByStaff: true,
    };
    await this.prisma.$transaction(async (tx) => {
      const { count } =
        type === 'POST'
          ? await tx.post.updateMany({
              where: {
                id,
                ...WAITING,
                contentEditedAt: seenEditedAt ? new Date(seenEditedAt) : null,
              },
              data,
            })
          : await tx.story.updateMany({ where: { id, ...WAITING }, data });
      if (count === 0) {
        const changed =
          type === 'POST' &&
          (await tx.post.count({ where: { id, ...WAITING } })) > 0;
        if (changed) {
          throw AppException.Conflict(
            ErrorCode.CONTENT_CHANGED_SINCE_REVIEW,
            'Its author changed it after it was opened',
          );
        }
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
