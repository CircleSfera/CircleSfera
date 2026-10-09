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
  TEST_UUID,
} from '../../common/testing/http-controller.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { SignInsController } from './sign-ins.controller.js';
import { SignInsService } from './sign-ins.service.js';

describe('SignInsController', () => {
  let app: INestApplication;
  const service = { list: vi.fn(), giveOwn: vi.fn(), share: vi.fn() };
  const base = '/api/v1/sign-ins';
  const own = {
    profileId: TEST_UUID,
    email: 'shop@example.com',
    password: 'New-Password-1',
    currentPassword: 'Current-Password-1',
  };
  const back = {
    profileId: TEST_UUID,
    signInId: TEST_UUID,
    currentPassword: 'Current-Password-1',
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [SignInsController],
      providers: [{ provide: SignInsService, useValue: service }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    service.list.mockResolvedValue([]);
    service.giveOwn.mockResolvedValue([]);
    service.share.mockResolvedValue([]);
  });

  it('needs a session for every route', async () => {
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).post(base).send(own).expect(401);
    await request(app.getHttpServer())
      .post(`${base}/share`)
      .send(back)
      .expect(401);
    expect(service.giveOwn).not.toHaveBeenCalled();
    expect(service.share).not.toHaveBeenCalled();
  });

  it('lists the sign-ins of the Profiles of who is signed in', async () => {
    await request(app.getHttpServer()).get(base).set(BEARER).expect(200);
    expect(service.list).toHaveBeenCalledWith(TEST_USER);
  });

  it('gives a Profile its own sign-in as who is signed in, with the proof apart', async () => {
    await request(app.getHttpServer())
      .post(base)
      .set(BEARER)
      .send(own)
      .expect(200);

    expect(service.giveOwn).toHaveBeenCalledWith(
      TEST_USER,
      {
        profileId: TEST_UUID,
        email: 'shop@example.com',
        password: 'New-Password-1',
      },
      { currentPassword: 'Current-Password-1', passkeyAssertion: undefined },
    );
  });

  it('takes a Profile back to a shared sign-in, accepting a passkey as proof', async () => {
    const passkeyAssertion = { id: 'cred-1', response: {} };
    await request(app.getHttpServer())
      .post(`${base}/share`)
      .set(BEARER)
      .send({ profileId: TEST_UUID, signInId: TEST_UUID, passkeyAssertion })
      .expect(200);

    expect(service.share).toHaveBeenCalledWith(
      TEST_USER,
      { profileId: TEST_UUID, signInId: TEST_UUID },
      { currentPassword: undefined, passkeyAssertion },
    );
  });

  it.each([
    ['an email that is not one', { ...own, email: 'not-an-email' }],
    ['a password under 8 characters', { ...own, password: 'short' }],
    ['a password over 128 characters', { ...own, password: 'x'.repeat(129) }],
    ['a Profile that is not an id', { ...own, profileId: 'me' }],
    ['the account it is for', { ...own, userId: 'someone-else' }],
    ['a verified date', { ...own, emailVerified: '2026-01-01' }],
  ])('refuses a new sign-in with %s', async (_case, body) => {
    await request(app.getHttpServer())
      .post(base)
      .set(BEARER)
      .send(body)
      .expect(400);
    expect(service.giveOwn).not.toHaveBeenCalled();
  });

  it.each([
    ['a sign-in that is not an id', { ...back, signInId: 'first' }],
    ['no Profile', { signInId: TEST_UUID, currentPassword: 'x' }],
    ['the account it is for', { ...back, userId: 'someone-else' }],
  ])('refuses going back to sharing with %s', async (_case, body) => {
    await request(app.getHttpServer())
      .post(`${base}/share`)
      .set(BEARER)
      .send(body)
      .expect(400);
    expect(service.share).not.toHaveBeenCalled();
  });
});
