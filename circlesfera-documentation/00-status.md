# Documentation status

**Last status note:** Aug 2026 — User/Profile identity documentation sync

## Aug 2026 User / Profile identity

- **`User`** = account (email, auth, Stripe, platform plans, trust); **`Profile`** = social identity (`username`, avatar, all content/social FKs)
- JWT session exposes both `userId` (`sub`) and primary `profileId` — see [15-identity-profile-model.md](./15-identity-profile-model.md)
- Admin APIs flatten profile fields to `user.profile.*` for React admin tabs; helpers in `common/utils/user-profile-shape.util.ts`
- ERD §4–12 corrected: social tables use `profileId`, not `userId`; live hosts on `Profile`; reports reporter on `Profile`; assignee on `AdminIdentity`
- **ADR-0015** documents the split; regression smoke: `npm run smoke:profile-drift` (`scripts/validate-profile-drift-smoke.mjs`)

## Aug 2026 Admin Panel

- Separate `AdminIdentity` + DB RBAC; MFA mandatory; admin session cookies on `admin.circlesfera.com`
- Platform `User.role` staff values deprecated for admin-panel access
- Framing: Admin Panel = internal control plane / Trust & Safety ops (not creator analytics); post-login home = **Trust** (`/trust`) when permitted
- Report claim/REVIEWING assignee is `Report.assignedAdminId` → `AdminIdentity` (migration `20260813010000_report_assigned_admin`)
- Report queue: my-queue filter, unclaim, claim conflict, bulk assignee/`resolvedAt`; Trust previews include assignee
- Moderation notifications use `AdminIdentity.linkedUserId` (never raw admin id as `Notification.senderId`)
- Deep-links / command palette gated by `ADMIN_TAB_PERMISSIONS`; promotions tab permission aligned to `content`
- Runbook: [admin-panel-cutover](./runbooks/admin-panel-cutover.md)

## Jul 2026 production closure (verified)

- **Deploy blocker**: CD uses compose service `nginx-proxy` (not `nginx`)
- **Encryption rotation**: `ENCRYPTION_KEY` required; `ENCRYPTION_KEY_LEGACY` decrypt fallback; re-encrypt via `node dist/scripts/reencrypt-messages.js` in the backend image
- **Account deletion**: `scheduledDeletionAt` grace; login restores during window; Settings can cancel; hard-delete cron + BullMQ
- **T&S**: `AdminGuard` deny-by-default for moderators; claim/REVIEWING/notes in Admin UI; warn/suspend/restore + `suspendedUntil` enforced in JWT/login + daily lift cron
- **Compliance**: CookieConsent mounted; telemetry gated; GDPR export includes stories/likes/notifications/settings/appeals/collections/transactions; age ≥16 client+server
- **Migration**: `20260727140000_account_deletion_and_suspension` alters `users` (+ MODERATOR, report queue fields)

## Jul 2026 full roadmap gap-closure

- **P0**: `ENCRYPTION_KEY` required (no insecure fallback); `src/scripts/reencrypt-messages.ts`; unified account deletion (`deletedAt` + `scheduledDeletionAt`); backup/restore scripts; env files synced (`.env`, `.env.production`, backend `.env`/`.env.backup`, examples)
- **Ops**: deploy rolling update + SHA tags + smoke rollback; Sentry bake-time; backend e2e on deploy; nginx body 50m
- **T&S**: `Role.MODERATOR`; report claim/REVIEWING/`resolvedAt`; warn/suspend/restore; ReportModal all target types + reasons; anti-shadowban label
- **Compliance**: cookie consent; GDPR export expanded; retention crons; age ≥16 on register
- **Quality**: Dependabot, Playwright nightly, AdminGuard specs, endpoint hardening
- **Frontend/docs**: 404, lazy routes, ADRs 0005–0010, governance files, runbooks

## Jul 2026 gap-closure (frontend/docs pass)

- **Frontend**: 404 + SEO noindex; Admin invalid-tab redirect; Live title before start; lazy EditsStudio/Profile/Frames/Chat panes; EmptyState/ErrorState on Frames/Saved/Notifications
- **Docs accuracy**: live gifts **are** billed; feed preferences **are** implemented — corrected in 01/02/04/06; `08-schema-prisma.md` is a pointer only
- **Governance**: root `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`
- **ADRs**: 0005 LiveKit, 0006 Redis+BullMQ, 0007 cookies+CSRF, 0008 storage providers, 0009 feed fan-out, 0010 20% platform fee
- **Runbooks**: `circlesfera-documentation/runbooks/` stubs → `scripts/backup-*.sh`, `restore-postgres.sh`

## Jul 2026 closure-to-100% (implemented)

- **Live gifts billing**: Stripe Checkout + `LiveGift` + `TransactionType.DIRECT_LIVE_GIFT` (20% application fee); webhook completion emits `live:gift`; catalog prices server-side (`gift-catalog.ts`)
- **Feed preferences**: `feed_hidden_posts` / `feed_hidden_authors` / `feed_muted_keywords` + `/feed/preferences` API; integrated into hybrid + following feeds; Settings UI + Post menu actions. See [ADR-0004](./adr/0004-feed-preferences.md) (Accepted)
- **Stripe payouts (read-only)**: `GET /monetization/payouts` returns Connect balance available/pending + recent payouts; Creator MonetizationDashboard surfaces them. No internal payout ledger. See [ADR-0002](./adr/0002-stripe-connect-payouts.md)
- **Auth bootstrap (frontend)**: `authStore.checkSession()` validates persisted session via `profileApi.getMyProfile()` on cold start
- **Prod fail-fast**: `OPENAI_API_KEY` + LiveKit credentials required in production (`main.ts` / `AIService` / `LiveService`)
- **Logging**: payments webhooks use Nest `Logger`; unhandled Stripe events → warn + Sentry
- **CI**: backend e2e + Playwright smoke on PRs; deploy runs frontend tests + shared build

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
- Ledger: `PROMOTION_PAYMENT` / `STRIPE_SUBSCRIPTION` / story unlocks / **live gifts**; tip/unlock/gift currency **EUR**
- Ops handlers: `checkout.session.expired`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created` (revoke unlocks), `account.updated` (Connect capability cache)
- Story PPV: persist `isPremium`/`priceCents`; `StoryUnlock` + `POST /monetization/unlock-story`; feed redacts locked media
- Creator VIP price UI in Creator finance tab (`PATCH /creator/subscription-price`)
- Platform fee: **20%** application fee on Connect tips/unlocks/creator subs/**live gifts** — [ADR-0010](./adr/0010-platform-fee-20-percent.md)

## Production incident (Jul 2026)

After merging feed hydration for `poll` / `qnaBox`, prod returned feed/stories **500** because `polls`, `qna_boxes`, `live_streams`, and message/comment voice columns existed in `schema.prisma` but had **no prior Prisma migration**. Fixed by migration `20260723010000_add_interactive_live_voice_fields` plus hybrid-feed vector reads from `post_embeddings`.

Follow-up: CI runs `scripts/check-prisma-schema-migrations.sh`; catch-up `20260723020000_appeals_profile_embeddings_drop_payouts`; post-deploy API smoke on 5xx.

## Still deferred / OUT OF SCOPE

Product/ops gap-closure is **not** “100% of every corporate vision item.” Explicitly **OUT OF SCOPE** for this closure track (remain Later / non-goals unless product reopens them):

- Native mobile apps (React Native / store binaries)
- Communities / forums
- B2B Business Manager
- Public OAuth / third-party developer platform
- SSR indexable profiles
- Subscriber badges as a first-class product surface
- Data warehouse / BI (ClickHouse/BigQuery, executive LTV dashboards)
- SOC2 certification and public bug-bounty program

Also deferred:

- Creator payouts: Stripe Connect Express only — see [ADR-0002](./adr/0002-stripe-connect-payouts.md). Read-only balance UI is shipped; initiating payouts stays in Stripe Express dashboard.

## Doc / source of truth

- Schema: `circlesfera-backend/prisma/schema.prisma` (not `08-schema-prisma.md`)
- ADRs: [adr/README.md](./adr/README.md)
- Runbooks: [runbooks/README.md](./runbooks/README.md)
- Documents **01–07** may still lag in places; prefer code + schema when they conflict.
