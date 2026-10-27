import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_JWT_AUDIENCE,
  type AdminJwtStrategy,
} from '../auth/strategies/admin-jwt.strategy.js';
import { MediaStaffViewerService } from './media-staff-viewer.service.js';

describe('MediaStaffViewerService', () => {
  const secret = 'staff-secret-for-tests-at-least-32-chars';
  const config = {
    get: (key: string) =>
      key === 'JWT_ADMIN_SECRET'
        ? secret
        : key === 'JWT_SECRET'
          ? 'platform-secret-for-tests-at-least-32'
          : undefined,
  } as unknown as ConfigService;
  const jwt = new JwtService({});
  const staffSessions = { validate: vi.fn() };
  const service = new MediaStaffViewerService(
    jwt,
    config,
    staffSessions as unknown as AdminJwtStrategy,
  );
  const token = (overrides: Record<string, unknown> = {}, key = secret) =>
    jwt.sign(
      {
        sub: 'admin-1',
        email: 'staff@example.com',
        jti: 'j-1',
        typ: 'access',
        mfa: true,
        ...overrides,
      },
      { secret: key, audience: ADMIN_JWT_AUDIENCE, expiresIn: 60 },
    );
  const request = (value?: string) =>
    ({ cookies: value ? { admin_access_token: value } : {} }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    staffSessions.validate.mockResolvedValue({
      permissions: ['content'],
      roles: [],
    });
  });

  it('recognises an active staff session that holds the content permission', async () => {
    await expect(service.isContentStaff(request(token()))).resolves.toBe(true);
    expect(staffSessions.validate).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'admin-1', aud: ADMIN_JWT_AUDIENCE }),
    );
  });

  it('is not staff without the content permission, a session, or a valid one', async () => {
    staffSessions.validate.mockResolvedValueOnce({
      permissions: ['users'],
      roles: [],
    });
    await expect(service.isContentStaff(request(token()))).resolves.toBe(false);

    await expect(service.isContentStaff(request())).resolves.toBe(false);
    await expect(
      service.isContentStaff({ cookies: undefined } as never),
    ).resolves.toBe(false);

    // Signed with another key: a person's session, say.
    await expect(
      service.isContentStaff(
        request(token({}, 'platform-secret-for-tests-at-least-32')),
      ),
    ).resolves.toBe(false);

    // A session the staff check refuses (no second factor, disabled).
    staffSessions.validate.mockRejectedValueOnce(new Error('disabled'));
    await expect(service.isContentStaff(request(token()))).resolves.toBe(false);
  });
});
