import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DiskHealthIndicator,
  HealthCheckService,
  MemoryHealthIndicator,
  MicroserviceHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import request from 'supertest';
import type { Mock } from 'vitest';
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
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let app: INestApplication;
  let mockCheck: Mock;

  beforeAll(async () => {
    mockCheck = vi.fn();
    app = await createControllerApp({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: { check: mockCheck } },
        { provide: PrismaHealthIndicator, useValue: { pingCheck: vi.fn() } },
        { provide: PrismaService, useValue: {} },
        { provide: DiskHealthIndicator, useValue: { checkStorage: vi.fn() } },
        {
          provide: MemoryHealthIndicator,
          useValue: { checkHeap: vi.fn(), checkRSS: vi.fn() },
        },
        {
          provide: MicroserviceHealthIndicator,
          useValue: { pingCheck: vi.fn() },
        },
        { provide: ConfigService, useValue: { get: vi.fn() } },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockCheck.mockReset();
    mockCheck.mockResolvedValue({ status: 'ok' });
  });

  it('returns the health payload and checks five indicators', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body).toEqual({ status: 'ok' });
    expect(mockCheck).toHaveBeenCalled();
    const callArgs = mockCheck.mock.calls[0][0] as unknown[];
    expect(Array.isArray(callArgs)).toBe(true);
    expect(callArgs.length).toBe(5);
  });

  it('runs liveness probe focusing strictly on process memory indicators', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/liveness')
      .expect(200);

    expect(res.body).toEqual({ status: 'ok' });
    expect(mockCheck).toHaveBeenCalled();
    const callArgs = mockCheck.mock.calls[0][0] as unknown[];
    expect(Array.isArray(callArgs)).toBe(true);
    expect(callArgs.length).toBe(2); // memory_heap, memory_rss
  });

  it('runs readiness probe focusing on external dependencies', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health/readiness')
      .expect(200);

    expect(res.body).toEqual({ status: 'ok' });
    expect(mockCheck).toHaveBeenCalled();
    const callArgs = mockCheck.mock.calls[0][0] as unknown[];
    expect(Array.isArray(callArgs)).toBe(true);
    expect(callArgs.length).toBe(3); // database, redis, storage
  });
});
