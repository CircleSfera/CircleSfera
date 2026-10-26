import { describe, expect, it, vi } from 'vitest';
import { AdminUsersService } from './admin-users.service.js';

// Staff deleting an account goes through the account erasure, never a direct
// delete of the row: the erasure handles the account's files, its Stripe
// subscriptions, its events and the admins of its groups.
describe('AdminUsersService: deleting an account', () => {
  it('erases it through the account erasure, logs the action and never deletes the row itself', async () => {
    const at = new Date('2026-10-26T19:00:00.000Z');
    const prisma = {
      user: { delete: vi.fn() },
      adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const usersService = { eraseNow: vi.fn().mockResolvedValue(at) };
    const service = new AdminUsersService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      usersService as never,
      {} as never,
      {} as never,
    );
    const logAction = vi
      .spyOn(service, 'logAction')
      .mockResolvedValue(undefined as never);

    await expect(service.deleteUser('admin-1', 'user-1')).resolves.toEqual({
      success: true,
      scheduledDeletionAt: at,
    });

    expect(usersService.eraseNow).toHaveBeenCalledWith('user-1');
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(logAction).toHaveBeenCalledWith(
      'admin-1',
      expect.anything(),
      'user',
      'user-1',
      'Full account deletion',
    );
  });
});
