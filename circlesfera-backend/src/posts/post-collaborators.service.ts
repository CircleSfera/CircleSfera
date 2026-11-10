import type { NotificationCreateEvent } from '@circlesfera/shared';
import { ErrorCode, PROFILE_PINS_MAX } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums, Visibility } from '@prisma/client';
import { Queue } from 'bullmq';
import { AppException } from '../common/errors/app.exception.js';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { LISTED_POST } from '../common/policies/removed-content.policy.js';
import { PUBLIC_PROFILE_SELECT } from '../common/selects/public-profile.select.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { countProfilePins } from './profile-pins.js';

const NotificationType = $Enums.NotificationType;

// The co-author of a post or Frame shown with it: only once it accepted.
export const ACCEPTED_COLLABORATOR_INCLUDE = {
  select: {
    status: true,
    pinnedAt: true,
    profile: { select: PUBLIC_PROFILE_SELECT },
  },
} as const;

// What a post shows of its collaborator to anyone: the Profile once it
// accepted, with when it pinned the post on its own profile (null if it did
// not), as anyone sees on that profile; nothing while it is only invited.
export function shownCollaborator(
  collaborator:
    | {
        status: $Enums.CollaborationStatus;
        profile: unknown;
        pinnedAt?: Date | null;
      }
    | null
    | undefined,
) {
  return collaborator?.status === 'ACCEPTED'
    ? {
        ...(collaborator.profile as Record<string, unknown>),
        pinnedAt: collaborator.pinnedAt ?? null,
      }
    : null;
}

const notFound = () =>
  AppException.NotFound(
    ErrorCode.COLLAB_NOT_FOUND,
    'No collaboration of this Profile on the post',
  );

// The one collaborator of a post or Frame. Its author invites one other
// Profile; that Profile accepts or declines. Once accepted, the post shows on
// both profiles and reaches the followers of both; the author keeps every
// control over it. Either side can end it.
@Injectable()
export class PostCollaboratorsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly eventEmitter: EventEmitter2,
    @InjectQueue('feed-fanout') private readonly feedFanoutQueue: Queue,
  ) {}

  // The author's view of its post's collaborator, invited or accepted.
  // Ownership is checked by OwnershipGuard.
  async get(postId: string) {
    const row = await this.prisma.postCollaborator.findUnique({
      where: { postId },
      select: {
        status: true,
        invitedAt: true,
        respondedAt: true,
        profile: { select: PUBLIC_PROFILE_SELECT },
      },
    });
    return row ?? null;
  }

  // The author invites one Profile. Only a public, unpaid post that is shown
  // can carry one, and only one. Ownership is checked by OwnershipGuard.
  async invite(postId: string, username: string) {
    const [post, invitee] = await Promise.all([
      this.prisma.post.findFirst({
        where: { id: postId, ...LISTED_POST },
        select: {
          id: true,
          profileId: true,
          visibility: true,
          isPremium: true,
          priceCents: true,
          collaborator: { select: { profileId: true } },
        },
      }),
      this.prisma.profile.findFirst({
        where: { username: { equals: username, mode: 'insensitive' } },
        select: { id: true },
      }),
    ]);
    if (!post) {
      throw AppException.NotFound(ErrorCode.POST_NOT_FOUND, 'Post not found');
    }
    if (
      !invitee ||
      (await isBlockedEitherWay(this.prisma, post.profileId, invitee.id))
    ) {
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    if (
      invitee.id === post.profileId ||
      post.visibility !== Visibility.PUBLIC ||
      post.isPremium ||
      post.priceCents > 0
    ) {
      throw AppException.BadRequest(
        ErrorCode.COLLAB_NOT_ALLOWED,
        'Only a public, unpaid post can have a collaborator',
      );
    }
    if (post.collaborator) {
      if (post.collaborator.profileId === invitee.id) {
        return this.get(postId);
      }
      throw AppException.Conflict(
        ErrorCode.COLLABORATOR_EXISTS,
        'A post has one collaborator',
      );
    }

    try {
      await this.prisma.postCollaborator.create({
        data: { postId, profileId: invitee.id },
      });
    } catch (error) {
      // Two invitations at once: the post's key lets only one in.
      if ((error as { code?: string }).code === 'P2002') {
        throw AppException.Conflict(
          ErrorCode.COLLABORATOR_EXISTS,
          'A post has one collaborator',
        );
      }
      throw error;
    }
    this.eventEmitter.emit('notification.create', {
      recipientId: invitee.id,
      senderId: post.profileId,
      type: NotificationType.COLLAB_INVITE,
      notice: { key: 'collab_invited' },
      postId,
    } satisfies NotificationCreateEvent['payload']);
    return this.get(postId);
  }

  // The author withdraws an invitation or removes the collaborator.
  // Ownership is checked by OwnershipGuard.
  async remove(postId: string) {
    await this.prisma.postCollaborator.deleteMany({ where: { postId } });
    return { postId, collaborator: null };
  }

  // The invitations a Profile has not answered yet, newest first.
  async invitations(profileId: string) {
    const rows = await this.prisma.postCollaborator.findMany({
      where: {
        profileId,
        status: 'PENDING',
        post: { ...LISTED_POST },
      },
      orderBy: [{ invitedAt: 'desc' }, { postId: 'asc' }],
      take: 50,
      select: {
        invitedAt: true,
        post: {
          select: {
            id: true,
            type: true,
            caption: true,
            createdAt: true,
            profile: { select: PUBLIC_PROFILE_SELECT },
            media: {
              orderBy: { order: 'asc' },
              take: 1,
              select: {
                type: true,
                url: true,
                thumbnailUrl: true,
                media: { select: { url: true, thumbnailUrl: true } },
              },
            },
          },
        },
      },
    });
    return rows.map(({ invitedAt, post }) => ({
      invitedAt,
      post: {
        ...post,
        media: post.media.map(({ media, ...item }) => ({
          ...item,
          url: media?.url ?? item.url,
          thumbnailUrl: media?.thumbnailUrl ?? item.thumbnailUrl,
        })),
      },
    }));
  }

  // The invited Profile accepts: the post shows on its profile and reaches
  // its followers too.
  async accept(profileId: string, postId: string) {
    const row = await this.prisma.postCollaborator.findUnique({
      where: { postId },
      select: {
        profileId: true,
        status: true,
        post: {
          select: {
            profileId: true,
            visibility: true,
            deletedAt: true,
            archivedAt: true,
            moderationStatus: true,
          },
        },
      },
    });
    if (
      !row ||
      row.profileId !== profileId ||
      row.post.deletedAt ||
      row.post.archivedAt ||
      row.post.moderationStatus === 'REMOVED'
    ) {
      throw notFound();
    }
    if (row.status === 'ACCEPTED') return { postId, status: row.status };
    if (await isBlockedEitherWay(this.prisma, row.post.profileId, profileId)) {
      throw notFound();
    }

    const updated = await this.prisma.postCollaborator.updateMany({
      where: { postId, profileId, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    if (updated.count === 0) throw notFound();

    this.eventEmitter.emit('notification.create', {
      recipientId: row.post.profileId,
      senderId: profileId,
      type: NotificationType.COLLAB_ACCEPTED,
      notice: { key: 'collab_accepted' },
      postId,
    } satisfies NotificationCreateEvent['payload']);
    // Its followers' Following feeds get it, as the author's did.
    if (row.post.visibility === Visibility.PUBLIC) {
      await this.feedFanoutQueue.add('distribute', {
        postId,
        authorId: profileId,
      });
    }
    return { postId, status: 'ACCEPTED' as const };
  }

  // The collaborator pins the post on its own profile. The author's pin is
  // apart and stays the author's. It counts toward the collaborator's
  // PROFILE_PINS_MAX; pinning one already pinned changes nothing.
  async pin(profileId: string, postId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.postCollaborator.findFirst({
        where: { postId, profileId, status: 'ACCEPTED', post: LISTED_POST },
        select: { pinnedAt: true },
      });
      if (!row) throw notFound();
      if (row.pinnedAt) return { postId, pinnedAt: row.pinnedAt };
      // The Profile is locked so two pins at once cannot pass the limit.
      await tx.$queryRaw`SELECT id FROM "profiles" WHERE id = ${profileId} FOR UPDATE`;
      if ((await countProfilePins(tx, profileId)) >= PROFILE_PINS_MAX) {
        throw AppException.Conflict(
          ErrorCode.PROFILE_PINS_FULL,
          `A Profile pins at most ${PROFILE_PINS_MAX} posts`,
        );
      }
      const pinnedAt = new Date();
      await tx.postCollaborator.update({
        where: { postId },
        data: { pinnedAt },
      });
      return { postId, pinnedAt };
    });
  }

  // The collaborator unpins it from its own profile.
  async unpin(profileId: string, postId: string) {
    const updated = await this.prisma.postCollaborator.updateMany({
      where: { postId, profileId, status: 'ACCEPTED' },
      data: { pinnedAt: null },
    });
    if (updated.count === 0) throw notFound();
    return { postId, pinnedAt: null };
  }

  // The invited Profile declines, or the collaborator leaves: the post is
  // the author's alone again.
  async leave(profileId: string, postId: string) {
    const removed = await this.prisma.postCollaborator.deleteMany({
      where: { postId, profileId },
    });
    if (removed.count === 0) throw notFound();
    return { postId, collaborator: null };
  }
}
