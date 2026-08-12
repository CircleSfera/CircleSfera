# Admin Panel cutover

Executable checklist for moving staff onto `admin.circlesfera.com` + `AdminIdentity`.
**Do not rotate secrets, issue TLS, or run migrate on production without explicit confirmation.**

## Ordered checklist

1. **Backup** — `./scripts/backup-postgres.sh` (failed migrate does not roll back with image rollback).
2. **DNS** — `admin.circlesfera.com` → production VPS A/AAAA.
3. **TLS (host nginx)** — certificate SAN includes `admin.circlesfera.com` (or dedicated cert). Container nginx (`nginx/master.conf.template`) terminates HTTP on :80 for that `server_name`; TLS is typically on the host reverse proxy in front.
4. **Env** — set in `.env.production` / `ENV_PRODUCTION_B64`:
   - `JWT_ADMIN_SECRET` — **distinct** from `JWT_SECRET` (min ~64 chars). Required in production.
   - `CORS_ORIGIN` — include `https://admin.circlesfera.com` (and platform origins), comma-separated.
   - `FRONTEND_URL` / cookie-related settings as already used for the platform.
5. **Deploy** — image that includes migration `20260812210000_admin_panel_admin_identity` (or later AdminIdentity migration present in the release).
6. **Migrate** — `prisma migrate deploy` on backend start / release job. Irreversible without restore from backup.
7. **Bootstrap first SUPER_ADMIN** — identities migrated from `User.role` have an **unusable password placeholder**; they cannot sign in until password is set:

```bash
docker compose exec backend npx ts-node scripts/bootstrap-admin.ts \
  ops@yourdomain.com 'YourLongPasswordHere' 'Ops Lead' SUPER_ADMIN
```

8. **MFA enroll** — open `https://admin.circlesfera.com/login`, sign in, complete authenticator setup (required).
9. **Verify matrix** (below).
10. **Operators** — create / reset additional staff via Admin Panel → Operators (`admins.manage`) or `bootstrap-admin.ts`. Prefer Operators UI for day-2.

## Verify matrix

| Check | Expect |
|-------|--------|
| Platform `circlesfera.com` `/admin` | Redirect to `admin.circlesfera.com/trust` (SPA tabs at root: `/users`, not `/admin/users`) |
| Admin Panel SPA | `https://admin.circlesfera.com/trust` (legacy `/admin/:tab` on admin host redirects to `/:tab`) |
| `POST /api/v1/admin-auth/login` + MFA | Cookies `admin_access_token` / `admin_refresh_token` on admin host |
| Platform user JWT → `/api/v1/admin/*` | 401/403 |
| Admin cookies → `GET /api/v1/admin/stats` | 200 |
| Audit | `ADMIN_LOGIN` (and later operator actions) |
| Operators tab | Lists `AdminIdentity`, not legacy `User.role` staff |

## Nginx / compose notes

- App nginx: `server_name admin.circlesfera.com` in `nginx/master.conf.template` proxies SPA + `/api/v1` + sockets (same pattern as platform).
- Host TLS: ensure SAN/`ssl_certificate` covers `admin.circlesfera.com` before flipping DNS traffic.
- Dev: `docker-compose.dev.yml` passes `JWT_ADMIN_SECRET` (falls back to `JWT_SECRET` only for local convenience — **not** for prod).

## Env reference (examples only)

See root `.env.example`:

- `JWT_ADMIN_SECRET`
- `ADMIN_BASE_URL` / `ADMIN_E2E_*` (local Playwright; not production)
- Frontend bake: `VITE_ADMIN_PANEL_HOST=admin.circlesfera.com` or rely on hostname `admin.*`

## Deprecations

- `scripts/grant-admin.ts` — exits with instructions; use `bootstrap-admin.ts` or Operators UI.
- Setting `User.role` to ADMIN/MODERATOR/SUPPORT/FINANCE — does not grant Admin Panel API access; promote creates `AdminIdentity` instead.

## Production execution (separate confirmation)

Only after explicit OK: set `JWT_ADMIN_SECRET`, issue/renew cert for `admin.circlesfera.com`, migrate deploy, bootstrap first SUPER_ADMIN, manual smoke of verify matrix.
