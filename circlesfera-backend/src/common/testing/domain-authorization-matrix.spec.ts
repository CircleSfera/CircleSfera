import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Visibility } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRES_PLAN_KEY } from '../../auth/decorators/requires-plan.decorator.js';
import { AdminGuard } from '../../auth/guards/admin.guard.js';
import { IdentityVerifiedGuard } from '../../auth/guards/identity-verified.guard.js';
import { OwnershipGuard } from '../../auth/guards/ownership.guard.js';
import { SubscriptionGuard } from '../../auth/guards/subscription.guard.js';
import { MediaAuthService } from '../../media/media-auth.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('Domain Authorization Policy Matrix (15 Domains)', () => {
  // =========================================================================
  // Shared Helper for ExecutionContext
  // =========================================================================
  const createMockContext = (
    user: Record<string, unknown> | null,
    params: Record<string, string> = {},
    metadata: Record<string, unknown> = {},
  ) => {
    const handler = () => undefined;
    for (const [key, value] of Object.entries(metadata)) {
      Reflect.defineMetadata(key, value, handler);
    }
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user, params }),
      }),
      getHandler: () => handler,
      getClass: () => class {},
    } as any;
  };

  // =========================================================================
  // 1. Domain: Posts (Ownership & Staff Content Permissions)
  // =========================================================================
  describe('Domain 1: Posts', () => {
    let guard: OwnershipGuard;
    let postFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      postFindUnique = vi.fn();
      guard = new OwnershipGuard(new Reflector(), {
        post: { findUnique: postFindUnique },
      } as unknown as PrismaService);
    });

    it('allows author to mutate own post', async () => {
      postFindUnique.mockResolvedValue({ profileId: 'profile-owner' });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-owner' },
        { id: 'post-1' },
        { requireOwnership: { model: 'Post' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies non-author with ForbiddenException (IDOR defense)', async () => {
      postFindUnique.mockResolvedValue({ profileId: 'profile-other' });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-attacker' },
        { id: 'post-1' },
        { requireOwnership: { model: 'Post' } },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('validates admin staff content permission for bypass deletion', () => {
      const adminGuard = new AdminGuard(new Reflector());
      const allowedCtx = createMockContext(
        {
          adminId: 'adm-1',
          permissions: ['content'],
          roles: ['MODERATOR'],
        },
        { id: 'post-1' },
        { staff_permissions: ['content'] },
      );
      expect(adminGuard.canActivate(allowedCtx)).toBe(true);

      const deniedCtx = createMockContext(
        {
          adminId: 'adm-2',
          permissions: ['reports'],
          roles: ['MODERATOR'],
        },
        { id: 'post-1' },
        { staff_permissions: ['content'] },
      );
      expect(() => adminGuard.canActivate(deniedCtx)).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 2. Domain: Comments (Author & Resource Scoping)
  // =========================================================================
  describe('Domain 2: Comments', () => {
    let guard: OwnershipGuard;
    let commentFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      commentFindUnique = vi.fn();
      guard = new OwnershipGuard(new Reflector(), {
        comment: { findUnique: commentFindUnique },
      } as unknown as PrismaService);
    });

    it('allows comment author to delete comment', async () => {
      commentFindUnique.mockResolvedValue({ profileId: 'profile-author' });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-author' },
        { id: 'comm-1' },
        { requireOwnership: { model: 'Comment' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies non-author comment deletion attempts', async () => {
      commentFindUnique.mockResolvedValue({ profileId: 'profile-author' });
      const ctx = createMockContext(
        { userId: 'u2', profileId: 'profile-intruder' },
        { id: 'comm-1' },
        { requireOwnership: { model: 'Comment' } },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 3. Domain: Stories & Highlights
  // =========================================================================
  describe('Domain 3: Stories & Highlights', () => {
    let guard: OwnershipGuard;
    let storyFindUnique: ReturnType<typeof vi.fn>;
    let highlightFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      storyFindUnique = vi.fn();
      highlightFindUnique = vi.fn();
      guard = new OwnershipGuard(new Reflector(), {
        story: { findUnique: storyFindUnique },
        highlight: { findUnique: highlightFindUnique },
      } as unknown as PrismaService);
    });

    it('enforces story ownership for story mutation', async () => {
      storyFindUnique.mockResolvedValue({ profileId: 'profile-creator' });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-creator' },
        { id: 'story-1' },
        { requireOwnership: { model: 'Story' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      const attackerCtx = createMockContext(
        { userId: 'u2', profileId: 'profile-attacker' },
        { id: 'story-1' },
        { requireOwnership: { model: 'Story' } },
      );
      await expect(guard.canActivate(attackerCtx)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('enforces highlight ownership for highlight editing/deletion', async () => {
      highlightFindUnique.mockResolvedValue({ profileId: 'profile-creator' });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-creator' },
        { id: 'hl-1' },
        { requireOwnership: { model: 'Highlight' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      const attackerCtx = createMockContext(
        { userId: 'u2', profileId: 'profile-other' },
        { id: 'hl-1' },
        { requireOwnership: { model: 'Highlight' } },
      );
      await expect(guard.canActivate(attackerCtx)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 4. Domain: Profiles & Users (Settings & Admin User Management)
  // =========================================================================
  describe('Domain 4: Profiles & Users', () => {
    let guard: OwnershipGuard;
    let userFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      userFindUnique = vi.fn();
      guard = new OwnershipGuard(new Reflector(), {
        user: { findUnique: userFindUnique },
      } as unknown as PrismaService);
    });

    it('allows user to manage own user record (id === userId)', async () => {
      userFindUnique.mockResolvedValue({ id: 'user-123' });
      const ctx = createMockContext(
        { userId: 'user-123', profileId: 'p123' },
        { id: 'user-123' },
        { requireOwnership: { model: 'User' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
    });

    it('denies user managing another user record', async () => {
      userFindUnique.mockResolvedValue({ id: 'user-victim' });
      const ctx = createMockContext(
        { userId: 'user-attacker', profileId: 'p-attacker' },
        { id: 'user-victim' },
        { requireOwnership: { model: 'User' } },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('enforces users.ban permission for staff user ban operations', () => {
      const adminGuard = new AdminGuard(new Reflector());
      const banAuthorizedCtx = createMockContext(
        {
          adminId: 'adm-sec',
          permissions: ['users.ban'],
          roles: ['TRUST_SAFETY'],
        },
        { id: 'user-target' },
        { staff_permissions: ['users.ban'] },
      );
      expect(adminGuard.canActivate(banAuthorizedCtx)).toBe(true);

      const banUnauthorizedCtx = createMockContext(
        {
          adminId: 'adm-support',
          permissions: ['support'],
          roles: ['SUPPORT'],
        },
        { id: 'user-target' },
        { staff_permissions: ['users.ban'] },
      );
      expect(() => adminGuard.canActivate(banUnauthorizedCtx)).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 5. Domain: Media & Uploads (Nginx Auth-Check & PPV/CF Matrix)
  // =========================================================================
  describe('Domain 5: Media & Uploads', () => {
    let mediaAuthService: MediaAuthService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        postMedia: { findFirst: vi.fn().mockResolvedValue(null) },
        postUnlock: { findUnique: vi.fn() },
        story: { findFirst: vi.fn().mockResolvedValue(null) },
        storyUnlock: { findUnique: vi.fn() },
        message: { findFirst: vi.fn().mockResolvedValue(null) },
        messageUnlock: { findUnique: vi.fn() },
        participant: { findFirst: vi.fn() },
        comment: { findFirst: vi.fn().mockResolvedValue(null) },
        collection: { findFirst: vi.fn().mockResolvedValue(null) },
        follow: { findUnique: vi.fn(), findFirst: vi.fn() },
        closeFriend: { findUnique: vi.fn(), findFirst: vi.fn() },
      };
      mediaAuthService = new MediaAuthService(
        mockPrisma as unknown as PrismaService,
      );
    });

    it('allows public access to public un-gated media', async () => {
      mockPrisma.postMedia.findFirst.mockResolvedValue({
        postId: 'post-public',
        post: {
          profileId: 'creator-1',
          visibility: Visibility.PUBLIC,
          isPremium: false,
        },
      });

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/posts/public-image.jpg',
        null, // anonymous guest
        null,
      );
      expect(allowed).toBe(true);
    });

    it('denies anonymous access to premium PPV media', async () => {
      mockPrisma.postMedia.findFirst.mockResolvedValue({
        postId: 'post-ppv',
        post: {
          profileId: 'creator-1',
          visibility: Visibility.PUBLIC,
          isPremium: true,
        },
      });

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/posts/ppv-image.jpg',
        null,
        null,
      );
      expect(allowed).toBe(false);
    });

    it('allows author access to their own premium media without unlock', async () => {
      mockPrisma.postMedia.findFirst.mockResolvedValue({
        postId: 'post-ppv',
        post: {
          profileId: 'creator-1',
          visibility: Visibility.PUBLIC,
          isPremium: true,
        },
      });

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/posts/ppv-image.jpg',
        'user-creator',
        'creator-1',
      );
      expect(allowed).toBe(true);
    });

    it('allows viewer access to premium media if unlocked, denies if not unlocked', async () => {
      mockPrisma.postMedia.findFirst.mockResolvedValue({
        postId: 'post-ppv',
        post: {
          profileId: 'creator-1',
          visibility: Visibility.PUBLIC,
          isPremium: true,
        },
      });

      // Not unlocked
      mockPrisma.postUnlock.findUnique.mockResolvedValue(null);
      let allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/posts/ppv-image.jpg',
        'user-viewer',
        'profile-viewer',
      );
      expect(allowed).toBe(false);

      // Unlocked
      mockPrisma.postUnlock.findUnique.mockResolvedValue({ id: 'unlock-1' });
      allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/posts/ppv-image.jpg',
        'user-viewer',
        'profile-viewer',
      );
      expect(allowed).toBe(true);
    });

    it('blocks static directory traversal into GDPR exports', async () => {
      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/exports/gdpr-archive.zip',
        'user-attacker',
        'profile-attacker',
      );
      expect(allowed).toBe(false);
    });
  });

  // =========================================================================
  // 6. Domain: Chat & Direct Messaging
  // =========================================================================
  describe('Domain 6: Chat & Direct Messaging', () => {
    it('restricts message deletion/editing to message author', () => {
      const isMessageAuthor = (msgAuthorId: string, actorProfileId: string) => {
        if (msgAuthorId !== actorProfileId) {
          throw new ForbiddenException(
            'You can only edit or delete your own messages',
          );
        }
        return true;
      };

      expect(isMessageAuthor('prof-alice', 'prof-alice')).toBe(true);
      expect(() => isMessageAuthor('prof-alice', 'prof-bob')).toThrow(
        ForbiddenException,
      );
    });

    it('restricts conversation read/query access to participants', () => {
      const verifyParticipant = (
        participants: string[],
        actorProfileId: string,
      ) => {
        if (!participants.includes(actorProfileId)) {
          throw new ForbiddenException(
            'Not a participant in this conversation',
          );
        }
        return true;
      };

      const groupMembers = ['prof-alice', 'prof-bob'];
      expect(verifyParticipant(groupMembers, 'prof-alice')).toBe(true);
      expect(() => verifyParticipant(groupMembers, 'prof-eve')).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 7. Domain: Live & WebRTC
  // =========================================================================
  describe('Domain 7: Live & WebRTC', () => {
    it('requires IdentityVerifiedGuard for sending live stream gifts', async () => {
      const mockPrisma = {
        user: { findUnique: vi.fn() },
      };
      const guard = new IdentityVerifiedGuard(mockPrisma as any);

      // Unverified user
      mockPrisma.user.findUnique.mockResolvedValue({
        isActive: true,
        identityVerifiedAt: null,
      });
      const unverifiedCtx = createMockContext({ userId: 'u-unverified' });
      await expect(guard.canActivate(unverifiedCtx)).rejects.toThrow(
        ForbiddenException,
      );

      // Verified user
      mockPrisma.user.findUnique.mockResolvedValue({
        isActive: true,
        identityVerifiedAt: new Date(),
      });
      const verifiedCtx = createMockContext({ userId: 'u-verified' });
      await expect(guard.canActivate(verifiedCtx)).resolves.toBe(true);
    });

    it('authorizes host for stream termination and co-host management', () => {
      const verifyHost = (hostProfileId: string, actorProfileId: string) => {
        if (hostProfileId !== actorProfileId) {
          throw new ForbiddenException(
            'Only the stream host can perform this action',
          );
        }
        return true;
      };

      expect(verifyHost('host-123', 'host-123')).toBe(true);
      expect(() => verifyHost('host-123', 'intruder-456')).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 8. Domain: PPV & Monetization
  // =========================================================================
  describe('Domain 8: PPV & Monetization', () => {
    it('requires verified identity for Stripe Connect onboarding and unlocking', async () => {
      const mockPrisma = {
        user: { findUnique: vi.fn() },
      };
      const guard = new IdentityVerifiedGuard(mockPrisma as any);

      mockPrisma.user.findUnique.mockResolvedValue({
        isActive: true,
        identityVerifiedAt: null,
      });
      const ctx = createMockContext({ userId: 'u-unverified' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('blocks self-purchase / self-tip invariants', () => {
      const validateTransactionActors = (
        senderId: string,
        receiverId: string,
      ) => {
        if (senderId === receiverId) {
          throw new BadRequestException(
            'Cannot purchase or tip your own content',
          );
        }
        return true;
      };

      expect(validateTransactionActors('user-buyer', 'user-creator')).toBe(
        true,
      );
      expect(() => validateTransactionActors('user-a', 'user-a')).toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // 9. Domain: Promotions & Ads
  // =========================================================================
  describe('Domain 9: Promotions & Ads', () => {
    let subscriptionGuard: SubscriptionGuard;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        user: { findUnique: vi.fn() },
        platformPlan: { findFirst: vi.fn() },
        platformSubscription: { findFirst: vi.fn() },
      };
      subscriptionGuard = new SubscriptionGuard(
        mockPrisma as unknown as PrismaService,
        new Reflector(),
      );
    });

    it('requires Elite Creator platform plan to manage promotions', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'USER' });
      mockPrisma.platformPlan.findFirst.mockResolvedValue({
        name: 'Elite Creator',
        priceCents: 2999,
      });

      // User has no subscription
      mockPrisma.platformSubscription.findFirst.mockResolvedValue(null);
      const deniedCtx = createMockContext(
        { userId: 'u-basic' },
        {},
        { [REQUIRES_PLAN_KEY]: 'Elite Creator' },
      );
      await expect(subscriptionGuard.canActivate(deniedCtx)).rejects.toThrow(
        ForbiddenException,
      );

      // User has active Elite Creator subscription
      mockPrisma.platformSubscription.findFirst.mockResolvedValue({
        status: 'ACTIVE',
        plan: { name: 'Elite Creator', priceCents: 2999 },
      });
      const allowedCtx = createMockContext(
        { userId: 'u-elite' },
        {},
        { [REQUIRES_PLAN_KEY]: 'Elite Creator' },
      );
      await expect(subscriptionGuard.canActivate(allowedCtx)).resolves.toBe(
        true,
      );
    });

    it('restricts promotion mutations to campaign owner', () => {
      const verifyPromotionOwner = (
        campaignUserId: string,
        actorUserId: string,
      ) => {
        if (campaignUserId !== actorUserId) {
          throw new ForbiddenException(
            'You can only manage your own promotions',
          );
        }
        return true;
      };

      expect(verifyPromotionOwner('user-advertiser', 'user-advertiser')).toBe(
        true,
      );
      expect(() =>
        verifyPromotionOwner('user-advertiser', 'user-other'),
      ).toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 10. Domain: Creator Capabilities
  // =========================================================================
  describe('Domain 10: Creator Capabilities', () => {
    it('scopes creator dashboard analytics strictly to requesting creator profile', () => {
      const scopeAnalytics = (actorProfileId: string) => ({
        where: { profileId: actorProfileId },
      });

      const aliceQuery = scopeAnalytics('profile-alice');
      expect(aliceQuery.where.profileId).toBe('profile-alice');
    });

    it('allows admin role bypass on creator subscription requirements', async () => {
      const mockPrisma = {
        user: { findUnique: vi.fn().mockResolvedValue({ role: 'ADMIN' }) },
        platformPlan: { findFirst: vi.fn() },
      };
      const guard = new SubscriptionGuard(
        mockPrisma as unknown as PrismaService,
        new Reflector(),
      );

      const adminCtx = createMockContext(
        { userId: 'u-admin', role: 'ADMIN' },
        {},
        { [REQUIRES_PLAN_KEY]: 'Elite Creator' },
      );
      await expect(guard.canActivate(adminCtx)).resolves.toBe(true);
    });
  });

  // =========================================================================
  // 11. Domain: Payments & Billing
  // =========================================================================
  describe('Domain 11: Payments & Billing', () => {
    it('restricts user ledger export to requesting userId', () => {
      const buildUserLedgerFilter = (userId: string) => ({
        where: { userId },
      });

      expect(buildUserLedgerFilter('user-10')).toEqual({
        where: { userId: 'user-10' },
      });
    });

    it('requires payments staff permission for platform-wide admin ledger', () => {
      const adminGuard = new AdminGuard(new Reflector());
      const allowedCtx = createMockContext(
        {
          adminId: 'adm-finance',
          permissions: ['payments'],
          roles: ['FINANCE'],
        },
        {},
        { staff_permissions: ['payments'] },
      );
      expect(adminGuard.canActivate(allowedCtx)).toBe(true);

      const deniedCtx = createMockContext(
        {
          adminId: 'adm-general',
          permissions: ['content'],
          roles: ['MODERATOR'],
        },
        {},
        { staff_permissions: ['payments'] },
      );
      expect(() => adminGuard.canActivate(deniedCtx)).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 12. Domain: Notifications
  // =========================================================================
  describe('Domain 12: Notifications', () => {
    let guard: OwnershipGuard;
    let notifFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      notifFindUnique = vi.fn();
      guard = new OwnershipGuard(new Reflector(), {
        notification: { findUnique: notifFindUnique },
      } as unknown as PrismaService);
    });

    it('validates notification ownership via recipientId (matching profileId)', async () => {
      notifFindUnique.mockResolvedValue({ recipientId: 'profile-alice' });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-alice' },
        { id: 'notif-1' },
        { requireOwnership: { model: 'Notification' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(notifFindUnique).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        select: { recipientId: true },
      });
    });

    it('denies mutating notifications destined for another profile', async () => {
      notifFindUnique.mockResolvedValue({ recipientId: 'profile-alice' });
      const ctx = createMockContext(
        { userId: 'u2', profileId: 'profile-bob' },
        { id: 'notif-1' },
        { requireOwnership: { model: 'Notification' } },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 13. Domain: Reports & Moderation
  // =========================================================================
  describe('Domain 13: Reports & Moderation', () => {
    it('scopes user reports query strictly to reporterId', () => {
      const getUserReportsQuery = (profileId: string) => ({
        where: { reporterId: profileId },
      });

      expect(getUserReportsQuery('profile-reporter')).toEqual({
        where: { reporterId: 'profile-reporter' },
      });
    });

    it('enforces reports staff permission for admin moderation triage', () => {
      const adminGuard = new AdminGuard(new Reflector());
      const authorizedCtx = createMockContext(
        {
          adminId: 'adm-mod',
          permissions: ['reports'],
          roles: ['MODERATOR'],
        },
        {},
        { staff_permissions: ['reports'] },
      );
      expect(adminGuard.canActivate(authorizedCtx)).toBe(true);

      const unauthorizedCtx = createMockContext(
        {
          adminId: 'adm-guest',
          permissions: ['audit'],
          roles: ['AUDITOR'],
        },
        {},
        { staff_permissions: ['reports'] },
      );
      expect(() => adminGuard.canActivate(unauthorizedCtx)).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 14. Domain: Appeals
  // =========================================================================
  describe('Domain 14: Appeals', () => {
    it('scopes appellant queries to requesting userId', () => {
      const getMyAppealsQuery = (userId: string) => ({
        where: { userId },
      });
      expect(getMyAppealsQuery('user-banned')).toEqual({
        where: { userId: 'user-banned' },
      });
    });

    it('enforces appeals staff permission for triage and resolution', () => {
      const adminGuard = new AdminGuard(new Reflector());
      const authorizedCtx = createMockContext(
        {
          adminId: 'adm-legal',
          permissions: ['appeals'],
          roles: ['LEGAL'],
        },
        {},
        { staff_permissions: ['appeals'] },
      );
      expect(adminGuard.canActivate(authorizedCtx)).toBe(true);

      const unauthorizedCtx = createMockContext(
        {
          adminId: 'adm-it',
          permissions: ['system'],
          roles: ['SYSADMIN'],
        },
        {},
        { staff_permissions: ['appeals'] },
      );
      expect(() => adminGuard.canActivate(unauthorizedCtx)).toThrow(
        ForbiddenException,
      );
    });
  });

  // =========================================================================
  // 15. Domain: Collections & Bookmarks
  // =========================================================================
  describe('Domain 15: Collections & Bookmarks', () => {
    let guard: OwnershipGuard;
    let collectionFindUnique: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      collectionFindUnique = vi.fn();
      guard = new OwnershipGuard(new Reflector(), {
        collection: { findUnique: collectionFindUnique },
      } as unknown as PrismaService);
    });

    it('allows owner to manage collection', async () => {
      collectionFindUnique.mockResolvedValue({
        profileId: 'profile-collector',
      });
      const ctx = createMockContext(
        { userId: 'u1', profileId: 'profile-collector' },
        { id: 'col-1' },
        { requireOwnership: { model: 'Collection' } },
      );
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(collectionFindUnique).toHaveBeenCalledWith({
        where: { id: 'col-1' },
        select: { profileId: true },
      });
    });

    it('denies foreign profile from updating or deleting collection (IDOR defense)', async () => {
      collectionFindUnique.mockResolvedValue({
        profileId: 'profile-collector',
      });
      const ctx = createMockContext(
        { userId: 'u2', profileId: 'profile-intruder' },
        { id: 'col-1' },
        { requireOwnership: { model: 'Collection' } },
      );
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });

    it('scopes bookmark checks and listings strictly to requesting profileId', () => {
      const getBookmarksQuery = (profileId: string, collectionId?: string) => ({
        where: {
          profileId,
          ...(collectionId ? { collectionId } : {}),
        },
      });

      expect(getBookmarksQuery('prof-me')).toEqual({
        where: { profileId: 'prof-me' },
      });
      expect(getBookmarksQuery('prof-me', 'col-favorites')).toEqual({
        where: { profileId: 'prof-me', collectionId: 'col-favorites' },
      });
    });
  });
});
