import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createUserWithProfile } from './factories/index.js';
import { uniqueSuffix } from './utils/unique-id.js';

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// The conversation list is read a page at a time, so every conversation can
// be reached however many there are: walking the pages gives each
// conversation once, most recently active first, the folders apart.
describe('Conversation list pages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cookies: string[];
  let profileId: string;
  const otherUserIds: string[] = [];
  // Inbox, most recently active first.
  const inbox: string[] = [];
  let requestId: string;

  const id = uniqueSuffix();
  const account = {
    email: `conv_pages_${id}@example.com`,
    password: 'Password123!',
    username: `conv_pages_${id}`,
    dateOfBirth: '1990-01-15',
  };

  const page = (query: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/page?${query}`)
      .set('Cookie', cookies)
      .expect(200);

  // Every page in turn until the last, two at a time.
  const walk = async (folder: 'inbox' | 'requests') => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await page(
        `folder=${folder}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      seen.push(...res.body.items.map((c: { id: string }) => c.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    return { seen, pages };
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

    // Five conversations in the inbox, two of them last active at the same
    // moment, and one message request.
    const times = [
      '2026-10-18T12:00:00.000Z',
      '2026-10-18T11:00:00.000Z',
      '2026-10-18T10:00:00.000Z',
      '2026-10-18T10:00:00.000Z',
      '2026-10-18T09:00:00.000Z',
      '2026-10-18T13:00:00.000Z',
    ];
    const made: { id: string; at: string; isRequest: boolean }[] = [];
    for (const [i, at] of times.entries()) {
      const other = await createUserWithProfile(prisma);
      otherUserIds.push(other.user.id);
      const isRequest = i === times.length - 1;
      const conv = await prisma.conversation.create({
        data: {
          participants: {
            create: [
              { profileId, hasAccepted: !isRequest },
              { profileId: other.profile.id },
            ],
          },
        },
        select: { id: true },
      });
      await prisma.$executeRaw`UPDATE conversations SET "updatedAt" = ${new Date(at)} WHERE id = ${conv.id}`;
      made.push({ id: conv.id, at, isRequest });
    }
    requestId = made.find((c) => c.isRequest)?.id as string;
    inbox.push(
      ...made
        .filter((c) => !c.isRequest)
        .sort((a, b) =>
          a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1,
        )
        .map((c) => c.id),
    );
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({
      where: { participants: { some: { profileId } } },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ email: account.email }, { id: { in: otherUserIds } }] },
    });
    await app.close();
  });

  it('gives every conversation once, most recently active first, two to a page', async () => {
    const { seen, pages } = await walk('inbox');

    expect(seen).toEqual(inbox);
    expect(pages).toBe(3);
  });

  it('keeps message requests in their own folder', async () => {
    const { seen } = await walk('requests');

    expect(seen).toEqual([requestId]);
  });

  it('says the last page is the last one', async () => {
    const res = await page('folder=inbox&limit=50');

    expect(res.body.items).toHaveLength(inbox.length);
    expect(res.body.nextCursor).toBeNull();
  });
});
