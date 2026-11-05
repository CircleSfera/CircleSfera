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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  BEARER,
  createControllerApp,
  TEST_USER,
} from '../common/testing/http-controller.js';
import { HiddenWordsController } from './hidden-words.controller.js';
import { HiddenWordsService } from './hidden-words.service.js';

describe('HiddenWordsController', () => {
  let app: INestApplication;
  const service = { list: vi.fn(), add: vi.fn(), remove: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HiddenWordsController],
      providers: [{ provide: HiddenWordsService, useValue: service }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => vi.clearAllMocks());

  it('lists, adds and removes the session Profile words', async () => {
    service.list.mockResolvedValue({ words: [], max: 500 });
    service.add.mockResolvedValue({ word: 'feo' });
    service.remove.mockResolvedValue({ success: true });

    await request(app.getHttpServer())
      .get('/api/v1/hidden-words')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/hidden-words')
      .set(BEARER)
      .send({ word: 'Feo' })
      .expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/hidden-words/feo')
      .set(BEARER)
      .expect(200);

    expect(service.list).toHaveBeenCalledWith(TEST_USER.profileId);
    expect(service.add).toHaveBeenCalledWith(TEST_USER.profileId, 'Feo');
    expect(service.remove).toHaveBeenCalledWith(TEST_USER.profileId, 'feo');
  });

  it('refuses an empty word before the service', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/hidden-words')
      .set(BEARER)
      .send({ word: '' })
      .expect(400);
    expect(service.add).not.toHaveBeenCalled();
  });

  it('refuses without a session', async () => {
    await request(app.getHttpServer()).get('/api/v1/hidden-words').expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });
});
