import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaAuthService } from './media-auth.service.js';

describe('MediaAuthService', () => {
  let service: MediaAuthService;

  const mockPrismaService = {
    postMedia: {
      findMany: vi.fn(),
    },
    postUnlock: {
      findUnique: vi.fn(),
    },
    story: {
      findMany: vi.fn(),
    },
    storyUnlock: {
      findUnique: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    messageUnlock: {
      findUnique: vi.fn(),
    },
    participant: {
      findFirst: vi.fn(),
    },
    comment: {
      findMany: vi.fn(),
    },
    collection: {
      findMany: vi.fn(),
    },
    editProject: {
      findMany: vi.fn(),
    },
    follow: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    closeFriend: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Every isAccessAllowed call runs all 5 content-table lookups in
    // parallel; default them all to "no match" so a test only needs to
    // stub the one table it's exercising.
    mockPrismaService.postMedia.findMany.mockResolvedValue([]);
    mockPrismaService.story.findMany.mockResolvedValue([]);
    mockPrismaService.message.findMany.mockResolvedValue([]);
    mockPrismaService.comment.findMany.mockResolvedValue([]);
    mockPrismaService.editProject.findMany.mockResolvedValue([]);
    mockPrismaService.collection.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MediaAuthService>(MediaAuthService);
  });

  describe('Path normalization', () => {
    it('blocks direct static access to GDPR export artifacts', async () => {
      expect(
        await service.isAccessAllowed(
          '/uploads/exports/archive.zip',
          'user-1',
          'profile-1',
        ),
      ).toBe(false);
      expect(
        await service.isAccessAllowed(
          'exports/archive.zip',
          'user-1',
          'profile-1',
        ),
      ).toBe(false);
      expect(
        await service.isAccessAllowed(
          '/uploads/exports/sub/archive.zip',
          null,
          null,
        ),
      ).toBe(false);
      expect(mockPrismaService.postMedia.findMany).not.toHaveBeenCalled();
    });

    it.each([
      ['a dot segment', '/uploads/./3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg'],
      [
        'an encoded dot segment',
        '/uploads/%2e/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg',
      ],
      [
        'an encoded upper-case dot',
        '/uploads/%2E/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg',
      ],
      ['a double slash', '/uploads//3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg'],
      [
        'an encoded slash pair',
        '/uploads/%2F3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg',
      ],
      [
        'a dot inside a folder',
        '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d/./master.m3u8',
      ],
      [
        'a trailing slash',
        '/uploads/3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg/',
      ],
      ['a backslash', '/uploads/.\\3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d.jpg'],
    ])(
      'refuses a path with %s, which Nginx would resolve to a protected file the rows hold under its canonical address',
      async (_kind, uploadPath) => {
        await expect(
          service.isAccessAllowed(uploadPath, null, null),
        ).resolves.toBe(false);
        expect(mockPrismaService.postMedia.findMany).not.toHaveBeenCalled();
      },
    );

    it("gives a segment of a video's stream folder the access of the post that holds the video", async () => {
      const V = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'PRIVATE',
            isPremium: false,
          },
        },
      ]);

      await expect(
        service.isAccessAllowed(`/uploads/${V}/720p_003.ts`, null, null),
      ).resolves.toBe(false);
      // No row names a segment: the folder and the video file are looked up.
      expect(mockPrismaService.postMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { url: { contains: `${V}/` } },
              { url: { contains: `${V}.` } },
              { standardUrl: { contains: `${V}/` } },
              { standardUrl: { contains: `${V}.` } },
              { thumbnailUrl: { contains: `${V}/` } },
              { thumbnailUrl: { contains: `${V}.` } },
            ],
          },
        }),
      );
    });

    it('keeps looking up a file in an ordinary folder by its own path', async () => {
      await service.isAccessAllowed('/uploads/avatars/user.png', null, null);
      expect(mockPrismaService.postMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { url: { contains: 'avatars/user.png' } },
              { standardUrl: { contains: 'avatars/user.png' } },
              { thumbnailUrl: { contains: 'avatars/user.png' } },
            ],
          },
        }),
      );
    });

    it('allows public asset access when no content-owning row matches', async () => {
      expect(
        await service.isAccessAllowed('/uploads/avatars/user.png', null, null),
      ).toBe(true);
    });

    it('strips a query string before the DB lookup so it cannot dodge ownership matching', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'PRIVATE',
            isPremium: false,
          },
        },
      ]);
      await service.isAccessAllowed(
        '/uploads/posts/p1.jpg?x=1',
        'stranger-u',
        'stranger-p',
      );
      expect(mockPrismaService.postMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { url: { contains: 'posts/p1.jpg' } },
              { standardUrl: { contains: 'posts/p1.jpg' } },
              { thumbnailUrl: { contains: 'posts/p1.jpg' } },
            ],
          }),
        }),
      );
    });

    it('percent-decodes the path before the DB lookup', async () => {
      await service.isAccessAllowed('/uploads/posts/p%201.jpg', null, null);
      expect(mockPrismaService.postMedia.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { url: { contains: 'posts/p 1.jpg' } },
              { standardUrl: { contains: 'posts/p 1.jpg' } },
              { thumbnailUrl: { contains: 'posts/p 1.jpg' } },
            ],
          }),
        }),
      );
    });

    it('denies malformed percent-encoding without touching the database', async () => {
      expect(
        await service.isAccessAllowed('/uploads/posts/%E0.jpg', null, null),
      ).toBe(false);
      expect(mockPrismaService.postMedia.findMany).not.toHaveBeenCalled();
    });

    it('denies a decoded path traversal marker without touching the database', async () => {
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/..%2F..%2Fetc%2Fpasswd',
          'user-1',
          'profile-1',
        ),
      ).toBe(false);
      expect(mockPrismaService.postMedia.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Post media', () => {
    it("keeps a private account's public post for its followers, as the post itself is", async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-p',
          post: {
            profileId: 'private-author',
            visibility: 'PUBLIC',
            isPremium: false,
            profile: { privacyLevel: 'PRIVATE' },
          },
        },
      ]);

      await expect(
        service.isAccessAllowed('/uploads/p.jpg', null, null),
      ).resolves.toBe(false);
      mockPrismaService.follow.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.isAccessAllowed('/uploads/p.jpg', 'u-2', 'stranger'),
      ).resolves.toBe(false);
      mockPrismaService.follow.findFirst.mockResolvedValueOnce({ id: 'f-1' });
      await expect(
        service.isAccessAllowed('/uploads/p.jpg', 'u-3', 'follower'),
      ).resolves.toBe(true);
      await expect(
        service.isAccessAllowed('/uploads/p.jpg', 'u-1', 'private-author'),
      ).resolves.toBe(true);
    });

    it('allows public free post media access to anyone including anonymous', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'PUBLIC',
            isPremium: false,
          },
        },
      ]);
      expect(
        await service.isAccessAllowed('/uploads/posts/p1.jpg', null, null),
      ).toBe(true);
    });

    it('denies anonymous access to protected post media', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'FOLLOWERS',
            isPremium: false,
          },
        },
      ]);
      expect(
        await service.isAccessAllowed('/uploads/posts/p1.jpg', null, null),
      ).toBe(false);
    });

    it('allows author to access their own protected content', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'PRIVATE',
            isPremium: true,
          },
        },
      ]);
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/p1.jpg',
          'user-author',
          'author-1',
        ),
      ).toBe(true);
    });

    it('checks post unlock for premium / PPV content', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-ppv',
          post: {
            profileId: 'author-1',
            visibility: 'PUBLIC',
            isPremium: true,
          },
        },
      ]);

      mockPrismaService.postUnlock.findUnique.mockResolvedValueOnce({
        id: 'unlock-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/ppv.jpg',
          'buyer-1',
          'profile-buyer',
        ),
      ).toBe(true);

      mockPrismaService.postUnlock.findUnique.mockResolvedValueOnce(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/ppv.jpg',
          'nonbuyer-1',
          'profile-nonbuyer',
        ),
      ).toBe(false);
    });

    it('checks follow relationship for followers-only posts', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-followers',
          post: {
            profileId: 'author-1',
            visibility: 'FOLLOWERS',
            isPremium: false,
          },
        },
      ]);

      mockPrismaService.follow.findFirst.mockResolvedValueOnce({ id: 'f-1' });
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/followers.jpg',
          'follower-user',
          'follower-profile',
        ),
      ).toBe(true);

      mockPrismaService.follow.findFirst.mockResolvedValueOnce(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/followers.jpg',
          'stranger-user',
          'stranger-profile',
        ),
      ).toBe(false);
    });

    it('checks close-friend relationship for private posts and handles fallback deny', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-cf',
          post: {
            profileId: 'author-1',
            visibility: 'PRIVATE',
            isPremium: false,
          },
        },
      ]);

      mockPrismaService.closeFriend.findFirst.mockResolvedValueOnce({
        id: 'cf-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/cf.jpg',
          'friend-user',
          'friend-profile',
        ),
      ).toBe(true);

      mockPrismaService.closeFriend.findFirst.mockResolvedValueOnce(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/cf.jpg',
          'friend-user',
          'friend-profile',
        ),
      ).toBe(false);

      mockPrismaService.postMedia.findMany.mockResolvedValueOnce([
        {
          postId: 'post-other',
          post: {
            profileId: 'author-1',
            visibility: 'CUSTOM' as any,
            isPremium: false,
          },
        },
      ]);
      expect(
        await service.isAccessAllowed(
          '/uploads/posts/other.jpg',
          'viewer-u',
          'viewer-p',
        ),
      ).toBe(false);
    });
  });

  describe('Story media', () => {
    it('allows the story author', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          profileId: 'author-1',
          isPremium: false,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PUBLIC' },
        },
      ]);
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/s1.jpg',
          'user-author',
          'author-1',
        ),
      ).toBe(true);
    });

    it('denies anonymous access to a story', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          profileId: 'author-1',
          isPremium: false,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PRIVATE' },
        },
      ]);
      expect(
        await service.isAccessAllowed('/uploads/stories/s1.jpg', null, null),
      ).toBe(false);
    });

    it('allows a public-profile story to any logged-in non-author viewer', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          profileId: 'author-1',
          isPremium: false,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PUBLIC' },
        },
      ]);
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/s1.jpg',
          'viewer-u',
          'viewer-p',
        ),
      ).toBe(true);
    });

    it('checks StoryUnlock for premium stories', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-ppv',
          profileId: 'author-1',
          isPremium: true,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PUBLIC' },
        },
      ]);

      mockPrismaService.storyUnlock.findUnique.mockResolvedValueOnce({
        id: 'su-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/ppv.jpg',
          'buyer-u',
          'buyer-p',
        ),
      ).toBe(true);

      mockPrismaService.storyUnlock.findUnique.mockResolvedValueOnce(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/ppv.jpg',
          'nonbuyer-u',
          'nonbuyer-p',
        ),
      ).toBe(false);
    });

    it('checks CloseFriend for close-friends-only stories regardless of profile privacy', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-cf',
          profileId: 'author-1',
          isPremium: false,
          isCloseFriendsOnly: true,
          profile: { privacyLevel: 'PUBLIC' },
        },
      ]);

      mockPrismaService.closeFriend.findUnique.mockResolvedValueOnce({
        id: 'cf-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/cf.jpg',
          'friend-u',
          'friend-p',
        ),
      ).toBe(true);

      mockPrismaService.closeFriend.findUnique.mockResolvedValueOnce(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/cf.jpg',
          'stranger-u',
          'stranger-p',
        ),
      ).toBe(false);
    });

    it('checks an ACCEPTED follow for a private-profile story', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-priv',
          profileId: 'author-1',
          isPremium: false,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PRIVATE' },
        },
      ]);

      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'ACCEPTED',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/priv.jpg',
          'follower-u',
          'follower-p',
        ),
      ).toBe(true);

      mockPrismaService.follow.findUnique.mockResolvedValueOnce({
        status: 'PENDING',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/stories/priv.jpg',
          'pending-u',
          'pending-p',
        ),
      ).toBe(false);
    });
  });

  describe('Message media', () => {
    it("looks a voice note up by the message's voice column, and refuses it to a stranger", async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-v',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: false,
        },
      ]);

      await expect(
        service.isAccessAllowed('/uploads/voice.m4a', null, null),
      ).resolves.toBe(false);
      const { where } = mockPrismaService.message.findMany.mock.calls[0][0];
      expect(where.OR).toContainEqual({ voiceUrl: { contains: 'voice.m4a' } });
    });

    it("refuses a draft's media to anyone but its author, and asks for a comment's voice and a story's layer", async () => {
      mockPrismaService.editProject.findMany.mockResolvedValue([
        { profileId: 'author-1' },
      ]);

      await expect(
        service.isAccessAllowed('/uploads/draft.mp4', 'u-2', 'other-2'),
      ).resolves.toBe(false);
      await expect(
        service.isAccessAllowed('/uploads/draft.mp4', 'u-1', 'author-1'),
      ).resolves.toBe(true);
      expect(
        mockPrismaService.comment.findMany.mock.calls[0][0].where.OR,
      ).toContainEqual({ voiceUrl: { contains: 'draft.mp4' } });
      expect(
        mockPrismaService.story.findMany.mock.calls[0][0].where.OR,
      ).toContainEqual({ overlayUrl: { contains: 'draft.mp4' } });
    });

    it('denies anonymous access to a DM attachment', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: false,
        },
      ]);
      expect(
        await service.isAccessAllowed('/uploads/chat/m1.jpg', null, null),
      ).toBe(false);
      expect(mockPrismaService.participant.findFirst).not.toHaveBeenCalled();
    });

    it('denies a logged-in viewer who is not a participant in the conversation', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: false,
        },
      ]);
      mockPrismaService.participant.findFirst.mockResolvedValue(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/chat/m1.jpg',
          'outsider-u',
          'outsider-p',
        ),
      ).toBe(false);
    });

    it('allows an active participant to a free (unlocked) message', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: false,
        },
      ]);
      mockPrismaService.participant.findFirst.mockResolvedValue({
        id: 'part-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/chat/m1.jpg',
          'recipient-u',
          'recipient-p',
        ),
      ).toBe(true);
      expect(mockPrismaService.participant.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            conversationId: 'conv-1',
            profileId: 'recipient-p',
            deletedAt: null,
          },
        }),
      );
    });

    it('exempts the sender from unlocking their own PPV message', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-ppv',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: true,
        },
      ]);
      mockPrismaService.participant.findFirst.mockResolvedValue({
        id: 'part-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/chat/ppv.jpg',
          'sender-u',
          'sender-p',
        ),
      ).toBe(true);
      expect(mockPrismaService.messageUnlock.findUnique).not.toHaveBeenCalled();
    });

    it('denies a locked message when the participant has no viewerUserId (defensive branch)', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-ppv',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: true,
        },
      ]);
      mockPrismaService.participant.findFirst.mockResolvedValue({
        id: 'part-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/chat/ppv.jpg',
          null,
          'recipient-p',
        ),
      ).toBe(false);
      expect(mockPrismaService.messageUnlock.findUnique).not.toHaveBeenCalled();
    });

    it('checks MessageUnlock for a locked message on a non-sender participant', async () => {
      mockPrismaService.message.findMany.mockResolvedValue([
        {
          id: 'msg-ppv',
          conversationId: 'conv-1',
          senderId: 'sender-p',
          isLocked: true,
        },
      ]);
      mockPrismaService.participant.findFirst.mockResolvedValue({
        id: 'part-1',
      });

      mockPrismaService.messageUnlock.findUnique.mockResolvedValueOnce({
        id: 'mu-1',
      });
      expect(
        await service.isAccessAllowed(
          '/uploads/chat/ppv.jpg',
          'buyer-u',
          'buyer-p',
        ),
      ).toBe(true);

      mockPrismaService.messageUnlock.findUnique.mockResolvedValueOnce(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/chat/ppv.jpg',
          'nonbuyer-u',
          'nonbuyer-p',
        ),
      ).toBe(false);
    });
  });

  describe('Comment media (inherits parent Post policy)', () => {
    it('allows comment media on a public free post', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'PUBLIC',
            isPremium: false,
          },
        },
      ]);
      expect(
        await service.isAccessAllowed('/uploads/comments/c1.jpg', null, null),
      ).toBe(true);
    });

    it('denies comment media on a protected post to a non-follower', async () => {
      mockPrismaService.comment.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'FOLLOWERS',
            isPremium: false,
          },
        },
      ]);
      mockPrismaService.follow.findFirst.mockResolvedValue(null);
      expect(
        await service.isAccessAllowed(
          '/uploads/comments/c1.jpg',
          'stranger-u',
          'stranger-p',
        ),
      ).toBe(false);
    });
  });

  describe('Collection media (owner-only)', () => {
    it('allows the collection owner', async () => {
      mockPrismaService.collection.findMany.mockResolvedValue([
        { profileId: 'owner-p' },
      ]);
      expect(
        await service.isAccessAllowed(
          '/uploads/collections/cover.jpg',
          'owner-u',
          'owner-p',
        ),
      ).toBe(true);
    });

    it('denies anyone else, including an anonymous viewer', async () => {
      mockPrismaService.collection.findMany.mockResolvedValue([
        { profileId: 'owner-p' },
      ]);
      expect(
        await service.isAccessAllowed(
          '/uploads/collections/cover.jpg',
          null,
          null,
        ),
      ).toBe(false);
      expect(
        await service.isAccessAllowed(
          '/uploads/collections/cover.jpg',
          'other-u',
          'other-p',
        ),
      ).toBe(false);
    });
  });

  describe('Cross-table match precedence (CodeRabbit finding, PR #110)', () => {
    it('denies when a crafted public post matches the same key as a protected story it does not own', async () => {
      // An attacker could set their own PUBLIC post's client-controlled url
      // field to a string that happens to contain a known/leaked protected
      // story's filename. Both rows share the same `contains` match; the
      // post alone would allow, but the story correctly denies -- the
      // combined result must deny.
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'attacker-post',
          post: {
            profileId: 'attacker-1',
            visibility: 'PUBLIC',
            isPremium: false,
          },
        },
      ]);
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'victim-story',
          profileId: 'victim-1',
          isPremium: true,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PUBLIC' },
        },
      ]);
      mockPrismaService.storyUnlock.findUnique.mockResolvedValue(null);

      expect(
        await service.isAccessAllowed(
          '/uploads/shared-key.jpg',
          'attacker-u',
          'attacker-1',
        ),
      ).toBe(false);
    });

    it('allows when every matched owner independently allows', async () => {
      mockPrismaService.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-1',
          post: {
            profileId: 'author-1',
            visibility: 'PUBLIC',
            isPremium: false,
          },
        },
      ]);
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 'story-1',
          profileId: 'author-2',
          isPremium: false,
          isCloseFriendsOnly: false,
          profile: { privacyLevel: 'PUBLIC' },
        },
      ]);

      expect(
        await service.isAccessAllowed(
          '/uploads/shared-key.jpg',
          'viewer-u',
          'viewer-p',
        ),
      ).toBe(true);
    });
  });
});
