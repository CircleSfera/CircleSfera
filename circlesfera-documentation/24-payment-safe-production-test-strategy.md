# 24. Payment-Safe Production Test Strategy

## 1. Overview and Purpose

CircleSfera's `StripeService` (`circlesfera-backend/src/common/stripe/stripe.service.ts`) uses a **live** Stripe secret key in production — every charge, subscription, payout, and Stripe Connect action it triggers moves real money. Any automated test or check that runs against production must never call an endpoint that reaches Stripe's live API with a side-effecting operation (charge, transfer, payout, Connect account mutation).

This document audits how payment code is tested today, across every environment, and defines the policy for what production checks (including the QA-008 authenticated smoke, [00-status.md](00-status.md)) are and are not allowed to touch.

---

## 2. Current State: How Payment Code Is Tested Today

| Layer | Where | Stripe reached? | Evidence |
| :--- | :--- | :--- | :--- |
| Unit tests | `src/payments/payments.service.spec.ts`, `src/monetization/monetization.service.spec.ts` | **No.** `StripeService` is a fully mocked provider (`mockStripeService`); no network calls of any kind. | `TestingModule` DI override, verified in both spec files. |
| E2E tests (Vitest, real NestJS app + Postgres) | `test/money-flows.e2e-spec.ts` | **No.** Exercises validation/authorization that rejects requests *before* the code path would reach Stripe (tip-minimum rejection, unlock-payload rejection, KYC gating). No call into `StripeService.stripe.*` appears anywhere in the file. | `grep` for `StripeService`/`stripe.` in the test file returns nothing. |
| CI (`pr.yml`, `ci-quality.yml`, `playwright-nightly.yml`) | GitHub Actions | **No.** All three workflows set `STRIPE_SECRET_KEY: sk_test_dummy` — a syntactically test-mode-shaped key that is not a real Stripe credential. Any code path that actually tried to call the real Stripe API with it would fail immediately. | `.github/workflows/pr.yml:67`, `ci-quality.yml:114`, `playwright-nightly.yml:54`. |
| Frontend Playwright smoke (`e2e/smoke.spec.ts`) | PR gate | **No.** Explicitly unauthenticated, never reaches an authenticated payment flow. | File header: "Unauthenticated PR gate... Does not register users." |
| Post-deploy API smoke (`deploy.yml`, pre-existing) | Production | **No.** Only unauthenticated `GET` health/read checks (`/health`, `/feed/foryou`, `/stories`, `/live/active`). | `.github/workflows/deploy.yml`. |
| Post-deploy authenticated smoke (QA-008, added alongside this doc) | Production | **No, by design.** Logs in as a dedicated low-privilege test account and creates/deletes one `PRIVATE` post. Never calls `/monetization/*`, `/payments/*`, or any endpoint that can create a charge, subscription, payout, or Stripe Connect side effect. | `.github/workflows/deploy.yml`, authenticated smoke block. |

**Conclusion:** no automated test or check in this repository — in any environment, including production — makes a real network call to the Stripe API today. That is the correct starting posture, and this document exists to keep it that way as new checks are added.

---

## 3. Policy

1. **Unit and integration tests never call the real Stripe API.** `StripeService` (or the specific Stripe SDK call) must be mocked/overridden. This is already the pattern in every existing spec file — new tests must follow it, not introduce a real key.
2. **CI never holds a real Stripe key**, test-mode or live. `sk_test_dummy` (or an equivalent obviously-fake value) is correct and must not be replaced with a real `sk_test_...` key, even a low-privilege one, without a documented reason — CI logs and artifacts are a leak surface, and a real key (even test-mode) can create real records in Stripe's dashboard that someone has to notice are noise.
3. **Automated checks that run against production must be non-monetary.** Concretely, no automated production check may call:
   - `POST/PUT/DELETE /api/v1/payments/*` (platform subscription checkout, billing portal, plan changes)
   - `POST /api/v1/monetization/*` (tip, unlock, Connect onboarding, payouts)
   - Any endpoint that results in `StripeService.stripe.*` being invoked with a side-effecting call (`create`, `update`, `cancel`, `refund`, `payouts.create`, Connect account/link creation)

   The QA-008 authenticated smoke check (§4 of this document, and `.github/workflows/deploy.yml`) is scoped to login + a `PRIVATE` post create/delete specifically to respect this rule. If future smoke coverage needs to touch a Stripe-adjacent endpoint (e.g. `GET /monetization/status`, which is read-only and does not call Stripe), it must stay `GET`-only and must be reviewed against this table before being added.
4. **If genuine end-to-end Stripe coverage is ever needed** (e.g. verifying a live webhook round-trip), it must use a **separate, dedicated Stripe account in test mode** with its own webhook endpoint secret — never the platform's live account, and never by pointing a test at the production `STRIPE_SECRET_KEY`. This is out of scope today; no such coverage exists, and none should be added without a new ADR given the blast radius of a misconfigured live-mode test.
5. **The dedicated smoke test account** (`scripts/create-smoke-test-user.ts`) must remain `PERSONAL` account type and must never be onboarded to Stripe Connect or given an active `PlatformSubscription`. If it ever acquires either, QA-008-style checks must be re-reviewed against this policy before continuing to run unattended in production.

---

## 4. Cross-Reference

- Authenticated production smoke implementation: `.github/workflows/deploy.yml` (QA-008), `circlesfera-backend/scripts/create-smoke-test-user.ts`.
- Platform fee and monetization architecture: [ADR-0010](adr/0010-platform-fee-20-percent.md).
- Transaction state invariants: [15-transaction-boundaries-and-concurrency-invariants.md](15-transaction-boundaries-and-concurrency-invariants.md).
