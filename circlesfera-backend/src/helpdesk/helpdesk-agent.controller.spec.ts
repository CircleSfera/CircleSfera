import type { INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
import {
  AdminGuard,
  STAFF_PERMISSIONS_KEY,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { HelpdeskAgentController } from './helpdesk-agent.controller.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

describe('HelpdeskAgentController', () => {
  let app: INestApplication;

  const mockService = {
    listTickets: vi.fn(),
    updateTicket: vi.fn(),
    handOver: vi.fn(),
    accountCard: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HelpdeskAgentController],
      providers: [{ provide: HelpdeskTicketsService, useValue: mockService }],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the support permission on every route', () => {
    expect(
      new Reflector().get(STAFF_PERMISSIONS_KEY, HelpdeskAgentController),
    ).toEqual(['support']);
  });

  it('answers 401 without a staff session, and with a participant session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets')
      .set(BEARER)
      .expect(401);

    expect(mockService.listTickets).not.toHaveBeenCalled();
  });

  it('hands a ticket to moderation as the agent and reads its account card', async () => {
    mockService.handOver.mockResolvedValue({ id: 't-1' });
    mockService.accountCard.mockResolvedValue({ userId: 'u-1' });

    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets/t-1/escalate')
      .set(ADMIN_BEARER)
      .expect(201);
    const card = await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets/t-1/account')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.handOver).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      't-1',
    );
    expect(mockService.accountCard).toHaveBeenCalledWith('t-1');
    expect(card.body).toEqual({ userId: 'u-1' });
  });

  it('lists and updates tickets as the agent', async () => {
    const body = { status: 'RESOLVED' as const, reply: 'Done' };
    mockService.listTickets.mockResolvedValue({ data: [] });
    mockService.updateTicket.mockResolvedValue({ id: 't-1' });

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets')
      .query({ status: 'OPEN' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/admin/support/tickets/t-1')
      .set(ADMIN_BEARER)
      .send(body)
      .expect(200);

    expect(mockService.listTickets).toHaveBeenCalledWith(
      1,
      10,
      'OPEN',
      undefined,
    );
    expect(mockService.updateTicket).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      't-1',
      body,
    );
  });

  it('passes the topic filter and rejects one that does not exist', async () => {
    mockService.listTickets.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?category=PAYMENTS')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(mockService.listTickets).toHaveBeenCalledWith(
      1,
      10,
      undefined,
      'PAYMENTS',
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?category=BILLING')
      .set(ADMIN_BEARER)
      .expect(400);
  });
});
