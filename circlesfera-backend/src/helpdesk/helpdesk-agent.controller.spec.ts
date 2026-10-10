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
import { HelpdeskFiguresService } from './helpdesk-figures.service.js';
import { HelpdeskTicketsService } from './helpdesk-tickets.service.js';

describe('HelpdeskAgentController', () => {
  let app: INestApplication;

  const figures = { figures: vi.fn() };

  const mockService = {
    listTickets: vi.fn(),
    updateTicket: vi.fn(),
    handOver: vi.fn(),
    accountCard: vi.fn(),
    getTicket: vi.fn(),
    addMessage: vi.fn(),
    assign: vi.fn(),
    assignableAgents: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [HelpdeskAgentController],
      providers: [
        { provide: HelpdeskTicketsService, useValue: mockService },
        { provide: HelpdeskFiguresService, useValue: figures },
      ],
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
      {
        priority: undefined,
        assignment: undefined,
        target: undefined,
        agentRef: TEST_ADMIN.adminId,
      },
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
      {
        priority: undefined,
        assignment: undefined,
        target: undefined,
        agentRef: TEST_ADMIN.adminId,
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?category=BILLING')
      .set(ADMIN_BEARER)
      .expect(400);
  });

  it('reads one ticket with its conversation', async () => {
    mockService.getTicket.mockResolvedValue({ id: 't-1', messages: [] });

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets/t-1')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getTicket).toHaveBeenCalledWith('t-1');
    expect(res.body).toEqual({ id: 't-1', messages: [] });
  });

  it('adds an answer or a note as the agent', async () => {
    mockService.addMessage.mockResolvedValue({ id: 't-1' });
    const note = { body: 'Checked the payment.', visibility: 'INTERNAL' };

    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets/t-1/messages')
      .set(ADMIN_BEARER)
      .send(note)
      .expect(201);

    expect(mockService.addMessage).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      't-1',
      note,
    );
  });

  it.each([
    ['no visibility', { body: 'Hello' }],
    [
      'a visibility that does not exist',
      { body: 'Hello', visibility: 'SECRET' },
    ],
    ['an empty body', { body: '', visibility: 'PUBLIC' }],
    [
      'a body over 5000 characters',
      { body: 'x'.repeat(5001), visibility: 'PUBLIC' },
    ],
    [
      'a state an answer cannot leave',
      { body: 'Hello', visibility: 'PUBLIC', status: 'CLOSED' },
    ],
    [
      'an author sent by the client',
      { body: 'Hello', visibility: 'PUBLIC', authorRef: 'someone-else' },
    ],
  ])('rejects a message with %s', async (_case, body) => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets/t-1/messages')
      .set(ADMIN_BEARER)
      .send(body)
      .expect(400);

    expect(mockService.addMessage).not.toHaveBeenCalled();
  });

  it('lists the agents a ticket can be given to, and does not take the word for a ticket', async () => {
    mockService.assignableAgents.mockResolvedValue([
      { ref: 'admin-1', name: 'Ana' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets/agents')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.body).toEqual([{ ref: 'admin-1', name: 'Ana' }]);
    expect(mockService.getTicket).not.toHaveBeenCalled();
  });

  it('assigns as who is signed in, saying whether they lead the team', async () => {
    mockService.assign.mockResolvedValue({ id: 't-1' });

    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets/t-1/assignment')
      .set(ADMIN_BEARER)
      .send({ agentRef: TEST_ADMIN.adminId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets/t-1/assignment')
      .set(ADMIN_BEARER)
      .send({})
      .expect(201);

    expect(mockService.assign).toHaveBeenNthCalledWith(
      1,
      { ref: TEST_ADMIN.adminId, canManage: true },
      't-1',
      TEST_ADMIN.adminId,
    );
    expect(mockService.assign).toHaveBeenNthCalledWith(
      2,
      { ref: TEST_ADMIN.adminId, canManage: true },
      't-1',
      null,
    );
  });

  it.each([
    ['a state that does not exist', { status: 'ESCALATED' }],
    ['a priority that does not exist', { priority: 'URGENT' }],
    ['a topic that does not exist', { category: 'BILLING' }],
    [
      'a field an agent cannot set',
      { assignedAgentRef: 'someone', status: 'OPEN' },
    ],
  ])('rejects a change with %s', async (_case, body) => {
    await request(app.getHttpServer())
      .patch('/api/v1/admin/support/tickets/t-1')
      .set(ADMIN_BEARER)
      .send(body)
      .expect(400);

    expect(mockService.updateTicket).not.toHaveBeenCalled();
  });

  it('accepts the waiting state for an answer', async () => {
    mockService.addMessage.mockResolvedValue({ id: 't-1' });

    await request(app.getHttpServer())
      .post('/api/v1/admin/support/tickets/t-1/messages')
      .set(ADMIN_BEARER)
      .send({ body: 'Which day?', visibility: 'PUBLIC', status: 'WAITING' })
      .expect(201);
  });

  it('lists the tickets of who is signed in, whatever agent the request names', async () => {
    mockService.listTickets.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?assignment=mine&priority=HIGH')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(mockService.listTickets).toHaveBeenLastCalledWith(
      1,
      10,
      undefined,
      undefined,
      {
        priority: 'HIGH',
        assignment: 'mine',
        target: undefined,
        agentRef: TEST_ADMIN.adminId,
      },
    );

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?target=past')
      .set(ADMIN_BEARER)
      .expect(200);
    expect(mockService.listTickets.mock.calls.at(-1)?.[4]).toMatchObject({
      target: 'past',
    });
    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?target=soon')
      .set(ADMIN_BEARER)
      .expect(400);

    await request(app.getHttpServer())
      .get(
        '/api/v1/admin/support/tickets?assignment=mine&agentRef=someone-else',
      )
      .set(ADMIN_BEARER)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets?assignment=theirs')
      .set(ADMIN_BEARER)
      .expect(400);
  });

  it('gives the figures only to who leads the team, for the last 7 days or the last 30', async () => {
    figures.figures.mockResolvedValue({ days: 7 });
    expect(
      new Reflector().get(
        STAFF_PERMISSIONS_KEY,
        HelpdeskAgentController.prototype.figures,
      ),
    ).toEqual(['support.manage']);

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets/figures')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets/figures?days=30')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/support/tickets/figures?days=365')
      .set(ADMIN_BEARER)
      .expect(400);

    expect(figures.figures.mock.calls).toEqual([[7], [30]]);
    // The word "figures" is never taken for a ticket.
    expect(mockService.getTicket).not.toHaveBeenCalled();
  });
});
