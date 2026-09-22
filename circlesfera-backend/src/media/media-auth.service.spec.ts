import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaAuthService } from './media-auth.service.js';

describe('MediaAuthService', () => {
  let service: MediaAuthService;

  const mockPrismaService = {
    postMedia: {
      findFirst: vi.fn(),
    },
    postUnlock: {
      findUnique: vi.fn(),
    },
    follow: {
      findFirst: vi.fn(),
    },
    closeFriend: {
      findFirst: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<MediaAuthService>(MediaAuthService);
  });

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
    expect(mockPrismaService.postMedia.findFirst).not.toHaveBeenCalled();
  });

  it('allows public asset access when no post media row exists', async () => {
    mockPrismaService.postMedia.findFirst.mockResolvedValue(null);
    expect(
      await service.isAccessAllowed('/uploads/avatars/user.png', null, null),
    ).toBe(true);
  });

  it('allows public free post media access to anyone including anonymous', async () => {
    mockPrismaService.postMedia.findFirst.mockResolvedValue({
      postId: 'post-1',
      post: { profileId: 'author-1', visibility: 'PUBLIC', isPremium: false },
    });
    expect(
      await service.isAccessAllowed('/uploads/posts/p1.jpg', null, null),
    ).toBe(true);
  });

  it('denies anonymous access to protected post media', async () => {
    mockPrismaService.postMedia.findFirst.mockResolvedValue({
      postId: 'post-1',
      post: {
        profileId: 'author-1',
        visibility: 'FOLLOWERS',
        isPremium: false,
      },
    });
    expect(
      await service.isAccessAllowed('/uploads/posts/p1.jpg', null, null),
    ).toBe(false);
  });

  it('allows author to access their own protected content', async () => {
    mockPrismaService.postMedia.findFirst.mockResolvedValue({
      postId: 'post-1',
      post: { profileId: 'author-1', visibility: 'PRIVATE', isPremium: true },
    });
    expect(
      await service.isAccessAllowed(
        '/uploads/posts/p1.jpg',
        'user-author',
        'author-1',
      ),
    ).toBe(true);
  });

  it('checks post unlock for premium / PPV content', async () => {
    mockPrismaService.postMedia.findFirst.mockResolvedValue({
      postId: 'post-ppv',
      post: { profileId: 'author-1', visibility: 'PUBLIC', isPremium: true },
    });

    // Unlocked
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

    // Not unlocked
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
    mockPrismaService.postMedia.findFirst.mockResolvedValue({
      postId: 'post-followers',
      post: {
        profileId: 'author-1',
        visibility: 'FOLLOWERS',
        isPremium: false,
      },
    });

    // Follower
    mockPrismaService.follow.findFirst.mockResolvedValueOnce({ id: 'f-1' });
    expect(
      await service.isAccessAllowed(
        '/uploads/posts/followers.jpg',
        'follower-user',
        'follower-profile',
      ),
    ).toBe(true);

    // Not a follower
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
    mockPrismaService.postMedia.findFirst.mockResolvedValue({
      postId: 'post-cf',
      post: { profileId: 'author-1', visibility: 'PRIVATE', isPremium: false },
    });

    // Close friend
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

    // Not a close friend
    mockPrismaService.closeFriend.findFirst.mockResolvedValueOnce(null);
    expect(
      await service.isAccessAllowed(
        '/uploads/posts/cf.jpg',
        'friend-user',
        'friend-profile',
      ),
    ).toBe(false);

    // Unexpected visibility fallback
    mockPrismaService.postMedia.findFirst.mockResolvedValueOnce({
      postId: 'post-other',
      post: {
        profileId: 'author-1',
        visibility: 'CUSTOM' as any,
        isPremium: false,
      },
    });
    expect(
      await service.isAccessAllowed(
        '/uploads/posts/other.jpg',
        'viewer-u',
        'viewer-p',
      ),
    ).toBe(false);
  });
});
