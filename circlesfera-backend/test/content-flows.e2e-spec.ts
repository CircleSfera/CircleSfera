import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

describe('Content Flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let csrfToken: string;
  let csrfCookie: string;

  const uniqueId = Date.now();
  const creator = {
    email: `creator_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `creator_${uniqueId}`,
  };

  const mentionedUser = {
    email: `mentioned_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `mentioned_${uniqueId}`,
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

    // Pre-test cleanup (in case previous runs failed)
    await prisma.user.deleteMany({
      where: { email: { contains: uniqueId.toString() } },
    });
    await prisma.hashtag.deleteMany({ where: { tag: 'testflow' } });

    // Initial CSRF
    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    csrfCookie =
      (csrfRes.get('Set-Cookie') as string[]).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';

    // Register users via API
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ ...creator, fullName: 'Creator' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ ...mentionedUser, fullName: 'Mentioned' })
      .expect(201);

    // Manually verify them in DB
    await prisma.user.updateMany({
      where: { email: { in: [creator.email, mentionedUser.email] } },
      data: { emailVerified: new Date() },
    });

    // Login creator
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ identifier: creator.email, password: creator.password })
      .expect(200);

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    accessToken =
      authCookies
        .find((c) => c.startsWith('access_token='))
        ?.split(';')[0]
        .split('=')[1] || '';

    // 3. Get fresh CSRF token AFTER login
    const freshCsrfRes = await request(app.getHttpServer())
      .get('/api/v1/csrf-token')
      .set('Cookie', authCookies)
      .expect(200);
    csrfToken = freshCsrfRes.body.csrfToken;
    csrfCookie =
      (freshCsrfRes.get('Set-Cookie') as string[])
        .find((c) => c.startsWith('x-csrf-token='))
        ?.split(';')[0] || '';
  });

  afterAll(async () => {
    // Cascading deletes will handle notifications and other relations
    await prisma.user.deleteMany({
      where: { email: { in: [creator.email, mentionedUser.email] } },
    });
    // Hashtags don't cascade from user, so delete separately if needed
    await prisma.hashtag.deleteMany({
      where: { tag: 'testflow' },
    });
    await app.close();
  });

  it('Flow: Post with Mentions and Hashtags', async () => {
    const postData = {
      caption: `Testing flow #testflow @${mentionedUser.username}`,
      media: [{ url: 'https://test.com/img.jpg', type: 'image' }],
    };

    await request(app.getHttpServer())
      .post('/api/v1/posts')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(postData)
      .expect(201);

    // 1. Verify Hashtag creation
    const hashtag = await prisma.hashtag.findUnique({
      where: { tag: 'testflow' },
    });
    expect(hashtag).toBeDefined();

    // 2. Verify Mention notification
    const notification = await prisma.notification.findFirst({
      where: {
        recipient: { profile: { username: mentionedUser.username } },
        type: 'MENTION',
      },
    });
    expect(notification).toBeDefined();
    expect(notification?.senderId).toBeDefined();
  });

  it('Flow: Story and Highlights', async () => {
    // 1. Create Story
    const storyRes = await request(app.getHttpServer())
      .post('/api/v1/stories')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        url: 'https://test.com/story.jpg',
        mediaType: 'image',
      })
      .expect(201);

    const storyId = storyRes.body.id;

    // 2. Archive the story (manually expire it in DB)
    await prisma.story.update({
      where: { id: storyId },
      data: { expiresAt: new Date(Date.now() - 1000) }, // Expired 1s ago
    });

    // 3. Verify it's in archive
    const archiveRes = await request(app.getHttpServer())
      .get('/api/v1/stories/archive')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .expect(200);

    expect(archiveRes.body.some((s: any) => s.id === storyId)).toBe(true);

    // 4. Create Highlight from archived story
    await request(app.getHttpServer())
      .post('/api/v1/highlights')
      .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        title: 'My Highlights',
        coverUrl: 'https://test.com/cover.jpg',
        storyIds: [storyId],
      })
      .expect(201);
  });
});
