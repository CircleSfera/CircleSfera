import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_JWT_AUDIENCE,
  AdminJwtStrategy,
} from '../auth/strategies/admin-jwt.strategy.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MediaStaffViewerService } from './media-staff-viewer.service.js';

// Real signed staff tokens, checked by the real staff session rule; only the
// staff identity is read from a fake database.
describe('MediaStaffViewerService', () => {
  const secret = 'staff-secret-for-tests-at-least-32-chars';
  const platformSecret = 'platform-secret-for-tests-at-least-32';
  const config = {
    get: (key: string) =>
      key === 'JWT_ADMIN_SECRET'
        ? secret
        : key === 'JWT_SECRET'
          ? platformSecret
          : undefined,
  } as unknown as ConfigService;
  const prisma = {
    adminIdentity: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const jwt = new JwtService({});
  const service = new MediaStaffViewerService(
    jwt,
    config,
    new AdminJwtStrategy(config, prisma as unknown as PrismaService),
  );
  const identity = (permissions: string[], overrides = {}) => ({
    id: 'admin-1',
    email: 'staff@example.com',
    displayName: 'Staff',
    status: 'ACTIVE',
    totpEnabled: true,
    roles: [
      {
        role: {
          name: 'MODERATOR',
          permissions: permissions.map((key) => ({ permission: { key } })),
        },
      },
    ],
    ...overrides,
  });
  const token = (claims: Record<string, unknown> = {}, key = secret) =>
    jwt.sign(
      {
        sub: 'admin-1',
        email: 'staff@example.com',
        jti: 'j-1',
        typ: 'access',
        mfa: true,
        ...claims,
      },
      { secret: key, audience: ADMIN_JWT_AUDIENCE, expiresIn: 60 },
    );
  const request = (value?: string) =>
    ({ cookies: value ? { admin_access_token: value } : {} }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.adminIdentity.findUnique.mockResolvedValue(identity(['content']));
  });

  it('recognises an active staff session, second factor done, that holds the content permission', async () => {
    await expect(service.isContentStaff(request(token()))).resolves.toBe(true);
    expect(prisma.adminIdentity.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin-1' } }),
    );
  });

  it('refuses a real staff session without the content permission', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValue(identity(['users']));
    await expect(service.isContentStaff(request(token()))).resolves.toBe(false);
  });

  it('refuses a real staff token signed before the second factor, and the sign-in step token', async () => {
    await expect(
      service.isContentStaff(request(token({ mfa: false }))),
    ).resolves.toBe(false);
    await expect(
      service.isContentStaff(request(token({ purpose: 'mfa' }))),
    ).resolves.toBe(false);
    await expect(
      service.isContentStaff(request(token({ typ: 'refresh' }))),
    ).resolves.toBe(false);
    expect(prisma.adminIdentity.findUnique).not.toHaveBeenCalled();
  });

  it('refuses a disabled identity, one without its second factor set up, and no session or another key', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(
      identity(['content'], { status: 'DISABLED' }),
    );
    await expect(service.isContentStaff(request(token()))).resolves.toBe(false);
    prisma.adminIdentity.findUnique.mockResolvedValueOnce(
      identity(['content'], { totpEnabled: false }),
    );
    await expect(service.isContentStaff(request(token()))).resolves.toBe(false);

    await expect(service.isContentStaff(request())).resolves.toBe(false);
    await expect(
      service.isContentStaff({ cookies: undefined } as never),
    ).resolves.toBe(false);
    // Signed with the platform's key: a person's session, say.
    await expect(
      service.isContentStaff(request(token({}, platformSecret))),
    ).resolves.toBe(false);
  });
});
