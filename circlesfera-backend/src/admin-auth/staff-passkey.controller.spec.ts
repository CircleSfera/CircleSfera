import type { INestApplication } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
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
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  ADMIN_REFRESH_TOKEN_COOKIE,
} from '../common/config/cookie.config.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminAuthService } from './admin-auth.service.js';
import { StaffPasskeyController } from './staff-passkey.controller.js';
import { StaffPasskeyService } from './staff-passkey.service.js';

const PASSKEY_ID = '7c2b0b4e-1f0a-4b7e-9a51-3b8e2f6d9c10';

describe('StaffPasskeyController', () => {
  let app: INestApplication;
  const passkeys = {
    authenticationOptions: vi.fn(),
    authenticate: vi.fn(),
    list: vi.fn(),
    registrationOptions: vi.fn(),
    register: vi.fn(),
    remove: vi.fn(),
  };
  const auth = { signInWithPasskey: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [StaffPasskeyController],
      providers: [
        { provide: StaffPasskeyService, useValue: passkeys },
        { provide: AdminAuthService, useValue: auth },
      ],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: ThrottlerGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    TEST_ADMIN.stepUpVerified = false;
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Whether the staff session confirmed its authenticator code moments ago.
    TEST_ADMIN.stepUpVerified = false;
  });

  const http = () => request(app.getHttpServer());

  it('offers sign-in options to anyone', async () => {
    passkeys.authenticationOptions.mockResolvedValue({ challenge: 'c' });

    const res = await http()
      .post('/api/v1/admin-auth/passkeys/login/options')
      .expect(200);

    expect(res.body).toEqual({ challenge: 'c' });
  });

  it('signs in with a passkey, the tokens only in cookies', async () => {
    passkeys.authenticate.mockResolvedValue('admin-9');
    auth.signInWithPasskey.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
    });

    const res = await http()
      .post('/api/v1/admin-auth/passkeys/login')
      .set('User-Agent', 'Vitest')
      .send({ response: { id: 'cred-1', response: {} } })
      .expect(200);

    expect(res.body).toEqual({ status: 'SIGNED_IN' });
    const cookies = String(res.get('Set-Cookie'));
    expect(cookies).toContain(`${ADMIN_ACCESS_TOKEN_COOKIE}=acc`);
    expect(cookies).toContain(`${ADMIN_REFRESH_TOKEN_COOKIE}=ref`);
    expect(auth.signInWithPasskey).toHaveBeenCalledWith(
      'admin-9',
      expect.objectContaining({ userAgent: 'Vitest' }),
    );
  });

  it('refuses a sign-in without an answer, or with extra fields', async () => {
    await http().post('/api/v1/admin-auth/passkeys/login').send({}).expect(400);
    await http()
      .post('/api/v1/admin-auth/passkeys/login')
      .send({ response: {}, adminId: 'x' })
      .expect(400);
    expect(passkeys.authenticate).not.toHaveBeenCalled();
  });

  it('lists the passkeys of the identity signed in, and only with a staff session', async () => {
    passkeys.list.mockResolvedValue([]);
    await http().get('/api/v1/admin-auth/passkeys').expect(401);
    await http().get('/api/v1/admin-auth/passkeys').set(BEARER).expect(401);
    await http()
      .get('/api/v1/admin-auth/passkeys')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(passkeys.list).toHaveBeenCalledWith(TEST_ADMIN.adminId);
  });

  it('asks for the authenticator code before adding or removing a passkey', async () => {
    for (const [method, path] of [
      ['post', '/api/v1/admin-auth/passkeys/register/options'],
      ['post', '/api/v1/admin-auth/passkeys/register'],
      ['delete', `/api/v1/admin-auth/passkeys/${PASSKEY_ID}`],
    ] as const) {
      const res = await http()
        [method](path)
        .set(ADMIN_BEARER)
        .send({ response: {} })
        .expect(401);
      expect(res.body.code ?? res.body.message).toBe('ADMIN_STEP_UP_REQUIRED');
    }
    expect(passkeys.registrationOptions).not.toHaveBeenCalled();
    expect(passkeys.register).not.toHaveBeenCalled();
    expect(passkeys.remove).not.toHaveBeenCalled();
  });

  it('adds and removes a passkey once the code was given', async () => {
    TEST_ADMIN.stepUpVerified = true;
    passkeys.registrationOptions.mockResolvedValue({ challenge: 'r' });
    passkeys.register.mockResolvedValue({ id: PASSKEY_ID });

    await http()
      .post('/api/v1/admin-auth/passkeys/register/options')
      .set(ADMIN_BEARER)
      .expect(200);
    const added = await http()
      .post('/api/v1/admin-auth/passkeys/register')
      .set(ADMIN_BEARER)
      .send({ response: { id: 'cred' }, name: 'Phone' })
      .expect(200);
    await http()
      .delete(`/api/v1/admin-auth/passkeys/${PASSKEY_ID}`)
      .set(ADMIN_BEARER)
      .expect(200);

    expect(added.body).toEqual({ id: PASSKEY_ID });
    expect(passkeys.register).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      { id: 'cred' },
      'Phone',
      expect.any(Object),
    );
    expect(passkeys.remove).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      PASSKEY_ID,
      expect.any(Object),
    );
  });

  it('refuses a passkey id that is not one', async () => {
    TEST_ADMIN.stepUpVerified = true;
    await http()
      .delete('/api/v1/admin-auth/passkeys/not-an-id')
      .set(ADMIN_BEARER)
      .expect(400);
  });
});
