import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { CryptoService } from '../src/common/services/crypto.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createUserWithProfile } from './factories/index.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// A conversation opens on its latest messages, not its first ones, and the
// ones before are read a page at a time from the oldest shown.
describe('Conversation messages, latest first (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let profileId: string;
  let otherUserId: string;
  let conversationId: string;
  // Oldest first.
  const sent: { id: string; createdAt: Date }[] = [];

  const id = uniqueSuffix();
  const account = {
    email: `conv_msgs_${id}@example.com`,
    password: 'Password123!',
    username: `conv_msgs_${id}`,
    dateOfBirth: '1990-01-15',
  };

  const messages = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}/messages${query}`)
      .set('Cookie', cookies)
      .expect(200);

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
    const csrfToken = csrfRes.body.csrfToken;
    const csrfCookie =
      ((csrfRes.get('Set-Cookie') as string[]) || []).find((c) =>
        c.startsWith('x-csrf-token='),
      ) || '';
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(account)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({ identifier: account.email, password: account.password })
      .expect(200);
    cookies = [
      csrfCookie,
      ...((login.get('Set-Cookie') as string[]) || []).map(
        (c) => c.split(';')[0],
      ),
    ];
    const profile = await prisma.profile.findFirstOrThrow({
      where: { username: account.username },
      select: { id: true },
    });
    profileId = profile.id;

    const other = await createUserWithProfile(prisma);
    otherUserId = other.user.id;
    const conv = await prisma.conversation.create({
      data: {
        participants: {
          create: [{ profileId }, { profileId: other.profile.id }],
        },
      },
      select: { id: true },
    });
    conversationId = conv.id;
    // 55 messages, a minute apart; the last two at the same moment. Stored
    // encrypted, as the app stores them.
    const crypto = app.get(CryptoService);
    for (let i = 0; i < 55; i++) {
      const createdAt = new Date(Date.UTC(2026, 9, 18, 8, Math.min(i, 53)));
      const m = await prisma.message.create({
        data: {
          conversationId,
          senderId: other.profile.id,
          content: crypto.encrypt(`message ${i}`),
          createdAt,
        },
        select: { id: true, createdAt: true },
      });
      sent.push(m);
    }
    sent.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : 1),
    );
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({ where: { id: conversationId } });
    await prisma.user.deleteMany({
      where: { OR: [{ email: account.email }, { id: otherUserId }] },
    });
    await app.close();
  });

  it('opens on the latest 50, oldest first', async () => {
    const res = await messages();

    expect(res.body.map((m: { id: string }) => m.id)).toEqual(
      sent.slice(5).map((m) => m.id),
    );
  });

  it('reads the ones before the oldest shown, and nothing before the first', async () => {
    const oldest = sent[5];
    const res = await messages(
      `?before=${oldest.createdAt.toISOString()}&beforeId=${oldest.id}`,
    );

    expect(res.body.map((m: { id: string }) => m.id)).toEqual(
      sent.slice(0, 5).map((m) => m.id),
    );

    const first = sent[0];
    const none = await messages(
      `?before=${first.createdAt.toISOString()}&beforeId=${first.id}`,
    );
    expect(none.body).toEqual([]);
  });
});
