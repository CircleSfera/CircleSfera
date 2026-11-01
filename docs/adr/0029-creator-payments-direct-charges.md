# ADR-0029: A payment to a creator is a direct charge on the creator's account

- **Status:** Accepted
- **Date:** 2026-11-01
- **Deciders:** CircleSfera owner (with their legal team), CircleSfera engineering

## Context

Tips, paid posts, stories and messages, and live gifts were destination charges: CircleSfera's
Stripe account charged the buyer, kept the VAT and its 20 % fee, and transferred the creator's share
to the creator's Express account. With that charge type Stripe debits every refund, every dispute and
its EUR 20 fee from CircleSfera's balance. CircleSfera could only take money back from a creator by
reversing the transfer (at most what it sent) or by debiting the creator's account, which needs the
creator's legally binding consent and costs extra.

The owner decided that CircleSfera provides the platform and takes 20 %, and does not pay for
disputes on what creators sell. Their legal team confirmed that each creator is the seller and
declares the VAT of their sales.

## Decision

### The charge

A payment to a creator is a Checkout Session created on the creator's account (the `Stripe-Account`
header). The creator is the merchant of record: the buyer's statement names them, and refunds and
disputes, with Stripe's fees, are debited from their account.

CircleSfera's fee is the `application_fee_amount`: 20 % of the price without VAT. The VAT depends
on where the buyer is and is known only once they pay, so the checkout asks 20 % of the whole price,
and the payment notice gives back to the creator the part of the fee taken on the VAT (an
application fee refund). Platform Plans and promotions stay CircleSfera's own sales, on its account.

### VAT

The price includes VAT. When the creator's tax settings are active (head office and preset tax
code), Stripe Tax works out the VAT on the creator's account (`automatic_tax` with
`liability: self`); without a tax registration where the buyer is, Stripe works out none. Until the
settings are active, the checkout carries no VAT calculation.

### The payout account

Each payout account is created with the provider liable for its negative balance:
`controller.losses.payments = stripe`, `controller.fees.payer = account`,
`controller.stripe_dashboard.type = express`, `controller.requirement_collection = stripe`, asking
for `card_payments` and `transfers`. That combination is a public preview of Stripe's API: the
request that creates the account sends the preview version (`2026-10-28.preview`); every other
request keeps the stable version. The installed library is Stripe's public-preview release, an
exception to the dependency policy approved by the owner, to move back to a stable release when the
feature is generally available.

### Notices

Stripe sends the notices of a creator's account (checkout completed or expired, refund, dispute) to
the Connect destination, naming the account. The handlers find the payment by its payment intent and
use the account to settle the fee, refund on that account and read who was charged.

## Consequences

- No refund, dispute or dispute fee of a payment to a creator reaches CircleSfera's balance, and
  CircleSfera never covers a creator's negative balance.
- A refund the app makes (a paid message deleted before the buyer paid) is made on the creator's
  account and gives back CircleSfera's fee.
- Stripe's risk team manages payment risk on creator accounts and may contact or act on them.
  Holding a banned creator's payouts (a manual payout schedule) is still accepted by Stripe on these
  accounts.
- A payout account opened before this decision can only receive transfers (it never asked for card
  payments). It takes no sales: a checkout for its creator is refused before Stripe is called. When
  the creator connects Stripe again, the app opens a new account with the new settings, puts it
  wherever the old one was kept, and leaves the old one untouched at Stripe. It only does so while
  the old account holds no money; otherwise staff are alerted and nothing changes. One account
  existed when this was decided, with nothing in it.
- An account takes sales only once Stripe has activated card payments on it, not only charges; the
  saved flag follows that rule.
- Creators need their tax settings and registrations; CircleSfera has to give them a place to enter
  them.
