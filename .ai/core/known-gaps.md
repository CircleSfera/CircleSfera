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

## Frontend

*(No open known gaps — F1 nav height drift and F2 avatar `lg` drift closed in Wave 1 UI foundation, August 2026. See `14-uiux-improvement-roadmap.md`.)*

## Tooling and CI

*(No open known gaps — PR/deploy quality gates unified via `.github/workflows/ci-quality.yml`,
Playwright nightly boots Postgres/Redis/backend and discovers `e2e/**/*.spec.ts`, Dependabot covers
shared/Actions/Docker, and `security.yml` runs CodeQL + informative npm audit as of August 2026.)*

## Documentation

*(No open known gaps — D1 docs 01–07 carry schema-first banners as of Aug 2026; D2 backups doc separates shipped scripts from aspirational PITR in §Future Roadmap.)*


## Maintenance

Add an entry when you find drift you are not fixing, with evidence and a risk note. Remove it in the
PR that fixes it. An entry with no evidence path is not an entry.
