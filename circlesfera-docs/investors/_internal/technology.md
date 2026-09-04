# CircleSfera — product and technology appendix

**Date:** 30 August 2026  
**Audience:** technical partners and diligence  
**Do not attach this to a first email.** Send after a partner or engineer asks.  
**Versions** come from the `package.json` files read on this date. If a file and this appendix disagree later, the `package.json` wins.

This is a map. It does not paste schema or endpoint lists. Canonical artifacts stay in the repo.

---

## 1. Monorepo

| Path | Role |
| --- | --- |
| `circlesfera-backend/` | NestJS 11 API, Prisma 7, BullMQ workers, Socket.IO gateway |
| `circlesfera-frontend/` | React 19 SPA (Vite 7), PWA, TanStack Query, Zustand |
| `circlesfera-shared/` | Small shared enums, interfaces, DTOs (not generated from Prisma) |
| `circlesfera-documentation/` | Product and ops documents, ADRs, runbooks |
| `circlesfera-docs/investors/` | This pack |
| `e2e/` | Playwright specs |

`circlesfera-landing/` was removed in July 2026. Do not document it as live.

## 2. Stack (verified)

**Backend.** NestJS 11.1.26, TypeScript, Node 24 Alpine image, Prisma 7.8 with `@prisma/adapter-pg`, PostgreSQL + `vector` extension, Redis 7, BullMQ 5, Socket.IO 4.8, Stripe 22.0.2, LiveKit server SDK, OpenAI SDK, Sentry, Pino, Helmet, Throttler, `csrf-csrf`, Argon2, SimpleWebAuthn, otplib.

**Frontend.** React 19.2, Vite 7, React Router 7, TanStack Query 5, Zustand 5, Tailwind CSS 4, i18next (`en`, `es`), LiveKit client, hls.js, FFmpeg.wasm, Sentry, vite-plugin-pwa.

**API prefix.** `api/v1`. Swagger at `/api/docs`. Health at `/api/v1/health`.

**Controllers.** 52 NestJS controller files under `circlesfera-backend/src/` as of this date. Do not infer an endpoint from this count; grep the controller.

## 3. Data model

`schema.prisma` is the only canonical model.

As of 30 August 2026: **76 models**, **29 enums**.

Domain groups that exist as tables (not as a wish list): User / Profile / Passkey / DeviceSignal; Post / Story / Highlight / Audio / Poll / QnA; Follow / Block / Mute; Conversation / Message; PlatformPlan / PlatformSubscription / Creator-side unlocks and `Transaction`; Promotion; LiveStream / LiveGift; Report / Appeal / SupportTicket; AdminIdentity and RBAC; FeatureFlag / UserExperiment; PostEmbedding / ProfileEmbedding; feed preference tables.

Money is integer cents. Social content foreign keys live on `Profile`, not on `User` (ADR-0015).

## 4. Architecture decisions that bind the product

| ADR | Decision |
| --- | --- |
| 0002 | Stripe Connect Express only. No internal payout ledger. No `payouts.create`. |
| 0003 | At most one active platform plan per user. |
| 0004 | Feed hide/mute is persisted domain data, not a client filter. |
| 0005 | Live streaming is LiveKit. |
| 0006 | Redis + BullMQ for cache, pub/sub, and jobs. Processors run in the API process. |
| 0007 | HttpOnly auth cookies + CSRF double-submit. |
| 0008 | Storage is S3, else Cloudinary, else local disk (local is not a production strategy). |
| 0009 | Hybrid feed fan-out on write. |
| 0010 | 20% platform application fee on Connect charges. |
| 0012 | WebRTC signaling for calls. |
| 0013 | Admin panel is a separate identity, host, and session. |
| 0014 | Turnstile, email gate, device hashes, IP retained for account life (admin + GDPR export only). Trust score does not cut reach. |
| 0015 | User = account, Profile = social identity. |
| 0016 | ClickHouse warehouse + nightly ETL — **proposed / in development**. Export job shipped; Cloud + Grafana not provisioned. |

ADR-0011 is the in-repo AI engineering framework. It is process, not product.

## 5. Money path (diligence)

Ownership of amounts is server-side:

- Plan prices: `PlatformPlan.priceCents`
- Creator VIP: `Profile.subscriptionPriceCents`
- Gifts: `src/live/gift-catalog.ts`
- Application fee: `floor(amountCents * 0.2)` (subscriptions use `application_fee_percent: 20.0`)

Guards: `IdentityVerifiedGuard` on connect / tip / unlock / gift / checkout. Entitlement for PPV is `PostUnlock` / `StoryUnlock` / `MessageUnlock` or an active `CreatorSubscription` or ownership — never a client flag.

Webhooks: `WebhookEvent` dedupe; `PROCESSED` only after success; HTTP 5xx on failure so Stripe retries. Two signing secrets can share one URL (platform Checkout vs Connect destination).

Production fail-fast: `ENCRYPTION_KEY`, `OPENAI_API_KEY`, and LiveKit credentials are required at boot.

## 6. Quality gates

On PRs to `main` (`.github/workflows/pr.yml`): shared install, backend lint + unit tests, Prisma schema↔migration check, backend e2e against real Postgres/Redis, frontend lint + unit tests + `tsc -b` build, Playwright smoke.

Deploy repeats tests, pushes GHCR images, SSH-deploys the VPS, smokes the API, rolls back on failure. Playwright nightly runs the broader suite. Dependabot covers shared packages, Actions, and Docker. CodeQL + informative npm audit run in `security.yml`.

Backend `npm test` is not a typecheck. `nest build` / the Playwright job is the type gate.

## 7. In development vs still out of scope

**In development** (product reopened August 2026 — not shipped):

- **Native apps.** Capacitor `com.circlesfera.app`; `circlesfera-frontend/ios/` and `android/`; plugins for cookies, HTTP, keyboard, splash, push, camera, filesystem, share, biometrics. `npm run cap:sync`. No published store binaries.
- **Paid ads at scale.** `Promotion` already: Stripe Checkout, feed inject (~1 per 5 posts), owner cannot burn own budget, pause / cancel / proportional refund, sponsored mark. Scale-up (inventory, pacing, warehouse reporting) is the open work.
- **New creation.** Shipped: `/create` (posts, Frames, stories) and `/edits` (Studio: timeline, FFmpeg export, Whisper captions). Next surfaces are raise work — do not invent formats here.
- **ClickHouse.** `WarehouseModule` + `scripts/etl/` + `clickhouse-schema.sql` + Cloud runbook. Set `CLICKHOUSE_URL` to load; unset = CSV only. Cloud service and Grafana are not provisioned.

**Still out of scope** (`00-status.md`):

- Communities / forums
- B2B Business Manager
- Public OAuth / third-party developer platform
- SSR indexable profiles
- Subscriber badges as a product surface
- SOC2 and a public bug-bounty program
- In-app creator withdraw

## 8. How an investor can inspect without a demo account

1. Read [22-one-pager.md](../22-one-pager.md), then this appendix.
2. Open `circlesfera-documentation/00-status.md` and the ADR index.
3. Ask for a **staged** walkthrough: consumer SPA, Creator Studio Ingresos, Admin Trust — not production secrets.
4. Ask for current admin Monetization MRR and Stripe Dashboard totals as founder-supplied figures, not as claims in this file.
