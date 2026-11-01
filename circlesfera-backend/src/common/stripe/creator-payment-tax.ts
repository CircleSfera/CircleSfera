import type Stripe from 'stripe';
import { platformFeeCents } from '../constants/monetization.constants.js';

// A payment to a creator (an unlock, a tip, a live gift) is charged on the
// creator's own account: the creator is the seller and declares the VAT of
// their sales, and the price the buyer sees includes it. When the creator's
// tax settings are complete the provider works out the VAT inside the price
// for where the buyer is; until then the payment carries none.
// CircleSfera's fee is its share of the price without VAT. The VAT is only
// known once the buyer has paid, so the fee asked here is its share of the
// whole price, and the part taken on the VAT is given back to the creator
// once the payment is made.
export function creatorPaymentTax(params: {
  priceCents: number;
  taxActive: boolean;
}): Pick<
  Stripe.Checkout.SessionCreateParams,
  'automatic_tax' | 'billing_address_collection' | 'payment_intent_data'
> {
  return {
    ...(params.taxActive && {
      automatic_tax: { enabled: true, liability: { type: 'self' } },
      // The country the VAT is due in, and nothing more than the tax needs.
      billing_address_collection: 'auto',
    }),
    payment_intent_data: {
      application_fee_amount: platformFeeCents(params.priceCents),
    },
  };
}

// A payment to a creator is paid by card only (owner decision). The card-only
// Payment Method Configuration of CircleSfera's account does not apply on a
// creator's account, so only cards are let through there.
export const CREATOR_PAYMENT_METHODS: Pick<
  Stripe.Checkout.SessionCreateParams,
  'allowed_payment_method_types'
> = { allowed_payment_method_types: ['card'] };

// CircleSfera's fee once the VAT of a payment is known.
export function creatorPaymentFeeDue(paid: number, vat: number): number {
  return platformFeeCents(paid - vat);
}
