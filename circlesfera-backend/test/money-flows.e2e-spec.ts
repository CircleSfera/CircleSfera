import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { MIN_PPV_PRICE_CENTS } from '../src/common/constants/monetization.constants.js';
import { LIVE_GIFT_CATALOG } from '../src/live/gift-catalog.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { uniqueSuffix } from './utils/unique-id.js';

const KYC_REQUIRED =
  'Debes verificar tu identidad primero para poder comprar o cobrar.';

describe('Money flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken = '';
  let csrfToken = '';
  let csrfCookie = '';
  let userId = '';
  let activePlanId = '';
  let inactivePlanId = '';

  const uniqueId = uniqueSuffix();
  const testUser = {
    email: `money_e2e_${uniqueId}@example.com`,
    password: 'Password123!',
    username: `money_${uniqueId}`,
    fullName: 'Money E2E User',
    dateOfBirth: '1990-01-15',
  };
  const activeStripeProductId = `prod_e2e_on_${uniqueId}`;
  const inactiveStripeProductId = `prod_e2e_off_${uniqueId}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();

    prisma = app.get(PrismaService);

    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await prisma.platformPlan.deleteMany({
      where: {
        stripeProductId: {
          in: [activeStripeProductId, inactiveStripeProductId],
        },
      },
    });

    const activePlan = await prisma.platformPlan.create({
      data: {
        name: `E2E Active ${uniqueId}`,
        priceCents: 1234,
        yearlyPriceCents: 12000,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: activeStripeProductId,
        stripePriceId: `price_e2e_on_${uniqueId}`,
        yearlyStripePriceId: `price_e2e_on_y_${uniqueId}`,
        features: ['e2e'],
        isActive: true,
      },
    });
    const inactivePlan = await prisma.platformPlan.create({
      data: {
        name: `E2E Inactive ${uniqueId}`,
        priceCents: 1,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: inactiveStripeProductId,
        stripePriceId: `price_e2e_off_${uniqueId}`,
        features: ['e2e'],
        isActive: false,
      },
    });
    activePlanId = activePlan.id;
    inactivePlanId = inactivePlan.id;

    const csrfRes = await request(app.getHttpServer()).get(
      '/api/v1/csrf-token',
    );
    csrfToken = csrfRes.body.csrfToken;
    const cookies = (csrfRes.get('Set-Cookie') as string[]) || [];
    csrfCookie = cookies.find((c) => c.startsWith('x-csrf-token=')) || '';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send(testUser)
      .expect(201);

    const user = await prisma.user.findUnique({
      where: { email: testUser.email },
    });
    if (!user) throw new Error('e2e user was not created');
    userId = user.id;

    await prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    });

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Cookie', [csrfCookie])
      .set('x-csrf-token', csrfToken)
      .send({
        identifier: testUser.email,
        password: testUser.password,
      })
      .expect(200);

    const authCookies = (loginRes.get('Set-Cookie') as string[]) || [];
    const accessCookie = authCookies.find((c) => c.startsWith('access_token='));
    accessToken = accessCookie?.split(';')[0].split('=')[1] || '';
    expect(accessToken).not.toBe('');

    const sessionCsrfCookie = authCookies.find((c) =>
      c.startsWith('x-csrf-token='),
    );
    if (sessionCsrfCookie) csrfCookie = sessionCsrfCookie;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testUser.email } });
    await prisma.platformPlan.deleteMany({
      where: { id: { in: [activePlanId, inactivePlanId].filter(Boolean) } },
    });
    await app.close();
  });

  describe('public catalog', () => {
    it('GET /payments/plans returns server priceCents and hides inactive plans', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/payments/plans')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      const active = res.body.find(
        (p: { id: string }) => p.id === activePlanId,
      );
      const inactive = res.body.find(
        (p: { id: string }) => p.id === inactivePlanId,
      );

      expect(active).toMatchObject({
        id: activePlanId,
        priceCents: 1234,
        currency: 'EUR',
      });
      expect(inactive).toBeUndefined();
    });
  });

  describe('unauthenticated', () => {
    it('rejects monetization, checkout, tip and live gift without a session', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/monetization')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/payments/status')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .send({
          planId: activePlanId,
          billingCycle: 'MONTHLY',
        })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/monetization/tip')
        .send({
          receiverId: userId,
          amountCents: MIN_PPV_PRICE_CENTS * 5,
          returnUrl: 'http://localhost:5173/',
        })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/live/00000000-0000-4000-8000-000000000001/gift')
        .send({ giftId: 'star' })
        .expect(401);
    });

    it('rejects a Stripe webhook without stripe-signature', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook')
        .send({ type: 'checkout.session.completed' })
        .expect(400);

      expect(res.body.message).toBe('Missing stripe-signature header');
    });

    it('rejects a signed webhook when Nest has no rawBody (no Stripe construct)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/payments/webhook')
        .set('stripe-signature', 't=1,v1=not-a-real-signature')
        .send({ type: 'checkout.session.completed' })
        .expect(400);

      expect(res.body.message).toBe('rawBody not found');
    });

    it('rejects the admin ledger without an admin session', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/payments/admin/ledger')
        .expect(401);
    });
  });

  describe('authenticated without KYC', () => {
    it('lets the caller read monetization and billing without identity verification', async () => {
      const monetization = await request(app.getHttpServer())
        .get('/api/v1/monetization')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(monetization.body.lifetimeEarningsCents).toBe(0);
      expect(monetization.body.hasStripeAccount).toBe(false);

      const status = await request(app.getHttpServer())
        .get('/api/v1/payments/status')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(status.body.hasActiveSubscription).toBe(false);
      expect(status.body.subscription).toBeNull();
    });

    it('blocks checkout, tip and live gift until identity is verified', async () => {
      const checkout = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ planId: activePlanId, billingCycle: 'MONTHLY' })
        .expect(403);
      expect(checkout.body.message).toBe(KYC_REQUIRED);

      const tip = await request(app.getHttpServer())
        .post('/api/v1/monetization/tip')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          receiverId: userId,
          amountCents: MIN_PPV_PRICE_CENTS * 5,
          returnUrl: 'http://localhost:5173/',
        })
        .expect(403);
      expect(tip.body.message).toBe(KYC_REQUIRED);

      const gift = await request(app.getHttpServer())
        .post('/api/v1/live/00000000-0000-4000-8000-000000000001/gift')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ giftId: 'star' })
        .expect(403);
      expect(gift.body.message).toBe(KYC_REQUIRED);
    });
  });

  describe('authenticated with KYC', () => {
    beforeAll(async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { identityVerifiedAt: new Date() },
      });
    });

    it('rejects client-supplied gift and checkout prices (forbidNonWhitelisted)', async () => {
      const gift = await request(app.getHttpServer())
        .post('/api/v1/live/00000000-0000-4000-8000-000000000001/gift')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ giftId: 'star', amountCents: 1 })
        .expect(400);
      expect(String(gift.body.message)).toContain('amountCents');

      const checkout = await request(app.getHttpServer())
        .post('/api/v1/payments/checkout')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          planId: activePlanId,
          billingCycle: 'MONTHLY',
          amountCents: 1,
        })
        .expect(400);
      expect(String(checkout.body.message)).toContain('amountCents');
    });

    it('rejects an unknown live giftId from the server catalog before Stripe', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/live/00000000-0000-4000-8000-000000000001/gift')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({ giftId: 'not-a-catalog-gift' })
        .expect(400);

      expect(String(res.body.message)).toContain('Unknown giftId');
      expect(String(res.body.message)).toContain(
        Object.keys(LIVE_GIFT_CATALOG).join(', '),
      );
    });

    it('rejects a tip below the $1.00 minimum', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/monetization/tip')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          receiverId: userId,
          // Tip minimum (100 cents) is hardcoded and independent of
          // MIN_PPV_PRICE_CENTS (the PPV content price floor).
          amountCents: 99,
          returnUrl: 'http://localhost:5173/',
        })
        .expect(400);

      expect(String(res.body.message)).toContain('Minimum tip is $1.00 USD');
    });

    it('rejects unlock payloads that include a client price', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/monetization/unlock')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          postId: '00000000-0000-4000-8000-000000000002',
          returnUrl: 'http://localhost:5173/',
          amountCents: 1,
        })
        .expect(400);

      expect(String(res.body.message)).toContain('amountCents');
    });
  });

  describe('inactive account', () => {
    beforeAll(async () => {
      await prisma.user.update({
        where: { id: userId },
        data: {
          identityVerifiedAt: new Date(),
          isActive: false,
        },
      });
    });

    it('rejects spend when the account is deactivated (JWT before KYC guard)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/monetization/tip')
        .set('Cookie', [`access_token=${accessToken}`, csrfCookie])
        .set('x-csrf-token', csrfToken)
        .send({
          receiverId: userId,
          amountCents: MIN_PPV_PRICE_CENTS * 5,
          returnUrl: 'http://localhost:5173/',
        })
        .expect(401);

      expect(res.body.message).toBe('User not found or account deactivated');
    });
  });
});
