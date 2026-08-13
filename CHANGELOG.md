# Changelog

All notable changes to CircleSfera are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/) where version tags exist.

## [Unreleased]

### Added

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
