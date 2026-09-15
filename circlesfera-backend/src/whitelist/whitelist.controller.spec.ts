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
import { WhitelistController } from './whitelist.controller.js';
import { WhitelistService } from './whitelist.service.js';

describe('WhitelistController', () => {
  let app: INestApplication;

  const mockService = {
    create: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [WhitelistController],
      providers: [{ provide: WhitelistService, useValue: mockService }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a signup body with a non-whitelisted field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/whitelist/signup')
      .send({
        email: 'invite@example.com',
        name: 'Ada',
        role: 'ADMIN',
      })
      .expect(400);

    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('forwards the signup body to the service', async () => {
    mockService.create.mockResolvedValue({ id: 'wl-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/whitelist/signup')
      .send({ email: 'invite@example.com', name: 'Ada' })
      .expect(201);

    expect(res.body).toEqual({ id: 'wl-1' });
    expect(mockService.create).toHaveBeenCalledWith({
      email: 'invite@example.com',
      name: 'Ada',
    });
  });
});
