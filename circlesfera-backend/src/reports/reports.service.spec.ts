/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReportTargetType } from './dto/create-report.dto.js';
import { ReportsService } from './reports.service.js';

// What a reporter can see is decided by the shared access policies; here they
// read the same rows the tests set, and refuse what is missing.
const access = vi.hoisted(() => ({
  post: vi.fn(),
  story: vi.fn(),
}));
vi.mock('../common/policies/post-access.policy.js', () => ({
  assertCanAccessPost: access.post,
}));
vi.mock('../common/policies/story-access.policy.js', () => ({
  assertCanAccessStory: access.story,
}));

describe('ReportsService', () => {
  let service: ReportsService;

  const mockPrismaService = {
    report: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    post: { findUnique: vi.fn() },
    comment: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn() },
    story: { findUnique: vi.fn() },
    message: { findUnique: vi.fn(), findFirst: vi.fn() },
    notification: { findFirst: vi.fn() },
    participant: { findUnique: vi.fn() },
    transaction: { findUnique: vi.fn() },
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    vi.clearAllMocks();
    access.post.mockImplementation(async (_db: unknown, id: string) => {
      const post = await mockPrismaService.post.findUnique({ where: { id } });
      if (!post) throw new NotFoundException('Post not found');
      return post;
    });
    access.story.mockImplementation(async (_db: unknown, id: string) => {
      const story = await mockPrismaService.story.findUnique({ where: { id } });
      if (!story) throw new NotFoundException('Story not found');
      return story;
    });
    // The reporter is in the conversation unless a test says otherwise.
    mockPrismaService.participant.findUnique.mockResolvedValue({ id: 'part' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    describe('only about what the reporter can see or took part in', () => {
      const report = (targetType: string, targetId = 't1') =>
        service.create('reporter-1', {
          targetType,
          targetId,
          reason: 'SPAM',
        } as any);

      beforeEach(() => {
        mockPrismaService.report.create.mockResolvedValue({ id: 'rep' });
      });

      it('a post or a story the reporter cannot see answers as missing, and nothing is filed', async () => {
        access.post.mockRejectedValueOnce(new NotFoundException());
        await expect(report('POST')).rejects.toMatchObject({
          errorCode: 'POST_NOT_FOUND',
        });
        expect(access.post).toHaveBeenCalledWith(
          mockPrismaService,
          't1',
          'reporter-1',
        );

        access.story.mockRejectedValueOnce(new NotFoundException());
        await expect(report('STORY')).rejects.toMatchObject({
          errorCode: 'STORY_NOT_FOUND',
        });
        expect(access.story).toHaveBeenCalledWith(
          mockPrismaService,
          't1',
          'reporter-1',
        );
        expect(mockPrismaService.report.create).not.toHaveBeenCalled();
      });

      it('a comment is reported only with its post in sight, and not once removed', async () => {
        mockPrismaService.comment.findUnique.mockResolvedValue({
          profileId: 'a',
          postId: 'p1',
          moderationStatus: 'VISIBLE',
        });
        access.post.mockRejectedValueOnce(new NotFoundException());
        await expect(report('COMMENT')).rejects.toMatchObject({
          errorCode: 'COMMENT_NOT_FOUND',
        });
        expect(access.post).toHaveBeenCalledWith(
          mockPrismaService,
          'p1',
          'reporter-1',
        );

        mockPrismaService.comment.findUnique.mockResolvedValue({
          profileId: 'a',
          postId: 'p1',
          moderationStatus: 'REMOVED',
        });
        await expect(report('COMMENT')).rejects.toMatchObject({
          errorCode: 'COMMENT_NOT_FOUND',
        });
        expect(mockPrismaService.report.create).not.toHaveBeenCalled();
      });

      it('a private post or comment answers as missing, not as private', async () => {
        for (const refusal of [
          'This account is private',
          'This post is private',
          'This post is for followers only',
        ]) {
          access.post.mockRejectedValueOnce(new ForbiddenException(refusal));
          await expect(report('POST')).rejects.toMatchObject({
            errorCode: 'POST_NOT_FOUND',
          });

          mockPrismaService.comment.findUnique.mockResolvedValueOnce({
            profileId: 'a',
            postId: 'p1',
            moderationStatus: 'VISIBLE',
          });
          access.post.mockRejectedValueOnce(new ForbiddenException(refusal));
          await expect(report('COMMENT')).rejects.toMatchObject({
            errorCode: 'COMMENT_NOT_FOUND',
          });
        }
        expect(mockPrismaService.report.create).not.toHaveBeenCalled();
      });

      it('someone who left the conversation but wrote in it can still report its messages', async () => {
        mockPrismaService.message.findUnique.mockResolvedValue({
          id: 'm1',
          kind: 'USER',
          conversationId: 'c1',
          senderId: 'a',
        });
        mockPrismaService.participant.findUnique.mockResolvedValueOnce(null);
        mockPrismaService.message.findFirst.mockResolvedValueOnce({
          id: 'mine',
        });

        await expect(report('MESSAGE')).resolves.toMatchObject({ id: 'rep' });
        expect(mockPrismaService.message.findFirst).toHaveBeenCalledWith({
          where: { conversationId: 'c1', senderId: 'reporter-1' },
          select: { id: true },
        });
      });

      it('a message is reported only by someone in its conversation', async () => {
        mockPrismaService.message.findUnique.mockResolvedValue({
          id: 'm1',
          kind: 'USER',
          conversationId: 'c1',
          senderId: 'a',
        });
        // Not a member, and never wrote in it.
        mockPrismaService.participant.findUnique.mockResolvedValueOnce(null);
        mockPrismaService.message.findFirst.mockResolvedValueOnce(null);

        await expect(report('MESSAGE')).rejects.toMatchObject({
          errorCode: 'MESSAGE_NOT_FOUND',
        });
        expect(mockPrismaService.participant.findUnique).toHaveBeenCalledWith({
          where: {
            conversationId_profileId: {
              conversationId: 'c1',
              profileId: 'reporter-1',
            },
          },
          select: { id: true },
        });
        expect(mockPrismaService.report.create).not.toHaveBeenCalled();
      });

      it('a payment is reported only by the person who paid or was paid', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValue({
          userId: 'u-me',
        });
        mockPrismaService.transaction.findUnique.mockResolvedValue({
          senderId: 'u-other',
          receiverId: 'u-third',
        });
        await expect(report('PAYMENT')).rejects.toMatchObject({
          errorCode: 'NOT_FOUND',
        });

        mockPrismaService.transaction.findUnique.mockResolvedValue(null);
        await expect(report('PAYMENT')).rejects.toMatchObject({
          errorCode: 'NOT_FOUND',
        });
        expect(mockPrismaService.report.create).not.toHaveBeenCalled();

        mockPrismaService.transaction.findUnique.mockResolvedValue({
          senderId: 'u-me',
          receiverId: 'u-third',
        });
        await expect(report('PAYMENT')).resolves.toMatchObject({ id: 'rep' });

        mockPrismaService.transaction.findUnique.mockResolvedValue({
          senderId: null,
          receiverId: 'u-me',
        });
        await expect(report('PAYMENT')).resolves.toMatchObject({ id: 'rep' });

        mockPrismaService.profile.findUnique.mockResolvedValue(null);
        await expect(report('PAYMENT')).rejects.toMatchObject({
          errorCode: 'NOT_FOUND',
        });
      });

      it('a report about the service itself names nothing to check', async () => {
        await expect(report('SYSTEM')).resolves.toMatchObject({ id: 'rep' });
      });

      it('a failure of the check other than not seeing is not hidden', async () => {
        access.post.mockRejectedValueOnce(new Error('db down'));
        await expect(report('POST')).rejects.toThrow('db down');
      });
    });

    it('should handle USER target type existence check', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.USER,
          targetId: 'u-missing',
          reason: 'HARASSMENT',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-u' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.USER,
        targetId: 'u-ok',
        reason: 'HARASSMENT',
      } as any);
      expect(res.id).toBe('rep-u');
    });

    it('should throw AppException if target post does not exist', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'invalid-post',
        reason: 'SPAM',
      };
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.create('user-1', dto as any)).rejects.toThrow(
        AppException,
      );
    });

    it('should create a report for a valid POST', async () => {
      const dto = {
        targetType: ReportTargetType.POST,
        targetId: 'post-1',
        reason: 'SPAM',
        details: 'Bad post',
      };
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.report.create.mockResolvedValue({ id: '1', ...dto });

      const result = await service.create('user-1', dto as any);
      expect(result.id).toBe('1');
      expect(mockPrismaService.report.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ details: 'Bad post' }),
        }),
      );
    });

    it('a report of self-harm is marked urgent, and no other reason is', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'post-1' });
      mockPrismaService.report.create.mockResolvedValue({ id: '1' });

      for (const [reason, urgent] of [
        ['SELF_HARM', true],
        ['INTELLECTUAL_PROPERTY', false],
        ['SPAM', false],
      ] as const) {
        await service.create('user-1', {
          targetType: ReportTargetType.POST,
          targetId: 'post-1',
          reason,
        } as any);
        expect(mockPrismaService.report.create).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ reason, urgent }),
          }),
        );
      }
    });

    describe('help on a report of self-harm', () => {
      const report = (targetType: string, targetId: string) =>
        service.create('reporter-1', {
          targetType,
          targetId,
          reason: 'SELF_HARM',
        } as any);
      const helpSent = () =>
        mockEventEmitter.emit.mock.calls.filter(
          ([name, payload]) =>
            name === 'notification.create' &&
            payload.notice?.key === 'support_resources',
        );

      beforeEach(() => {
        mockPrismaService.report.create.mockResolvedValue({ id: 'r-1' });
        mockPrismaService.notification.findFirst.mockResolvedValue(null);
        mockPrismaService.user.findFirst.mockResolvedValue({
          id: 'staff-user',
          profiles: [{ id: 'staff-profile' }],
        });
      });

      it('tells the author privately where to find help, never who reported', async () => {
        mockPrismaService.post.findUnique.mockResolvedValue({
          id: 'post-1',
          profileId: 'author-1',
        });

        await report('POST', 'post-1');

        expect(helpSent()).toEqual([
          [
            'notification.create',
            {
              recipientId: 'author-1',
              senderId: 'staff-profile',
              type: 'SYSTEM',
              notice: { key: 'support_resources' },
              targetType: 'support_resources',
            },
          ],
        ]);
      });

      it('finds the author of a story, a comment, a message and an account', async () => {
        mockPrismaService.story.findUnique.mockResolvedValue({
          profileId: 'a-story',
        });
        mockPrismaService.comment.findUnique.mockResolvedValue({
          profileId: 'a-comment',
        });
        mockPrismaService.message.findUnique.mockResolvedValue({
          senderId: 'a-message',
        });
        mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-9' });
        mockPrismaService.profile.findFirst.mockResolvedValue({ id: 'a-user' });

        await report('STORY', 's');
        await report('COMMENT', 'c');
        await report('MESSAGE', 'm');
        await report('USER', 'u-9');

        expect(helpSent().map(([, p]) => p.recipientId)).toEqual([
          'a-story',
          'a-comment',
          'a-message',
          'a-user',
        ]);
      });

      it('a report of a Profile is kept against the person, and help reaches the Profile reported', async () => {
        mockPrismaService.profile.findUnique.mockResolvedValueOnce({
          id: 'hobby-profile',
          userId: 'u-7',
        });

        await report('USER', 'hobby-profile');

        expect(mockPrismaService.report.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            targetType: 'USER',
            targetId: 'u-7',
          }),
        });
        expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
        expect(helpSent().map(([, p]) => p.recipientId)).toEqual([
          'hobby-profile',
        ]);
        expect(
          mockEventEmitter.emit.mock.calls.find(
            ([name]) => name === 'moderation.report_filed',
          )?.[1],
        ).toMatchObject({ targetType: 'USER', targetId: 'u-7' });
      });

      it('sends it once a day at most, never for a report about oneself, and not without staff', async () => {
        mockPrismaService.post.findUnique.mockResolvedValue({
          profileId: 'author-1',
        });
        mockPrismaService.notification.findFirst.mockResolvedValueOnce({
          id: 'n-today',
        });
        await report('POST', 'post-1');

        mockPrismaService.post.findUnique.mockResolvedValue({
          profileId: 'reporter-1',
        });
        await report('POST', 'post-2');

        mockPrismaService.post.findUnique.mockResolvedValue({
          profileId: 'author-2',
        });
        mockPrismaService.user.findFirst.mockResolvedValue(null);
        await report('POST', 'post-3');

        // An account with no Profile left has no one to tell.
        mockPrismaService.user.findUnique.mockResolvedValue({ id: 'u-0' });
        mockPrismaService.profile.findFirst.mockResolvedValue(null);
        await report('USER', 'u-0');

        expect(helpSent()).toEqual([]);
        expect(mockPrismaService.notification.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              recipientId: 'author-1',
              targetType: 'support_resources',
            }),
          }),
        );
      });

      it('another reason offers no help', async () => {
        mockPrismaService.post.findUnique.mockResolvedValue({
          profileId: 'author-1',
        });
        await service.create('reporter-1', {
          targetType: 'POST',
          targetId: 'post-1',
          reason: 'SPAM',
        } as any);
        expect(helpSent()).toEqual([]);
      });
    });

    it('keeps who holds the right and the work only on an intellectual-property report', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ profileId: 'a' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'r' });
      const fields = { rightsHolder: 'Ana Ruiz', workConcerned: 'My photo' };

      await service.create('reporter-1', {
        targetType: 'POST',
        targetId: 'p',
        reason: 'INTELLECTUAL_PROPERTY',
        ...fields,
      } as any);
      expect(mockPrismaService.report.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining(fields),
      });

      await service.create('reporter-1', {
        targetType: 'POST',
        targetId: 'p',
        reason: 'SPAM',
        ...fields,
      } as any);
      const data = mockPrismaService.report.create.mock.calls.at(-1)?.[0].data;
      expect(data).not.toHaveProperty('rightsHolder');
      expect(data).not.toHaveProperty('workConcerned');
    });

    it('should handle STORY target type existence check', async () => {
      mockPrismaService.story.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.STORY,
          targetId: 'story-missing',
          reason: 'NUDITY',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.story.findUnique.mockResolvedValue({ id: 'story-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-s' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.STORY,
        targetId: 'story-ok',
        reason: 'NUDITY',
      } as any);
      expect(res.id).toBe('rep-s');
    });

    it('should handle COMMENT target type existence check', async () => {
      mockPrismaService.comment.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.COMMENT,
          targetId: 'c-missing',
          reason: 'HATE_SPEECH',
        } as any),
      ).rejects.toThrow(AppException);

      mockPrismaService.comment.findUnique.mockResolvedValue({ id: 'c-ok' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-c' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.COMMENT,
        targetId: 'c-ok',
        reason: 'HATE_SPEECH',
      } as any);
      expect(res.id).toBe('rep-c');
    });

    it('should handle MESSAGE target type existence check', async () => {
      mockPrismaService.message.findUnique.mockResolvedValue(null);
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.MESSAGE,
          targetId: 'm-missing',
          reason: 'SCAM',
        } as any),
      ).rejects.toThrow(AppException);

      // A notice from the app was written by nobody: it cannot be reported.
      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-notice',
        kind: 'ADMIN_GRANTED',
        senderId: 'p-new-admin',
      });
      await expect(
        service.create('reporter-1', {
          targetType: ReportTargetType.MESSAGE,
          targetId: 'm-notice',
          reason: 'SCAM',
        } as any),
      ).rejects.toMatchObject({ errorCode: 'MESSAGE_IS_NOTICE', status: 400 });
      expect(mockPrismaService.report.create).not.toHaveBeenCalled();

      mockPrismaService.message.findUnique.mockResolvedValue({
        id: 'm-ok',
        kind: 'USER',
      });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-m' });
      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.MESSAGE,
        targetId: 'm-ok',
        reason: 'SCAM',
      } as any);
      expect(res.id).toBe('rep-m');
    });

    it('should emit a moderation.report_filed event on report creation', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({ id: 'p-1' });
      mockPrismaService.report.create.mockResolvedValue({ id: 'rep-slack' });

      const res = await service.create('reporter-1', {
        targetType: ReportTargetType.POST,
        targetId: 'p-1',
        reason: 'SPAM',
      } as any);
      expect(res.id).toBe('rep-slack');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'moderation.report_filed',
        expect.objectContaining({
          reportId: 'rep-slack',
          reporterId: 'reporter-1',
          targetType: ReportTargetType.POST,
          targetId: 'p-1',
          reason: 'SPAM',
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should find all reports paginated with defaults', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.report.count.mockResolvedValue(1);
      const result = await service.findAll({} as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.report.findMany).toHaveBeenCalled();
    });
  });

  describe('findMyReports', () => {
    it('never tells the reporter who is behind a Profile they reported', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([
        { id: 'r1', targetType: 'USER', targetId: 'u-7' },
        { id: 'r2', targetType: 'POST', targetId: 'post-1' },
      ]);
      mockPrismaService.report.count.mockResolvedValue(2);

      const result = await service.findMyReports('p-1', {} as any);

      expect(result.data).toEqual([
        { id: 'r1', targetType: 'USER', targetId: null },
        { id: 'r2', targetType: 'POST', targetId: 'post-1' },
      ]);
    });

    it('answers a new report with what the reporter may know of it', async () => {
      const createdAt = new Date();
      mockPrismaService.profile.findUnique.mockResolvedValueOnce({
        id: 'hobby-profile',
        userId: 'u-7',
      });
      mockPrismaService.report.create.mockResolvedValue({
        id: 'r-1',
        reporterId: 'p-1',
        targetType: 'USER',
        targetId: 'u-7',
        reason: 'SPAM',
        status: 'PENDING',
        details: null,
        createdAt,
      });

      await expect(
        service.create('p-1', {
          targetType: ReportTargetType.USER,
          targetId: 'hobby-profile',
          reason: 'SPAM',
        } as any),
      ).resolves.toEqual({
        id: 'r-1',
        targetType: 'USER',
        reason: 'SPAM',
        status: 'PENDING',
        createdAt,
      });
    });

    it('should find my reports paginated with defaults', async () => {
      mockPrismaService.report.findMany.mockResolvedValue([{ id: '1' }]);
      mockPrismaService.report.count.mockResolvedValue(1);
      const result = await service.findMyReports('user-1', {} as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrismaService.report.findMany).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update report status and emit notification with adminId', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '1',
        status: 'PENDING',
        reporterId: 'reporter-1',
        targetType: 'POST',
        targetId: 'post-1',
      });
      mockPrismaService.report.update.mockResolvedValue({
        id: '1',
        status: 'RESOLVED',
      });
      const result = await service.update(
        '1',
        'RESOLVED' as any,
        'custom-admin',
      );
      expect(result.status).toBe('RESOLVED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'reporter-1',
          senderId: 'custom-admin',
          postId: 'post-1',
        }),
      );
    });

    it('should update report status and resolve system moderator when adminId not passed', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '2',
        status: 'PENDING',
        reporterId: 'reporter-2',
        targetType: 'USER',
        targetId: 'target-u2',
      });
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'admin-auto',
        profiles: [{ id: 'admin-profile-auto' }],
      });
      mockPrismaService.report.update.mockResolvedValue({
        id: '2',
        status: 'DISMISSED',
      });
      const result = await service.update('2', 'DISMISSED' as any);
      expect(result.status).toBe('DISMISSED');
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'notification.create',
        expect.objectContaining({
          recipientId: 'reporter-2',
          senderId: 'admin-profile-auto',
          postId: undefined,
        }),
      );
    });

    it('should not emit notification if status did not change or no senderId resolved', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '3',
        status: 'RESOLVED',
        reporterId: 'reporter-3',
        targetType: 'POST',
        targetId: 'post-3',
      });
      mockPrismaService.report.update.mockResolvedValue({
        id: '3',
        status: 'RESOLVED',
      });
      await service.update('3', 'RESOLVED' as any);
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();

      // Test when status changes but resolveSystemModeratorActor returns null
      mockPrismaService.report.findUnique.mockResolvedValue({
        id: '4',
        status: 'PENDING',
        reporterId: 'reporter-4',
        targetType: 'POST',
        targetId: 'post-4',
      });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.report.update.mockResolvedValue({
        id: '4',
        status: 'RESOLVED',
      });
      await service.update('4', 'RESOLVED' as any);
    });

    it('should throw AppException if report is not found', async () => {
      mockPrismaService.report.findUnique.mockResolvedValue(null);
      await expect(
        service.update('invalid-id', 'RESOLVED' as any),
      ).rejects.toThrow(AppException);
    });
  });
});
