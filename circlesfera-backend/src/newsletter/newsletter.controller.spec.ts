import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createControllerApp } from '../common/testing/http-controller.js';
import { NewsletterUnsubscribe } from '../email/newsletter-unsubscribe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NewsletterController } from './newsletter.controller.js';

describe('NewsletterController', () => {
  let app: INestApplication;
  const tokens = {
    verify: vi.fn((token: unknown) =>
      token === 'good-token' ? 'user-1' : null,
    ),
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    userSettings: { upsert: vi.fn() },
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [NewsletterController],
      providers: [
        { provide: NewsletterUnsubscribe, useValue: tokens },
        { provide: PrismaService, useValue: prisma },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    prisma.userSettings.upsert.mockResolvedValue({});
  });

  const switchedOff = () =>
    expect(prisma.userSettings.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      update: { newsletter: false },
      create: { userId: 'user-1', newsletter: false },
    });

  it('the page of the link unsubscribes with the token in the body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/newsletter/unsubscribe')
      .send({ token: 'good-token' })
      .expect(204);

    switchedOff();
  });

  it("a mail client's one-click unsubscribe posts the form body, token in the query", async () => {
    await request(app.getHttpServer())
      .post('/api/v1/newsletter/unsubscribe?token=good-token')
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(204);

    switchedOff();
  });

  it('refuses a token that is not genuine and changes nothing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/newsletter/unsubscribe')
      .send({ token: 'forged' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/newsletter/unsubscribe')
      .expect(400);

    expect(prisma.userSettings.upsert).not.toHaveBeenCalled();
  });

  it('an account deleted since the newsletter was sent has nothing to switch', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post('/api/v1/newsletter/unsubscribe')
      .send({ token: 'good-token' })
      .expect(204);

    expect(prisma.userSettings.upsert).not.toHaveBeenCalled();
  });
});
