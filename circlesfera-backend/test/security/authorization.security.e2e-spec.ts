import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { uniqueSuffix } from '../utils/unique-id.js';

describe('Authorization Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let userACookie: string;
  let userACsrf: string;
  let postAId: string;

  let userBCookie: string;
  let userBCsrf: string;

  const uniqueId = uniqueSuffix();

  const userA = {
    email: `authz_a_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `authz_a_${uniqueId}`,
    dateOfBirth: '1990-01-01',
  };

  const userB = {
    email: `authz_b_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `authz_b_${uniqueId}`,
    dateOfBirth: '1990-01-01',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    // Register User A
    let csrfRes = await request(app.getHttpServer()).get('/api/v1/csrf-token');
    userACsrf = csrfRes.body.csrfToken;
    let cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    userACookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .send(userA)
      .expect(201);

    // Verify email & login A
    await prisma.user.update({
      where: { email: userA.email },
      data: { emailVerified: new Date() },
    });
    const loginARes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .send({ identifier: userA.email, password: userA.password })
      .expect(200);
    const authCookiesA = (loginARes.get('Set-Cookie') as string[]) || [];
    userACookie = [userACookie, ...authCookiesA].join('; ');

    await prisma.user.findUnique({ where: { email: userA.email } });

    // Register User B
    csrfRes = await request(app.getHttpServer()).get('/api/v1/csrf-token');
    userBCsrf = csrfRes.body.csrfToken;
    cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    userBCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .send(userB)
      .expect(201);

    // Verify email & login B
    await prisma.user.update({
      where: { email: userB.email },
      data: { emailVerified: new Date() },
    });
    const loginBRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .send({ identifier: userB.email, password: userB.password })
      .expect(200);
    const authCookiesB = (loginBRes.get('Set-Cookie') as string[]) || [];
    userBCookie = [userBCookie, ...authCookiesB].join('; ');

    // User A creates a post
    const postRes = await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .send({ caption: 'Post by A' })
      .expect(201);
    postAId = postRes.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should block IDOR: User B cannot edit User A post', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/posts/${postAId}`)
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .send({ caption: 'Malicious edit by B' })
      .expect(403);
  });

  it('should block IDOR: User B cannot delete User A post', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/posts/${postAId}`)
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .expect(403);
  });

  it('should block standard user from accessing admin endpoints', async () => {
    // We try to access an admin endpoint with a standard user token
    await request(app.getHttpServer())
      .get('/api/v1/admin/users') // assuming this endpoint exists
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .expect(401); // 401 because AdminJwtAuthGuard looks for admin token
  });

  it('should block standard user from accessing admin content deletion', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/posts/${postAId}/admin`)
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .expect(401);
  });

  it('should block IDOR: User B cannot delete User A comment', async () => {
    // User A posts a comment
    const commentRes = await request(app.getHttpServer())
      .post(`/api/v1/posts/${postAId}/comments`)
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .send({ content: 'Comment by User A' })
      .expect(201);
    const commentId = commentRes.body.id;

    // User B tries to delete User A comment
    await request(app.getHttpServer())
      .delete(`/api/v1/posts/${postAId}/comments/${commentId}`)
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .expect(403);

    // User A can delete their own comment
    await request(app.getHttpServer())
      .delete(`/api/v1/posts/${postAId}/comments/${commentId}`)
      .set('Cookie', [userACookie])
      .set('x-csrf-token', userACsrf)
      .expect(204);
  });

  it('should support scheduled account deletion with grace period and login restoration', async () => {
    // User B schedules deletion
    const scheduleRes = await request(app.getHttpServer())
      .delete('/api/v1/users/me')
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .expect(200);

    expect(scheduleRes.body.success).toBe(true);
    expect(scheduleRes.body.scheduled_deletion_at).toBeDefined();

    let userBRecord = await prisma.user.findUnique({
      where: { email: userB.email },
    });
    expect(userBRecord?.isActive).toBe(false);
    expect(userBRecord?.scheduledDeletionAt).toBeDefined();

    // Authenticated requests with old cookie are now rejected because account is deactivated
    await request(app.getHttpServer())
      .get('/api/v1/profiles/me')
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .expect(401);

    // Logging in during grace period auto-restores the account
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .send({ identifier: userB.email, password: userB.password })
      .expect(200);

    const newCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    userBCookie = [userBCookie.split(';')[0], ...newCookies].join('; ');

    userBRecord = await prisma.user.findUnique({
      where: { email: userB.email },
    });
    expect(userBRecord?.isActive).toBe(true);
    expect(userBRecord?.scheduledDeletionAt).toBeNull();
    expect(userBRecord?.deletedAt).toBeNull();

    // User B can now perform authenticated requests again
    await request(app.getHttpServer())
      .get('/api/v1/profiles/me')
      .set('Cookie', [userBCookie])
      .set('x-csrf-token', userBCsrf)
      .expect(200);
  });
});
