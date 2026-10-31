import type Stripe from 'stripe';

// A payment to a creator (an unlock, a tip, a live gift) is priced before
// VAT. CircleSfera charges it and is the supplier for VAT, so the provider
// adds the VAT due where the buyer is, CircleSfera keeps it to pay the tax
// agency, and the creator's account receives the price less the platform
// fee: the same as before VAT was added.
export function creatorPaymentTax(params: {
  priceCents: number;
  platformFeeCents: number;
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
        amount: params.priceCents - params.platformFeeCents,
      },
    },
  };
}
