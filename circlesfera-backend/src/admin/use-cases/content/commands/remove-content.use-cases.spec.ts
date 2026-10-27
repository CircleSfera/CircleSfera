import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsService } from '../../../../notifications/notifications.service.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { DeleteCommentUseCase } from './delete-comment.use-case.js';
import { DeleteStoryUseCase } from './delete-story.use-case.js';
import type { LogAdminActionUseCase } from './log-admin-action.use-case.js';
import { ModerateContentUseCase } from './moderate-content.use-case.js';

// Staff removing a story or a comment keep it, shown to nobody, for six
// months: the row is marked removed, never deleted.
describe('staff removal of content', () => {
  const removed = {
    id: 'x-1',
    profileId: 'author',
    moderationStatus: 'REMOVED',
  };
  const prisma = {
    post: { update: vi.fn(), delete: vi.fn() },
    story: { update: vi.fn(), delete: vi.fn() },
    comment: { update: vi.fn(), delete: vi.fn() },
    adminIdentity: { findUnique: vi.fn() },
  };
  const log = { execute: vi.fn() };
  const notifications = { create: vi.fn() };
  const asPrisma = prisma as unknown as PrismaService;
  const asLog = log as unknown as LogAdminActionUseCase;
  const select = { id: true, profileId: true, moderationStatus: true };

  beforeEach(() => {
    vi.clearAllMocks();
    for (const model of [prisma.post, prisma.story, prisma.comment]) {
      model.update.mockResolvedValue(removed);
    }
    prisma.adminIdentity.findUnique.mockResolvedValue(null);
    notifications.create.mockResolvedValue({});
  });

  it('removes a story without deleting it, and logs it as before', async () => {
    await new DeleteStoryUseCase(asPrisma, asLog).execute('admin-1', 's-1');

    expect(prisma.story.delete).not.toHaveBeenCalled();
    expect(prisma.story.update).toHaveBeenCalledWith({
      where: { id: 's-1' },
      data: {
        moderationStatus: 'REMOVED',
        moderationNote: undefined,
        moderatedAt: expect.any(Date),
      },
      select,
    });
    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'DELETE_STORY',
      'story',
      's-1',
    );
  });

  it('removes a comment without deleting it, and logs it as before', async () => {
    await new DeleteCommentUseCase(asPrisma, asLog).execute('admin-1', 'c-1');

    expect(prisma.comment.delete).not.toHaveBeenCalled();
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: {
        moderationStatus: 'REMOVED',
        moderationNote: undefined,
        moderatedAt: expect.any(Date),
      },
      select,
    });
    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'DELETE_COMMENT',
      'comment',
      'c-1',
    );
  });

  it('a moderation decision records when, for each kind of content, and tells the author', async () => {
    const useCase = new ModerateContentUseCase(
      asPrisma,
      notifications as unknown as NotificationsService,
      asLog,
    );

    await expect(
      useCase.execute('admin-1', 'COMMENT', 'c-1', 'REMOVED', 'Spam'),
    ).resolves.toEqual(removed);
    expect(prisma.comment.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: {
        moderationStatus: 'REMOVED',
        moderationNote: 'Spam',
        moderatedAt: expect.any(Date),
      },
      select,
    });
    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'CONTENT_REMOVED',
      'comment',
      'c-1',
      'Spam',
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'author',
        notice: expect.objectContaining({ status: 'removed' }),
        postId: undefined,
      }),
    );

    await useCase.execute('admin-1', 'STORY', 's-1', 'HIDDEN');
    expect(prisma.story.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ moderatedAt: expect.any(Date) }),
      }),
    );

    await useCase.execute('admin-1', 'POST', 'p-1', 'VISIBLE');
    expect(prisma.post.update).toHaveBeenLastCalledWith({
      where: { id: 'p-1' },
      data: { moderationStatus: 'VISIBLE', moderationNote: undefined },
      select,
    });
    expect(notifications.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        notice: expect.objectContaining({ status: 'restored' }),
        postId: 'p-1',
      }),
    );
  });

  it('refuses an unknown kind or decision', async () => {
    const useCase = new ModerateContentUseCase(
      asPrisma,
      notifications as unknown as NotificationsService,
      asLog,
    );
    await expect(
      useCase.execute('admin-1', 'USER' as never, 'x', 'REMOVED'),
    ).rejects.toThrow('Invalid targetType');
    await expect(
      useCase.execute('admin-1', 'POST', 'x', 'GONE' as never),
    ).rejects.toThrow('Invalid status');
  });
});
