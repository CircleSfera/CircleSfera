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
*(No known gaps)*

## Tooling and CI
*(No known gaps)*

## Documentation

| # | Finding | Evidence |
| --- | --- | --- |
| D1 | Docs `01`–`07` are Abr 2026 snapshots patched in Jul 2026; `00-status.md` states they may lag. Prefer schema + controllers. | `00-status.md` |
| D2 | `11-backups-strategy.md` mixes shipped scripts with aspirational WAL/PITR and named S3 buckets. Do not treat the aspirational parts as existing infrastructure. | `11-backups-strategy.md` |


## Maintenance

Add an entry when you find drift you are not fixing, with evidence and a risk note. Remove it in the
PR that fixes it. An entry with no evidence path is not an entry.
