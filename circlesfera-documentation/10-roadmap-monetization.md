# Monetization and creator economy

Canonical behaviour is in the controllers, `schema.prisma`, and ADRs
[0002](./adr/0002-stripe-connect-payouts.md),
[0003](./adr/0003-one-active-platform-plan.md),
[0010](./adr/0010-platform-fee-20-percent.md).
This page is a map, not a second source of truth.

**Out of scope** (do not treat as missing product): subscriber badges as a first-class surface;
in-app withdraw; Stripe Custom accounts. See [00-status.md](./00-status.md).

---

## 1. What CircleSfera charges

| Flow | Who pays | Stripe | Local row |
| --- | --- | --- | --- |
| Platform plans (Premium / Elite / Business) | User → CircleSfera | Checkout / Billing Portal | `PlatformSubscription` |
| Creator VIP | Fan → creator (Connect) | Destination charge, 20% application fee | `CreatorSubscription` |
| Post / story / message unlock (PPV) | Fan → creator | Same | `PostUnlock` / `StoryUnlock` / `MessageUnlock` + `Transaction` |
| Tip | Fan → creator | Same | `Transaction` |
| Live gift | Viewer → creator | Same | `LiveGift` + `Transaction` `DIRECT_LIVE_GIFT` |
| Promote | Creator → CircleSfera | Checkout `mode: payment` | `Promotion` (`stripePaymentIntentId` = session id) |

- One **active platform plan** per user ([ADR-0003](./adr/0003-one-active-platform-plan.md)).
- Creator VIP price is `Profile.subscriptionPriceCents` (client `priceCents` is ignored).
- Gift prices are server-side (`gift-catalog.ts`).
- Unlock / tip / gift / Connect checkout require identity verification.
- PPV unlocks have **no rental expiry**. Access is revoked on refund or dispute (`charge.refunded` / `charge.dispute.created`).
- Currency for those Connect charges is **EUR**, amounts in integer cents.

---

## 2. Stripe Connect (creators)

- Accounts are **Express only** (`accounts.create` `type: 'express'`). Not Custom.
- KYC is Stripe Identity + Connect onboarding. CircleSfera does not collect bank details.
- Platform take-rate is **20%** / creator **80%** on Connect-mediated charges ([ADR-0010](./adr/0010-platform-fee-20-percent.md)).
- CircleSfera **does not** call `payouts.create` and does not set a payout schedule. Stripe pays the Express balance on its automatic rolling schedule. The creator can open the Express Dashboard via `GET /monetization/dashboard`.
- `GET /monetization/payouts` live-reads Connect `balance.retrieve` + `payouts.list` (available / pending). The creator Ingresos tab shows those balances, not a CircleSfera withdraw button.
- Admin → **Retiros (Stripe)** lists copies of Connect `payout.*` (`StripePayoutLog`). Those events come from a **Connected-accounts** destination. Platform Checkout uses a separate destination. Same URL, two signing secrets — [stripe-connect-webhook](./runbooks/stripe-connect-webhook.md).

---

## 3. Creator Studio (Ingresos)

Shipped: Connect status, Express login link, available/pending balances, PPV / tip / gift / VIP breakdown, promote (Ads). Planes is the creator paying CircleSfera (platform plan), a separate tab.

Not shipped and not planned here: subscriber badges on comments, geographic MRR maps, or a CircleSfera-side withdraw.

---

## 4. Promotions (already shipped)

Creator pays CircleSfera via Checkout. Feed injects only `ACTIVE` promotions. Views require a viewer JWT; the owner cannot burn their own budget. Cancel can refund unused budget (`PROPORTIONAL`). Admin reject of a charged promo refunds proportionally. Placements are marked sponsored in the feed.

---

## 5. Admin

- **Monetización:** platform MRR, subscription counts, tier mix, `Transaction` list (charges CircleSfera intermediates).
- **Retiros (Stripe):** automatic Express payouts after Stripe sends `payout.*` on the Connect destination. Empty until the first such payout after that destination went live.
