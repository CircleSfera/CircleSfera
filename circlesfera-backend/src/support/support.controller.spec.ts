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
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';

describe('SupportController', () => {
  let app: INestApplication;

  const mockService = {
    createTicket: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [SupportController],
      providers: [{ provide: SupportService, useValue: mockService }],
      guards: [{ guard: JwtAuthGuard, mode: 'session' }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects ticket create without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .send({ subject: 'Help', message: 'Cannot login' })
      .expect(401);

    expect(mockService.createTicket).not.toHaveBeenCalled();
  });

  it('rejects ticket create with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set(BEARER)
      .send({
        subject: 'Help',
        message: 'Cannot login',
        priority: 'high',
      })
      .expect(400);

    expect(mockService.createTicket).not.toHaveBeenCalled();
  });

  it('creates a ticket with the caller userId and email', async () => {
    const dto = { subject: 'Help', message: 'Cannot login' };
    mockService.createTicket.mockResolvedValue({ id: 'ticket-1' });

    const res = await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set(BEARER)
      .send(dto)
      .expect(201);

    expect(res.body).toEqual({ id: 'ticket-1' });
    expect(mockService.createTicket).toHaveBeenCalledWith({
      ...dto,
      email: TEST_USER.email,
      userId: TEST_USER.userId,
    });
  });

  it('overwrites client-supplied email and userId with the caller identity', async () => {
    mockService.createTicket.mockResolvedValue({ id: 'ticket-1' });

    await request(app.getHttpServer())
      .post('/api/v1/support/tickets')
      .set(BEARER)
      .send({
        subject: 'Help',
        message: 'Cannot login',
        email: 'spoof@example.com',
        userId: 'other-user',
      })
      .expect(201);

    expect(mockService.createTicket).toHaveBeenCalledWith({
      subject: 'Help',
      message: 'Cannot login',
      email: TEST_USER.email,
      userId: TEST_USER.userId,
    });
  });
});
