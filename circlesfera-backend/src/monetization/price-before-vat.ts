import type Stripe from 'stripe';

// What a buyer paid a creator before VAT: the price, which the 80/20 split
// is taken from. The VAT on top is CircleSfera's to pay to the tax agency
// and never part of the creator's earnings.
export function priceBeforeVat(
  session: Pick<Stripe.Checkout.Session, 'amount_subtotal' | 'amount_total'>,
): number {
  return session.amount_subtotal ?? session.amount_total ?? 0;
}

// The VAT the buyer paid on top of the price, for their own records.
export function vatPaid(
  session: Pick<Stripe.Checkout.Session, 'total_details'>,
): number {
  return session.total_details?.amount_tax ?? 0;
}
