import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FollowStatus, Visibility } from '@prisma/client';
import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppealsController } from '../../appeals/appeals.controller.js';
import { AuthService } from '../../auth/auth.service.js';
import { AccountStateService } from '../../auth/services/account-state.service.js';
import { MediaAuthService } from '../../media/media-auth.service.js';
import { DataExportService } from '../../users/data-export.service.js';
import { WebrtcSignalingService } from '../../webrtc/webrtc-signaling.service.js';

describe('Security Regression Suite: P0/P1 Findings', () => {
  // =========================================================================
  // Password Authentication & Hash Integrity
  // =========================================================================
  describe('Password Authentication & Plaintext Fallback Prevention', () => {
    let authService: AuthService;
    let mockPrisma: any;
    let mockJwtService: any;
    let mockConfigService: any;
    let mockEmailService: any;
    let mockSystemSettings: any;
    let mockCryptoService: any;
    let mockQueue: any;
    let mockCache: any;
    let mockDeviceSignal: any;
    let mockTurnstile: any;

    beforeEach(() => {
      mockPrisma = {
        user: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
        profile: {
          findFirst: vi.fn().mockResolvedValue(null),
          findUnique: vi.fn(),
        },
        refreshToken: {
          create: vi.fn().mockResolvedValue({ id: 'rt-1', token: 'hash' }),
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      mockJwtService = {
        sign: vi.fn().mockReturnValue('mock-jwt-token'),
        verify: vi.fn(),
      };

      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
          if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
          return null;
        }),
        getOrThrow: vi.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'super-strict-jwt-secret';
          if (key === 'JWT_REFRESH_SECRET')
            return 'super-strict-refresh-secret';
          throw new Error(`Missing configuration: ${key}`);
        }),
      };

      mockEmailService = {
        sendEmailVerification: vi.fn().mockResolvedValue(undefined),
      };

      mockSystemSettings = {
        isRegistrationEnabled: vi.fn().mockResolvedValue(true),
      };

      mockCryptoService = {
        encryptTotpSecret: vi.fn((s: string) => s),
        decryptTotpSecret: vi.fn((s: string) => s),
      };

      mockQueue = {
        add: vi.fn().mockResolvedValue({}),
      };

      mockCache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        del: vi.fn().mockResolvedValue(undefined),
      };

      mockDeviceSignal = {
        checkSignalAnomaly: vi.fn().mockResolvedValue({ isAnomaly: false }),
        recordDeviceSignal: vi.fn().mockResolvedValue(undefined),
        recordLogin: vi.fn().mockResolvedValue(undefined),
      };

      mockTurnstile = {
        assertValid: vi.fn().mockResolvedValue(undefined),
      };

      authService = new AuthService(
        mockPrisma,
        mockJwtService,
        mockConfigService as ConfigService,
        mockEmailService,
        mockQueue,
        mockSystemSettings,
        mockTurnstile,
        mockDeviceSignal,
        mockCache,
        mockCryptoService,
        new AccountStateService(),
      );
    });

    it('rejects plaintext stored passwords and fails closed without comparison', async () => {
      const plainPassword = 'SuperSecretPassword123!';
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-plaintext',
        email: 'plain@example.com',
        password: plainPassword, // Stored directly as plaintext (legacy vulnerability)
        deletedAt: null,
      });

      await expect(
        authService.login({
          identifier: 'plain@example.com',
          password: plainPassword,
        }),
      ).rejects.toThrow(UnauthorizedException);

      // Verify no password update was triggered
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('safely rejects malformed hash strings without throwing unhandled internal errors', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-malformed',
        email: 'malformed@example.com',
        password: '$argon2id$v=19$m=65536,t=3,p=4$corrupted_hash_payload',
        deletedAt: null,
      });

      await expect(
        authService.login({
          identifier: 'malformed@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('successfully verifies legitimate Argon2 password hash', async () => {
      const password = 'StrongPassword2026!';
      const hashed = await argon2.hash(password);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-argon2',
        email: 'argon@example.com',
        password: hashed,
        isActive: true,
        isRootBanned: false,
        isTwoFactorEnabled: false,
        emailVerified: new Date(),
        deletedAt: null,
      });

      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'profile-argon2',
        userId: 'user-argon2',
        suspendedUntil: null,
      });

      const result = await authService.login({
        identifier: 'argon@example.com',
        password,
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBe('mock-jwt-token');
      expect(mockDeviceSignal.recordLogin).toHaveBeenCalledWith(
        'user-argon2',
        expect.anything(),
      );
    });

    it('verifies legacy Bcrypt hash and automatically upgrades to Argon2 on valid authentication', async () => {
      const password = 'BcryptPassword123!';
      const bcryptHash = await bcrypt.hash(password, 10);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-bcrypt',
        email: 'bcrypt@example.com',
        password: bcryptHash,
        isActive: true,
        isRootBanned: false,
        isTwoFactorEnabled: false,
        emailVerified: new Date(),
        deletedAt: null,
      });

      mockPrisma.profile.findFirst.mockResolvedValue({
        id: 'profile-bcrypt',
        userId: 'user-bcrypt',
        suspendedUntil: null,
      });

      const result = await authService.login({
        identifier: 'bcrypt@example.com',
        password,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-bcrypt' },
          data: expect.objectContaining({
            password: expect.stringMatching(/^\$argon2/),
          }),
        }),
      );
    });
  });

  // =========================================================================
  // JWT & Hardcoded Fallback Secret Elimination
  // =========================================================================
  describe('JWT Secret Fallback Elimination', () => {
    let appealsController: AppealsController;
    let mockAppealsService: any;
    let mockJwtService: any;
    let mockConfigService: any;

    beforeEach(() => {
      mockAppealsService = {
        create: vi.fn().mockResolvedValue({ id: 'appeal-123' }),
      };

      mockJwtService = {
        verify: vi.fn(),
      };

      mockConfigService = {
        getOrThrow: vi.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'super-strict-production-jwt-secret';
          throw new Error(`Missing required configuration key: ${key}`);
        }),
      };

      appealsController = new AppealsController(
        mockAppealsService,
        mockJwtService,
        mockConfigService as ConfigService,
      );
    });

    it('rejects appeal token when ConfigService has no JWT_SECRET without falling back to literal defaults', () => {
      mockConfigService.getOrThrow.mockImplementation(() => {
        throw new Error('Config missing');
      });

      const req = {
        headers: { 'x-appeal-token': 'fake.jwt.token' },
        body: {},
      };

      expect(() =>
        appealsController.create(req, {
          reason: 'Unfair ban',
          evidence: 'logs',
        } as any),
      ).toThrow(UnauthorizedException);

      // Verify jwtService.verify was never called with any hardcoded default literal secret
      expect(mockJwtService.verify).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ secret: 'circlesfera-appeal-secret-key' }),
      );
      expect(mockJwtService.verify).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ secret: 'secret' }),
      );
    });

    it('verifies appeal token using strictly configured secret and creates appeal for sub', () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-appeal-1',
        isAppealToken: true,
      });

      const req = {
        headers: { 'x-appeal-token': 'valid.appeal.token' },
        body: {},
      };

      appealsController.create(req, {
        reason: 'Account suspension review',
        evidence: 'context',
      } as any);

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
      expect(mockAppealsService.create).toHaveBeenCalledWith(
        'user-appeal-1',
        expect.objectContaining({ reason: 'Account suspension review' }),
      );
    });

    it('rejects forged JWT where isAppealToken claim is missing', () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-attacker',
        isAppealToken: false, // Forged standard access token attempting to bypass appeal guard
      });

      const req = {
        headers: { 'x-appeal-token': 'forged.token' },
        body: {},
      };

      expect(() =>
        appealsController.create(req, {
          reason: 'Bypass attempt',
        } as any),
      ).toThrow(UnauthorizedException);

      expect(mockAppealsService.create).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Refresh Token Family Reuse & Replay Detection
  // =========================================================================
  describe('Refresh Token Family Reuse & Replay Invalidation (RFC 6819)', () => {
    let authService: AuthService;
    let mockPrisma: any;
    let mockJwtService: any;
    let mockConfigService: any;

    beforeEach(() => {
      mockPrisma = {
        refreshToken: {
          findUnique: vi.fn(),
          findFirst: vi.fn(),
          delete: vi.fn().mockResolvedValue({}),
          deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({ id: 'rt-new', token: 'hash' }),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-legit',
            isActive: true,
            isRootBanned: false,
            profiles: [],
          }),
        },
      };

      mockJwtService = {
        verify: vi.fn(),
        sign: vi.fn().mockReturnValue('new-access-token'),
      };

      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
          if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
          return null;
        }),
        getOrThrow: vi.fn((key: string) => {
          if (key === 'JWT_SECRET') return 'super-strict-jwt-secret';
          if (key === 'JWT_REFRESH_SECRET')
            return 'super-strict-refresh-secret';
          throw new Error(`Missing config: ${key}`);
        }),
      };

      authService = new AuthService(
        mockPrisma,
        mockJwtService,
        mockConfigService as ConfigService,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue(undefined),
          del: vi.fn().mockResolvedValue(undefined),
        } as any,
        {} as any,
        {} as any,
        new AccountStateService(),
      );
    });

    it('detects replay of previously rotated token and revokes entire token family', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-victim',
        email: 'victim@example.com',
        familyId: 'compromised-family-123',
      });

      // Token found in DB but is already revoked (replayed)
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-revoked',
        userId: 'user-victim',
        familyId: 'compromised-family-123',
        isRevoked: true,
        token: 'some-hash',
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(
        authService.refreshToken(
          { refreshToken: 'replayed.refresh.token' },
          { ip: '1.2.3.4', userAgent: 'Attacker Browser' },
        ),
      ).rejects.toThrow(UnauthorizedException);

      // Verify the entire compromised family was deleted from the database
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-victim',
          familyId: 'compromised-family-123',
        },
      });
    });

    it('allows legitimate token rotation within the existing family', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: 'user-legit',
        email: 'legit@example.com',
        familyId: 'valid-family-456',
      });

      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-active',
        userId: 'user-legit',
        familyId: 'valid-family-456',
        isRevoked: false,
        token: 'some-hash',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const result = await authService.refreshToken(
        { refreshToken: 'valid.active.token' },
        { ip: '10.0.0.1', userAgent: 'Legit Browser' },
      );

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('new-access-token');

      // Verify old token was marked revoked
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'token-active' },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
        },
      });

      // Verify new token was created within the exact same familyId
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-legit',
            familyId: 'valid-family-456',
          }),
        }),
      );
    });
  });

  // =========================================================================
  // WebRTC Call Signaling Authorization & State Machine
  // =========================================================================
  describe('WebRTC Call Signaling Authorization', () => {
    let webrtcService: WebrtcSignalingService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        block: {
          findFirst: vi.fn(),
        },
        conversation: {
          findFirst: vi.fn(),
        },
      };

      webrtcService = new WebrtcSignalingService(mockPrisma);
    });

    it('rejects self-calling attempts before checking database relationships', async () => {
      const result = await webrtcService.authorizeAndInitiateCall(
        'profile-1',
        'profile-1',
        'audio',
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('SELF_CALL');
      expect(mockPrisma.block.findFirst).not.toHaveBeenCalled();
    });

    it('rejects call initiation when a block relationship exists between participants', async () => {
      mockPrisma.block.findFirst.mockResolvedValue({ id: 'block-1' });

      const result = await webrtcService.authorizeAndInitiateCall(
        'profile-caller',
        'profile-callee',
        'video',
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('BLOCKED');
      expect(mockPrisma.conversation.findFirst).not.toHaveBeenCalled();
    });

    it('rejects call initiation when no active 1-on-1 conversation exists', async () => {
      mockPrisma.block.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await webrtcService.authorizeAndInitiateCall(
        'profile-stranger-1',
        'profile-stranger-2',
        'audio',
      );

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('NO_CONVERSATION');
    });

    it('rejects call initiation if either caller or callee is currently busy in another call', async () => {
      mockPrisma.block.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });

      // First call succeeds
      const firstCall = await webrtcService.authorizeAndInitiateCall(
        'profile-alice',
        'profile-bob',
        'video',
      );
      expect(firstCall.ok).toBe(true);

      // Second call involving Alice while first call is ringing/active must be rejected with BUSY
      const secondCall = await webrtcService.authorizeAndInitiateCall(
        'profile-charlie',
        'profile-alice',
        'video',
      );
      expect(secondCall.ok).toBe(false);
      expect(secondCall.reason).toBe('BUSY');
    });

    it('rejects unauthorized signaling packets from non-participating third parties', async () => {
      mockPrisma.block.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });

      await webrtcService.authorizeAndInitiateCall(
        'profile-alice',
        'profile-bob',
        'audio',
      );

      // Charlie attempts to signal Bob without being an authorized call peer
      const isAllowed = webrtcService.authorizeSignal(
        'profile-charlie',
        'profile-bob',
      );
      expect(isAllowed).toBe(false);
    });

    it('rejects call accept if caller id does not match active session caller', async () => {
      mockPrisma.block.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });

      await webrtcService.authorizeAndInitiateCall(
        'profile-alice',
        'profile-bob',
        'video',
      );

      // Bob tries to accept call spoofing attacker caller ID
      const acceptResult = webrtcService.authorizeAndAcceptCall(
        'profile-bob',
        'profile-attacker',
      );
      expect(acceptResult.ok).toBe(false);
    });
  });

  // =========================================================================
  // GDPR Data Export Artifact Protection
  // =========================================================================
  describe('GDPR Export Artifact Protection', () => {
    let dataExportService: DataExportService;
    let mockPrisma: any;
    let mockConfigService: any;
    let mockOutbox: any;

    beforeEach(() => {
      mockPrisma = {
        dataExportRequest: {
          findUnique: vi.fn(),
        },
      };

      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'DATA_EXPORT_SECRET') return 'gdpr-hmac-secret-test';
          return null;
        }),
      };

      mockOutbox = {
        emit: vi.fn().mockResolvedValue(undefined),
      };

      dataExportService = new DataExportService(
        mockPrisma,
        mockConfigService as ConfigService,
        mockOutbox,
      );
    });

    it('denies unauthenticated download requests lacking session or HMAC token', async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-owner',
        status: 'COMPLETED',
        filePath: '/storage/exports/export-1.zip',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockRes = {} as any;

      await expect(
        dataExportService.streamDataExport(
          'export-1',
          undefined,
          undefined,
          mockRes,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('denies cross-user download attempt when session user does not match export owner', async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-victim',
        status: 'COMPLETED',
        filePath: '/storage/exports/export-1.zip',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockRes = {} as any;

      await expect(
        dataExportService.streamDataExport(
          'export-1',
          'user-attacker', // User B attempting to download User A's export
          undefined,
          mockRes,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects forged or tampered HMAC download tokens', async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-1',
        userId: 'user-victim',
        status: 'COMPLETED',
        filePath: '/storage/exports/export-1.zip',
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockRes = {} as any;

      // Tampered token
      const forgedToken = 'fake-payload.fake-signature';

      await expect(
        dataExportService.streamDataExport(
          'export-1',
          undefined,
          forgedToken,
          mockRes,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects expired export artifacts with HTTP 410 Gone', async () => {
      mockPrisma.dataExportRequest.findUnique.mockResolvedValue({
        id: 'export-expired',
        userId: 'user-owner',
        status: 'COMPLETED',
        filePath: '/storage/exports/export-expired.zip',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      });

      const mockRes = {} as any;

      await expect(
        dataExportService.streamDataExport(
          'export-expired',
          'user-owner',
          undefined,
          mockRes,
        ),
      ).rejects.toThrow(HttpException);

      try {
        await dataExportService.streamDataExport(
          'export-expired',
          'user-owner',
          undefined,
          mockRes,
        );
      } catch (err: any) {
        expect(err.getStatus()).toBe(HttpStatus.GONE);
      }
    });
  });

  // =========================================================================
  // Protected & Pay-Per-View Media Access Boundary
  // =========================================================================
  describe('Protected & PPV Media Access Boundaries', () => {
    let mediaAuthService: MediaAuthService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        postMedia: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        postUnlock: {
          findUnique: vi.fn(),
        },
        story: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        storyUnlock: {
          findUnique: vi.fn(),
        },
        message: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        messageUnlock: {
          findUnique: vi.fn(),
        },
        participant: {
          findFirst: vi.fn(),
        },
        comment: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        collection: {
          findMany: vi.fn().mockResolvedValue([]),
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

      mediaAuthService = new MediaAuthService(mockPrisma);
    });

    it('blocks direct static access to export artifacts across any media route', async () => {
      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/exports/user-123.zip',
        'user-123',
        'profile-123',
      );

      expect(allowed).toBe(false);
      expect(mockPrisma.postMedia.findMany).not.toHaveBeenCalled();
    });

    it('denies anonymous access to protected PPV media', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-ppv-1',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.PUBLIC,
            isPremium: true,
          },
        },
      ]);

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/ppv-photo.jpg',
        null, // Anonymous user
        null,
      );

      expect(allowed).toBe(false);
      expect(mockPrisma.postUnlock.findUnique).not.toHaveBeenCalled();
    });

    it('denies access to PPV media when logged-in viewer has not unlocked content', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-ppv-1',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.PUBLIC,
            isPremium: true,
          },
        },
      ]);

      mockPrisma.postUnlock.findUnique.mockResolvedValue(null);

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/ppv-photo.jpg',
        'viewer-user-id',
        'viewer-profile-id',
      );

      expect(allowed).toBe(false);
      expect(mockPrisma.postUnlock.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_postId: {
              userId: 'viewer-user-id',
              postId: 'post-ppv-1',
            },
          },
        }),
      );
    });

    it('grants access to PPV media when viewer has verified PostUnlock record', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-ppv-1',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.PUBLIC,
            isPremium: true,
          },
        },
      ]);

      mockPrisma.postUnlock.findUnique.mockResolvedValue({
        id: 'unlock-123',
        userId: 'buyer-user-id',
        postId: 'post-ppv-1',
      });

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/ppv-photo.jpg',
        'buyer-user-id',
        'buyer-profile-id',
      );

      expect(allowed).toBe(true);
    });

    it('always grants content author full access to their own PPV media', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-ppv-1',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.PUBLIC,
            isPremium: true,
          },
        },
      ]);

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/ppv-photo.jpg',
        'creator-user-id',
        'creator-profile', // Viewer matches post author
      );

      expect(allowed).toBe(true);
      expect(mockPrisma.postUnlock.findUnique).not.toHaveBeenCalled();
    });

    it('denies access to FOLLOWERS-only media when viewer does not follow creator', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-followers-only',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.FOLLOWERS,
            isPremium: false,
          },
        },
      ]);

      mockPrisma.follow.findFirst.mockResolvedValue(null);

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/followers-video.mp4',
        'viewer-user-id',
        'viewer-profile-id',
      );

      expect(allowed).toBe(false);
      expect(mockPrisma.follow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            followerId: 'viewer-profile-id',
            followingId: 'creator-profile',
            status: FollowStatus.ACCEPTED,
          },
        }),
      );
    });

    it('grants access to FOLLOWERS-only media when viewer is accepted active follower', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-followers-only',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.FOLLOWERS,
            isPremium: false,
          },
        },
      ]);

      mockPrisma.follow.findFirst.mockResolvedValue({
        id: 'follow-1',
        status: FollowStatus.ACCEPTED,
      });

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/followers-video.mp4',
        'viewer-user-id',
        'viewer-profile-id',
      );

      expect(allowed).toBe(true);
    });

    it('grants public free media to everyone without database relationship checks', async () => {
      mockPrisma.postMedia.findMany.mockResolvedValue([
        {
          postId: 'post-public-free',
          post: {
            profileId: 'creator-profile',
            visibility: Visibility.PUBLIC,
            isPremium: false,
          },
        },
      ]);

      const allowed = await mediaAuthService.isAccessAllowed(
        '/uploads/media/public-cat.jpg',
        null,
        null,
      );

      expect(allowed).toBe(true);
      expect(mockPrisma.postUnlock.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.follow.findFirst).not.toHaveBeenCalled();
    });
  });
});
