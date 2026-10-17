import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileAccessService } from './profile-access.service.js';
import { PROFILE_ACTIONS, type ProfileAction } from './profile-actions.js';

// The table of PD-014, row by row.
const EXPECTED: Record<
  ProfileAction,
  { owner: boolean; administrator: boolean; editor: boolean }
> = {
  'content.manage': { owner: true, administrator: true, editor: true },
  'comments.answer': { owner: true, administrator: true, editor: true },
  'analytics.read': { owner: true, administrator: true, editor: true },
  'profile.edit': { owner: true, administrator: true, editor: false },
  'promotions.create': { owner: true, administrator: false, editor: false },
  'billing.manage': { owner: true, administrator: false, editor: false },
  'team.manage': { owner: true, administrator: false, editor: false },
  'messages.read': { owner: true, administrator: false, editor: false },
  'profile.delete': { owner: true, administrator: false, editor: false },
};

describe('ProfileAccessService', () => {
  const findUnique = vi.fn();
  const prisma = { profile: { findUnique } };
  let access: ProfileAccessService;

  // The Profile p-1 belongs to u-owner; its active members are given.
  const profileWith = (members: { role: string }[]) =>
    findUnique.mockResolvedValue({ userId: 'u-owner', members });

  beforeEach(() => {
    findUnique.mockReset();
    access = new ProfileAccessService(prisma as never);
  });

  it('covers every action of the table, and nothing else', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...PROFILE_ACTIONS].sort());
  });

  it('the owner can do every action', async () => {
    profileWith([]);
    for (const action of PROFILE_ACTIONS) {
      expect(await access.can('u-owner', 'p-1', action), action).toBe(
        EXPECTED[action].owner,
      );
    }
  });

  it('an active administrator, what the role allows', async () => {
    profileWith([{ role: 'ADMINISTRATOR' }]);
    for (const action of PROFILE_ACTIONS) {
      expect(await access.can('u-admin', 'p-1', action), action).toBe(
        EXPECTED[action].administrator,
      );
    }
  });

  it('an active editor, what the role allows', async () => {
    profileWith([{ role: 'EDITOR' }]);
    for (const action of PROFILE_ACTIONS) {
      expect(await access.can('u-editor', 'p-1', action), action).toBe(
        EXPECTED[action].editor,
      );
    }
  });

  it('only an active membership counts', async () => {
    profileWith([]);
    await access.can('u-editor', 'p-1', 'content.manage');
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      select: {
        userId: true,
        members: {
          where: { userId: 'u-editor', status: 'ACTIVE' },
          select: { role: true },
          take: 1,
        },
      },
    });
  });

  it('anyone else, and a Profile that does not exist, can do nothing', async () => {
    profileWith([]);
    for (const action of PROFILE_ACTIONS) {
      expect(await access.can('u-stranger', 'p-1', action)).toBe(false);
    }
    findUnique.mockResolvedValue(null);
    expect(await access.can('u-owner', 'p-gone', 'content.manage')).toBe(false);
  });

  it('says how the person relates to the Profile', async () => {
    profileWith([]);
    expect(await access.relation('u-owner', 'p-1')).toEqual({ kind: 'owner' });
    profileWith([{ role: 'EDITOR' }]);
    expect(await access.relation('u-editor', 'p-1')).toEqual({
      kind: 'member',
      role: 'EDITOR',
    });
  });

  it('refuses with Forbidden when the action is not allowed', async () => {
    profileWith([{ role: 'EDITOR' }]);
    await expect(
      access.assertCan('u-editor', 'p-1', 'messages.read'),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      access.assertCan('u-editor', 'p-1', 'content.manage'),
    ).resolves.toBeUndefined();
  });
});
