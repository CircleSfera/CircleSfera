import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';

describe('Export Security (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('should block unauthenticated access to GDPR export', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/gdpr/export')
      .expect(401); // Unauthorized
  });

  it('should block unauthenticated access to GDPR export history', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/gdpr/exports')
      .expect(401);
  });
});
