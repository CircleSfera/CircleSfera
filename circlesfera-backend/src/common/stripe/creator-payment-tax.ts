import type Stripe from 'stripe';
import { creatorShareCents } from '../constants/monetization.constants.js';

// A payment to a creator (an unlock, a tip, a live gift) includes VAT.
// CircleSfera charges it and is the supplier for VAT, so the provider works
// out the VAT inside the price for where the buyer is, from the country it
// asks for. The creator's account receives their share of the price; once
// the payment is made and its VAT is known, the part of that share that
// was VAT is taken back, so they keep their share of the price without VAT.
export function creatorPaymentTax(params: {
  priceCents: number;
  destination: string;
}): Pick<
  Stripe.Checkout.SessionCreateParams,
  'automatic_tax' | 'billing_address_collection' | 'payment_intent_data'
> {
  return {
    automatic_tax: { enabled: true, liability: { type: 'self' } },
    // The country the VAT is due in, and nothing more than the tax needs.
    billing_address_collection: 'auto',
    payment_intent_data: {
      transfer_data: {
        destination: params.destination,
        amount: creatorShareCents(params.priceCents),
      },
    },
  };
}
