import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import type { LogAdminActionUseCase } from './log-admin-action.use-case.js';
import { SetHashtagHiddenUseCase } from './set-hashtag-hidden.use-case.js';

describe('SetHashtagHiddenUseCase', () => {
  const prisma = { hashtag: { findUnique: vi.fn(), update: vi.fn() } };
  const log = { execute: vi.fn() };
  const useCase = new SetHashtagHiddenUseCase(
    prisma as unknown as PrismaService,
    log as unknown as LogAdminActionUseCase,
  );
  const stored = (isHidden: boolean) =>
    prisma.hashtag.findUnique.mockResolvedValue({
      id: 'h-1',
      tag: 'spam',
      isHidden,
    });

  beforeEach(() => vi.clearAllMocks());

  it('hides a hashtag and writes it in the audit log with its name', async () => {
    stored(false);

    await expect(useCase.execute('admin-1', 'h-1', true)).resolves.toEqual({
      id: 'h-1',
      isHidden: true,
    });

    expect(prisma.hashtag.update).toHaveBeenCalledWith({
      where: { id: 'h-1' },
      data: { isHidden: true },
    });
    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'CONTENT_RESTRICTED',
      'hashtag',
      'h-1',
      '#spam',
    );
  });

  it('shows a hidden hashtag again, logged as restored', async () => {
    stored(true);

    await expect(useCase.execute('admin-1', 'h-1', false)).resolves.toEqual({
      id: 'h-1',
      isHidden: false,
    });

    expect(prisma.hashtag.update).toHaveBeenCalledWith({
      where: { id: 'h-1' },
      data: { isHidden: false },
    });
    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'CONTENT_RESTORED',
      'hashtag',
      'h-1',
      '#spam',
    );
  });

  it('changes and logs nothing when it already is what was asked', async () => {
    stored(true);

    await expect(useCase.execute('admin-1', 'h-1', true)).resolves.toEqual({
      id: 'h-1',
      isHidden: true,
    });

    expect(prisma.hashtag.update).not.toHaveBeenCalled();
    expect(log.execute).not.toHaveBeenCalled();
  });

  it('refuses a hashtag that does not exist', async () => {
    prisma.hashtag.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('admin-1', 'nope', true)).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.hashtag.update).not.toHaveBeenCalled();
    expect(log.execute).not.toHaveBeenCalled();
  });
});
