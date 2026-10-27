import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { StoryArchiveErasureService } from '../src/archive/story-archive-erasure.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createPost } from './factories/post.factory.js';
import { createUserWithProfile } from './factories/profile.factory.js';
import { createComment } from './factories/social.factory.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// Proves against the real database that a post its author archives leaves
// their profile and every list, for everyone, them included, with its file
// out of others' reach; that it is listed in their archive only; and that
// "Show on profile" puts it back in its place with its likes and comments.
// Also that with "Save stories to archive" off, a story that ends is erased
// by the nightly job, unless it is in a highlight or ended before.
describe('Archive (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let csrfCookie: string;
  let csrfToken: string;
  const userIds: string[] = [];
  const DAY_MS = 24 * 60 * 60 * 1000;

  const newAccount = async () => {
    const created = await createUserWithProfile(prisma);
    userIds.push(created.user.id);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ identifier: created.user.email, password: 'Password123!' })
      .expect(200);
    const cookie = ((res.get('Set-Cookie') as string[]) ?? [])
      .find((c) => c.startsWith('access_token='))
      ?.split(';')[0];
    expect(cookie).toBeDefined();
    return { ...created, cookie: cookie as string };
  };

  const send = (
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    cookie?: string,
  ) =>
    request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('x-csrf-token', csrfToken)
      .set('Cookie', cookie ? [csrfCookie, cookie] : [csrfCookie]);
  const get = (path: string, cookie?: string) => send('get', path, cookie);
  const fileCheck = (file: string, cookie?: string) =>
    get('/media/auth-check', cookie).set('x-original-uri', file);
  const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

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
    csrfToken = csrfRes.body.csrfToken;
    csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) ?? [])
        .find((c) => c.startsWith('x-csrf-token='))
        ?.split(';')[0] ?? '';
  });

  afterAll(async () => {
    await prisma.storedFile.deleteMany({
      where: { profile: { userId: { in: userIds } } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('hides an archived post from everyone, lists it in the archive, and shows it again in its place with its likes and comments', async () => {
    const author = await newAccount();
    const viewer = await newAccount();
    const file = `/uploads/${randomUUID()}.jpg`;
    await prisma.storedFile.create({
      data: { key: file, profileId: author.profile.id },
    });
    const older = await createPost(prisma, author.profile.id);
    const post = await createPost(prisma, author.profile.id, {
      media: [{ url: file, type: 'image' }],
    });
    const newer = await createPost(prisma, author.profile.id);
    // Published in this order: older, post, newer.
    await prisma.post.update({
      where: { id: older.id },
      data: { createdAt: new Date(Date.now() - 3 * DAY_MS) },
    });
    await prisma.post.update({
      where: { id: post.id },
      data: { createdAt: new Date(Date.now() - 2 * DAY_MS) },
    });
    await createComment(prisma, viewer.profile.id, post.id);
    await prisma.like.create({
      data: { postId: post.id, profileId: viewer.profile.id },
    });
    const grid = async (cookie?: string) =>
      ids(
        (
          await get(`/posts/user/${author.profile.username}`, cookie).expect(
            200,
          )
        ).body.data,
      );
    expect(await grid(viewer.cookie)).toEqual([newer.id, post.id, older.id]);

    // Nobody else may archive it.
    await send('post', `/posts/${post.id}/archive`, viewer.cookie).expect(404);
    const archived = await send(
      'post',
      `/posts/${post.id}/archive`,
      author.cookie,
    ).expect(200);
    expect(archived.body).toMatchObject({ id: post.id });

    // Off the profile for everyone, the author included, and off its count.
    for (const cookie of [author.cookie, viewer.cookie, undefined]) {
      expect(await grid(cookie)).toEqual([newer.id, older.id]);
    }
    const profile = await get(
      `/profiles/${author.profile.username}`,
      viewer.cookie,
    ).expect(200);
    expect(profile.body._count.posts).toBe(2);
    // Not found by anyone else; its author opens it from the archive.
    await get(`/posts/${post.id}`, viewer.cookie).expect(404);
    await get(`/posts/${post.id}`).expect(404);
    await send('post', `/posts/${post.id}/likes/toggle`, viewer.cookie).expect(
      404,
    );
    const own = await get(`/posts/${post.id}`, author.cookie).expect(200);
    expect(own.body.archivedAt).toEqual(expect.any(String));
    // Its file is the author's only.
    await fileCheck(file, viewer.cookie).expect(403);
    await fileCheck(file).expect(403);
    await fileCheck(file, author.cookie).expect(204);

    // In the author's archive, with its likes and comments; nobody else's.
    const list = await get(
      '/users/me/archive/posts?type=POST',
      author.cookie,
    ).expect(200);
    expect(list.body).toEqual({
      items: [
        expect.objectContaining({
          kind: 'POST',
          id: post.id,
          url: file,
          likesCount: 1,
          commentsCount: 1,
        }),
      ],
      nextCursor: null,
    });
    const frames = await get(
      '/users/me/archive/posts?type=FRAME',
      author.cookie,
    ).expect(200);
    expect(frames.body.items).toEqual([]);
    const others = await get(
      '/users/me/archive/posts?type=POST',
      viewer.cookie,
    ).expect(200);
    expect(others.body.items).toEqual([]);
    await get('/users/me/archive/posts?type=STORY', author.cookie).expect(400);

    // Show on profile: back in its place, with its like and comment.
    await send('post', `/posts/${post.id}/unarchive`, viewer.cookie).expect(
      404,
    );
    await send('post', `/posts/${post.id}/unarchive`, author.cookie).expect(
      200,
    );
    expect(await grid(viewer.cookie)).toEqual([newer.id, post.id, older.id]);
    const back = await get(`/posts/${post.id}`, viewer.cookie).expect(200);
    expect(back.body._count).toMatchObject({ likes: 1, comments: 1 });
    await fileCheck(file, viewer.cookie).expect(204);
    const empty = await get(
      '/users/me/archive/posts?type=POST',
      author.cookie,
    ).expect(200);
    expect(empty.body.items).toEqual([]);

    // A deleted post cannot be archived.
    await send('delete', `/posts/${older.id}`, author.cookie).expect(204);
    await send('post', `/posts/${older.id}/archive`, author.cookie).expect(404);
  });

  it('with stories not saved, erases those that end from then on, but keeps the archive before and highlights', async () => {
    const author = await newAccount();
    const story = (expiresAt: Date) =>
      prisma.story.create({
        data: {
          profileId: author.profile.id,
          url: `/uploads/${randomUUID()}.jpg`,
          createdAt: new Date(expiresAt.getTime() - DAY_MS),
          expiresAt,
        },
      });
    // Ended while it was still on: stays in the archive.
    const before = await story(new Date(Date.now() - DAY_MS));

    const settings = await send(
      'put',
      '/users/me/settings',
      author.cookie,
    ).send({ saveStoriesToArchive: false });
    expect(settings.status).toBe(200);
    expect(settings.body.saveStoriesToArchive).toBe(false);

    // Running when it was turned off; they end after it.
    const live = await story(new Date(Date.now() + DAY_MS));
    const highlighted = await story(new Date(Date.now() + DAY_MS));
    await prisma.highlight.create({
      data: {
        profileId: author.profile.id,
        title: 'Kept',
        stories: { create: { storyId: highlighted.id } },
      },
    });

    const erasure = app.get(StoryArchiveErasureService);
    // Before they end, nothing is erased.
    await erasure.eraseUnkept();
    expect(
      await prisma.story.count({ where: { profileId: author.profile.id } }),
    ).toBe(3);

    // A night after their 24 hours end.
    await erasure.eraseUnkept(new Date(Date.now() + 2 * DAY_MS));
    expect(await prisma.story.count({ where: { id: live.id } })).toBe(0);
    expect(await prisma.story.count({ where: { id: highlighted.id } })).toBe(1);
    expect(await prisma.story.count({ where: { id: before.id } })).toBe(1);

    const archive = await get('/stories/archive', author.cookie).expect(200);
    expect(ids(archive.body).sort()).toEqual(
      [before.id, highlighted.id].sort(),
    );
    const read = await get('/users/me/settings', author.cookie).expect(200);
    expect(read.body.saveStoriesToArchive).toBe(false);
  });
});
