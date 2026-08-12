# E2E tests (Playwright)

## Suites

| Spec | Project | Base URL | Notes |
|------|---------|---------|--------|
| `e2e/admin.spec.ts` | `chromium` | `PLAYWRIGHT_BASE_URL` / SPA `BASE_URL` (default `http://localhost:5173`) | Apex `/admin` → Admin Panel redirect |
| `e2e/admin-panel.spec.ts` | `admin-panel` | `ADMIN_BASE_URL` (default `http://admin.localhost:5173`) | Login + MFA + smoke `/trust`, `/users`, `/reports` |

If `BASE_URL` points at the Nest API (`:3000` / `:3005`), Playwright ignores it and uses `http://localhost:5173`. Set `PLAYWRIGHT_BASE_URL` to pin the SPA origin.

## Admin Panel MFA

Local seed creates operators with **MFA enrollment pending**. First login shows the QR; Playwright reads the on-screen secret when present.

Optional CI shortcut (do **not** use for human local accounts — it overwrites Authenticator):

| Variable | Default / meaning |
|----------|-------------------|
| `ADMIN_E2E_EMAIL` | `admin@circlesfera.com` |
| `ADMIN_E2E_PASSWORD` | `password123` |
| `ADMIN_E2E_FORCE_TOTP` | unset — leave MFA to enrollment; `1` pre-enrolls fixed secret |
| `ADMIN_E2E_TOTP_SECRET` | used only when `ADMIN_E2E_FORCE_TOTP=1` |
| `ADMIN_BASE_URL` | `http://admin.localhost:5173` |

```bash
# Apex redirect only
npx playwright test --project=chromium e2e/admin.spec.ts

# Admin Panel login smoke (API must be running; seed applied)
npx playwright test --project=admin-panel

# All
npm run test:e2e
```

Backend must accept cookies from `admin.localhost` (CORS / cookie domain). Vite allows that host via `server.allowedHosts`.
