import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { AppModule } from '../app.module.js';
import { configureApp } from '../app.setup.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('GET /api/v1/health', () => {
  let app: INestApplication;
  const prisma = { $queryRaw: vi.fn() };

  beforeAll(async () => {
    // The whole app as it starts, with the database replaced.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.$queryRaw.mockReset();
  });

  it('answers ok when the database answers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'up' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('answers 503 without the reason when the database does not', async () => {
    prisma.$queryRaw.mockRejectedValue(
      new Error('connect ECONNREFUSED db.internal:5432'),
    );

    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', database: 'down' });
    expect(JSON.stringify(response.body)).not.toContain('db.internal');
  });

  it('is only served under the API prefix', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(404);
  });
});
