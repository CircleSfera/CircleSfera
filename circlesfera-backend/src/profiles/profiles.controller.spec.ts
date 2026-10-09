import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthService } from '../auth/auth.service.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from '../common/config/cookie.config.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

describe('ProfilesController', () => {
  let app: INestApplication;

  const mockService = {
    searchProfiles: vi.fn(),
    getMyReferrals: vi.fn(),
    getMyProfile: vi.fn(),
    getMyProfiles: vi.fn(),
    createProfile: vi.fn(),
    switchProfile: vi.fn(),
    checkUsernameAvailability: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    deactivateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  };

  const mockAuthService = {
    generateTokens: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ProfilesController],
      providers: [
        { provide: ProfilesService, useValue: mockService },
        { provide: AuthService, useValue: mockAuthService },
      ],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: EmailVerifiedGuard, mode: 'allow' },
        { guard: JwtOptionalGuard, mode: 'optional' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects own profile without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/profiles/me').expect(401);
    expect(mockService.getMyProfile).not.toHaveBeenCalled();
  });

  it('searches profiles without a caller profile', async () => {
    mockService.searchProfiles.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/profiles/search')
      .query({ q: 'alice' })
      .expect(200);

    expect(mockService.searchProfiles).toHaveBeenCalledWith('alice', undefined);
  });

  it('passes the caller profile id when an authenticated viewer searches profiles', async () => {
    mockService.searchProfiles.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/profiles/search')
      .query({ q: 'alice' })
      .set(BEARER)
      .expect(200);

    expect(mockService.searchProfiles).toHaveBeenCalledWith(
      'alice',
      TEST_USER.profileId,
    );
  });

  it('loads referrals by the caller account and own profile by the caller profile', async () => {
    mockService.getMyReferrals.mockResolvedValue([]);
    mockService.getMyProfile.mockResolvedValue({ id: 'profile-1' });

    await request(app.getHttpServer())
      .get('/api/v1/profiles/me/referrals')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/profiles/me')
      .set(BEARER)
      .expect(200);

    expect(mockService.getMyReferrals).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getMyProfile).toHaveBeenCalledWith(TEST_USER.profileId);
  });

  it('loads all profiles for the authenticated user', async () => {
    mockService.getMyProfiles.mockResolvedValue([
      { id: 'profile-1', username: 'alice' },
      { id: 'profile-2', username: 'alice_work' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/profiles/my-profiles')
      .set(BEARER)
      .expect(200);

    expect(mockService.getMyProfiles).toHaveBeenCalledWith(TEST_USER.userId);
    expect(res.body).toHaveLength(2);
  });

  it('creates an additional profile under the authenticated user', async () => {
    const dto = { username: 'new_persona', fullName: 'New Persona' };
    mockService.createProfile.mockResolvedValue({
      id: 'profile-3',
      username: 'new_persona',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/profiles')
      .set(BEARER)
      .send(dto)
      .expect(201);

    expect(mockService.createProfile).toHaveBeenCalledWith(
      TEST_USER.userId,
      dto,
    );
    expect(res.body.id).toBe('profile-3');
  });

  it('switches the active profile and reissues auth cookies', async () => {
    mockService.switchProfile.mockResolvedValue({
      id: 'profile-2',
      username: 'alice_work',
    });
    mockAuthService.generateTokens.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/profiles/switch/profile-2')
      .set(BEARER)
      .set('User-Agent', 'test-agent')
      .expect(201);

    expect(mockService.switchProfile).toHaveBeenCalledWith(
      TEST_USER.userId,
      'profile-2',
    );
    expect(mockAuthService.generateTokens).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_USER.email,
      'test-agent',
      // The session now records the client address (req.ip is populated by
      // the HTTP adapter even without proxy headers).
      expect.stringMatching(/127\.0\.0\.1$/),
      undefined,
      'profile-2',
      // The session keeps the sign-in that opened it.
      TEST_USER.signInId,
    );
    const rawCookies = res.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies)
      ? rawCookies
      : typeof rawCookies === 'string'
        ? [rawCookies]
        : [];
    expect(cookies.some((c) => c.includes(ACCESS_TOKEN_COOKIE))).toBe(true);
    expect(cookies.some((c) => c.includes(REFRESH_TOKEN_COOKIE))).toBe(true);
    expect(res.body.message).toBe('Profile switched successfully');
    expect(res.body.profile.id).toBe('profile-2');
  });

  it('checks username availability and loads a public profile by username', async () => {
    mockService.checkUsernameAvailability.mockResolvedValue({
      available: true,
    });
    mockService.getProfile.mockResolvedValue({ username: 'alice' });

    await request(app.getHttpServer())
      .get('/api/v1/profiles/check-username/alice')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/profiles/alice')
      .expect(200);

    expect(mockService.checkUsernameAvailability).toHaveBeenCalledWith('alice');
    expect(mockService.getProfile).toHaveBeenCalledWith('alice', undefined);
  });

  it('passes the caller profile id when an authenticated viewer loads a public profile', async () => {
    mockService.getProfile.mockResolvedValue({ username: 'alice' });

    await request(app.getHttpServer())
      .get('/api/v1/profiles/alice')
      .set(BEARER)
      .expect(200);

    expect(mockService.getProfile).toHaveBeenCalledWith(
      'alice',
      TEST_USER.profileId,
    );
  });

  it('rejects profile update with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .put('/api/v1/profiles/me')
      .set(BEARER)
      .send({ bio: 'Hello', isPremium: true })
      .expect(400);

    expect(mockService.updateProfile).not.toHaveBeenCalled();
  });

  it('updates the caller profile', async () => {
    const dto = { bio: 'Hello' };
    mockService.updateProfile.mockResolvedValue({ id: 'profile-1' });

    await request(app.getHttpServer())
      .put('/api/v1/profiles/me')
      .set(BEARER)
      .send(dto)
      .expect(200);

    expect(mockService.updateProfile).toHaveBeenCalledWith(
      TEST_USER.profileId,
      dto,
    );
  });

  it('deactivates and deletes as the caller user and profile', async () => {
    mockService.deactivateAccount.mockResolvedValue({ ok: true });
    mockService.deleteAccount.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .post('/api/v1/profiles/me/deactivate')
      .set(BEARER)
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/profiles/me')
      .set(BEARER)
      .expect(200);

    // Both act on the owning User; the profile id is only for cache keys.
    expect(mockService.deactivateAccount).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_USER.profileId,
    );
    expect(mockService.deleteAccount).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_USER.profileId,
    );
  });
});
