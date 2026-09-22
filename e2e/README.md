# E2E tests (Playwright, repo root)

Journeys against the **live** Vite SPA + Nest + Postgres. Locale `es`. Each authenticated spec
registers its own user (no shared `storageState.json`, no `E2E_USER_*` secrets).

Do **not** stub `**/api/v1/**` here. Isolate Stripe Checkout, LiveKit, and FFmpeg wasm only when
the journey would otherwise hit those vendors. Email verification is confirmed in the same Postgres
the API uses (`e2e/helpers/backend.ts`) because `EmailVerifiedGuard` is on by default and CI has
no inbox.

The SPA-only suite (API stubbed) lives in [`circlesfera-frontend/e2e/`](../circlesfera-frontend/e2e/README.md).
Legacy mock test suites (previously under `e2e/tests/`) have been completely purged;
all active tests in this suite run against live services without skipped or ignored suites.

## Isolated Postgres (recommended locally)

Root Playwright **writes real users and posts** into whatever Nest `DATABASE_URL` points at.
If that is your day-to-day seed DB (`:5432`), the feed fills with `E2E Tester` /
`*@circlesfera.test` and the shared fixture `post-4x5.jpg`.

Use a second Postgres on **`:5433`** instead:

```bash
# 1) Start isolated DB
npm run e2e:db:up

# 2) Apply migrations
npm run e2e:db:migrate

# 3) Run Nest against the e2e DB (example — keep your normal .env for day-to-day)
cd circlesfera-backend
DATABASE_URL="${E2E_DATABASE_URL:-postgresql://prisma:prisma@localhost:5433/circlesfera_e2e?schema=public}" \
  PORT=3005 npm run start:dev

# 4) Playwright (SPA still on :5173; BACKEND_URL / VITE_* must match Nest)
# from repo root
BACKEND_URL=http://localhost:3005/api/v1 npx playwright test --project=chromium
```

Compose file: [`docker-compose.e2e.yml`](../docker-compose.e2e.yml). Default URL:
`postgresql://prisma:prisma@localhost:5433/circlesfera_e2e?schema=public` (also
`E2E_DATABASE_URL` in [`.env.example`](../.env.example)).

Nightly CI already uses a dedicated `circlesfera_e2e` service DB — same idea.

## Cleanup polluted day-to-day DB

If you already ran Playwright against `:5432`:

```bash
# Dry-run (lists matching users / post counts)
npm run e2e:cleanup

# Delete users whose email ends with @circlesfera.test (cascade posts/profiles)
CONFIRM=YES npm run e2e:cleanup
```

Script: `circlesfera-backend/scripts/cleanup-e2e-users.ts`. Uses the process
`DATABASE_URL` (your backend `.env`). Refuses URLs that look non-local. Does **not**
delete seed demos (`SophiaStyle`, etc.) or Vitest `@example.com` accounts.

Orphaned files under local upload storage are left on disk; safe to ignore or prune
manually later.

## Prerequisites

- Nest on `BACKEND_URL` (default `http://localhost:3005/api/v1`)
- Postgres at Nest `DATABASE_URL` (prefer `E2E_DATABASE_URL` / `:5433` for Playwright)
- SPA on `PLAYWRIGHT_BASE_URL` / `BASE_URL` (default `http://localhost:5173`)
- Leave `CLOUDINARY_NAME` unset so uploads use `LocalStorageProvider`. A dummy Cloudinary name
  selects Cloudinary and publish journeys fail.

If `BASE_URL` points at the Nest API (`:3000` / `:3005`), Playwright ignores it and uses
`http://localhost:5173`.

## Specs

| Spec | Notes |
|------|--------|
| `smoke.spec.ts` | Unauthenticated PR gate (landing, login fields, `/health`) |
| `auth.spec.ts` | Login form, bad credentials, UI register → onboarding |
| `happy-path.spec.ts` | Register → onboard → publish JPEG → bio |
| `social.spec.ts` | Like own post on Home |
| `settings.spec.ts` | Account hub + Passkeys copy |
| `chat.spec.ts` | Two unique users, thread + message |
| `creator.spec.ts` / `monetization.spec.ts` | CREATOR studio + Stripe Connect CTA (no Checkout) |
| `live.spec.ts` | Broadcast setup copy; unknown stream leaves the URL |
| `studio.spec.ts` | Edits chrome + import still; wasm hung only to cancel export |
| `support-tickets.spec.ts` | Guest portal + authenticated ticket |
| `admin.spec.ts` | Apex `/admin` → Admin Panel host |
| `admin-panel.spec.ts` | Project `admin-panel`; seeded operator + MFA |

Visible Post media is `circlesfera-frontend/e2e/fixtures/post-4x5.jpg` (not a solid colour).

## Commands

```bash
# PR gate (auth-free)
npm run test:e2e -- e2e/smoke.spec.ts

# Chromium journeys (needs Nest + Postgres; skips Admin Panel MFA)
npx playwright test --project=chromium

# Admin Panel login smoke (API running; seed applied)
npx playwright test --project=admin-panel

# All projects
npm run test:e2e
```

## Admin Panel MFA

Local seed creates operators with **MFA enrollment pending**. First login shows the QR; Playwright
reads the on-screen secret when present.

| Variable | Default / meaning |
|----------|-------------------|
| `ADMIN_E2E_EMAIL` | `admin@circlesfera.com` |
| `ADMIN_E2E_PASSWORD` | `password123` |
| `ADMIN_E2E_FORCE_TOTP` | unset — leave MFA to enrollment; `1` pre-enrolls fixed secret |
| `ADMIN_E2E_TOTP_SECRET` | used only when `ADMIN_E2E_FORCE_TOTP=1` |
| `ADMIN_BASE_URL` | `http://admin.localhost:5173` |

Backend must accept cookies from `admin.localhost` (CORS / cookie domain). Vite allows that host via
`server.allowedHosts`.
