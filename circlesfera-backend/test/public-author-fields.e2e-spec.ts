import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createPost, createUserWithProfile } from './factories/index.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

// Whoever wrote a post comes with it, to anyone who may read the post. What
// comes of them never tells who the person or the sign-in behind the
// Profile is, nor how it was sanctioned or how it is set up.
describe('Public author fields (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let username: string;
  let postId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);

    const author = await createUserWithProfile(prisma);
    userId = author.user.id;
    username = author.profile.username;
    await prisma.profile.update({
      where: { id: author.profile.id },
      data: { accountBanReason: 'What staff wrote', pushMessages: false },
    });
    postId = (
      await createPost(prisma, author.profile.id, { visibility: 'PUBLIC' })
    ).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('a post and the posts of a Profile, read without a session, carry its author without the person behind it', async () => {
    const answers = await Promise.all([
      request(app.getHttpServer()).get(`/api/v1/posts/${postId}`).expect(200),
      request(app.getHttpServer())
        .get(`/api/v1/posts/user/${username}`)
        .expect(200),
    ]);

    const [one, list] = answers.map((a) => a.body);
    const listed = (list.data ?? list.items ?? list).find(
      (p: { id: string }) => p.id === postId,
    );
    for (const post of [one, listed]) {
      expect(post.profile.username).toBe(username);
      for (const hidden of [
        'userId',
        'signInId',
        'user',
        'accountBanReason',
        'pushMessages',
        'isAccountBanned',
      ]) {
        expect(post.profile).not.toHaveProperty(hidden);
      }
    }
    for (const { text } of answers) {
      expect(text).not.toContain(userId);
      expect(text).not.toContain('What staff wrote');
    }
  });
});
