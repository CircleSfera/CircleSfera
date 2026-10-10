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
import { HelpdeskRequesterController } from './helpdesk-requester.controller.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

describe('HelpdeskRequesterController', () => {
  let app: INestApplication;

  const mockService = {
    createTicket: vi.fn(),
    listMyTickets: vi.fn(),
    getMyTicket: vi.fn(),
    replyToMyTicket: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HelpdeskRequesterController],
      providers: [{ provide: HelpdeskTicketsService, useValue: mockService }],
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

  it('answers 401 without a session on every route of a requester', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/support/tickets')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/support/tickets/t-1')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/support/tickets/t-1/messages')
      .send({ body: 'Hello' })
      .expect(401);

    expect(mockService.listMyTickets).not.toHaveBeenCalled();
    expect(mockService.getMyTicket).not.toHaveBeenCalled();
    expect(mockService.replyToMyTicket).not.toHaveBeenCalled();
  });

  it('lists and reads tickets as the signed-in person', async () => {
    mockService.listMyTickets.mockResolvedValue({ data: [] });
    mockService.getMyTicket.mockResolvedValue({ id: 't-1' });

    await request(app.getHttpServer())
      .get('/api/v1/support/tickets?page=2&limit=5')
      .set(BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/support/tickets/t-1')
      .set(BEARER)
      .expect(200);

    expect(mockService.listMyTickets).toHaveBeenCalledWith(
      TEST_USER.userId,
      2,
      5,
    );
    expect(mockService.getMyTicket).toHaveBeenCalledWith(
      TEST_USER.userId,
      't-1',
    );
  });

  it('adds a reply as the signed-in person, and takes no author from the request', async () => {
    mockService.replyToMyTicket.mockResolvedValue({ id: 't-1' });

    await request(app.getHttpServer())
      .post('/api/v1/support/tickets/t-1/messages')
      .set(BEARER)
      .send({ body: 'On the 2nd.' })
      .expect(201);
    expect(mockService.replyToMyTicket).toHaveBeenCalledWith(
      TEST_USER.userId,
      't-1',
      { body: 'On the 2nd.' },
    );

    for (const body of [
      { body: 'Hello', userId: 'someone-else' },
      { body: 'Hello', visibility: 'INTERNAL' },
      { body: '' },
      { body: 'x'.repeat(5001) },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/support/tickets/t-1/messages')
        .set(BEARER)
        .send(body)
        .expect(400);
    }
    expect(mockService.replyToMyTicket).toHaveBeenCalledTimes(1);
  });
});
