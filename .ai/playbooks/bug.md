# Playbook — Bug

For a defect with a known reproduction. If production is broken right now, use
[`incident.md`](./incident.md) instead.

Specialists: `qa` → `backend` or `frontend` (by layer) → `database` → `code-reviewer`.

## 1 — Collect evidence

Gather before theorizing:

- Exact symptom: endpoint or screen, HTTP status, error message, stack trace.
- Reproduction steps, and whether it reproduces locally.
- Who it affects: all users, one role, one plan, one state.
- Since when, and what changed around then — recent commits, migrations, config, env.
- Logs (Pino, structured) and Sentry context.
- The actual request and response, minus secrets.

If you cannot reproduce it, say so and describe what you would need. Do not guess-fix.

## 2 — Read the code path

Follow the real path end to end:

- Frontend: component → hook/query → `src/services/*.service.ts` → `src/services/api.ts`.
- Backend: controller → guard → DTO/`ValidationPipe` → service → Prisma.
- Then the data: the model in `schema.prisma`, the row that triggers it, and whether the column
  actually exists in the deployed database.

Check [`../core/known-gaps.md`](../core/known-gaps.md) — the bug may already be a documented
contradiction.

## 3 — Hypotheses

At most three, ordered by probability. For each: evidence for, evidence against, and the cheapest
check that would confirm or eliminate it.

Frequent causes in this codebase:

- Prisma field or enum present in code but missing a migration in the target database.
- `forbidNonWhitelisted` rejecting a field that has no DTO property.
- Missing CSRF header on a non-GET request, or a 401 refresh loop.
- Missing ownership check, or an ownership check comparing the wrong id.
- Stale or wrongly keyed cache — a cache key missing the viewer dimension.
- Query key not invalidated after a mutation, so the UI shows old data.
- A guard applied at the wrong level, or a moderator route missing declared permissions.
- Money rounding, or a webhook processed twice.
- A missing i18n key rendering as the raw key.

## 4 — Confirm

Confirm the hypothesis with evidence before fixing: a log line, a query, a targeted test, an inspected
row. A fix based on an unconfirmed hypothesis usually creates a second bug.

## 5 — Fix

- Smallest change that addresses the **root cause**, not the symptom.
- No unrelated refactor, no drive-by cleanup.
- Fix the layer where the defect actually is. A backend bug patched in the frontend is a new bug.
- Write the test **first** if practical: it must fail before the fix and pass after.

## 6 — Verify

```bash
cd circlesfera-backend && npm test && npm run build      # backend fix
cd circlesfera-frontend && npm test && npm run build     # frontend fix
npx biome check --write --files-ignore-unknown=true --no-errors-on-unmatched \
  $(git diff --name-only HEAD)   # scoped on purpose; see ../core/quality.md
```

Reproduce the original scenario and confirm it is gone. Then check the neighbours: other callers of
the same code, the adjacent edge cases, and anything that depended on the old (wrong) behaviour.

## 7 — Close

- Was the same mistake made elsewhere? Search for the pattern and say what you found.
- Which test or check would have caught this earlier? Add it if cheap; note it if not.
- Update docs if the bug came from a documented-but-wrong behaviour.
- `CHANGELOG.md` under `[Unreleased]` → Fixed, if user- or operator-visible.

Report: symptom, confirmed root cause with evidence, fix, verification actually run, and residual
risk. If you could not confirm the root cause, say that explicitly instead of implying you did.
