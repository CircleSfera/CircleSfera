# Runbook: Incident response

## Goal

Stabilize production quickly, communicate clearly, and preserve evidence for a postmortem.

## Severity (stub)

- **SEV1:** Auth down, data loss risk, payments incorrectly charging, full outage
- **SEV2:** Major feature broken (feed, chat, live) for many users
- **SEV3:** Degraded performance or limited blast radius

## First 15 minutes

1. Declare an incident owner; stop speculative deploys.
2. Check recent deploys, error rates, and Redis/Postgres health.
3. Mitigate: rollback deploy, feature-flag off, or scale/restart workers as appropriate.
4. If data integrity is at risk, pause writers and prepare backup/restore path (`scripts/backup-postgres.sh`, [restore-postgres](./restore-postgres.md)).
5. Capture timestamps, failing endpoints, and sample request IDs (no secrets in notes).

## After mitigation

- Confirm user-facing recovery with smoke tests.
- Write a short timeline and follow-ups (code, monitoring, runbook gaps).
- Rotate any secrets that may have been exposed.

## Related

- [rollback-deploy](./rollback-deploy.md)
- [SECURITY.md](../../SECURITY.md)
- `circlesfera-documentation/00-status.md`
