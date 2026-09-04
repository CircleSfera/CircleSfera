import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { IdentityVerifiedGuard } from '../auth/guards/identity-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsController', () => {
  let controller: PaymentsController;

  const req = {
    user: {
      userId: 'user-1',
      email: 'test@example.com',
      role: 'USER',
    },
  } as Parameters<PaymentsController['createCheckout']>[0];

  const mockService = {
    findAllPlans: vi.fn(),
    createCheckout: vi.fn(),
    getPortalUrl: vi.fn(),
    getBillingStatus: vi.fn(),
    getLedgerCsv: vi.fn(),
    constructEvent: vi.fn(),
    processWebhookEvent: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(IdentityVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentsController>(PaymentsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists plans without a caller identity', async () => {
    mockService.findAllPlans.mockResolvedValue([]);

    await controller.getPlans();

    expect(mockService.findAllPlans).toHaveBeenCalledWith();
  });

  it('starts checkout as the caller userId and unwraps plan fields', async () => {
    mockService.createCheckout.mockResolvedValue({
      url: 'https://example.com',
    });

    await controller.createCheckout(req, {
      planId: '11111111-1111-1111-1111-111111111111',
      billingCycle: 'YEARLY',
    });

    expect(mockService.createCheckout).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-1111-1111-111111111111',
      'YEARLY',
    );
  });

  it('reads portal, status and ledger as the caller userId', async () => {
    mockService.getPortalUrl.mockResolvedValue({ url: 'https://example.com' });
    mockService.getBillingStatus.mockResolvedValue({ plan: null });
    mockService.getLedgerCsv.mockResolvedValue('id,amount\n');

    await controller.getPortal(req);
    await controller.getBillingStatus(req);
    await controller.getLedger(req);

    expect(mockService.getPortalUrl).toHaveBeenCalledWith('user-1');
    expect(mockService.getBillingStatus).toHaveBeenCalledWith('user-1');
    expect(mockService.getLedgerCsv).toHaveBeenCalledWith('user-1');
  });

  it('exports the admin ledger without a userId', async () => {
    mockService.getLedgerCsv.mockResolvedValue('id,amount\n');

    await controller.getAdminLedger();

    expect(mockService.getLedgerCsv).toHaveBeenCalledWith();
  });

  it('rejects a webhook without stripe-signature', async () => {
    await expect(
      controller.handleWebhook({
        headers: {},
        rawBody: Buffer.from('{}'),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockService.constructEvent).not.toHaveBeenCalled();
  });

  it('rejects a webhook without rawBody', async () => {
    await expect(
      controller.handleWebhook({
        headers: { 'stripe-signature': 'sig-1' },
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockService.constructEvent).not.toHaveBeenCalled();
  });

  it('verifies and processes a webhook event', async () => {
    const rawBody = Buffer.from('{"id":"evt_test"}');
    const event = { id: 'evt_test', type: 'checkout.session.completed' };
    mockService.constructEvent.mockReturnValue(event);
    mockService.processWebhookEvent.mockResolvedValue(undefined);

    const result = await controller.handleWebhook({
      headers: { 'stripe-signature': 'sig-1' },
      rawBody,
    } as never);

    expect(mockService.constructEvent).toHaveBeenCalledWith(rawBody, 'sig-1');
    expect(mockService.processWebhookEvent).toHaveBeenCalledWith(event);
    expect(result).toEqual({ received: true });
  });

  it('rethrows BadRequestException from webhook verification', async () => {
    mockService.constructEvent.mockImplementation(() => {
      throw new BadRequestException('bad signature');
    });

    await expect(
      controller.handleWebhook({
        headers: { 'stripe-signature': 'sig-1' },
        rawBody: Buffer.from('{}'),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockService.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('maps unexpected webhook errors to 5xx so Stripe can retry', async () => {
    mockService.constructEvent.mockReturnValue({ id: 'evt_test' });
    mockService.processWebhookEvent.mockRejectedValue(new Error('downstream'));

    await expect(
      controller.handleWebhook({
        headers: { 'stripe-signature': 'sig-1' },
        rawBody: Buffer.from('{}'),
      } as never),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
