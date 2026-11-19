import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { StripeModule } from './stripe.module.js';
import { StripeService } from './stripe.service.js';

describe('StripeModule', () => {
  it('compiles and exports StripeService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              STRIPE_SECRET_KEY: 'sk_test_mock',
              STRIPE_WEBHOOK_SECRET: 'whsec_mock',
            }),
          ],
        }),
        StripeModule,
      ],
    }).compile();

    const stripeService = moduleRef.get<StripeService>(StripeService);
    expect(stripeService).toBeDefined();
    expect(stripeService.stripe).toBeDefined();
  });
});
