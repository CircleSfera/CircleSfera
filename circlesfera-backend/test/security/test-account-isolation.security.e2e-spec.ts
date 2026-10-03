import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createComment,
  createFollow,
  createLike,
  createPost,
  createUserWithProfile,
} from '../factories/index.js';
import { uniqueSuffix } from '../utils/unique-id.js';

// Test Accounts and real accounts are separate audiences. Real and
// anonymous viewers must never see a Test Account or its content, and a Test
// Account must never see real accounts. Every fixture of one audience carries
// a marker; a response to the other audience must not contain it anywhere.
describe('Test Account isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrf: string;
  let csrfCookie: string;

  const id = uniqueSuffix();
  const clean = id.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const testMarker = `tacct${clean}`;
  const realMarker = `racct${clean}`;
  const password = 'Password123!';

  let realCookie: string;
  let testCookie: string;
  let testUsername: string;
  let testProfileId: string;
  let testPostId: string;
  let testHighlightId: string;
  let testStreamId: string;
  let testPollId: string;
  let realUsername: string;
  let realPostId: string;
  const userIds: string[] = [];

  const register = async (email: string, username: string) => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({ email, password, username, dateOfBirth: '1990-01-01' })
      .expect(201);
    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
      include: { profiles: true },
    });
    userIds.push(user.id);
    return user;
  };

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrf)
      .send({ identifier: email, password })
      .expect(200);
    return [csrfCookie, ...((res.get('Set-Cookie') as string[]) || [])].join(
      '; ',
    );
  };

  const fetchBody = async (route: string, cookie?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1${route}`);
    if (cookie) req.set('Cookie', [cookie]).set('x-csrf-token', csrf);
    const res = await req;
    const body =
      res.text ||
      (typeof res.body === 'string' ? res.body : JSON.stringify(res.body));
    return { status: res.status, body };
  };

  const findExposures = async (
    routes: string[],
    marker: string,
    cookie?: string,
  ) => {
    const failures: string[] = [];
    for (const route of routes) {
      const { status, body } = await fetchBody(route, cookie);
      // Error bodies echo the request path, which contains the marker; only
      // successful responses can expose content.
      if (status >= 500) failures.push(`${route}: HTTP ${status}`);
      else if (status < 300 && body.toLowerCase().includes(marker)) {
        failures.push(`${route}: HTTP ${status} contains the marker`);
      }
    }
    return failures;
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

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrf = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';

    // Real side: a logged-in viewer and an author with public content.
    const viewer = await register(`rview_${id}@example.com`, `rview_${clean}`);
    realCookie = await login(`rview_${id}@example.com`);
    const realAuthor = await createUserWithProfile(prisma, {
      profile: { fullName: `Real Author ${realMarker}` },
    });
    userIds.push(realAuthor.user.id);
    realUsername = realAuthor.profile.username;
    const realPost = await createPost(prisma, realAuthor.profile.id, {
      caption: `${realMarker} real caption`,
      hashtags: [realMarker],
    });
    realPostId = realPost.id;
    await createFollow(prisma, viewer.profiles[0].id, realAuthor.profile.id);

    // Test side: a logged-in Test Account viewer and a Test Account author.
    const testViewer = await register(
      `tview_${id}@example.com`,
      `tview_${clean}`,
    );
    await prisma.user.update({
      where: { id: testViewer.id },
      data: { isTestAccount: true },
    });
    testCookie = await login(`tview_${id}@example.com`);

    const testAuthor = await createUserWithProfile(prisma, {
      user: { isTestAccount: true },
      profile: {
        // The username must not carry the marker: some pages echo the
        // requested path, which would match without exposing anything.
        username: `tuser${clean}`,
        fullName: `Test Author ${testMarker}`,
      },
    });
    userIds.push(testAuthor.user.id);
    testUsername = testAuthor.profile.username;
    testProfileId = testAuthor.profile.id;

    const testPost = await createPost(prisma, testProfileId, {
      caption: `${testMarker} test caption`,
      hashtags: [testMarker],
    });
    testPostId = testPost.id;
    await createFollow(prisma, testViewer.profiles[0].id, testProfileId);

    // Cross-audience leftovers (e.g. an account marked after it was used):
    // they must stay invisible to the other audience.
    await createComment(prisma, testProfileId, realPostId, `${testMarker} hi`);
    await createLike(prisma, testProfileId, realPostId);
    await createFollow(prisma, testProfileId, realAuthor.profile.id);

    const story = await prisma.story.create({
      data: {
        profileId: testProfileId,
        url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const highlight = await prisma.highlight.create({
      data: {
        profileId: testProfileId,
        title: `${testMarker} highlight`,
        stories: { create: [{ storyId: story.id }] },
      },
    });
    testHighlightId = highlight.id;
    const stream = await prisma.liveStream.create({
      data: {
        hostId: testProfileId,
        title: `${testMarker} live`,
        status: 'LIVE',
      },
    });
    testStreamId = stream.id;
    const poll = await prisma.poll.create({
      data: { postId: testPostId, question: `${testMarker}?`, options: ['a'] },
    });
    testPollId = poll.id;
  });

  afterAll(async () => {
    if (prisma && userIds.length) {
      await prisma.liveStream.deleteMany({
        where: { host: { userId: { in: userIds } } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  const routesExposingTestAccount = (): string[] => [
    `/search?q=${testMarker}`,
    `/search/posts?q=${testMarker}`,
    `/search/users?q=${testMarker}`,
    '/search/trending',
    `/search/ai?q=${testMarker}`,
    `/search/ai/profiles?q=${testMarker}`,
    `/profiles/search?q=${testMarker}`,
    `/profiles/${testUsername}`,
    '/posts',
    '/posts/frames',
    `/posts/user/${testUsername}`,
    `/posts/tags/${testMarker}`,
    `/posts/${testPostId}`,
    `/posts/${realPostId}/comments`,
    `/posts/${realPostId}/likes`,
    '/feed/foryou',
    '/feed/following',
    `/users/${realUsername}/follow/followers`,
    `/users/${testUsername}/follow/followers`,
    `/users/${testUsername}/follow/following`,
    '/stories',
    `/stories/user/${testUsername}`,
    `/highlights/profile/${testProfileId}`,
    `/highlights/user/${testProfileId}`,
    `/highlights/${testHighlightId}`,
    '/live/active',
    `/live/${testStreamId}`,
    `/interactive/poll/${testPollId}`,
  ];

  const publicSeoRoutes = (): string[] => [
    '/sitemap.xml',
    `/og?path=/p/${testPostId}`,
    `/og?path=/${testUsername}`,
    `/og-image/post/${testPostId}`,
    `/og-image/profile/${testUsername}`,
  ];

  it('hides Test Accounts from a real viewer', async () => {
    const failures = await findExposures(
      routesExposingTestAccount(),
      testMarker,
      realCookie,
    );
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('hides Test Accounts from anonymous viewers, including SEO pages', async () => {
    const failures = await findExposures(
      [...routesExposingTestAccount(), ...publicSeoRoutes()],
      testMarker,
    );
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('answers a real viewer looking up a Test Account as not found', async () => {
    expect(
      (await fetchBody(`/profiles/${testUsername}`, realCookie)).status,
    ).toBe(404);
    expect((await fetchBody(`/posts/${testPostId}`, realCookie)).status).toBe(
      404,
    );
  });

  it('hides real accounts from a Test Account viewer', async () => {
    const failures = await findExposures(
      [
        `/search?q=${realMarker}`,
        `/search/posts?q=${realMarker}`,
        `/search/users?q=${realMarker}`,
        `/profiles/search?q=${realMarker}`,
        `/profiles/${realUsername}`,
        `/posts/user/${realUsername}`,
        `/posts/tags/${realMarker}`,
        `/posts/${realPostId}`,
        '/posts',
        '/feed/foryou',
        '/search/trending',
      ],
      realMarker,
      testCookie,
    );
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('lets a Test Account viewer see other Test Accounts', async () => {
    const res = await fetchBody(`/profiles/${testUsername}`, testCookie);
    expect(res.status).toBe(200);
    expect(res.body).toContain(testMarker);
  });

  it('rejects interactions across audiences', async () => {
    const realFollowsTest = await request(app.getHttpServer())
      .post(`/api/v1/users/${testUsername}/follow/toggle`)
      .set('Cookie', [realCookie])
      .set('x-csrf-token', csrf);
    expect(realFollowsTest.status).toBe(404);

    const testFollowsReal = await request(app.getHttpServer())
      .post(`/api/v1/users/${realUsername}/follow/toggle`)
      .set('Cookie', [testCookie])
      .set('x-csrf-token', csrf);
    expect(testFollowsReal.status).toBe(404);
  });
});
