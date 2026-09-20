import { ApiErrorCode } from '@circlesfera/shared';
import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { JwtService } from '@nestjs/jwt';
import { type Job, UnrecoverableError } from 'bullmq';
import type { Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountStateService } from '../../auth/services/account-state.service.js';
import { FeedService } from '../../feed/feed.service.js';
import type { FeedInboxService } from '../../feed/feed-inbox.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { AppGateway, type SocketWithAuth } from '../../socket/app.gateway.js';
import type { ChatRealtimeService } from '../../socket/services/chat-realtime.service.js';
import type { LiveRealtimeService } from '../../socket/services/live-realtime.service.js';
import { SocketAuthService } from '../../socket/services/socket-auth.service.js';
import type { SocketPresenceService } from '../../socket/services/socket-presence.service.js';
import type { StorageProvider } from '../../uploads/interfaces/storage-provider.interface.js';
import type { UploadedFile } from '../../uploads/interfaces/uploaded-file.interface.js';
import type { MediaProcessorService } from '../../uploads/media-processor.service.js';
import type { MediaSignatureValidator } from '../../uploads/media-signature.validator.js';
import { MediaCleanupProcessor } from '../../uploads/processors/media-cleanup.processor.js';
import { VideoProcessor } from '../../uploads/processors/video.processor.js';
import {
  DEFAULT_MAX_USER_CONCURRENT_VIDEO_JOBS,
  DEFAULT_MAX_VIDEO_QUEUE_BACKLOG,
  UploadsService,
} from '../../uploads/uploads.service.js';
import type { WebrtcSignalingService } from '../../webrtc/webrtc-signaling.service.js';

describe('Failure Injection & Recovery Invariants (QA-007)', () => {
  describe('Media Pipeline: Admission Control & Failure Injection (UPLOAD-006)', () => {
    let uploadsService: UploadsService;
    let mockStorageProvider: StorageProvider;
    let mockMediaProcessor: MediaProcessorService;
    let mockSignatureValidator: MediaSignatureValidator;
    let mockVideoQueue: {
      getWaitingCount: ReturnType<typeof vi.fn>;
      getActiveCount: ReturnType<typeof vi.fn>;
      getJobs: ReturnType<typeof vi.fn>;
      add: ReturnType<typeof vi.fn>;
    };
    let mockConfigService: ConfigService;

    beforeEach(() => {
      mockStorageProvider = {
        upload: vi.fn(),
        delete: vi.fn(),
      } as unknown as StorageProvider;

      mockMediaProcessor = {
        process: vi.fn(),
      } as unknown as MediaProcessorService;

      mockSignatureValidator = {
        validate: vi.fn().mockResolvedValue(undefined),
      } as unknown as MediaSignatureValidator;

      mockVideoQueue = {
        getWaitingCount: vi.fn().mockResolvedValue(0),
        getActiveCount: vi.fn().mockResolvedValue(0),
        getJobs: vi.fn().mockResolvedValue([]),
        add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      };

      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'VIDEO_TRANSCODING_MAX_BACKLOG')
            return DEFAULT_MAX_VIDEO_QUEUE_BACKLOG;
          if (key === 'VIDEO_TRANSCODING_USER_QUOTA')
            return DEFAULT_MAX_USER_CONCURRENT_VIDEO_JOBS;
          return undefined;
        }),
      } as unknown as ConfigService;

      uploadsService = new UploadsService(
        mockStorageProvider,
        mockMediaProcessor,
        mockSignatureValidator,
        mockVideoQueue as unknown as ConstructorParameters<
          typeof UploadsService
        >[3],
        mockConfigService,
      );
    });

    it('rejects video upload with 503 Service Unavailable when global transcoding queue is saturated', async () => {
      mockVideoQueue.getWaitingCount.mockResolvedValue(15);
      mockVideoQueue.getActiveCount.mockResolvedValue(5); // total = 20 >= DEFAULT_MAX_VIDEO_QUEUE_BACKLOG (20)

      const dummyFile: UploadedFile = {
        buffer: Buffer.from('fake-video-bytes'),
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
      };

      await expect(
        uploadsService.uploadFile(dummyFile, 'user-abc'),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(mockStorageProvider.upload).not.toHaveBeenCalled();
      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });

    it('rejects video upload with 429 Too Many Requests when per-user concurrent job quota is saturated', async () => {
      mockVideoQueue.getWaitingCount.mockResolvedValue(2);
      mockVideoQueue.getActiveCount.mockResolvedValue(1);
      mockVideoQueue.getJobs.mockResolvedValue([
        { data: { userId: 'rate-limited-user' } },
        { data: { userId: 'rate-limited-user' } }, // 2 active/waiting jobs for this user
      ]);

      const dummyFile: UploadedFile = {
        buffer: Buffer.from('fake-video-bytes'),
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
      };

      await expect(
        uploadsService.uploadFile(dummyFile, 'rate-limited-user'),
      ).rejects.toThrow(HttpException);

      try {
        await uploadsService.uploadFile(dummyFile, 'rate-limited-user');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      expect(mockStorageProvider.upload).not.toHaveBeenCalled();
    });

    it('bubbles storage provider failure and avoids enqueuing transcode job when upload rejects', async () => {
      const storageError = new Error('S3 connection timed out');
      (
        mockMediaProcessor.process as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        original: { buffer: Buffer.from('processed'), mimetype: 'video/mp4' },
      });
      (
        mockStorageProvider.upload as ReturnType<typeof vi.fn>
      ).mockRejectedValue(storageError);

      const dummyFile: UploadedFile = {
        buffer: Buffer.from('video-payload'),
        mimetype: 'video/mp4',
        originalname: 'clip.mp4',
      };

      await expect(
        uploadsService.uploadFile(dummyFile, 'healthy-user'),
      ).rejects.toThrow('S3 connection timed out');

      expect(mockVideoQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('Queue Processors: Terminal Rejection & Retry Backoff (QUEUE-001, QUEUE-002)', () => {
    let mockPrisma: PrismaService;
    let videoProcessor: VideoProcessor;
    let mockUploadsService: UploadsService;
    let mockEventEmitter: EventEmitter2;
    let mediaCleanupProcessor: MediaCleanupProcessor;

    beforeEach(() => {
      mockPrisma = {
        post: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        story: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        message: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        comment: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        profile: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
        collection: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      } as unknown as PrismaService;

      videoProcessor = new VideoProcessor(mockPrisma);

      mockUploadsService = {
        deleteFile: vi.fn(),
      } as unknown as UploadsService;

      mockEventEmitter = {
        emit: vi.fn(),
      } as unknown as EventEmitter2;

      mediaCleanupProcessor = new MediaCleanupProcessor(
        mockUploadsService,
        mockEventEmitter,
      );
    });

    it('throws UnrecoverableError when video job name is unknown or payload has no url', async () => {
      const invalidJob = {
        name: 'unrecognized-video-job',
        data: { url: 'https://example.com/video.mp4' },
      } as unknown as Job<{ url: string }>;

      await expect(videoProcessor.process(invalidJob)).rejects.toThrow(
        UnrecoverableError,
      );

      const missingUrlJob = {
        name: 'transcode',
        data: {},
      } as unknown as Job<{ url: string }>;

      await expect(videoProcessor.process(missingUrlJob)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it('throws UnrecoverableError when basename is not a valid UUID v4 (path manipulation guard)', async () => {
      const maliciousJob = {
        name: 'transcode',
        data: {
          url: '/uploads/../../etc/passwd.mp4',
        },
      } as unknown as Job<{ url: string }>;

      await expect(videoProcessor.process(maliciousJob)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it('re-throws error to trigger BullMQ retry when storage deletion fails in MediaCleanupProcessor', async () => {
      (
        mockUploadsService.deleteFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('S3 Service Unavailable'));

      const job = {
        id: 'cleanup-job-1',
        name: 'delete-media-batch',
        data: {
          mediaUrls: ['https://cdn.example.com/file1.png'],
        },
        attemptsMade: 1,
        opts: { attempts: 5 },
      } as unknown as Parameters<typeof mediaCleanupProcessor.process>[0];

      await expect(mediaCleanupProcessor.process(job)).rejects.toThrow(
        /Media deletion failed for 1\/1 files/,
      );

      // On intermediate attempts, system.incident should not be emitted
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('emits system.incident event when MediaCleanupProcessor exhausts max retry attempts', async () => {
      (
        mockUploadsService.deleteFile as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Permanent Access Denied'));

      const job = {
        id: 'cleanup-job-final',
        name: 'delete-media-batch',
        data: {
          mediaUrls: ['https://cdn.example.com/stale.mp4'],
        },
        attemptsMade: 4, // 5th attempt (currentAttempt = 5)
        opts: { attempts: 5 },
      } as unknown as Parameters<typeof mediaCleanupProcessor.process>[0];

      await expect(mediaCleanupProcessor.process(job)).rejects.toThrow(
        /Media deletion failed/,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'system.incident',
        expect.objectContaining({
          type: 'system.incident',
          payload: expect.objectContaining({
            statusCode: 500,
            path: 'media-cleanup/delete-media-batch',
          }),
        }),
      );
    });
  });

  describe('Realtime & Signaling: Fail-Closed Authorization & Drops (RT-003)', () => {
    let mockJwtService: JwtService;
    let mockPrisma: PrismaService;
    let mockConfigService: ConfigService;
    let socketAuthService: SocketAuthService;

    beforeEach(() => {
      mockJwtService = {
        verifyAsync: vi.fn(),
      } as unknown as JwtService;

      mockConfigService = {
        getOrThrow: vi.fn().mockReturnValue('mock-jwt-secret'),
      } as unknown as ConfigService;

      mockPrisma = {
        user: { findUnique: vi.fn() },
        conversationParticipant: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;

      socketAuthService = new SocketAuthService(
        mockJwtService,
        mockConfigService,
        mockPrisma,
        new AccountStateService(),
      );
    });

    it('rejects connection when handshake contains no auth token', async () => {
      const mockClient = {
        handshake: { headers: {} },
      } as unknown as Socket;

      await expect(socketAuthService.authenticate(mockClient)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(socketAuthService.authenticate(mockClient)).rejects.toThrow(
        'No token found',
      );
    });

    it('rejects connection when user profile does not exist', async () => {
      const mockClient = {
        handshake: {
          headers: { cookie: 'access_token=valid.token' },
        },
      } as unknown as Socket;

      (
        mockJwtService.verifyAsync as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        sub: 'user-without-profile',
        email: 'orphan@example.com',
      });

      (
        mockPrisma.user.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'user-without-profile',
        isActive: true,
        profiles: [], // no profile!
      });

      await expect(socketAuthService.authenticate(mockClient)).rejects.toThrow(
        'Profile not found',
      );
    });

    it('rejects connection when profile is currently suspended', async () => {
      const mockClient = {
        handshake: {
          headers: { cookie: 'access_token=valid.token' },
        },
      } as unknown as Socket;

      (
        mockJwtService.verifyAsync as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        sub: 'suspended-user',
        email: 'suspended@example.com',
      });

      (
        mockPrisma.user.findUnique as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        id: 'suspended-user',
        isActive: true,
        profiles: [
          {
            id: 'prof-suspended',
            suspendedUntil: new Date(Date.now() + 100000), // suspended
          },
        ],
      });

      await expect(socketAuthService.authenticate(mockClient)).rejects.toThrow(
        ApiErrorCode.ACCOUNT_SUSPENDED,
      );
    });

    it('drops cross-conversation reactions when caller lacks conversation access and DB rejects', async () => {
      const mockChatRealtimeService = {
        addReaction: vi.fn().mockResolvedValue({ success: false }),
      } as unknown as ChatRealtimeService;

      const mockWebrtc = {} as unknown as WebrtcSignalingService;
      const mockPresence = {} as unknown as SocketPresenceService;
      const mockLive = {} as unknown as LiveRealtimeService;

      const gateway = new AppGateway(
        socketAuthService,
        mockPresence,
        mockChatRealtimeService,
        mockWebrtc,
        mockLive,
      );

      const mockEmit = vi.fn();
      const mockTo = vi.fn().mockReturnValue({ emit: mockEmit });
      gateway.server = {
        to: mockTo,
        emit: mockEmit,
      } as unknown as AppGateway['server'];

      const client = {
        data: {
          user: { profileId: 'caller-profile', sub: 'caller-sub' },
          conversationIds: new Set(['convo-authorized']),
        },
      } as unknown as SocketWithAuth;

      await gateway.handleSendReaction(
        {
          messageId: 'msg-1',
          conversationId: 'convo-unauthorized',
          reaction: '❤️',
        },
        client,
      );

      expect(mockChatRealtimeService.addReaction).toHaveBeenCalledWith(
        'msg-1',
        'convo-unauthorized',
        'caller-profile',
        '❤️',
        false, // hasConversationAccess is false
      );
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe('Redis Degradation & Cache Fallback Invariants (REDIS-002)', () => {
    let mockPrisma: PrismaService;
    let mockFeedInbox: FeedInboxService;
    let feedService: FeedService;

    beforeEach(() => {
      mockPrisma = {
        follow: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ followingId: 'target-author' }]),
        },
        mute: { findMany: vi.fn().mockResolvedValue([]) },
        userPreference: { findUnique: vi.fn().mockResolvedValue(null) },
        userSettings: { findUnique: vi.fn().mockResolvedValue(null) },
        profile: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ userId: 'account-profile-reader' }),
        },
        like: { findMany: vi.fn().mockResolvedValue([]) },
        creatorSubscription: { findMany: vi.fn().mockResolvedValue([]) },
        postUnlock: { findMany: vi.fn().mockResolvedValue([]) },
        promotion: { findMany: vi.fn().mockResolvedValue([]) },
        post: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { id: 'sql-post-1', authorId: 'target-author', likes: [] },
            ]),
          count: vi.fn().mockResolvedValue(1),
        },
        block: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;

      mockFeedInbox = {
        getInbox: vi.fn(),
        getInboxCount: vi.fn(),
        rebuildInbox: vi.fn().mockResolvedValue(undefined),
      } as unknown as FeedInboxService;

      const mockFeedPreferences = {
        getFilterSets: vi.fn().mockResolvedValue({
          hiddenPostIds: [],
          hiddenAuthorIds: [],
          mutedKeywords: [],
        }),
      };

      const mockExperiments = {
        isFeatureEnabled: vi.fn().mockResolvedValue(false),
      };

      feedService = new FeedService(
        mockPrisma,
        {} as never,
        {} as never,
        mockFeedInbox,
        mockFeedPreferences as never,
        mockExperiments as never,
      );
    });

    it('falls back cleanly to canonical SQL when Redis getInbox returns null (REDIS-002)', async () => {
      (mockFeedInbox.getInbox as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      const feed = await feedService.getFollowingFeed('profile-reader', {
        page: 1,
        limit: 10,
      });

      expect(feed.data).toHaveLength(1);
      expect(feed.data[0].id).toBe('sql-post-1');
      // CRITICAL: Must NOT attempt to rebuild inbox into degraded Redis
      expect(mockFeedInbox.rebuildInbox).not.toHaveBeenCalled();
    });

    it('triggers background inbox rebuild only when inbox is genuinely empty (not degraded null)', async () => {
      (mockFeedInbox.getInbox as ReturnType<typeof vi.fn>).mockResolvedValue(
        [],
      ); // genuinely empty, not null!

      await feedService.getFollowingFeed('profile-reader', {
        page: 1,
        limit: 10,
      });

      expect(mockFeedInbox.rebuildInbox).toHaveBeenCalledWith('profile-reader');
    });

    it('safely defaults total to returned posts length when getInboxCount returns null due to Redis failure', async () => {
      (mockFeedInbox.getInbox as ReturnType<typeof vi.fn>).mockResolvedValue([
        'cached-post-1',
      ]);
      (
        mockFeedInbox.getInboxCount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null); // Redis count failed!
      (mockPrisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'cached-post-1', likes: [] },
      ]);

      const feed = await feedService.getFollowingFeed('profile-reader', {
        page: 1,
        limit: 10,
      });

      expect(feed.data).toHaveLength(1);
      expect(feed.meta.total).toBe(1);
    });
  });
});
