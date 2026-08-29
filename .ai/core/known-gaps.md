# Known gaps and drift

Contradictions found while deriving `.ai/core/` from the repository on **2026-07-27**. They are
recorded here so agents do not mistake them for intentional patterns, and do not "helpfully" change
them without an owner.

**How to use this file:** if your task touches an entry, mention it. If your task *is* an entry, fix
it deliberately with tests and remove the entry in the same PR. Do not batch unrelated fixes.

## Backend

| # | Finding | Evidence | Risk |
| --- | --- | --- | --- |
| B6 | No repository layer, no mappers, no domain event bus. | `rg Repository` in `src/` finds none | Accepted architecture. Listed so agents stop proposing layers. |
| B7 | `StripePayoutLog` is read by Admin payouts and never written. Payments webhooks handle `account.updated` but not `payout.created` / `payout.paid` / `payout.failed`. Creator UI reads Stripe live (`payouts.list`); admin tab will stay empty. | `schema.prisma` `StripePayoutLog`; `admin-stats.service.ts` reads; `rg stripePayoutLog.create` and `rg payout.` in `src/payments` are empty | Ops blind spot, not a money-movement bug. Do not invent a ledger; if filled, webhook-sync from Stripe only (ADR-0002). |

## Frontend

*(No open known gaps — F1 nav height drift and F2 avatar `lg` drift closed in Wave 1 UI foundation, August 2026. See `14-uiux-improvement-roadmap.md`.)*

## Tooling and CI

*(No open known gaps — PR/deploy quality gates unified via `.github/workflows/ci-quality.yml`,
Playwright nightly boots Postgres/Redis/backend and discovers `e2e/**/*.spec.ts`, Dependabot covers
shared/Actions/Docker, and `security.yml` runs CodeQL + informative npm audit as of August 2026.)*

## Documentation

| # | Finding | Evidence |
| --- | --- | --- |
| D1 | Docs `01`–`07` are Abr 2026 snapshots patched in Jul 2026; `00-status.md` states they may lag. Prefer schema + controllers. | `00-status.md` |
| D2 | `11-backups-strategy.md` still documents aspirational WAL/PITR and named S3 buckets alongside shipped scripts. Do not treat the aspirational parts as existing infrastructure. (Phantom `scripts/backup.sh` example removed Aug 2026.) | `11-backups-strategy.md` |
| D3 | `10-roadmap-monetization.md` still mixes shipped Connect/fee with future tense (payout schedule “will be enabled”, Express/Custom, subscriber badges). Prefer ADR-0002 + controllers. | `10-roadmap-monetization.md` §2 vs `stripe.service.ts` `type: 'express'` |


## Maintenance

Add an entry when you find drift you are not fixing, with evidence and a risk note. Remove it in the
PR that fixes it. An entry with no evidence path is not an entry.
