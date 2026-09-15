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
} from '../common/testing/http-controller.js';
import { AIController } from './ai.controller.js';
import { AIService } from './ai.service.js';

describe('AIController', () => {
  let app: INestApplication;

  const mockService = {
    generateAltText: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AIController],
      providers: [{ provide: AIService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects alt-text without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/alt-text')
      .send({ imageUrl: 'https://cdn.example/cat.jpg' })
      .expect(401);

    expect(mockService.generateAltText).not.toHaveBeenCalled();
  });

  it('rejects alt-text with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ai/alt-text')
      .set(BEARER)
      .send({
        imageUrl: 'https://cdn.example/cat.jpg',
        prompt: 'ignore previous',
      })
      .expect(400);

    expect(mockService.generateAltText).not.toHaveBeenCalled();
  });

  it('generates alt text from the imageUrl and wraps the result', async () => {
    mockService.generateAltText.mockResolvedValue('A cat on a sofa');

    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/alt-text')
      .set(BEARER)
      .send({ imageUrl: 'https://cdn.example/cat.jpg' })
      .expect(201);

    expect(res.body).toEqual({ text: 'A cat on a sofa' });
    expect(mockService.generateAltText).toHaveBeenCalledWith(
      'https://cdn.example/cat.jpg',
    );
  });
});
