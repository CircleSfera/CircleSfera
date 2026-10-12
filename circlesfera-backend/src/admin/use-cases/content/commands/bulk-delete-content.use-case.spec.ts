import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BulkDeleteContentUseCase } from './bulk-delete-content.use-case.js';
import type { DeleteCommentUseCase } from './delete-comment.use-case.js';
import type { DeletePostUseCase } from './delete-post.use-case.js';

describe('BulkDeleteContentUseCase', () => {
  const deletePost = { execute: vi.fn() };
  const deleteComment = { execute: vi.fn() };
  const useCase = new BulkDeleteContentUseCase(
    deletePost as unknown as DeletePostUseCase,
    deleteComment as unknown as DeleteCommentUseCase,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    deletePost.execute.mockResolvedValue(undefined);
    deleteComment.execute.mockResolvedValue(undefined);
  });

  it('deletes each post the way one is deleted alone, as the staff member, in order', async () => {
    await expect(useCase.posts('admin-1', ['a', 'b', 'c'])).resolves.toEqual({
      deleted: 3,
      failed: 0,
    });

    expect(deletePost.execute.mock.calls).toEqual([
      ['admin-1', 'a'],
      ['admin-1', 'b'],
      ['admin-1', 'c'],
    ]);
    expect(deleteComment.execute).not.toHaveBeenCalled();
  });

  it('goes on past an item that was already gone, and counts it apart', async () => {
    deleteComment.execute
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new NotFoundException('gone'))
      .mockResolvedValueOnce(undefined);

    await expect(
      useCase.comments('admin-1', ['a', 'gone', 'c']),
    ).resolves.toEqual({ deleted: 2, failed: 1 });
    expect(deleteComment.execute).toHaveBeenCalledTimes(3);
    expect(deletePost.execute).not.toHaveBeenCalled();
  });
});
