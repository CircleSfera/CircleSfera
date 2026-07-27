# Runbook: Rollback deploy

## Goal

Revert production to the last known-good deployment after a bad release.

## Prerequisites

- Access to GitHub Actions / deploy secrets for the OVH VPS path
- Identify the last good commit or image tag

## Steps (stub)

1. Confirm blast radius (API 5xx, frontend blank, migration failure, payment errors).
2. Prefer rolling forward with a hotfix if the failure is a one-line config/env issue.
3. Otherwise redeploy the previous good git SHA via the existing deploy workflow (`.github/workflows/deploy.yml`).
4. If a Prisma migration already applied and is unsafe to leave, stop and escalate — do not invent destructive SQL; use a prepared reverse migration only when one exists.
5. Verify health endpoints and a short smoke checklist (login, feed, upload, Stripe webhook path).

## Related

- `.github/workflows/deploy.yml`
- `circlesfera-documentation/05-deployment-strategy.md`
- [restore-postgres](./restore-postgres.md) if data corruption is involved
