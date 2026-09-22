import type { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPostAttributes,
  buildProfileAttributes,
  buildUserAttributes,
  createBlock,
  createCloseFriend,
  createComment,
  createDirectConversation,
  createFollow,
  createLike,
  createMessage,
  createMockMulterFile,
  createPlatformPlan,
  createPlatformSubscription,
  createPost,
  createPostUnlock,
  createProfile,
  createTransaction,
  createUser,
  createUserWithProfile,
  generateTestEmail,
  generateTestSuffix,
  generateTestUsername,
  getTestPasswordHash,
  ScenarioSeeder,
  TINY_JPEG_BUFFER,
  TINY_MP4_BUFFER,
  TINY_PNG_BUFFER,
} from './index.js';

describe('Test Data Factories & Scenario Seeder', () => {
  describe('Binary Fixtures', () => {
    it('provides a valid PNG buffer with proper magic bytes', () => {
      expect(TINY_PNG_BUFFER).toBeInstanceOf(Buffer);
      expect(TINY_PNG_BUFFER.length).toBeGreaterThan(0);
      // PNG magic number: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      expect(TINY_PNG_BUFFER.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    });

    it('provides a valid JPEG buffer with proper SOI marker', () => {
      expect(TINY_JPEG_BUFFER).toBeInstanceOf(Buffer);
      expect(TINY_JPEG_BUFFER.length).toBeGreaterThan(0);
      // JPEG Start of Image (SOI) marker: 0xFF 0xD8 0xFF
      expect(TINY_JPEG_BUFFER[0]).toBe(0xff);
      expect(TINY_JPEG_BUFFER[1]).toBe(0xd8);
      expect(TINY_JPEG_BUFFER[2]).toBe(0xff);
    });

    it('provides a valid MP4 buffer with ftyp header', () => {
      expect(TINY_MP4_BUFFER).toBeInstanceOf(Buffer);
      expect(TINY_MP4_BUFFER.length).toBeGreaterThan(0);
      // ftyp box type at offset 4
      const boxType = TINY_MP4_BUFFER.subarray(4, 8).toString('ascii');
      expect(boxType).toBe('ftyp');
    });

    it('creates mock Multer file with default and custom properties', () => {
      const defaultFile = createMockMulterFile();
      expect(defaultFile.fieldname).toBe('file');
      expect(defaultFile.mimetype).toBe('image/jpeg');
      expect(defaultFile.size).toBe(TINY_JPEG_BUFFER.length);

      const customFile = createMockMulterFile({
        filename: 'custom.png',
        mimetype: 'image/png',
        buffer: TINY_PNG_BUFFER,
      });
      expect(customFile.originalname).toBe('custom.png');
      expect(customFile.mimetype).toBe('image/png');
      expect(customFile.size).toBe(TINY_PNG_BUFFER.length);
    });
  });

  describe('Attribute Builders & Generators', () => {
    it('generates unique test suffixes, emails, and usernames', () => {
      const s1 = generateTestSuffix();
      const s2 = generateTestSuffix();
      expect(s1).not.toBe(s2);

      const email1 = generateTestEmail('alice');
      const email2 = generateTestEmail('alice');
      expect(email1).not.toBe(email2);
      expect(email1).toContain('alice_');
      expect(email1.endsWith('@circlesfera.test')).toBe(true);

      const user1 = generateTestUsername('bob');
      const user2 = generateTestUsername('bob');
      expect(user1).not.toBe(user2);
      expect(user1.length).toBeLessThanOrEqual(24);
    });

    it('caches default test password hash for performance', async () => {
      const hash1 = await getTestPasswordHash();
      const hash2 = await getTestPasswordHash();
      expect(hash1).toBe(hash2);
      expect(await argon2.verify(hash1, 'Password123!')).toBe(true);
    });

    it('builds unpersisted User attributes with proper defaults and overrides', async () => {
      const defaultUser = await buildUserAttributes();
      expect(defaultUser.email).toContain('@circlesfera.test');
      expect(defaultUser.role).toBe('USER');
      expect(defaultUser.isActive).toBe(true);
      expect(defaultUser.emailVerified).toBeInstanceOf(Date);

      const overriddenUser = await buildUserAttributes({
        email: 'custom@example.com',
        role: 'ADMIN',
        isActive: false,
        emailVerified: null,
      });
      expect(overriddenUser.email).toBe('custom@example.com');
      expect(overriddenUser.role).toBe('ADMIN');
      expect(overriddenUser.isActive).toBe(false);
      expect(overriddenUser.emailVerified).toBeNull();
    });

    it('builds unpersisted Profile attributes with proper defaults and overrides', () => {
      const profile = buildProfileAttributes('user-123', {
        fullName: 'Jane Doe',
        accountType: 'CREATOR',
      });
      expect(profile.userId).toBe('user-123');
      expect(profile.fullName).toBe('Jane Doe');
      expect(profile.accountType).toBe('CREATOR');
      expect(profile.verificationLevel).toBe('BASIC');
      expect(profile.location).toBe('Madrid, Spain');
    });

    it('builds unpersisted Post attributes with proper defaults and overrides', () => {
      const post = buildPostAttributes('profile-456', {
        caption: 'Exclusive creator post',
        isPremium: true,
        priceCents: 500,
        visibility: 'PUBLIC',
      });
      expect(post.profileId).toBe('profile-456');
      expect(post.caption).toBe('Exclusive creator post');
      expect(post.isPremium).toBe(true);
      expect(post.priceCents).toBe(500);
      expect(post.type).toBe('POST');
    });
  });

  describe('Database Operations with Mock PrismaClient', () => {
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        user: {
          create: vi.fn(),
          deleteMany: vi.fn(),
        },
        userSettings: {
          create: vi.fn(),
        },
        profile: {
          create: vi.fn(),
        },
        post: {
          create: vi.fn(),
        },
        hashtag: {
          upsert: vi.fn(),
        },
        postHashtag: {
          create: vi.fn(),
        },
        follow: {
          upsert: vi.fn(),
        },
        block: {
          upsert: vi.fn(),
        },
        closeFriend: {
          upsert: vi.fn(),
        },
        like: {
          upsert: vi.fn(),
        },
        comment: {
          create: vi.fn(),
        },
        platformPlan: {
          create: vi.fn(),
          deleteMany: vi.fn(),
        },
        platformSubscription: {
          create: vi.fn(),
        },
        postUnlock: {
          upsert: vi.fn(),
        },
        transaction: {
          create: vi.fn(),
        },
        conversation: {
          create: vi.fn(),
          deleteMany: vi.fn(),
        },
        message: {
          create: vi.fn(),
        },
      };
    });

    it('creates user and initializes user settings', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'u1@test.com',
      });
      mockPrisma.userSettings.create.mockResolvedValue({
        id: 's1',
        userId: 'u1',
      });

      const user = await createUser(mockPrisma as unknown as PrismaClient, {
        email: 'u1@test.com',
      });

      expect(user.id).toBe('u1');
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.userSettings.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          isOnboarded: true,
          privacyLevel: 'PUBLIC',
        }),
      });
    });

    it('creates profile and atomic user-with-profile pair', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'u2',
        email: 'u2@test.com',
      });
      mockPrisma.userSettings.create.mockResolvedValue({
        id: 's2',
        userId: 'u2',
      });
      mockPrisma.profile.create.mockResolvedValue({
        id: 'p2',
        userId: 'u2',
        username: 'prof2',
      });

      const standaloneProfile = await createProfile(
        mockPrisma as unknown as PrismaClient,
        'u2',
        { username: 'standalone' },
      );
      expect(standaloneProfile.id).toBe('p2');

      const result = await createUserWithProfile(
        mockPrisma as unknown as PrismaClient,
        {
          profile: { username: 'prof2' },
        },
      );

      expect(result.user.id).toBe('u2');
      expect(result.profile.id).toBe('p2');
      expect(mockPrisma.profile.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u2',
          username: 'prof2',
        }),
      });
    });

    it('creates post with media items and hashtags', async () => {
      mockPrisma.post.create.mockResolvedValue({
        id: 'post-1',
        profileId: 'p1',
        caption: 'Hello #world',
        media: [{ id: 'm1', url: 'https://cdn.example.com/img.jpg' }],
      });
      mockPrisma.hashtag.upsert.mockResolvedValue({ id: 'h1', tag: 'world' });
      mockPrisma.postHashtag.create.mockResolvedValue({ id: 'ph1' });

      const post = await createPost(
        mockPrisma as unknown as PrismaClient,
        'p1',
        {
          caption: 'Hello #world',
          hashtags: ['world'],
        },
      );

      expect(post.id).toBe('post-1');
      expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.hashtag.upsert).toHaveBeenCalledWith({
        where: { tag: 'world' },
        create: { tag: 'world', postCount: 1 },
        update: { postCount: { increment: 1 } },
      });
      expect(mockPrisma.postHashtag.create).toHaveBeenCalledWith({
        data: { postId: 'post-1', hashtagId: 'h1' },
      });
    });

    it('creates social relations: follow, block, close friend, like, comment', async () => {
      mockPrisma.follow.upsert.mockResolvedValue({ id: 'f1' });
      mockPrisma.block.upsert.mockResolvedValue({ id: 'b1' });
      mockPrisma.closeFriend.upsert.mockResolvedValue({ id: 'cf1' });
      mockPrisma.like.upsert.mockResolvedValue({ id: 'l1' });
      mockPrisma.comment.create.mockResolvedValue({ id: 'c1' });

      await createFollow(mockPrisma as unknown as PrismaClient, 'p1', 'p2');
      expect(mockPrisma.follow.upsert).toHaveBeenCalledTimes(1);

      await createBlock(mockPrisma as unknown as PrismaClient, 'p1', 'p2');
      expect(mockPrisma.block.upsert).toHaveBeenCalledTimes(1);

      await createCloseFriend(
        mockPrisma as unknown as PrismaClient,
        'p1',
        'p2',
      );
      expect(mockPrisma.closeFriend.upsert).toHaveBeenCalledTimes(1);

      await createLike(mockPrisma as unknown as PrismaClient, 'p1', 'post-1');
      expect(mockPrisma.like.upsert).toHaveBeenCalledTimes(1);

      await createComment(
        mockPrisma as unknown as PrismaClient,
        'p1',
        'post-1',
        'Great!',
      );
      expect(mockPrisma.comment.create).toHaveBeenCalledWith({
        data: {
          profileId: 'p1',
          postId: 'post-1',
          content: 'Great!',
        },
      });
    });

    it('creates monetization models: plan, subscription, post unlock, transaction', async () => {
      mockPrisma.platformPlan.create.mockResolvedValue({ id: 'plan-1' });
      mockPrisma.platformSubscription.create.mockResolvedValue({ id: 'sub-1' });
      mockPrisma.postUnlock.upsert.mockResolvedValue({ id: 'unlock-1' });
      mockPrisma.transaction.create.mockResolvedValue({ id: 'tx-1' });

      const plan = await createPlatformPlan(
        mockPrisma as unknown as PrismaClient,
        { priceCents: 1200 },
      );
      expect(plan.id).toBe('plan-1');

      const sub = await createPlatformSubscription(
        mockPrisma as unknown as PrismaClient,
        'u1',
        'plan-1',
      );
      expect(sub.id).toBe('sub-1');

      const unlock = await createPostUnlock(
        mockPrisma as unknown as PrismaClient,
        'u1',
        'post-1',
      );
      expect(unlock.id).toBe('unlock-1');

      const tx = await createTransaction(
        mockPrisma as unknown as PrismaClient,
        'u1',
        'u2',
      );
      expect(tx.id).toBe('tx-1');
    });

    it('creates direct conversation and messages', async () => {
      mockPrisma.conversation.create.mockResolvedValue({ id: 'conv-1' });
      mockPrisma.message.create.mockResolvedValue({ id: 'msg-1' });

      const conv = await createDirectConversation(
        mockPrisma as unknown as PrismaClient,
        'p1',
        'p2',
      );
      expect(conv.id).toBe('conv-1');

      const msg = await createMessage(
        mockPrisma as unknown as PrismaClient,
        'conv-1',
        'p1',
        'Hello there',
      );
      expect(msg.id).toBe('msg-1');
    });
  });

  describe('ScenarioSeeder', () => {
    let mockPrisma: any;
    let seeder: ScenarioSeeder;

    beforeEach(() => {
      mockPrisma = {
        user: {
          create: vi.fn().mockImplementation((args) => ({
            id: `usr_${Math.random().toString(36).slice(2, 8)}`,
            email: args.data.email,
          })),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        userSettings: {
          create: vi.fn().mockResolvedValue({ id: 'settings-1' }),
        },
        profile: {
          create: vi.fn().mockImplementation((args) => ({
            id: `prof_${Math.random().toString(36).slice(2, 8)}`,
            userId: args.data.userId,
            username: args.data.username,
          })),
        },
        follow: {
          upsert: vi.fn().mockResolvedValue({ id: 'follow-1' }),
        },
        platformPlan: {
          create: vi
            .fn()
            .mockResolvedValue({ id: 'plan-xyz', priceCents: 1500 }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        platformSubscription: {
          create: vi.fn().mockResolvedValue({ id: 'sub-xyz' }),
        },
        post: {
          create: vi.fn().mockResolvedValue({
            id: 'post-xyz',
            caption: 'Scenario post',
            media: [],
          }),
        },
        hashtag: {
          upsert: vi.fn().mockResolvedValue({ id: 'h-1' }),
        },
        postHashtag: {
          create: vi.fn().mockResolvedValue({ id: 'ph-1' }),
        },
        conversation: {
          create: vi.fn().mockResolvedValue({ id: 'conv-xyz' }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        message: {
          create: vi.fn().mockResolvedValue({ id: 'msg-xyz' }),
        },
      };

      seeder = new ScenarioSeeder(mockPrisma as unknown as PrismaClient);
    });

    it('seeds social graph and executes isolated cleanup', async () => {
      const scenario = await seeder.seedSocialGraph({
        usersCount: 3,
        mutualFollows: true,
      });

      expect(scenario.entities).toHaveLength(3);
      expect(typeof scenario.cleanup).toBe('function');

      await scenario.cleanup();
      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: scenario.entities.map((e) => e.user.id),
          },
        },
      });
    });

    it('seeds creator with subscribers and cleans up plan and users', async () => {
      const scenario = await seeder.seedCreatorWithSubscribers({
        subscriberCount: 2,
        planPriceCents: 2000,
      });

      expect(scenario.creator).toBeDefined();
      expect(scenario.subscribers).toHaveLength(2);
      expect(scenario.plan.id).toBe('plan-xyz');

      await scenario.cleanup();
      expect(mockPrisma.user.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.platformPlan.deleteMany).toHaveBeenCalledWith({
        where: { id: 'plan-xyz' },
      });
    });

    it('seeds feed with posts and executes cleanup', async () => {
      const scenario = await seeder.seedFeedWithPosts({ postCount: 2 });
      expect(scenario.author).toBeDefined();
      expect(scenario.posts).toHaveLength(2);

      await scenario.cleanup();
      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: { id: scenario.author.user.id },
      });
    });

    it('seeds conversation with messages and executes cleanup', async () => {
      const scenario = await seeder.seedConversation({ messageCount: 3 });
      expect(scenario.userA).toBeDefined();
      expect(scenario.userB).toBeDefined();
      expect(scenario.conversation.id).toBe('conv-xyz');
      expect(scenario.messages).toHaveLength(3);

      await scenario.cleanup();
      expect(mockPrisma.conversation.deleteMany).toHaveBeenCalledWith({
        where: { id: 'conv-xyz' },
      });
      expect(mockPrisma.user.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: [scenario.userA.user.id, scenario.userB.user.id] },
        },
      });
    });
  });
});
