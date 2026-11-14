import { ErrorCode, PROFILE_PINS_MAX } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PostCollaboratorsService,
  shownCollaborator,
} from './post-collaborators.service.js';

const isBlockedEitherWay = vi.hoisted(() => vi.fn());
vi.mock('../common/policies/block.policy.js', () => ({ isBlockedEitherWay }));

describe('PostCollaboratorsService', () => {
  const prisma = {
    post: { findFirst: vi.fn() },
    profile: { findFirst: vi.fn() },
    postCollaborator: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  const events = { emit: vi.fn() };
  const fanout = { add: vi.fn() };
  let service: PostCollaboratorsService;

  const post = (over: Record<string, unknown> = {}) => ({
    id: 'post-1',
    profileId: 'author',
    visibility: 'PUBLIC',
    collaborator: null,
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PostCollaboratorsService(
      prisma as never,
      events as never,
      fanout as never,
    );
    isBlockedEitherWay.mockResolvedValue(false);
    prisma.post.findFirst.mockResolvedValue(post());
    prisma.profile.findFirst.mockResolvedValue({ id: 'ana' });
    prisma.postCollaborator.findUnique.mockResolvedValue({
      status: 'PENDING',
      profile: { id: 'ana' },
    });
  });

  describe('invite', () => {
    it('invites one Profile and tells it', async () => {
      await service.invite('post-1', 'Ana');

      expect(prisma.postCollaborator.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', profileId: 'ana' },
      });
      expect(events.emit).toHaveBeenCalledWith('notification.create', {
        recipientId: 'ana',
        senderId: 'author',
        type: 'COLLAB_INVITE',
        notice: { key: 'collab_invited' },
        postId: 'post-1',
      });
      // Only a post that is shown: not deleted nor archived.
      expect(prisma.post.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({ id: 'post-1', deletedAt: null }),
      );
    });

    it.each([['a post for followers only', { visibility: 'FOLLOWERS' }]])(
      'refuses %s',
      async (_label, over) => {
        prisma.post.findFirst.mockResolvedValue(post(over));
        await expect(service.invite('post-1', 'ana')).rejects.toMatchObject({
          errorCode: ErrorCode.COLLAB_NOT_ALLOWED,
        });
        expect(prisma.postCollaborator.create).not.toHaveBeenCalled();
      },
    );

    it('refuses the author itself', async () => {
      prisma.profile.findFirst.mockResolvedValue({ id: 'author' });
      await expect(service.invite('post-1', 'me')).rejects.toMatchObject({
        errorCode: ErrorCode.COLLAB_NOT_ALLOWED,
      });
    });

    it('treats a blocked or unknown Profile as not found', async () => {
      isBlockedEitherWay.mockResolvedValue(true);
      await expect(service.invite('post-1', 'ana')).rejects.toMatchObject({
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
      prisma.profile.findFirst.mockResolvedValue(null);
      await expect(service.invite('post-1', 'nobody')).rejects.toMatchObject({
        errorCode: ErrorCode.USER_NOT_FOUND,
      });
      expect(prisma.postCollaborator.create).not.toHaveBeenCalled();
    });

    it('refuses a missing post', async () => {
      prisma.post.findFirst.mockResolvedValue(null);
      await expect(service.invite('post-1', 'ana')).rejects.toMatchObject({
        errorCode: ErrorCode.POST_NOT_FOUND,
      });
    });

    it('keeps one collaborator: the same one again changes nothing, another is refused', async () => {
      prisma.post.findFirst.mockResolvedValue(
        post({ collaborator: { profileId: 'ana' } }),
      );
      await service.invite('post-1', 'ana');
      expect(prisma.postCollaborator.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();

      prisma.profile.findFirst.mockResolvedValue({ id: 'bea' });
      await expect(service.invite('post-1', 'bea')).rejects.toMatchObject({
        errorCode: ErrorCode.COLLABORATOR_EXISTS,
      });
    });

    it('lets only one of two invitations at once in', async () => {
      prisma.postCollaborator.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.invite('post-1', 'ana')).rejects.toMatchObject({
        errorCode: ErrorCode.COLLABORATOR_EXISTS,
      });
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    const invited = (over: Record<string, unknown> = {}) => ({
      profileId: 'ana',
      status: 'PENDING',
      post: {
        profileId: 'author',
        visibility: 'PUBLIC',
        deletedAt: null,
        archivedAt: null,
        moderationStatus: 'VISIBLE',
      },
      ...over,
    });

    it('accepts, tells the author and sends it to its followers', async () => {
      prisma.postCollaborator.findUnique.mockResolvedValue(invited());
      prisma.postCollaborator.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.accept('ana', 'post-1')).resolves.toEqual({
        postId: 'post-1',
        status: 'ACCEPTED',
      });
      expect(prisma.postCollaborator.updateMany).toHaveBeenCalledWith({
        where: { postId: 'post-1', profileId: 'ana', status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
      expect(events.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'author',
          senderId: 'ana',
          type: 'COLLAB_ACCEPTED',
        }),
      );
      expect(fanout.add).toHaveBeenCalledWith('distribute', {
        postId: 'post-1',
        authorId: 'ana',
      });
    });

    it('changes nothing when already accepted', async () => {
      prisma.postCollaborator.findUnique.mockResolvedValue(
        invited({ status: 'ACCEPTED' }),
      );
      await service.accept('ana', 'post-1');
      expect(prisma.postCollaborator.updateMany).not.toHaveBeenCalled();
      expect(fanout.add).not.toHaveBeenCalled();
    });

    it.each([
      ['no invitation', null],
      ['an invitation of someone else', invited({ profileId: 'bea' })],
      [
        'a deleted post',
        invited({ post: { ...invited().post, deletedAt: new Date() } }),
      ],
      [
        'a removed post',
        invited({ post: { ...invited().post, moderationStatus: 'REMOVED' } }),
      ],
    ])('refuses %s', async (_label, row) => {
      prisma.postCollaborator.findUnique.mockResolvedValue(row);
      await expect(service.accept('ana', 'post-1')).rejects.toMatchObject({
        errorCode: ErrorCode.COLLAB_NOT_FOUND,
      });
      expect(prisma.postCollaborator.updateMany).not.toHaveBeenCalled();
    });

    it('refuses across a block', async () => {
      prisma.postCollaborator.findUnique.mockResolvedValue(invited());
      isBlockedEitherWay.mockResolvedValue(true);
      await expect(service.accept('ana', 'post-1')).rejects.toMatchObject({
        errorCode: ErrorCode.COLLAB_NOT_FOUND,
      });
    });

    it('refuses when the invitation went away meanwhile', async () => {
      prisma.postCollaborator.findUnique.mockResolvedValue(invited());
      prisma.postCollaborator.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.accept('ana', 'post-1')).rejects.toMatchObject({
        errorCode: ErrorCode.COLLAB_NOT_FOUND,
      });
      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  it('lets the invited Profile decline or leave, and nobody else', async () => {
    prisma.postCollaborator.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.leave('ana', 'post-1')).resolves.toEqual({
      postId: 'post-1',
      collaborator: null,
    });
    expect(prisma.postCollaborator.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1', profileId: 'ana' },
    });

    prisma.postCollaborator.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.leave('bea', 'post-1')).rejects.toMatchObject({
      errorCode: ErrorCode.COLLAB_NOT_FOUND,
    });
  });

  it('lets the author remove the collaborator', async () => {
    await service.remove('post-1');
    expect(prisma.postCollaborator.deleteMany).toHaveBeenCalledWith({
      where: { postId: 'post-1' },
    });
  });

  it('lists the invitations not answered yet, of posts still shown', async () => {
    prisma.postCollaborator.findMany.mockResolvedValue([
      {
        invitedAt: new Date('2026-11-09'),
        post: {
          id: 'post-1',
          media: [
            {
              type: 'image',
              url: 'old',
              thumbnailUrl: null,
              media: { url: 'new', thumbnailUrl: 'thumb' },
            },
          ],
        },
      },
    ]);

    const [invitation] = await service.invitations('ana');

    const query = prisma.postCollaborator.findMany.mock.calls[0][0];
    expect(query.where).toEqual(
      expect.objectContaining({ profileId: 'ana', status: 'PENDING' }),
    );
    expect(query.where.post).toEqual(
      expect.objectContaining({ deletedAt: null, archivedAt: null }),
    );
    expect(invitation.post.media[0]).toEqual({
      type: 'image',
      url: 'new',
      thumbnailUrl: 'thumb',
    });
  });

  it('shows the co-author only once it accepted', () => {
    expect(
      shownCollaborator({ status: 'ACCEPTED', profile: { id: 'ana' } }),
    ).toEqual({ id: 'ana', pinnedAt: null });
    // With when it pinned the post on its own profile.
    const at = new Date('2026-11-05T00:00:00Z');
    expect(
      shownCollaborator({
        status: 'ACCEPTED',
        profile: { id: 'ana' },
        pinnedAt: at,
      }),
    ).toEqual({ id: 'ana', pinnedAt: at });
    expect(
      shownCollaborator({ status: 'PENDING', profile: { id: 'ana' } }),
    ).toBeNull();
    expect(shownCollaborator(null)).toBeNull();
  });
  describe("pin on the collaborator's own profile", () => {
    let tx: any;
    beforeEach(() => {
      tx = {
        postCollaborator: {
          findFirst: vi.fn().mockResolvedValue({ pinnedAt: null }),
          count: vi.fn().mockResolvedValue(0),
          update: vi.fn(),
        },
        post: { count: vi.fn().mockResolvedValue(0) },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };
      (prisma as any).$transaction = vi.fn((cb: any) => cb(tx));
    });

    it('pins an accepted collaboration of a listed post, under the Profile lock', async () => {
      const result = await service.pin('ana', 'post-1');

      expect(tx.postCollaborator.findFirst).toHaveBeenCalledWith({
        where: {
          postId: 'post-1',
          profileId: 'ana',
          status: 'ACCEPTED',
          post: expect.objectContaining({ deletedAt: null, archivedAt: null }),
        },
        select: { pinnedAt: true },
      });
      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(tx.postCollaborator.update).toHaveBeenCalledWith({
        where: { postId: 'post-1' },
        data: { pinnedAt: expect.any(Date) },
      });
      expect(result).toEqual({ postId: 'post-1', pinnedAt: expect.any(Date) });
    });

    it('counts its own pins and its pins as collaborator toward one limit', async () => {
      tx.post.count.mockResolvedValue(PROFILE_PINS_MAX - 1);
      tx.postCollaborator.count.mockResolvedValue(1);

      await expect(service.pin('ana', 'post-1')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.PROFILE_PINS_FULL },
      });
      expect(tx.postCollaborator.update).not.toHaveBeenCalled();
    });

    it('changes nothing when already pinned, and refuses one it does not co-author', async () => {
      const at = new Date('2026-11-01T00:00:00Z');
      tx.postCollaborator.findFirst.mockResolvedValueOnce({ pinnedAt: at });
      await expect(service.pin('ana', 'post-1')).resolves.toEqual({
        postId: 'post-1',
        pinnedAt: at,
      });

      tx.postCollaborator.findFirst.mockResolvedValueOnce(null);
      await expect(service.pin('leo', 'post-1')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.COLLAB_NOT_FOUND },
      });
      expect(tx.postCollaborator.update).not.toHaveBeenCalled();
    });

    it('unpins only its own accepted collaboration', async () => {
      prisma.postCollaborator.updateMany.mockResolvedValueOnce({ count: 1 });
      await expect(service.unpin('ana', 'post-1')).resolves.toEqual({
        postId: 'post-1',
        pinnedAt: null,
      });
      expect(prisma.postCollaborator.updateMany).toHaveBeenCalledWith({
        where: { postId: 'post-1', profileId: 'ana', status: 'ACCEPTED' },
        data: { pinnedAt: null },
      });

      prisma.postCollaborator.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(service.unpin('leo', 'post-1')).rejects.toMatchObject({
        response: { errorCode: ErrorCode.COLLAB_NOT_FOUND },
      });
    });
  });
});
