import { describe, expect, it } from 'vitest';
import {
  CREATOR_PAYMENT_METHODS,
  creatorPaymentFeeDue,
  creatorPaymentTax,
} from './creator-payment-tax.js';

describe('creatorPaymentTax', () => {
  it("works out the VAT on the creator's account when their tax settings are complete, and asks the fee on the whole price", () => {
    expect(creatorPaymentTax({ priceCents: 1000, taxActive: true })).toEqual({
      automatic_tax: { enabled: true, liability: { type: 'self' } },
      billing_address_collection: 'auto',
      payment_intent_data: { application_fee_amount: 200 },
    });
  });

  it('works out no VAT and asks no address while their tax settings are not complete', () => {
    expect(creatorPaymentTax({ priceCents: 999, taxActive: false })).toEqual({
      payment_intent_data: { application_fee_amount: 199 },
    });
  });
});

describe('creatorPaymentFeeDue', () => {
  it('is 20% of the price without VAT, rounded down', () => {
    expect(creatorPaymentFeeDue(1000, 174)).toBe(165);
    expect(creatorPaymentFeeDue(1000, 0)).toBe(200);
  });
});

describe('CREATOR_PAYMENT_METHODS', () => {
  it('lets only cards through', () => {
    expect(CREATOR_PAYMENT_METHODS).toEqual({
      allowed_payment_method_types: ['card'],
    });
  });
});
