import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../../../../email/email.service.js';
import { BulkDeleteContentUseCase } from './bulk-delete-content.use-case.js';
import type { DeleteCommentUseCase } from './delete-comment.use-case.js';
import type { DeletePostUseCase } from './delete-post.use-case.js';

describe('BulkDeleteContentUseCase', () => {
  const deletePost = { execute: vi.fn(), remove: vi.fn() };
  const deleteComment = { execute: vi.fn() };
  const email = {
    sendPostRemovedEmail: vi.fn(),
    sendPostsRemovedEmail: vi.fn(),
  };
  const useCase = new BulkDeleteContentUseCase(
    deletePost as unknown as DeletePostUseCase,
    deleteComment as unknown as DeleteCommentUseCase,
    email as unknown as EmailService,
  );
  const by = (address: string | null, name = 'Ana') => ({
    author: address ? { email: address, name } : null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    deletePost.remove.mockResolvedValue(by('ana@example.com'));
    deleteComment.execute.mockResolvedValue(undefined);
    email.sendPostRemovedEmail.mockResolvedValue(undefined);
    email.sendPostsRemovedEmail.mockResolvedValue(undefined);
  });

  it('deletes each post as the staff member, in order, and tells its author once with how many', async () => {
    await expect(useCase.posts('admin-1', ['a', 'b', 'c'])).resolves.toEqual({
      deleted: 3,
      failed: 0,
    });

    expect(deletePost.remove.mock.calls).toEqual([
      ['admin-1', 'a'],
      ['admin-1', 'b'],
      ['admin-1', 'c'],
    ]);
    expect(email.sendPostsRemovedEmail.mock.calls).toEqual([
      ['ana@example.com', 'Ana', 3],
    ]);
    // Not also once per post.
    expect(deletePost.execute).not.toHaveBeenCalled();
    expect(email.sendPostRemovedEmail).not.toHaveBeenCalled();
    expect(deleteComment.execute).not.toHaveBeenCalled();
  });

  it('tells each author of their own posts, and one who lost a single post as when one is deleted', async () => {
    deletePost.remove
      .mockResolvedValueOnce(by('ana@example.com'))
      .mockResolvedValueOnce(by('luz@example.com', 'Luz'))
      .mockResolvedValueOnce(by('ana@example.com'))
      // An author with no address to write to.
      .mockResolvedValueOnce(by(null));

    await expect(
      useCase.posts('admin-1', ['a', 'b', 'c', 'd']),
    ).resolves.toEqual({ deleted: 4, failed: 0 });

    expect(email.sendPostsRemovedEmail.mock.calls).toEqual([
      ['ana@example.com', 'Ana', 2],
    ]);
    expect(email.sendPostRemovedEmail.mock.calls).toEqual([
      ['luz@example.com', 'Luz'],
    ]);
  });

  it('counts for an author only the posts that were deleted', async () => {
    deletePost.remove
      .mockResolvedValueOnce(by('ana@example.com'))
      .mockRejectedValueOnce(new NotFoundException('gone'))
      .mockResolvedValueOnce(by('ana@example.com'));

    await expect(useCase.posts('admin-1', ['a', 'gone', 'c'])).resolves.toEqual(
      { deleted: 2, failed: 1 },
    );

    expect(email.sendPostsRemovedEmail.mock.calls).toEqual([
      ['ana@example.com', 'Ana', 2],
    ]);
  });

  it('writes to nobody when nothing was deleted', async () => {
    deletePost.remove.mockRejectedValue(new NotFoundException('gone'));

    await expect(useCase.posts('admin-1', ['a', 'b'])).resolves.toEqual({
      deleted: 0,
      failed: 2,
    });

    expect(email.sendPostRemovedEmail).not.toHaveBeenCalled();
    expect(email.sendPostsRemovedEmail).not.toHaveBeenCalled();
  });

  it('keeps the result, and still tells the next author, when one notice cannot be sent', async () => {
    deletePost.remove
      .mockResolvedValueOnce(by('ana@example.com'))
      .mockResolvedValueOnce(by('ana@example.com'))
      .mockResolvedValueOnce(by('luz@example.com', 'Luz'));
    email.sendPostsRemovedEmail.mockRejectedValue(new Error('queue down'));

    await expect(useCase.posts('admin-1', ['a', 'b', 'c'])).resolves.toEqual({
      deleted: 3,
      failed: 0,
    });

    expect(email.sendPostRemovedEmail.mock.calls).toEqual([
      ['luz@example.com', 'Luz'],
    ]);
  });

  it('goes on past a comment that was already gone, counts it apart and writes to nobody', async () => {
    deleteComment.execute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundException('gone'))
      .mockResolvedValueOnce(undefined);

    await expect(
      useCase.comments('admin-1', ['a', 'gone', 'c']),
    ).resolves.toEqual({ deleted: 2, failed: 1 });
    expect(deleteComment.execute).toHaveBeenCalledTimes(3);
    expect(deletePost.remove).not.toHaveBeenCalled();
    expect(email.sendPostsRemovedEmail).not.toHaveBeenCalled();
  });
});
