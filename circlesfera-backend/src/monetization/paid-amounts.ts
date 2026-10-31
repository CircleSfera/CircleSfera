import type Stripe from 'stripe';
import { creatorShareCents } from '../common/constants/monetization.constants.js';

// What a buyer paid a creator: the price, VAT included.
export function amountPaid(
  session: Pick<Stripe.Checkout.Session, 'amount_total'>,
): number {
  return session.amount_total ?? 0;
}

// The VAT inside what the buyer paid, worked out by the provider for where
// the buyer is: CircleSfera's to pay to the tax agency.
export function vatPaid(
  session: Pick<Stripe.Checkout.Session, 'total_details'>,
): number {
  return session.total_details?.amount_tax ?? 0;
}

// What the creator earns of a payment: their share of what was paid less
// the VAT. The provider first sent them their share of all that was paid,
// as the VAT was not known yet; `vatToTakeBack` is the difference.
export function creatorEarnings(paid: number, vat: number): number {
  return creatorShareCents(paid - vat);
}

export function vatToTakeBack(paid: number, vat: number): number {
  return creatorShareCents(paid) - creatorEarnings(paid, vat);
}
