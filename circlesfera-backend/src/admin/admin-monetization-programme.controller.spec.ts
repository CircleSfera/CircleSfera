import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { STAFF_PERMISSIONS_KEY } from '../auth/guards/admin.guard.js';
import { AdminMonetizationProgrammeController } from './admin-monetization-programme.controller.js';

describe('AdminMonetizationProgrammeController', () => {
  const programme = {
    list: vi.fn().mockResolvedValue({ items: [] }),
    decide: vi.fn().mockResolvedValue({ success: true }),
  };
  const controller = new AdminMonetizationProgrammeController(
    programme as never,
  );
  const admin = { adminId: 'admin-1' } as never;

  it('lists applications by status and page', async () => {
    await controller.list({ status: 'APPROVED', page: 2 });
    expect(programme.list).toHaveBeenCalledWith('APPROVED', 2);
  });

  it('approves, refuses and revokes as the staff member signed in', async () => {
    await controller.approve('p1', admin);
    await controller.reject('p1', { note: 'Not enough activity' }, admin);
    await controller.revoke('p1', { note: 'Adult content' }, admin);
    expect(programme.decide.mock.calls).toEqual([
      ['admin-1', 'p1', 'approve'],
      ['admin-1', 'p1', 'reject', 'Not enough activity'],
      ['admin-1', 'p1', 'revoke', 'Adult content'],
    ]);
  });

  it('asks the payments permission for every route', () => {
    const reflector = new Reflector();
    for (const handler of ['list', 'approve', 'reject', 'revoke'] as const) {
      expect(
        reflector.get(
          STAFF_PERMISSIONS_KEY,
          AdminMonetizationProgrammeController.prototype[handler],
        ),
      ).toEqual(['payments']);
    }
  });
});
