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
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
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
    checkUsernameAvailability: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    deactivateAccount: vi.fn(),
    deleteAccount: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [ProfilesController],
      providers: [{ provide: ProfilesService, useValue: mockService }],
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

    expect(mockService.searchProfiles).toHaveBeenCalledWith('alice');
  });

  it('loads referrals and own profile as the caller profile', async () => {
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

    expect(mockService.getMyReferrals).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
    expect(mockService.getMyProfile).toHaveBeenCalledWith(TEST_USER.profileId);
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

  it('deactivates and deletes as the caller profile', async () => {
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

    expect(mockService.deactivateAccount).toHaveBeenCalledWith(
      TEST_USER.profileId,
    );
    expect(mockService.deleteAccount).toHaveBeenCalledWith(TEST_USER.profileId);
  });
});
