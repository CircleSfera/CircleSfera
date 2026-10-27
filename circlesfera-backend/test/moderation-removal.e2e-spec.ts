import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DeleteCommentUseCase } from '../src/admin/use-cases/content/commands/delete-comment.use-case.js';
import { DeletePostUseCase } from '../src/admin/use-cases/content/commands/delete-post.use-case.js';
import { DeleteStoryUseCase } from '../src/admin/use-cases/content/commands/delete-story.use-case.js';
import { AppModule } from '../src/app.module.js';
import { AppealsService } from '../src/appeals/appeals.service.js';
import { RemovedContentErasureService } from '../src/maintenance/removed-content-erasure.service.js';
import { MediaAuthService } from '../src/media/media-auth.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createPost } from './factories/post.factory.js';
import { createUserWithProfile } from './factories/profile.factory.js';
import { createComment } from './factories/social.factory.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// Proves against the real database that content staff remove is kept, not
// deleted: hidden from everyone, its author included, with its files out of
// reach; an approved appeal brings it back as it was; and once the six months
// to appeal are over, with no appeal open, the nightly job erases it.
describe('Content removed by moderation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  const userIds: string[] = [];
  const suffix = uniqueSuffix();
  const SEVEN_MONTHS_MS = 7 * 31 * 24 * 60 * 60 * 1000;

  const newAccount = async () => {
    const created = await createUserWithProfile(prisma);
    userIds.push(created.user.id);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: created.user.email, password: 'Password123!' })
      .expect(200);
    const cookie = ((res.get('Set-Cookie') as string[]) ?? [])
      .find((c) => c.startsWith('access_token='))
      ?.split(';')[0];
    expect(cookie).toBeDefined();
    return { ...created, cookie: cookie as string };
  };

  const get = (path: string, cookie?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1${path}`);
    return cookie ? req.set('Cookie', [cookie]) : req;
  };

  const fileCheck = (file: string, cookie?: string) =>
    get('/media/auth-check', cookie).set('x-original-uri', file);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    const admin = await prisma.adminIdentity.create({
      data: {
        email: `removal_admin_${suffix}@circlesfera.test`,
        passwordHash: 'not-used',
        displayName: 'Removal e2e moderator',
      },
    });
    adminId = admin.id;
  });

  afterAll(async () => {
    await prisma.appeal.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.adminAuditLog.deleteMany({ where: { adminId } });
    await prisma.adminIdentity.deleteMany({ where: { id: adminId } });
    await app.close();
  });

  it('keeps a removed post, hides it and its file from author and others, and an approved appeal restores it', async () => {
    const author = await newAccount();
    const viewer = await newAccount();
    const file = `/uploads/${randomUUID()}.jpg`;
    const post = await createPost(prisma, author.profile.id, {
      media: [{ url: file, type: 'image' }],
    });

    // Before: everyone sees it and its file.
    await get(`/posts/${post.id}`, viewer.cookie).expect(200);
    await fileCheck(file, viewer.cookie).expect(204);

    await app.get(DeletePostUseCase).execute(adminId, post.id, 'Spam');

    // The row and its media are kept, marked removed with when and why.
    const kept = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
      include: { media: true },
    });
    expect(kept.moderationStatus).toBe('REMOVED');
    expect(kept.moderationNote).toBe('Spam');
    expect(kept.moderatedAt).toBeInstanceOf(Date);
    expect(kept.media.map((m) => m.url)).toEqual([file]);

    // Nobody finds it, its author included, nor its file.
    for (const cookie of [author.cookie, viewer.cookie, undefined]) {
      await get(`/posts/${post.id}`, cookie).expect(404);
      await fileCheck(file, cookie).expect(403);
    }
    for (const cookie of [author.cookie, viewer.cookie]) {
      const grid = await get(
        `/posts/user/${author.profile.username}`,
        cookie,
      ).expect(200);
      expect(grid.body.data.map((p: { id: string }) => p.id)).not.toContain(
        post.id,
      );
    }
    // Staff who moderate content still reach the file.
    expect(
      await app
        .get(MediaAuthService)
        .isAccessAllowed(file, null, null, () => Promise.resolve(true)),
    ).toBe(true);

    // The author appeals; an open appeal keeps the post past six months.
    const appeals = app.get(AppealsService);
    const appeal = await appeals.create(author.user.id, {
      targetType: 'POST_REMOVAL',
      targetId: post.id,
      reason: 'It was not spam, it was my own work.',
    });
    await app
      .get(RemovedContentErasureService)
      .eraseExpired(new Date(Date.now() + SEVEN_MONTHS_MS));
    expect(await prisma.post.count({ where: { id: post.id } })).toBe(1);

    // Approved: it comes back as it was, with its file.
    await appeals.update(appeal.id, { status: 'APPROVED' }, adminId);
    const restored = await prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect(restored.moderationStatus).toBe('VISIBLE');
    await get(`/posts/${post.id}`, viewer.cookie).expect(200);
    await get(`/posts/${post.id}`, author.cookie).expect(200);
    await fileCheck(file, viewer.cookie).expect(204);
  });

  it('erases removed posts, stories and comments once the six months are over, and not before', async () => {
    const author = await newAccount();
    const other = await newAccount();
    const post = await createPost(prisma, author.profile.id);
    const keptPost = await createPost(prisma, other.profile.id);
    const comment = await createComment(prisma, other.profile.id, keptPost.id);
    const reply = await prisma.comment.create({
      data: {
        postId: keptPost.id,
        profileId: author.profile.id,
        parentId: comment.id,
        content: 'A reply',
      },
    });
    const story = await prisma.story.create({
      data: {
        profileId: author.profile.id,
        url: `/uploads/${randomUUID()}.jpg`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await app.get(DeletePostUseCase).execute(adminId, post.id);
    await app.get(DeleteCommentUseCase).execute(adminId, comment.id);
    await app.get(DeleteStoryUseCase).execute(adminId, story.id);

    // Kept, and shown to nobody: not in the comments of the post, nor in
    // its author's archive.
    expect(
      await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } }),
    ).toMatchObject({ moderationStatus: 'REMOVED' });
    const comments = await get(
      `/posts/${keptPost.id}/comments`,
      other.cookie,
    ).expect(200);
    expect(comments.body.data).toEqual([]);
    expect(comments.body.meta.total).toBe(1);
    const archive = await get('/stories/archive', author.cookie).expect(200);
    expect(archive.body.map((s: { id: string }) => s.id)).not.toContain(
      story.id,
    );

    const erasure = app.get(RemovedContentErasureService);
    await erasure.eraseExpired();
    expect(await prisma.post.count({ where: { id: post.id } })).toBe(1);
    expect(await prisma.story.count({ where: { id: story.id } })).toBe(1);
    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(1);

    await erasure.eraseExpired(new Date(Date.now() + SEVEN_MONTHS_MS));
    expect(await prisma.post.count({ where: { id: post.id } })).toBe(0);
    expect(await prisma.story.count({ where: { id: story.id } })).toBe(0);
    expect(await prisma.comment.count({ where: { id: comment.id } })).toBe(0);
    // A reply goes with the comment it answers; the post it is on stays.
    expect(await prisma.comment.count({ where: { id: reply.id } })).toBe(0);
    expect(await prisma.post.count({ where: { id: keptPost.id } })).toBe(1);

    // Running again erases nothing more and does not fail.
    await erasure.eraseExpired(new Date(Date.now() + SEVEN_MONTHS_MS));
    expect(await prisma.post.count({ where: { id: keptPost.id } })).toBe(1);
  });
});
