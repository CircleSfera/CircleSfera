# Changelog

All notable changes to CircleSfera are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) where version tags exist.

## [Unreleased]

### Changed

- Monetization doc (`10-roadmap-monetization.md`) now describes shipped Connect Express, 20% fee, Admin Retiros, and promotions. Removed future-tense payout schedule, Custom accounts, and subscriber badges presented as current (gap D3)

### Added

- Nightly Postgres analytics CSV export for warehouse load (`scripts/etl/export-analytics-tables.sh`); ClickHouse ingest pending provisioning
- Appeal and support ticket `resolvedAt` with 30-day MTTR on Trust tab (`appealMttr`, `ticketMttr` on `GET admin/trust/queue`)
- Default-off `feed_home_following_first` FeatureFlag seed + [runbook](circlesfera-documentation/runbooks/feed-following-first-experiment.md)
- [ADR-0016](circlesfera-documentation/adr/0016-analytical-warehouse-clickhouse.md): ClickHouse warehouse + nightly ETL (proposed)
- Admin Trust tab shows 30-day median report resolution time (MTTR) from `Report.resolvedAt`, exposed on `GET admin/trust/queue` as `reportMttr`
- Webhook signature accepts a second secret (`STRIPE_CONNECT_WEBHOOK_SECRET`) so a Connected-accounts destination can share `POST /api/v1/payments/webhook`
- Admin Payouts tab can fill from Stripe Connect: webhooks `payout.created` / `updated` / `paid` / `failed` / `canceled` upsert `StripePayoutLog`. CircleSfera does not call `payouts.create` (ADR-0002)
- Home For You can run the existing following feed as treatment under FeatureFlag `feed_home_following_first` (default off; assignment on User.id). No new ranking weights.

### Fixed

- Admin report strike/ban notices now go to the target’s Profile; the strike/ban still writes on User
- Tip and message-unlock payment notices now resolve User ids to primary Profile ids before writing `Notification` rows
- Automated moderation reports and author notices now use a panel operator’s Profile id (`Report.reporterId` / `Notification.senderId`). Strikes increment on the author’s User, and a 3-strike escalation targets that User — the previous User.id-as-reporter path failed the Profile FKs after the identity split
- Admin Users tab no longer labels a linked panel operator as “platform ADMIN (≠ panel)”. Rows and the filter say Operator / Operadores, and that filter matches a linked AdminIdentity instead of the deprecated `User.role`
- EditsStudio Later: export preview + schedule handoff to Create; Roboto Bold/Regular font parity; richer CSS→FFmpeg filters; keyboard J/K/L/E/Esc/zoom; constrained-device 720p encode; cancel e2e
- EditsStudio polish: export cancel + encode preset picker; add/remove timeline tracks; text preset content i18n; AI captions cancel + prerequisite hints
- EditsStudio production hardening: preview/export letterbox fit parity; text export align/box/stroke/shadow; self-hosted `@ffmpeg/core` via `/ffmpeg`; IndexedDB local draft + beforeunload; rename without wiping undo; export all video tracks; `splitClip` respects speed; draft delete cleans clip CDN URLs; export/captions i18n errors
- EditsStudio export/preview fidelity: timeline `startAt` placement, image clips, optional video audio, mute/volume/transform/opacity/flip/filters in FFmpeg export; preview plays video audio and composites overlapping visual layers; AI captions map Whisper times onto trimmed clips; aspect ratio updates export resolution; playhead scrub + track mute/hide/lock; drafts delete; PropertiesPanel i18n; full-screen `/edits` (no app Sidebar); larger mobile timeline; frame-step + fullscreen; removed orphaned `StudioSidebar`
- Creator Studio (`/creator/overview`) crashed with `useState is not defined`: `CreatorShell` used React hooks without importing them
- Native Alerts subscribe no longer 400s with `property endpoint should not exist`: `PushController` type-only-imported the DTO so ValidationPipe had no whitelist. Duplicate toggle clicks, local-subscription rollback, and browser `expirationTime` handling are covered in the same fix
- Settings hub index is centered in the main column after the section rail was hidden on that screen
- Direct messages now appear as soon as they are sent: starting a new conversation no longer requires a page reload to see the first bubble

### Changed

- **EditsStudio (`/edits`)** redesigned as a mobile-first CircleSfera Studio: vertical stack (topbar → preview → timeline strip → tool dock), immersive chrome (no BottomNav, same as `/create`), token-aligned UI, cloud draft autosave with uploaded media URLs, and real AI captions via Whisper (`POST /edits/:id/captions`) with manual cues as fallback
- Creator Studio Ingresos is a single money-in surface: PPV copy + Stripe Connect, ledger, type breakdown, and Connect balances. Wallet tab removed (`?section=wallet` still opens Ingresos). Planes stays a separate tab (creator pays CircleSfera). Platform fee remains Stripe’s 20% application fee.
- Creator Studio cards match Settings: glass panels, sentence-case labels, quiet empty states, and token colours across analytics, wallet, plans, ads, posts, and stories.
- Stripe Checkout, Billing Portal, and KYC Identity return URLs land on `/accounts/billing` and `/accounts/account` (account hub; `/accounts/edit` removed)
- Onboarding aligned with Home: shared brand wash (no opaque black overlay), logo lockup, glass step pills, coral-to-purple primary CTAs, and i18n copy
- Onboarding empty-suggestions state no longer nests a second card; it lists Home/Explore as next places and offers a refresh action
- Appeals, Reports, Monetization, and Invitations settings use the same section hierarchy as Privacy (sentence-case titles, no italic caps, token colours, Spanish copy)
- Guest marketing surface redesigned: `/` hero is product-led (headline + Home `GuestSurfaceMedia` window, brand lockup only in chrome); chapters/principles/FAQ use glass cards instead of document lists; GuestAppChrome has active `NavLink` states and 44px targets; GuestFooter adds signup CTA; Features / Feature detail / Explore / Support / Pricing / Legal share the same language (Stripe checkout and legal body copy unchanged)
- Create composer (`/create`) is an immersive full-viewport page on mobile: no TopNav/BottomNav, no card/modal chrome; gallery and camera are primary; edit/remove controls are always visible; caption uses a single options list; advanced sub-screens push full-screen

### Added

- Account trust signals: Cloudflare Turnstile on register/login, email-verification gate on writes, first-party device hashes for T&S clustering, plaintext signup/last IP retained for account lifetime (admin + GDPR export; not public), public “About this account” facts (including strikes and staff bot labels with appeal), admin trust score and signup funnel metrics — see [ADR-0014](./circlesfera-documentation/adr/0014-account-trust-signals.md)
- Create flow: posts and Frames can be marked **sensitive** (violence, strong language, artistic context) from Advanced settings. Stories have no rating field; explicit sexual content remains prohibited.
- Admin Panel report workflow: my-queue filter, unclaim, claim conflict handling, bulk assignee/`resolvedAt`, Trust assignee preview
- Admin whitelist create API/UI; comments hide via moderation status; Live HLS detail panel wired
- **Admin Panel:** separate `AdminIdentity` + RBAC in Postgres, mandatory MFA, admin JWT (`aud=circlesfera-admin`, cookies `admin_access_*`), hosted at `admin.circlesfera.com`; platform `User.role` no longer grants staff API access
- Global system settings catalog (`maintenance_mode`, `registration_open`, `require_invite_code`, `content_posting_enabled`, `live_streams_enabled`) with admin UI, seed defaults, and runtime enforcement
- Runbook: `circlesfera-documentation/runbooks/admin-panel-cutover.md`; bootstrap script `circlesfera-backend/scripts/bootstrap-admin.ts`
- Shared reusable CI quality workflow (`.github/workflows/ci-quality.yml`) used by PR and deploy; CodeQL + informative npm audit (`.github/workflows/security.yml`); Dependabot for `circlesfera-shared`, GitHub Actions, and Docker base images
- **AI Engineering Framework** under `.ai/`: repo context (`core/`), task router (`orchestrator.md`), 24 specialist roles (`agents/`), 11 workflows (`playbooks/`), 9 done-gates (`checklists/`) and 7 document skeletons (`templates/`). Tool adapters: 11 `.cursor/rules/*.mdc` routers, and `.agents/` for Antigravity (11 workspace rules + 11 `/slash-command` workflows). Verified doc/code drift is recorded in `.ai/core/known-gaps.md`
- ADR-0011: in-repository AI engineering framework under `.ai/` (precedence, alternatives, constraints)
- **P0 security**: required `ENCRYPTION_KEY` (no hardcoded fallback); `src/scripts/reencrypt-messages.ts` (ships in prod image); optional `ENCRYPTION_KEY_LEGACY` decrypt fallback during rotation
- **P0 GDPR**: `scheduledDeletionAt` + unified `DELETE /users/me` / restore; login restores during grace; Settings cancel deletion
- **P0 backups**: `scripts/backup-postgres.sh`, `backup-uploads.sh`, `restore-postgres.sh`; pre-deploy dump in CD
- Role `MODERATOR` + **deny-by-default** `AdminGuard` (`@RequireStaffPermissions` on T&S routes); report claim/REVIEWING/`resolvedAt`/`internalNotes`; warn/suspend/restore (UI + auto-lift cron)
- Cookie consent banner mounted; telemetry gated on analytics consent; expanded GDPR export; retention crons (reports 2y, webhooks 30d); age ≥16 on register (client + server)
- Deploy: SHA image tags, rolling `up --no-deps` (`nginx-proxy`), smoke rollback; Sentry DSN bake; backend e2e on deploy CD
- Frontend 404 (`NotFound`) catch-all route with SEO `noindex`
- Admin invalid-tab redirect (aligned with Creator studio)
- Live broadcast title input before start
- Lazy-loaded heavy routes (EditsStudio, Profile, Frames; lazy Chat panes)
- Root governance files: `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`
- ADRs 0005–0010 (LiveKit, Redis/BullMQ, auth cookies+CSRF, storage providers, feed fan-out, 20% platform fee)
- Ops runbook stubs under `circlesfera-documentation/runbooks/`
- Dependabot + Playwright nightly workflow

### Fixed

- Admin moderation notifications no longer use `AdminIdentity` id as `Notification.senderId` (FK to User); prefer `linkedUserId`
- Appeals admin update uses `@CurrentAdmin` / AdminIdentity audit actor
- Admin deep-links and Cmd+K respect tab permissions; promotions tab permission aligned with API (`content`)
- Report claim/assignee stores `AdminIdentity` (`assignedAdminId`) instead of platform `User` after Admin Panel cutover
- Documentation false negatives: live gifts are billed; feed preferences are implemented
- `08-schema-prisma.md` reduced to a pointer at the live Prisma schema
- Report status audit logged `DISMISSED` for non-RESOLVED (including REVIEWING)
- Duplicate `AllExceptionsFilter` registration in `main.ts`
- Deploy compose service name (`nginx` → `nginx-proxy`)
- Account grace restore used obsolete `deletedAt > now` check; now uses `scheduledDeletionAt`
- Migration `20260727140000` targets `users` table (`@@map`), not `"User"`
- Flaky backend e2e: spec fixtures keyed on `Date.now()` could collide across parallel workers and a `contains`-scoped cleanup deleted another spec's user mid-run (login 500 / profile 401-404). Fixtures now use a random per-spec suffix, cleanups match exact emails, and e2e spec files run sequentially against the shared CI database

### Changed

- Admin Panel home is **Trust** (`/trust`) for T&S ops entry (permission-aware fallback); Trust hub hardened with attention summary and queue deep-links; framing documented as internal control plane (not creator dashboard)
- Admin Panel mobile density: 2-col KPI grids, denser StatCards, responsive analytics chart, tighter detail/filter chrome; dead `xs:` utilities replaced with `sm:`; touch targets ≥44px on segmented controls, filter chips, and firewall sub-tabs
- Apex `/admin` redirects to Admin Panel host; staff notifications resolve via linked `AdminIdentity` instead of `User.role`
- PR and deploy quality gates unified; deploy concurrency queues instead of cancelling mid-rollout; Docker Buildx GHA cache enabled; Playwright discovers all `e2e/**/*.spec.ts` and nightly boots Postgres/Redis/backend (requires `E2E_USER_*` secrets)
- Removed one-off root/backend scratch scripts and committed compile artifacts; docs no longer present `circlesfera-landing/` as an in-tree package
- Root `README.md` technology-stack versions and Node prerequisite corrected against `package.json` and the `node:24` Docker/CI pins
- Empty/error states on Frames, Saved, and Notifications use shared `EmptyState` / `ErrorState`
- Design-system doc notes real brand tokens vs `Button` `blue-600` usage
- Roadmap/status docs mark gap-closure progress and explicit out-of-scope product/ops items
- ReportModal supports COMMENT/STORY/MESSAGE and full reason enum
- nginx `client_max_body_size` aligned to 50m with Nest body parser
