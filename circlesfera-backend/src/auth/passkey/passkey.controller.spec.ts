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
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../../common/testing/http-controller.js';
import { AuthService } from '../auth.service.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { PasskeyController } from './passkey.controller.js';
import { PasskeyService } from './passkey.service.js';

const ABUSE_HEADERS = {
  'User-Agent': 'Vitest',
  'x-forwarded-for': '203.0.113.10',
  'cf-ipcountry': 'ES',
} as const;

const expectedAbuseMeta = {
  ip: '203.0.113.10',
  userAgent: 'Vitest',
  country: 'ES',
};

function cookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  return Array.isArray(raw) ? raw.join('\n') : String(raw);
}

describe('PasskeyController', () => {
  let app: INestApplication;

  const mockPasskey = {
    getUserPasskeys: vi.fn(),
    generateRegistrationOptions: vi.fn(),
    verifyRegistration: vi.fn(),
    generateAuthenticationOptions: vi.fn(),
    verifyAuthentication: vi.fn(),
    deletePasskey: vi.fn(),
  };

  const mockAuth = {
    loginById: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [PasskeyController],
      providers: [
        { provide: PasskeyService, useValue: mockPasskey },
        { provide: AuthService, useValue: mockAuth },
      ],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects listing passkeys without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/passkey').expect(401);
    expect(mockPasskey.getUserPasskeys).not.toHaveBeenCalled();
  });

  it('lists passkeys and registration options as the caller userId', async () => {
    mockPasskey.getUserPasskeys.mockResolvedValue([]);
    mockPasskey.generateRegistrationOptions.mockResolvedValue({
      challenge: 'c',
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/passkey')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/passkey/register-options')
      .set(BEARER)
      .expect(201);

    expect(mockPasskey.getUserPasskeys).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockPasskey.generateRegistrationOptions).toHaveBeenCalledWith(
      TEST_USER.userId,
    );
  });

  it('verifies registration as the caller userId and unwraps the body', async () => {
    const registrationResponse = { id: 'cred-1' };
    mockPasskey.verifyRegistration.mockResolvedValue({ verified: true });

    await request(app.getHttpServer())
      .post('/api/v1/auth/passkey/register-verify')
      .set(BEARER)
      .send({ registrationResponse })
      .expect(201);

    expect(mockPasskey.verifyRegistration).toHaveBeenCalledWith(
      TEST_USER.userId,
      registrationResponse,
    );
  });

  it('rejects login options with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/passkey/login-options')
      .send({ email: 'test@example.com', userId: 'attacker' })
      .expect(400);

    expect(mockPasskey.generateAuthenticationOptions).not.toHaveBeenCalled();
  });

  it('generates login options from the email body', async () => {
    mockPasskey.generateAuthenticationOptions.mockResolvedValue({
      challenge: 'c',
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/passkey/login-options')
      .send({ email: 'test@example.com' })
      .expect(201);

    expect(mockPasskey.generateAuthenticationOptions).toHaveBeenCalledWith(
      'test@example.com',
    );
  });

  it('verifies login, issues cookies via loginById, and returns success', async () => {
    mockPasskey.verifyAuthentication.mockResolvedValue({
      verified: true,
      userId: 'user-1',
    });
    mockAuth.loginById.mockResolvedValue({
      accessToken: 'access-test',
      refreshToken: 'refresh-test',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/passkey/login-verify')
      .set(ABUSE_HEADERS)
      .send({
        email: 'test@example.com',
        authenticationResponse: { id: 'cred-1' },
      })
      .expect(200);

    expect(res.body).toEqual({ message: 'Passkey login successful' });
    expect(cookieHeader(res)).toContain('access_token=access-test');
    expect(cookieHeader(res)).toContain('refresh_token=refresh-test');
    expect(mockPasskey.verifyAuthentication).toHaveBeenCalledWith(
      'test@example.com',
      { id: 'cred-1' },
    );
    expect(mockAuth.loginById).toHaveBeenCalledWith(
      'user-1',
      expectedAbuseMeta,
    );
  });

  it('rejects a failed passkey login without issuing cookies', async () => {
    mockPasskey.verifyAuthentication.mockResolvedValue({ verified: false });

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/passkey/login-verify')
      .set(ABUSE_HEADERS)
      .send({
        email: 'test@example.com',
        authenticationResponse: { id: 'cred-1' },
      })
      .expect(401);

    expect(mockAuth.loginById).not.toHaveBeenCalled();
    expect(cookieHeader(res)).not.toContain('access_token=');
  });

  it('deletes a passkey as the caller userId', async () => {
    mockPasskey.deletePasskey.mockResolvedValue({ ok: true });

    await request(app.getHttpServer())
      .delete('/api/v1/auth/passkey/pk-1')
      .set(BEARER)
      .expect(200);

    expect(mockPasskey.deletePasskey).toHaveBeenCalledWith(
      TEST_USER.userId,
      'pk-1',
    );
  });
});
