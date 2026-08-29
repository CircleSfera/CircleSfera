# Stripe Connect webhook (creator Express events)

The live destination **Webhook API CircleSfera** listens to the **platform** account
(`checkout.session.*`, subscriptions, refunds, and the same event names on the
platform). Creator Express `payout.*` and connected `account.updated` are sent
only if a **second** destination is scoped to **Connected accounts**.

Do not convert the existing destination to Connect-only: platform Checkout
would stop arriving.

## Prerequisites

- Deploy includes `STRIPE_CONNECT_WEBHOOK_SECRET` fallback in
  `StripeService.constructEvent`.
- Do not create the destination until that deploy is live (or the new `whsec_`
  will fail signature checks).

## Create the destination (Dashboard)

1. Workbench → **Webhooks** → create a new destination (do not edit the
   existing CircleSfera destination’s scope).
2. Scope: **Events on connected accounts** / **Cuentas conectadas**.
3. API version: same as the platform destination (`2026-03-25.dahlia` if that
   is what production uses).
4. Events only:
   - `payout.created`
   - `payout.updated`
   - `payout.paid`
   - `payout.failed`
   - `payout.canceled`
   - `account.updated`
5. Type: Webhook. URL (unchanged):

   `https://api.circlesfera.com/api/v1/payments/webhook`

6. Description e.g. `Webhook Connect CircleSfera`. Create.
7. Copy the new signing secret (`whsec_…`). It is **not** the same as
   `STRIPE_WEBHOOK_SECRET`.

## Server

Set `STRIPE_CONNECT_WEBHOOK_SECRET` in production env to that `whsec_`.
Redeploy or restart backend so the process loads the value.

Do not paste the secret into git, chat, or this runbook.

## Verify

| Check | Expect |
| --- | --- |
| Platform destination | Still **Tu cuenta**, 12 events, same `STRIPE_WEBHOOK_SECRET` |
| New destination | **Cuentas conectadas**, 6 events above |
| First creator Express payout after both are live | Admin → Retiros shows a row |
| Checkout / platform plans | Still complete via the original destination |
