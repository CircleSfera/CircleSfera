import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIProcessor } from '../../ai/processors/ai.processor.js';
import { AnalyticsProcessor } from '../../analytics/processors/analytics.processor.js';
import { ChatProcessor } from '../../chat/processors/chat.processor.js';
import { CleanupExpiredMessagesUseCase } from '../../chat/use-cases/system/cleanup-expired-messages.use-case.js';
import { EditsProcessor } from '../../edits/processors/edits.processor.ts';
import { FeedFanoutProcessor } from '../../feed/processors/feed-fanout.processor.js';
import { NotificationsProcessor } from '../../notifications/processors/notifications.processor.js';
import { PostsProcessor } from '../../posts/posts.processor.js';
import { SlackProcessor } from '../../slack/processors/slack.processor.js';
import { StoriesProcessor } from '../../stories/processors/stories.processor.js';
import { AccountDeletionProcessor } from '../../users/account-deletion.processor.js';
import { DataExportProcessor } from '../../users/data-export.processor.js';
import { UsersProcessor } from '../../users/users.processor.js';
import { WarehouseExportProcessor } from '../../warehouse/processors/warehouse-export.processor.js';

describe('Queue Processors Reliability & Error Handling (Order 56 / QUEUE-002)', () => {
  describe('UsersProcessor & Users Sub-Processors', () => {
    let usersProcessor: UsersProcessor;
    let mockAccountDeletion: any;
    let mockDataExport: any;

    beforeEach(() => {
      mockAccountDeletion = {
        process: vi.fn(),
        cleanExpiredSearchHistory: vi.fn(),
        cleanExpiredAccounts: vi.fn(),
        hardDeleteUser: vi.fn(),
      };
      mockDataExport = {
        process: vi.fn(),
        processDataExport: vi.fn(),
        cleanExpiredDataExports: vi.fn(),
      };
      usersProcessor = new UsersProcessor(mockAccountDeletion, mockDataExport);
    });

    it('delegates account deletion jobs to AccountDeletionProcessor', async () => {
      mockAccountDeletion.process.mockResolvedValue({ success: true });
      const job = { name: 'clean-expired-accounts', data: {} } as any;

      await usersProcessor.process(job);
      expect(mockAccountDeletion.process).toHaveBeenCalledWith(job);
    });

    it('delegates data export jobs to DataExportProcessor', async () => {
      mockDataExport.process.mockResolvedValue({ success: true });
      const job = {
        name: 'export-data',
        data: { requestId: 'req-1', userId: 'u-1' },
      } as any;

      await usersProcessor.process(job);
      expect(mockDataExport.process).toHaveBeenCalledWith(job);
    });

    it('throws UnrecoverableError on unknown job name', async () => {
      const job = { name: 'unknown-user-job', data: {} } as any;
      await expect(usersProcessor.process(job)).rejects.toThrow(
        UnrecoverableError,
      );
    });

    it('AccountDeletionProcessor re-throws DB errors in cleanExpiredSearchHistory', async () => {
      const mockPrisma = {
        searchHistory: {
          deleteMany: vi
            .fn()
            .mockRejectedValue(new Error('Postgres connection lost')),
        },
      } as any;
      const proc = new AccountDeletionProcessor(
        mockPrisma,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await expect(proc.cleanExpiredSearchHistory()).rejects.toThrow(
        'Postgres connection lost',
      );
    });

    it('AccountDeletionProcessor throws UnrecoverableError if userId is missing', async () => {
      const proc = new AccountDeletionProcessor(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      await expect(proc.hardDeleteUser('')).rejects.toThrow(UnrecoverableError);
    });

    it('DataExportProcessor throws UnrecoverableError when user is not found', async () => {
      const mockPrisma = {
        dataExportRequest: {
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as any;
      const mockUsersService = {
        exportUserData: vi.fn().mockResolvedValue({}),
      } as any;

      const proc = new DataExportProcessor(
        mockPrisma,
        {} as any,
        mockUsersService,
        {} as any,
        {} as any,
      );

      await expect(
        proc.processDataExport('req-1', 'missing-user'),
      ).rejects.toThrow(UnrecoverableError);

      expect(mockPrisma.dataExportRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'FAILED' },
      });
    });

    it('DataExportProcessor does NOT mark FAILED when retries remain on transient error', async () => {
      const mockPrisma = {
        dataExportRequest: {
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ email: 'test@example.com', profiles: [] }),
        },
      } as any;
      const mockUsersService = {
        exportUserData: vi
          .fn()
          .mockRejectedValue(new Error('Disk I/O timeout')),
      } as any;

      const proc = new DataExportProcessor(
        mockPrisma,
        {} as any,
        mockUsersService,
        {} as any,
        {} as any,
      );

      const job = {
        opts: { attempts: 3 },
        attemptsMade: 0, // First attempt (attempt 1/3)
      } as any;

      await expect(
        proc.processDataExport('req-1', 'user-1', job),
      ).rejects.toThrow('Disk I/O timeout');

      // Only status: 'PROCESSING' was called at start, NOT status: 'FAILED'
      expect(mockPrisma.dataExportRequest.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dataExportRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: { status: 'PROCESSING' },
      });
    });
  });

  describe('AIProcessor', () => {
    it('throws UnrecoverableError on unknown job name', async () => {
      const proc = new AIProcessor({} as any, {} as any, {} as any);
      const job = { name: 'unknown-ai-task', data: {} } as any;

      await expect(proc.process(job)).rejects.toThrow(UnrecoverableError);
    });

    it('throws UnrecoverableError if required fields are missing', async () => {
      const proc = new AIProcessor({} as any, {} as any, {} as any);

      await expect(
        proc.process({ name: 'generate-embedding', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        proc.process({ name: 'moderate-content', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        proc.process({ name: 'generate-alt-text', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('re-throws transient OpenAI / service error during alt-text generation', async () => {
      const mockPrisma = {
        post: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'post-1',
            media: [
              {
                id: 'm-1',
                type: 'image',
                url: 'https://cdn.example.com/p.jpg',
              },
            ],
          }),
        },
      } as any;
      const mockAiService = {
        generateAltText: vi
          .fn()
          .mockRejectedValue(new Error('OpenAI 429 Rate Limit')),
      } as any;

      const proc = new AIProcessor(mockAiService, mockPrisma, {} as any);
      const job = {
        name: 'generate-alt-text',
        data: { postId: 'post-1' },
      } as any;

      await expect(proc.process(job)).rejects.toThrow('OpenAI 429 Rate Limit');
    });
  });

  describe('NotificationsProcessor', () => {
    it('throws UnrecoverableError on unknown job name', async () => {
      const proc = new NotificationsProcessor({} as any, {} as any);
      const job = { name: 'unknown-notif-job', data: {} } as any;

      await expect(proc.process(job)).rejects.toThrow(UnrecoverableError);
    });

    it('re-throws error when cleanupOldNotifications DB fails', async () => {
      const mockPrisma = {
        notification: {
          deleteMany: vi.fn().mockRejectedValue(new Error('Database deadlock')),
        },
      } as any;

      const proc = new NotificationsProcessor(mockPrisma, {} as any);
      await expect(proc.cleanupOldNotifications()).rejects.toThrow(
        'Database deadlock',
      );
    });
  });

  describe('StoriesProcessor & StoriesService', () => {
    it('throws UnrecoverableError on unknown job name', async () => {
      const proc = new StoriesProcessor({} as any);
      const job = { name: 'unknown-story-job', data: {} } as any;

      await expect(proc.process(job)).rejects.toThrow(UnrecoverableError);
    });
  });

  describe('ChatProcessor & CleanupExpiredMessagesUseCase', () => {
    it('ChatProcessor throws UnrecoverableError on unknown job name', async () => {
      const proc = new ChatProcessor({} as any);
      const job = { name: 'unknown-chat-job', data: {} } as any;

      await expect(proc.process(job)).rejects.toThrow(UnrecoverableError);
    });

    it('CleanupExpiredMessagesUseCase re-throws DB error', async () => {
      const mockPrisma = {
        message: {
          deleteMany: vi
            .fn()
            .mockRejectedValue(new Error('Prisma query timeout')),
        },
      } as any;

      const useCase = new CleanupExpiredMessagesUseCase(mockPrisma);
      await expect(useCase.execute()).rejects.toThrow('Prisma query timeout');
    });
  });

  describe('EditsProcessor', () => {
    it('throws UnrecoverableError on unknown job name', async () => {
      const proc = new EditsProcessor({} as any);
      const job = { name: 'unknown-edit-job', data: {} } as any;

      await expect(proc.process(job)).rejects.toThrow(UnrecoverableError);
    });
  });

  describe('PostsProcessor', () => {
    it('throws UnrecoverableError on unknown job name or invalid mediaUrls', async () => {
      const proc = new PostsProcessor({} as any);

      await expect(
        proc.process({ name: 'unknown-post-job', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        proc.process({ name: 'delete-post-media', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('re-throws failure during media deletion so BullMQ retries', async () => {
      const mockUploads = {
        deleteFile: vi.fn().mockRejectedValue(new Error('S3 503 SlowDown')),
      } as any;

      const proc = new PostsProcessor(mockUploads);
      const job = {
        name: 'delete-post-media',
        data: { mediaUrls: ['https://cdn.example.com/file1.png'] },
      } as any;

      await expect(proc.process(job)).rejects.toThrow(
        /Failed to delete 1\/1 media files/,
      );
    });
  });

  describe('WarehouseExportProcessor & SlackProcessor & FeedFanoutProcessor', () => {
    it('WarehouseExportProcessor throws UnrecoverableError on unknown job', async () => {
      const proc = new WarehouseExportProcessor({} as any);
      await expect(
        proc.process({ name: 'unknown-warehouse-job' } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('SlackProcessor throws UnrecoverableError on unknown job', async () => {
      const proc = new SlackProcessor({} as any);
      await expect(
        proc.process({ name: 'unknown-slack-job', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('FeedFanoutProcessor throws UnrecoverableError on unknown job or missing data', async () => {
      const proc = new FeedFanoutProcessor({} as any, {} as any);

      await expect(
        proc.process({ name: 'unknown-feed-job', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);

      await expect(
        proc.process({ name: 'distribute', data: { postId: 'p1' } } as any),
      ).rejects.toThrow(UnrecoverableError);
    });
  });

  describe('AnalyticsProcessor', () => {
    it('throws UnrecoverableError on missing postId for update-performance-score', async () => {
      const proc = new AnalyticsProcessor({} as any, {} as any);
      await expect(
        proc.process({ name: 'update-performance-score', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('throws UnrecoverableError on unknown job', async () => {
      const proc = new AnalyticsProcessor({} as any, {} as any);
      await expect(
        proc.process({ name: 'unknown-analytics-job', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);
    });
  });
});
