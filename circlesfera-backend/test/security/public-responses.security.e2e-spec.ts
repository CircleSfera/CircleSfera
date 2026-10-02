import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  createBlock,
  createComment,
  createFollow,
  createLike,
  createPost,
  createUserWithProfile,
} from '../factories/index.js';
import { uniqueSuffix } from '../utils/unique-id.js';

// Account-level columns that must never appear in a response describing
// another profile. Keys are matched at any depth.
const FORBIDDEN_KEYS = [
  'password',
  'twoFactorSecret',
  'resetToken',
  'resetTokenExpires',
  'verificationToken',
  'currentChallenge',
  'signupIp',
  'lastIp',
  'signupIpHash',
  'lastIpHash',
  'stripeCustomerId',
  'stripeConnectAccountId',
  'stripeIdentitySessionId',
  'dateOfBirth',
  'rootBanReason',
  'isRootBanned',
  'email',
];

function collectLeaks(
  value: unknown,
  sentinels: string[],
  path = '$',
): string[] {
  const leaks: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      leaks.push(...collectLeaks(item, sentinels, `${path}[${i}]`));
    });
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.includes(key) && child !== null) {
        leaks.push(`${path}.${key}`);
      }
      leaks.push(...collectLeaks(child, sentinels, `${path}.${key}`));
    }
  } else if (typeof value === 'string') {
    for (const s of sentinels) {
      if (value.includes(s)) leaks.push(`${path} contains ${s}`);
    }
  }
  return leaks;
}

describe('Public responses never carry account-level User columns (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookie: string;
  let csrf: string;

  const id = uniqueSuffix();
  const viewer = {
    email: `viewer_${id}@example.com`,
    password: 'Password123!',
    username: `viewer_${id}`,
    dateOfBirth: '1990-01-01',
  };
  const authorEmail = `author_${id}@example.com`;
  const sentinels = {
    resetToken: `sentinel-reset-${id}`,
    twoFactorSecret: `sentinel-2fa-${id}`,
    signupIp: `203.0.113.${(id.length % 200) + 1}`,
    stripeCustomerId: `cus_sentinel_${id}`,
    stripeConnectAccountId: `acct_sentinel_${id}`,
  };
  const marker = `probe${id.replace(/[^a-z0-9]/gi, '').toLowerCase()}`;

  let authorUsername: string;
  let postId: string;
  const userIds: string[] = [];

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
    const csrfCookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    cookie = csrfCookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [cookie])
      .set('x-csrf-token', csrf)
      .send(viewer)
      .expect(201);
    const viewerUser = await prisma.user.update({
      where: { email: viewer.email },
      data: { emailVerified: new Date() },
      include: { profiles: true },
    });
    userIds.push(viewerUser.id);
    const viewerProfile = viewerUser.profiles[0];

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [cookie])
      .set('x-csrf-token', csrf)
      .send({ identifier: viewer.email, password: viewer.password })
      .expect(200);
    cookie = [cookie, ...((login.get('Set-Cookie') as string[]) || [])].join(
      '; ',
    );

    const author = await createUserWithProfile(prisma, {
      user: { email: authorEmail },
      profile: { fullName: `Probe Author ${marker}` },
    });
    userIds.push(author.user.id);
    authorUsername = author.profile.username;
    await prisma.user.update({
      where: { id: author.user.id },
      data: {
        resetToken: sentinels.resetToken,
        twoFactorSecret: sentinels.twoFactorSecret,
        signupIp: sentinels.signupIp,
        lastIp: sentinels.signupIp,
        stripeCustomerId: sentinels.stripeCustomerId,
        stripeConnectAccountId: sentinels.stripeConnectAccountId,
      },
    });

    const post = await createPost(prisma, author.profile.id, {
      caption: `${marker} public caption`,
      hashtags: [marker],
    });
    postId = post.id;
    await createLike(prisma, author.profile.id, post.id);
    await createComment(prisma, author.profile.id, post.id, `${marker} hi`);
    await createFollow(prisma, author.profile.id, viewerProfile.id);
    await createFollow(prisma, viewerProfile.id, author.profile.id);

    const other = await createUserWithProfile(prisma, {
      user: { email: `blocked_${id}@example.com` },
    });
    userIds.push(other.user.id);
    await createBlock(prisma, viewerProfile.id, other.profile.id);

    await prisma.bookmark.create({
      data: { profileId: viewerProfile.id, postId: post.id },
    });
    await prisma.notification.create({
      data: {
        recipientId: viewerProfile.id,
        senderId: author.profile.id,
        type: 'LIKE',
        content: 'liked your post',
        postId: post.id,
      },
    });
    await prisma.story.create({
      data: {
        profileId: author.profile.id,
        url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  });

  afterAll(async () => {
    if (prisma && userIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (app) await app.close();
  });

  const authenticatedRoutes = (): string[] => [
    `/search?q=${marker}`,
    `/search/posts?q=${marker}`,
    '/search/trending',
    `/search/users?q=${marker}`,
    '/search/history',
    `/profiles/search?q=${marker}`,
    `/profiles/${authorUsername}`,
    '/posts',
    '/posts/frames',
    `/posts/user/${authorUsername}`,
    `/posts/tags/${marker}`,
    `/posts/${postId}`,
    '/feed/foryou',
    '/feed/following',
    `/posts/${postId}/likes`,
    `/posts/${postId}/comments`,
    '/bookmarks',
    `/users/${authorUsername}/follow/followers`,
    `/users/${authorUsername}/follow/following`,
    '/users/me/follow/blocked',
    '/users/me/follow/muted',
    '/users/me/follow/pending',
    '/notifications',
    '/stories',
    `/stories/user/${authorUsername}`,
  ];

  it('does not leak account-level columns on any read route', async () => {
    const sentinelValues = [authorEmail, ...Object.values(sentinels)];
    const failures: string[] = [];
    const statuses: Record<string, number> = {};

    for (const route of authenticatedRoutes()) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1${route}`)
        .set('Cookie', [cookie])
        .set('x-csrf-token', csrf);
      statuses[route] = res.status;
      if (res.status >= 500) {
        failures.push(`${route}: HTTP ${res.status}`);
        continue;
      }
      const leaks = collectLeaks(res.body, sentinelValues);
      if (leaks.length) {
        failures.push(`${route}: ${[...new Set(leaks)].join(', ')}`);
      }
    }

    expect(failures, JSON.stringify({ failures, statuses }, null, 2)).toEqual(
      [],
    );
  });

  it('does not leak account-level columns to anonymous callers', async () => {
    const sentinelValues = [authorEmail, ...Object.values(sentinels)];
    const failures: string[] = [];
    const reachable: string[] = [];

    for (const route of authenticatedRoutes()) {
      const res = await request(app.getHttpServer()).get(`/api/v1${route}`);
      if (res.status >= 500) {
        failures.push(`${route}: HTTP ${res.status}`);
        continue;
      }
      if (res.status === 200) reachable.push(route);
      const leaks = collectLeaks(res.body, sentinelValues);
      if (leaks.length) {
        failures.push(`${route}: ${[...new Set(leaks)].join(', ')}`);
      }
    }

    expect(failures, JSON.stringify({ failures, reachable }, null, 2)).toEqual(
      [],
    );
  });

  it('does not leak account-level columns on public SEO routes', async () => {
    const sentinelValues = [authorEmail, ...Object.values(sentinels)];
    const routes = [
      `/api/v1/og-image/post/${postId}`,
      `/api/v1/og-image/profile/${authorUsername}`,
      `/api/v1/og?path=/p/${postId}`,
      '/api/v1/sitemap.xml',
    ];
    for (const route of routes) {
      const res = await request(app.getHttpServer()).get(route);
      const body = res.text ?? '';
      for (const s of sentinelValues) {
        expect(body.includes(s), `${route} contains ${s}`).toBe(false);
      }
    }
  });
});
