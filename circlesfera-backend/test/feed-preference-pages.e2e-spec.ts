import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createPost, createUserWithProfile } from './factories/index.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// What a person hides or mutes in the feed can always be undone, so each
// list of the settings is read a page at a time and every entry can be
// reached: walking the pages gives each entry once, most recent first. A
// person's author is a Profile, and hiding it by the Profile's id works.
describe('Feed preference pages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let csrfToken: string;
  let profileId: string;
  const otherUserIds: string[] = [];
  const authorIds: string[] = [];
  const postIds: string[] = [];
  const keywords = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

  const id = uniqueSuffix();
  const account = {
    email: `feed_pages_${id}@example.com`,
    password: 'Password123!',
    username: `feed_pages_${id}`,
    dateOfBirth: '1990-01-15',
  };

  const send = (method: 'post' | 'get', path: string) =>
    request(app.getHttpServer())
      [method](`/api/v1/feed/preferences/${path}`)
      .set('Cookie', cookies)
      .set('x-csrf-token', csrfToken);

  // Every page in turn until the last, two at a time.
  const walk = async (list: string, key: string) => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await send(
        'get',
        `${list}?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      ).expect(200);
      seen.push(
        ...res.body.items.map((item: Record<string, string>) => item[key]),
      );
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    return { seen, pages };
  };

  // When each entry was added: the third and fourth at the same moment.
  const times = [
    '2026-10-18T12:00:00.000Z',
    '2026-10-18T11:00:00.000Z',
    '2026-10-18T10:00:00.000Z',
    '2026-10-18T10:00:00.000Z',
    '2026-10-18T09:00:00.000Z',
  ];

  // The expected order of a list: most recent first, then by id.
  const newestFirst = (rows: { id: string; createdAt: Date; key: string }[]) =>
    [...rows]
      .sort((a, b) =>
        a.createdAt.getTime() === b.createdAt.getTime()
          ? a.id < b.id
            ? 1
            : -1
          : b.createdAt.getTime() - a.createdAt.getTime(),
      )
      .map((r) => r.key);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email: account.email } });

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    const anonymousToken = csrfRes.body.csrfToken;
    const csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', anonymousToken)
      .send(account)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', anonymousToken)
      .send({ identifier: account.email, password: account.password })
      .expect(200);
    cookies = [
      csrfCookie,
      ...((login.get('Set-Cookie') as string[]) || []).map(
        (c) => c.split(';')[0],
      ),
    ];
    csrfToken = anonymousToken;
    const profile = await prisma.profile.findFirstOrThrow({
      where: { username: account.username },
      select: { id: true },
    });
    profileId = profile.id;

    // Five other people, each with one post.
    for (let i = 0; i < times.length; i += 1) {
      const other = await createUserWithProfile(prisma);
      otherUserIds.push(other.user.id);
      authorIds.push(other.profile.id);
      const post = await createPost(prisma, other.profile.id, {
        visibility: 'PUBLIC',
      });
      postIds.push(post.id);
    }
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { OR: [{ email: account.email }, { id: { in: otherUserIds } }] },
    });
    await app.close();
  });

  it('hides an author by the id of their Profile', async () => {
    for (const authorId of authorIds) {
      await send('post', `hide-author/${authorId}`).expect(201);
    }

    const hidden = await prisma.feedHiddenAuthor.count({
      where: { profileId },
    });
    expect(hidden).toBe(authorIds.length);
  });

  it('gives every hidden author, post and muted word once, most recent first', async () => {
    for (const postId of postIds) {
      await send('post', `hide-post/${postId}`).expect(201);
    }
    for (const keyword of keywords) {
      await send('post', 'mute-keyword').send({ keyword }).expect(201);
    }
    for (const [i, at] of times.entries()) {
      const when = new Date(at);
      await prisma.feedHiddenAuthor.updateMany({
        where: { profileId, authorId: authorIds[i] },
        data: { createdAt: when },
      });
      await prisma.feedHiddenPost.updateMany({
        where: { profileId, postId: postIds[i] },
        data: { createdAt: when },
      });
      await prisma.feedMutedKeyword.updateMany({
        where: { profileId, keyword: keywords[i] },
        data: { createdAt: when },
      });
    }

    const authors = await prisma.feedHiddenAuthor.findMany({
      where: { profileId },
    });
    const posts = await prisma.feedHiddenPost.findMany({
      where: { profileId },
    });
    const words = await prisma.feedMutedKeyword.findMany({
      where: { profileId },
    });

    const authorWalk = await walk('hidden-authors', 'authorId');
    expect(authorWalk.seen).toEqual(
      newestFirst(authors.map((a) => ({ ...a, key: a.authorId }))),
    );
    expect(authorWalk.pages).toBe(3);

    const postWalk = await walk('hidden-posts', 'postId');
    expect(postWalk.seen).toEqual(
      newestFirst(posts.map((p) => ({ ...p, key: p.postId }))),
    );
    expect(postWalk.pages).toBe(3);

    const wordWalk = await walk('muted-keywords', 'keyword');
    expect(wordWalk.seen).toEqual(
      newestFirst(words.map((w) => ({ ...w, key: w.keyword }))),
    );
    expect(wordWalk.pages).toBe(3);
  });

  it('says the last page is the last one', async () => {
    const res = await send('get', 'muted-keywords?limit=50').expect(200);

    expect(res.body.items).toHaveLength(keywords.length);
    expect(res.body.nextCursor).toBeNull();
  });
});
