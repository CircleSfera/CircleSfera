import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailService } from '../../../../email/email.service.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { DeletePostUseCase } from './delete-post.use-case.js';
import type { LogAdminActionUseCase } from './log-admin-action.use-case.js';

vi.mock('../../../../common/auth/sign-in-lookup.js', () => ({
  emailForProfile: vi.fn(),
}));

import { emailForProfile } from '../../../../common/auth/sign-in-lookup.js';

describe('DeletePostUseCase', () => {
  const prisma = { post: { findUnique: vi.fn(), delete: vi.fn() } };
  const email = { sendPostRemovedEmail: vi.fn() };
  const log = { execute: vi.fn() };
  const useCase = new DeletePostUseCase(
    prisma as unknown as PrismaService,
    email as unknown as EmailService,
    log as unknown as LogAdminActionUseCase,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.post.findUnique.mockResolvedValue({
      id: 'p-1',
      profileId: 'profile-1',
      profile: { userId: 'u-1', username: 'ana', fullName: 'Ana Ruiz' },
    });
    prisma.post.delete.mockResolvedValue({ id: 'p-1' });
    vi.mocked(emailForProfile).mockResolvedValue('ana@example.com');
  });

  it('deletes one post, logs it and writes to its author with the staff note', async () => {
    await expect(useCase.execute('admin-1', 'p-1', 'Spam')).resolves.toEqual({
      id: 'p-1',
    });

    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'DELETE_POST',
      'post',
      'p-1',
    );
    expect(prisma.post.delete).toHaveBeenCalledWith({ where: { id: 'p-1' } });
    expect(email.sendPostRemovedEmail.mock.calls).toEqual([
      ['ana@example.com', 'Ana Ruiz', 'Spam'],
    ]);
  });

  it('removes a post without writing to anyone, and says who its author is', async () => {
    await expect(useCase.remove('admin-1', 'p-1')).resolves.toEqual({
      deletedPost: { id: 'p-1' },
      author: { email: 'ana@example.com', name: 'Ana Ruiz' },
    });

    expect(log.execute).toHaveBeenCalledTimes(1);
    expect(prisma.post.delete).toHaveBeenCalledTimes(1);
    expect(email.sendPostRemovedEmail).not.toHaveBeenCalled();
  });

  it('names the author by handle when there is no name, and nobody with no address', async () => {
    prisma.post.findUnique.mockResolvedValue({
      id: 'p-1',
      profileId: 'profile-1',
      profile: { userId: 'u-1', username: 'ana', fullName: null },
    });
    await expect(useCase.remove('admin-1', 'p-1')).resolves.toMatchObject({
      author: { email: 'ana@example.com', name: 'ana' },
    });

    vi.mocked(emailForProfile).mockResolvedValue(null as never);
    await expect(useCase.execute('admin-1', 'p-1')).resolves.toEqual({
      id: 'p-1',
    });
    expect(email.sendPostRemovedEmail).not.toHaveBeenCalled();
  });

  it('refuses a post that does not exist, and logs and deletes nothing', async () => {
    prisma.post.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('admin-1', 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(log.execute).not.toHaveBeenCalled();
    expect(prisma.post.delete).not.toHaveBeenCalled();
  });
});
