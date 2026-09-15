import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { createControllerApp } from './common/testing/http-controller.js';

describe('AppController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: new AppService() }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns Hello World! at the API root', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1').expect(200);
    expect(res.text).toBe('Hello World!');
  });
});
