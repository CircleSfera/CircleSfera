# Documentation status

**Last status note:** Jul 2026 — Payments/Stripe monetization hardening (webhook integrity, creator sub price, promo views)

## Remediation vs PRD v4.0 (implemented)

- Moderation transparency: author notify on AI/admin hide/restore; appeals UI (`Settings → Appeals`); appeal outcome notify
- User control: mute entry on profile/post menus; `UserSettings` prefs applied to feed (content rating) + push
- Monetization contracts: one active platform plan enforced; `GET /payments/status`; creator sub list/check/cancel; Elite guard scoped
- Discovery: ProfileEmbedding writer on profile update + `npm run embeddings:backfill`; recommendation signals; poll/QnA create (posts) + display
- Promotions: `PAUSED` / resume; cancel → `CANCELLED` with proportional unused-budget Stripe refund; Ads checkout redirect; feed injects only `ACTIVE`

## Payments / Stripe hardening (Jul 2026)

- Webhooks: `PROCESSED` only after success; `FAILED` + HTTP 5xx on error so Stripe retries; PENDING/FAILED reprocessed (no skip-on-duplicate trap)
- Creator VIP price: canonical `Profile.subscriptionPriceCents` (client `priceCents` ignored); `PATCH /creator/subscription-price`
- Promotion views: viewer JWT required; owner cannot burn own budget; row lock via `FOR UPDATE`
- Admin reject of charged promo triggers proportional refund
- Unlock requires IdentityVerifiedGuard; Checkout return query append safe when URL already has `?`
- Ledger: `PROMOTION_PAYMENT` / `STRIPE_SUBSCRIPTION` / story unlocks; tip/unlock currency **EUR**
- Ops handlers: `checkout.session.expired`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` (revoke unlocks), `account.updated` (Connect capability cache)
- Story PPV: persist `isPremium`/`priceCents`; `StoryUnlock` + `POST /monetization/unlock-story`; feed redacts locked media
- Creator VIP price UI in Creator finance tab (`PATCH /creator/subscription-price`)
- Platform fee: **20%** application fee on Connect tips/unlocks/creator subs

## Production incident (Jul 2026)

After merging feed hydration for `poll` / `qnaBox`, prod returned feed/stories **500** because `polls`, `qna_boxes`, `live_streams`, and message/comment voice columns existed in `schema.prisma` but had **no prior Prisma migration**. Fixed by migration `20260723010000_add_interactive_live_voice_fields` plus hybrid-feed vector reads from `post_embeddings`.

Follow-up: CI runs `scripts/check-prisma-schema-migrations.sh`; catch-up `20260723020000_appeals_profile_embeddings_drop_payouts`; post-deploy API smoke on 5xx.

## Still deferred / out of scope

- Feed-preference domain tables (absent by design in PRD future)
- Live gifts billing (stub only)
- Creator payouts: Stripe Connect Express only (`TransactionType.PAYOUT` removed; no internal payout ledger)

## Doc / source of truth

Documents **01–08** (Abr 2026 origins) remain **partially stale** in places relative to the current `schema.prisma` and backend modules, except where explicitly revised (e.g. **01 PRD v4.0**, **03 API inventory**, **ADR-0001**).

When in doubt: `schema.prisma` → implemented code → API contracts → these markdown files.

## Production infra (current)

- Deploy target: **OVH VPS** via GitHub Actions + `docker-compose.prod.yml` (this is production today).
- **TLS/SSL**: certificates are generated and renewed **on the VPS host**; the compose nginx proxy is HTTP-only behind the host reverse proxy.
- Doc **05-deployment-strategy**: §2 = live OVH topology; Cloudflare/ECS/AWS described only as a **future** target (not in use).
- API inventory regenerated in [03-api-detailed-endpoints.md](./03-api-detailed-endpoints.md) (Jul 2026).
- [ADR-0001](./adr/0001-profile-embedding-retention.md): keep `ProfileEmbedding`; writer on update + backfill script available.
