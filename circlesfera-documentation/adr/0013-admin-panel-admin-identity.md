# ADR-0013: Admin Panel — separate Admin Identity

- **Status:** Accepted
- **Date:** 2026-08-12
- **Deciders:** CircleSfera engineering
- **Scope:** backend | frontend | data | infra | trust & safety

## Context

Staff access was `User.role ∈ {ADMIN, MODERATOR, SUPPORT, FINANCE}` on the same platform identity,
with the same `/api/v1/auth/login` cookies and JWT as social users, and the Admin UI at
`circlesfera.com/admin`. Compromising a staff member’s social account therefore compromised the
admin panel. Permissions lived as hardcoded sets in `AdminGuard`, not as persisted RBAC.

## Decision

CircleSfera operates an **Admin Panel** at `admin.circlesfera.com` with a separate **Admin
Identity** (`AdminIdentity`), distinct from platform `User`.

- Admin auth: `/api/v1/admin-auth/*`, cookies `admin_access_token` / `admin_refresh_token`, JWT
  `aud=circlesfera-admin` signed with `JWT_ADMIN_SECRET`.
- MFA (TOTP) is mandatory for operators; platform session never authorizes `/api/v1/admin/*`.
- Authorization is RBAC in Postgres (`AdminRole`, `AdminPermission`, join tables).
- `AdminAuditLog` references `AdminIdentity` (with `legacyUserId` for pre-migration rows).
- Platform `User.role` staff values are deprecated for admin-panel access; apex `/admin` redirects
  to `admin.circlesfera.com` (SPA tabs at `/trust`, `/users`, … — not `/admin/:tab` on that host; Trust is the T&S home).

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep `User.role` + harden MFA only | Does not separate privileged identity from social accounts |
| Separate Vite admin app in v1 | Extra deploy surface; same SPA on subdomain delivers isolation of cookies/sessions first |
| ABAC / regional scopes in v1 | No product requirement yet; permission keys stay string-stable for later scopes |
| Share platform JWT with `aud` claim only | Still ties credentials and refresh tokens to `User` |

## Consequences

**Accepted costs.** Operators need a separate password + MFA enrollment; cutover requires a bootstrap
script and human MFA setup. Two auth stacks to maintain.

**Constraints.** Staff routes must use `AdminJwtAuthGuard` + DB permissions. Do not grant admin-panel
access via `User.role`. Do not set admin cookies on the apex host. New admin env secret
`JWT_ADMIN_SECRET` is required in production.

**What this does not decide.** ABAC, a split `circlesfera-admin` package, `ops.`/`status.` hosts, SOC2.

## Implementation anchors

- `circlesfera-backend/prisma/schema.prisma` — `AdminIdentity`, roles, permissions, `AdminRefreshToken`
- `circlesfera-backend/src/admin-auth/` — login, MFA, sessions
- `circlesfera-backend/src/auth/guards/admin.guard.ts` — RBAC from DB
- `nginx/master.conf.template` — `admin.circlesfera.com`
- `circlesfera-frontend` — host-based Admin Panel router + `adminAuthStore`

## Revisiting

Revisit if a separate admin frontend package is required for XSS blast-radius reduction, or if ABAC
scopes become a compliance requirement.
