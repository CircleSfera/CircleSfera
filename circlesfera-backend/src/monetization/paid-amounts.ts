import type Stripe from 'stripe';
import { creatorShareCents } from '../common/constants/monetization.constants.js';

// What a buyer paid a creator: the price, VAT included.
export function amountPaid(
  session: Pick<Stripe.Checkout.Session, 'amount_total'>,
): number {
  return session.amount_total ?? 0;
}

// The VAT inside what the buyer paid, worked out by the provider for where
// the buyer is: the creator's to declare, as the seller.
export function vatPaid(
  session: Pick<Stripe.Checkout.Session, 'total_details'>,
): number {
  return session.total_details?.amount_tax ?? 0;
}

// What a payment keeps of its price without VAT once `refunded` of what was
// paid went back to the buyer: the same part of it, rounded down.
export function keptWithoutVat(
  paid: number,
  vat: number,
  refunded = 0,
): number {
  if (paid <= 0 || refunded >= paid) return 0;
  return Math.floor(((paid - vat) * (paid - refunded)) / paid);
}

// What the creator earns of a payment: their share of what was paid less
// the VAT, and less what was refunded.
export function creatorEarnings(
  paid: number,
  vat: number,
  refunded = 0,
): number {
  return creatorShareCents(keptWithoutVat(paid, vat, refunded));
}
