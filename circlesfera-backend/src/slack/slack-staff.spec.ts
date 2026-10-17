import type { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SlackStaff } from './slack-staff.js';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));

const config = (token: string | undefined) =>
  ({ get: () => token }) as unknown as ConfigService;

const identity = (
  status: string,
  roles: Array<{ name: string; permissions: string[] }>,
) => ({
  id: 'admin-1',
  status,
  roles: roles.map((r) => ({
    role: {
      name: r.name,
      permissions: r.permissions.map((key) => ({ permission: { key } })),
    },
  })),
});

describe('SlackStaff', () => {
  const prisma = { adminIdentity: { findUnique: vi.fn() } };
  let staff: SlackStaff;

  beforeEach(() => {
    vi.clearAllMocks();
    staff = new SlackStaff(prisma as never, config('xoxb-token'));
    vi.mocked(axios.get).mockResolvedValue({
      data: { ok: true, user: { profile: { email: 'Ana@CircleSfera.com ' } } },
    });
  });

  it('is the active staff identity with the email of the Slack account and the reports permission', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValue(
      identity('ACTIVE', [{ name: 'MODERATOR', permissions: ['reports'] }]),
    );

    await expect(staff.moderatorFor('U123')).resolves.toBe('admin-1');
    expect(axios.get).toHaveBeenCalledWith(
      'https://slack.com/api/users.info',
      expect.objectContaining({
        params: { user: 'U123' },
        headers: { Authorization: 'Bearer xoxb-token' },
      }),
    );
    expect(prisma.adminIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'ana@circlesfera.com' } }),
    );
  });

  it('a super admin holds every permission', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValue(
      identity('ACTIVE', [{ name: 'SUPER_ADMIN', permissions: [] }]),
    );

    await expect(staff.moderatorFor('U123')).resolves.toBe('admin-1');
  });

  it('is nobody without the reports permission, when not active, or with no staff identity', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(
      identity('ACTIVE', [{ name: 'SUPPORT', permissions: ['support'] }]),
    );
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(
      identity('SUSPENDED', [{ name: 'MODERATOR', permissions: ['reports'] }]),
    );
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(null);

    for (let i = 0; i < 3; i++) {
      await expect(staff.moderatorFor('U123')).resolves.toBeNull();
    }
  });

  it('is nobody when Slack does not give the email of the account', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { ok: false, error: 'missing_scope' },
    });
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('network'));

    await expect(staff.moderatorFor('U123')).resolves.toBeNull();
    await expect(staff.moderatorFor('U123')).resolves.toBeNull();
    expect(prisma.adminIdentity.findUnique).not.toHaveBeenCalled();
  });

  it('asks Slack nothing without a bot token or for an id that is not a Slack id', async () => {
    const tokenless = new SlackStaff(prisma as never, config(undefined));

    await expect(tokenless.moderatorFor('U123')).resolves.toBeNull();
    await expect(staff.moderatorFor('../../evil')).resolves.toBeNull();
    await expect(staff.moderatorFor(undefined)).resolves.toBeNull();
    expect(axios.get).not.toHaveBeenCalled();
  });
});
