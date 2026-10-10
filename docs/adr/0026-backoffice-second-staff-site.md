# ADR-0026: Backoffice — a second staff site on the same app

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** CircleSfera owner, engineering
- **Scope:** frontend | backend | infra | trust & safety

## Context

The Admin Panel at `admin.circlesfera.com` (ADR-0013) holds everything staff do: protecting the
community, running the platform and running the business. The business part is growing (platform
plans, creator payouts, promotions, support), needs different people and permissions, and has
nothing to do with sanctioning participants. The DNS record `backoffice.circlesfera.com` exists.

## Decision

CircleSfera operates a second staff site, the **Backoffice**, at `backoffice.circlesfera.com`.

- **Split by job.** The Admin Panel protects the community and runs the platform. The Backoffice
  runs the business. Rule for a new section: if the action can sanction someone or remove content
  it belongs in the Admin Panel; if it moves money or talks to customers it belongs in the
  Backoffice.
- **Same app, chosen by host.** The frontend renders the Backoffice when the host is the
  Backoffice host, as it renders the Admin Panel on its host. One build, one deploy, one API.
- **Same staff identity.** Operators sign in with their `AdminIdentity` and mandatory MFA through
  `/api/v1/admin-auth/*`. A participant session never opens the Backoffice, and staff access never
  uses `User.role`.
- **Sessions per site.** Staff cookies are host-only, so a session belongs to the site that
  created it. Signing in to one site does not open the other.
- **Same RBAC and audit log.** Every Backoffice route is under `/api/v1/admin/*` with
  `AdminJwtAuthGuard` and a permission from Postgres; every change is written to `AdminAuditLog`.
  New sections get their own permission key.
- **Same server.** A server block for the host in `nginx/master.conf.template`, identical to the
  Admin Panel block except for the server name, and the host in the origins the backend allows.

## Alternatives considered

| Option | Why not |
| --- | --- |
| One panel with two areas in its navigation | Works with one operator, but the sections move twice once roles split, and a session keeps reaching both areas |
| A separate frontend package for the Backoffice | A second build and deploy for screens that share the staff shell, the API client and the session code |
| One staff session for both sites (cookie on the parent domain) | A staff cookie on `circlesfera.com` would reach the participant app; host-only cookies are a constraint of ADR-0013 |
| Finance screens in the Backoffice (ledger, refunds, exports) | The payment provider's dashboard already does them with roles and an audit trail; the Backoffice links to it |
| A helpdesk of our own | Support tickets stay as they are at low volume; beyond that the answer is a contracted tool |

## Consequences

**Accepted costs.** An operator who needs both sites signs in twice. Two staff entry points to
keep working, each with its post-deploy check. With one operator the split brings order, not
extra security; the security gain arrives with separate roles.

**Constraints.** Do not set staff cookies on the parent domain. A section lives in one site only:
it moves in one change that adds it to one and removes it from the other, with its permission
checks and tests. Prices and payment provider identifiers are never edited from a form.

**What this does not decide.** Network restrictions for staff sites, ABAC or regional scopes, team
access to a Profile, and a contracted helpdesk.

## Implementation anchors

- `circlesfera-frontend/src/utils/adminPanel.ts` — host detection for both staff sites
- `circlesfera-frontend/src/pages/backoffice/` — the Backoffice
- `circlesfera-backend/src/admin-auth/`, `src/auth/guards/admin.guard.ts` — staff session and RBAC
- `nginx/master.conf.template` — `backoffice.circlesfera.com`

## Revisiting

Revisit if staff sites need a network restriction, or if the Backoffice needs a deploy cadence of
its own.
