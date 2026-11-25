import { createServer, type Server, type Socket } from 'node:net';
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

  it('does not name the server framework in its headers', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const ok = await request(app.getHttpServer()).get('/api/v1/health');
    const notFound = await request(app.getHttpServer()).get('/health');

    expect(ok.headers['x-powered-by']).toBeUndefined();
    expect(notFound.headers['x-powered-by']).toBeUndefined();
  });
});

describe('GET /api/v1/health with a database that drops packets', () => {
  // A server that accepts the connection and never answers, as a database
  // behind a firewall that drops packets looks to pg.
  let blackHole: Server;
  const sockets = new Set<Socket>();
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    blackHole = createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    await new Promise<void>((resolve) =>
      blackHole.listen(0, '127.0.0.1', resolve),
    );
    const address = blackHole.address();
    if (address === null || typeof address === 'string') {
      throw new Error('the test server has no port');
    }
    // The real client, with a connection timeout short enough for a test.
    prisma = new PrismaService(
      `postgresql://nobody@127.0.0.1:${address.port}/none`,
      200,
    );
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => blackHole.close(() => resolve()));
  });

  it('answers 503 instead of waiting for ever', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', database: 'down' });
  }, 5_000);
});
