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
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_USER,
  TEST_UUID,
} from '../common/testing/http-controller.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsController', () => {
  let app: INestApplication;

  const mockService = {
    findAllPlans: vi.fn(),
    createCheckout: vi.fn(),
    getPortalUrl: vi.fn(),
    getBillingStatus: vi.fn(),
    getLedgerCsv: vi.fn(),
    constructEvent: vi.fn(),
    processWebhookEvent: vi.fn(),
  };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
      guards: [
        { guard: JwtAuthGuard, mode: 'session' },
        { guard: IdentityVerifiedGuard, mode: 'session' },
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

  it('lists plans without a caller identity', async () => {
    mockService.findAllPlans.mockResolvedValue([]);

    const res = await request(app.getHttpServer())
      .get('/api/v1/payments/plans')
      .expect(200);

    expect(res.body).toEqual([]);
    expect(mockService.findAllPlans).toHaveBeenCalledWith();
  });

  it('rejects checkout without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments/checkout')
      .send({ planId: TEST_UUID, billingCycle: 'YEARLY' })
      .expect(401);

    expect(mockService.createCheckout).not.toHaveBeenCalled();
  });

  it('rejects checkout with a non-whitelisted body field', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments/checkout')
      .set(BEARER)
      .send({
        planId: TEST_UUID,
        billingCycle: 'YEARLY',
        amountCents: 999,
      })
      .expect(400);

    expect(mockService.createCheckout).not.toHaveBeenCalled();
  });

  it('starts checkout as the session userId', async () => {
    mockService.createCheckout.mockResolvedValue({
      url: 'https://example.com',
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/checkout')
      .set(BEARER)
      .send({ planId: TEST_UUID, billingCycle: 'YEARLY' })
      .expect(201);

    expect(res.body).toEqual({ url: 'https://example.com' });
    expect(mockService.createCheckout).toHaveBeenCalledWith(
      TEST_USER.userId,
      TEST_UUID,
      'YEARLY',
    );
  });

  it('reads portal, status and ledger as the session userId', async () => {
    mockService.getPortalUrl.mockResolvedValue({ url: 'https://example.com' });
    mockService.getBillingStatus.mockResolvedValue({ plan: null });
    mockService.getLedgerCsv.mockResolvedValue('id,amount\n');

    const portal = await request(app.getHttpServer())
      .get('/api/v1/payments/portal')
      .set(BEARER)
      .expect(200);
    expect(portal.body).toEqual({ url: 'https://example.com' });

    const status = await request(app.getHttpServer())
      .get('/api/v1/payments/status')
      .set(BEARER)
      .expect(200);
    expect(status.body).toEqual({ plan: null });

    const ledger = await request(app.getHttpServer())
      .get('/api/v1/payments/ledger')
      .set(BEARER)
      .expect(200);
    expect(ledger.text).toBe('id,amount\n');

    expect(mockService.getPortalUrl).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getBillingStatus).toHaveBeenCalledWith(TEST_USER.userId);
    expect(mockService.getLedgerCsv).toHaveBeenCalledWith(TEST_USER.userId);
  });

  it('rejects the admin ledger with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/payments/admin/ledger')
      .set(BEARER)
      .expect(401);

    expect(mockService.getLedgerCsv).not.toHaveBeenCalled();
  });

  it('exports the admin ledger with an admin session', async () => {
    mockService.getLedgerCsv.mockResolvedValue('id,amount\n');

    const res = await request(app.getHttpServer())
      .get('/api/v1/payments/admin/ledger')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(res.text).toBe('id,amount\n');
    expect(mockService.getLedgerCsv).toHaveBeenCalledWith();
  });

  it('rejects a webhook without stripe-signature', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .send({ id: 'evt_test' })
      .expect(400);

    expect(mockService.constructEvent).not.toHaveBeenCalled();
  });

  it('verifies and processes a webhook event', async () => {
    const event = { id: 'evt_test', type: 'checkout.session.completed' };
    mockService.constructEvent.mockReturnValue(event);
    mockService.processWebhookEvent.mockResolvedValue(undefined);

    const res = await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'sig-1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt_test' }))
      .expect(200);

    expect(res.body).toEqual({ received: true });
    expect(mockService.constructEvent).toHaveBeenCalled();
    const [rawBody, sig] = mockService.constructEvent.mock.calls[0];
    expect(Buffer.isBuffer(rawBody)).toBe(true);
    expect(sig).toBe('sig-1');
    expect(mockService.processWebhookEvent).toHaveBeenCalledWith(event);
  });

  it('maps unexpected webhook errors to 5xx so Stripe can retry', async () => {
    mockService.constructEvent.mockReturnValue({ id: 'evt_test' });
    mockService.processWebhookEvent.mockRejectedValue(new Error('downstream'));
    const controller = app.get(PaymentsController);
    vi.spyOn((controller as any).logger, 'error').mockImplementation(() => {});

    await request(app.getHttpServer())
      .post('/api/v1/payments/webhook')
      .set('stripe-signature', 'sig-1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt_test' }))
      .expect(500);
  });
});
