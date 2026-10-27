import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { RecentlyDeletedErasureService } from '../src/recently-deleted/recently-deleted-erasure.service.js';
import { createPost } from './factories/post.factory.js';
import { createUserWithProfile } from './factories/profile.factory.js';
import { createComment } from './factories/social.factory.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// Proves against the real database that a post or story its author deletes
// is kept 30 days in their Recently deleted instead of being removed: hidden
// at once from everyone, and from the author's own views, with its file out
// of others' reach; restored as it was, with its comments and likes; deleted
// for good at once on request; and erased by the nightly job after 30 days.
describe('Recently deleted (e2e)', () => {
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
    method: 'get' | 'post' | 'delete',
    path: string,
    cookie?: string,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api/v1${path}`)
      .set('x-csrf-token', csrfToken);
    return req.set('Cookie', cookie ? [csrfCookie, cookie] : [csrfCookie]);
  };
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

  it('hides a deleted post from everyone, restores it with its comments and likes, then deletes it for good', async () => {
    const author = await newAccount();
    const viewer = await newAccount();
    const file = `/uploads/${randomUUID()}.jpg`;
    await prisma.storedFile.create({
      data: { key: file, profileId: author.profile.id },
    });
    const post = await createPost(prisma, author.profile.id, {
      media: [{ url: file, type: 'image' }],
    });
    const comment = await createComment(prisma, viewer.profile.id, post.id);
    await prisma.like.create({
      data: { postId: post.id, profileId: viewer.profile.id },
    });

    // Before: everyone sees it and its file.
    await get(`/posts/${post.id}`, viewer.cookie).expect(200);
    await fileCheck(file, viewer.cookie).expect(204);

    await send('delete', `/posts/${post.id}`, author.cookie).expect(204);

    // Kept with its comment and like, its file detached.
    const kept = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { _count: { select: { comments: true, likes: true } } },
    });
    expect(kept.deletedAt).toBeInstanceOf(Date);
    expect(kept._count).toEqual({ comments: 1, likes: 1 });
    expect(
      (await prisma.storedFile.findUniqueOrThrow({ where: { key: file } }))
        .detachedAt,
    ).toBeInstanceOf(Date);

    // Nobody finds it outside Recently deleted, its author included.
    for (const cookie of [author.cookie, viewer.cookie, undefined]) {
      await get(`/posts/${post.id}`, cookie).expect(404);
      await get(`/posts/${post.id}/comments`, cookie).expect(404);
      const grid = await get(
        `/posts/user/${author.profile.username}`,
        cookie,
      ).expect(200);
      expect(ids(grid.body.data)).not.toContain(post.id);
    }
    // Liking, commenting or deleting it again is refused as missing.
    await send('post', `/posts/${post.id}/likes/toggle`, viewer.cookie).expect(
      404,
    );
    await send('post', `/posts/${post.id}/comments`, viewer.cookie)
      .send({ content: 'Hello?' })
      .expect(404);
    await send('delete', `/posts/${post.id}`, author.cookie).expect(404);
    // The profile counts no deleted post.
    const profile = await get(
      `/profiles/${author.profile.username}`,
      viewer.cookie,
    ).expect(200);
    expect(profile.body._count.posts).toBe(0);

    // Its file is the author's only.
    await fileCheck(file, viewer.cookie).expect(403);
    await fileCheck(file).expect(403);
    await fileCheck(file, author.cookie).expect(204);

    // The author finds it in Recently deleted, with its days left; nobody
    // else may act on it.
    const list = await get('/users/me/recently-deleted', author.cookie).expect(
      200,
    );
    expect(list.body.items).toEqual([
      expect.objectContaining({
        kind: 'POST',
        id: post.id,
        daysLeft: 30,
        url: file,
        mediaCount: 1,
      }),
    ]);
    const othersList = await get(
      '/users/me/recently-deleted',
      viewer.cookie,
    ).expect(200);
    expect(othersList.body.items).toEqual([]);
    await send('post', `/posts/${post.id}/restore`, viewer.cookie).expect(404);
    await send('delete', `/posts/${post.id}/permanent`, viewer.cookie).expect(
      404,
    );

    // Restored: back as it was, with its comment and like, its file open.
    const restored = await send(
      'post',
      `/posts/${post.id}/restore`,
      author.cookie,
    ).expect(200);
    expect(restored.body).toEqual({ id: post.id, kind: 'POST' });
    const shown = await get(`/posts/${post.id}`, viewer.cookie).expect(200);
    expect(shown.body._count).toMatchObject({ likes: 1, comments: 1 });
    const comments = await get(
      `/posts/${post.id}/comments`,
      viewer.cookie,
    ).expect(200);
    expect(ids(comments.body.data)).toEqual([comment.id]);
    await fileCheck(file, viewer.cookie).expect(204);
    expect(
      (await prisma.storedFile.findUniqueOrThrow({ where: { key: file } }))
        .detachedAt,
    ).toBeNull();
    // Restoring it again finds nothing to restore.
    await send('post', `/posts/${post.id}/restore`, author.cookie).expect(404);

    // Deleted again, then for good: gone at once, rows and file record.
    await send('delete', `/posts/${post.id}`, author.cookie).expect(204);
    await send('delete', `/posts/${post.id}/permanent`, author.cookie).expect(
      204,
    );
    expect(await prisma.post.count({ where: { id: post.id } })).toBe(0);
    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(0);
    expect(await prisma.storedFile.count({ where: { key: file } })).toBe(0);
    const after = await get('/users/me/recently-deleted', author.cookie).expect(
      200,
    );
    expect(after.body.items).toEqual([]);
  });

  it('takes a deleted story out of the tray and the archive, and a restored one whose day is over back to the archive only', async () => {
    const author = await newAccount();
    const live = await prisma.story.create({
      data: {
        profileId: author.profile.id,
        url: `/uploads/${randomUUID()}.jpg`,
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
    const ended = await prisma.story.create({
      data: {
        profileId: author.profile.id,
        url: `/uploads/${randomUUID()}.jpg`,
        createdAt: new Date(Date.now() - 2 * DAY_MS),
        expiresAt: new Date(Date.now() - DAY_MS),
      },
    });

    for (const story of [live, ended]) {
      await send('delete', `/stories/${story.id}`, author.cookie).expect(200);
    }
    const tray = await get(
      `/stories/user/${author.profile.username}`,
      author.cookie,
    ).expect(200);
    expect(ids(tray.body)).not.toContain(live.id);
    const archive = await get('/stories/archive', author.cookie).expect(200);
    expect(ids(archive.body)).not.toContain(live.id);
    expect(ids(archive.body)).not.toContain(ended.id);
    const list = await get('/users/me/recently-deleted', author.cookie).expect(
      200,
    );
    expect(
      list.body.items.map((item: { kind: string; id: string }) => [
        item.kind,
        item.id,
      ]),
    ).toEqual([
      ['STORY', ended.id],
      ['STORY', live.id],
    ]);

    const back = await send(
      'post',
      `/stories/${live.id}/restore`,
      author.cookie,
    ).expect(200);
    expect(back.body).toEqual({ id: live.id, archived: false });
    const toArchive = await send(
      'post',
      `/stories/${ended.id}/restore`,
      author.cookie,
    ).expect(200);
    expect(toArchive.body).toEqual({ id: ended.id, archived: true });

    const trayAfter = await get(
      `/stories/user/${author.profile.username}`,
      author.cookie,
    ).expect(200);
    expect(ids(trayAfter.body)).toContain(live.id);
    expect(ids(trayAfter.body)).not.toContain(ended.id);
    const archiveAfter = await get('/stories/archive', author.cookie).expect(
      200,
    );
    expect(ids(archiveAfter.body)).toEqual(
      expect.arrayContaining([live.id, ended.id]),
    );
  });

  it('erases what was deleted more than 30 days ago each night, and nothing deleted since', async () => {
    const author = await newAccount();
    const file = `/uploads/${randomUUID()}.jpg`;
    await prisma.storedFile.create({
      data: { key: file, profileId: author.profile.id },
    });
    const old = await createPost(prisma, author.profile.id, {
      media: [{ url: file, type: 'image' }],
    });
    const recent = await createPost(prisma, author.profile.id);
    const oldStory = await prisma.story.create({
      data: {
        profileId: author.profile.id,
        url: `/uploads/${randomUUID()}.jpg`,
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
    await send('delete', `/posts/${old.id}`, author.cookie).expect(204);
    await send('delete', `/posts/${recent.id}`, author.cookie).expect(204);
    await send('delete', `/stories/${oldStory.id}`, author.cookie).expect(200);
    const longAgo = new Date(Date.now() - 31 * DAY_MS);
    await prisma.post.update({
      where: { id: old.id },
      data: { deletedAt: longAgo },
    });
    await prisma.story.update({
      where: { id: oldStory.id },
      data: { deletedAt: longAgo },
    });

    // Past its 30 days it can no longer be restored, and is not listed.
    await send('post', `/posts/${old.id}/restore`, author.cookie).expect(404);
    const list = await get('/users/me/recently-deleted', author.cookie).expect(
      200,
    );
    expect(ids(list.body.items)).toEqual([recent.id]);

    const erasure = app.get(RecentlyDeletedErasureService);
    await erasure.eraseExpired();
    expect(await prisma.post.count({ where: { id: old.id } })).toBe(0);
    expect(await prisma.story.count({ where: { id: oldStory.id } })).toBe(0);
    expect(await prisma.storedFile.count({ where: { key: file } })).toBe(0);
    expect(await prisma.post.count({ where: { id: recent.id } })).toBe(1);

    // Running again erases nothing more and does not fail.
    await erasure.eraseExpired();
    expect(await prisma.post.count({ where: { id: recent.id } })).toBe(1);
  });
});
