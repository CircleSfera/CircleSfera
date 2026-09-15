import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';

describe('Auth Abuse Controls (e2e)', () => {
  let app: INestApplication;
  let csrfToken: string;
  let csrfCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    // Initial CSRF
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    csrfCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should rate-limit /auth/request-reset', async () => {
    const makeRequest = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/request-reset')
        .set('Cookie', [csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ email: 'abuse_test@example.com' });

    let got429 = false;
    for (let i = 0; i < 150; i++) {
      const res = await makeRequest();
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  }, 15000);

  it('should rate-limit /auth/verify-email', async () => {
    const makeRequest = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/verify-email')
        .set('Cookie', [csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ token: 'fake_token' }); // fake token throws 400 normally

    let got429 = false;
    for (let i = 0; i < 150; i++) {
      const res = await makeRequest();
      if (res.status === 429) {
        got429 = true;
        break;
      }
    }
    expect(got429).toBe(true);
  }, 15000);
});
