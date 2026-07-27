# Playbook — Production incident

Users are affected now. **Mitigate first, understand second.**

Specialists: `incident-commander` → `observability` → `backend`/`frontend` by symptom → `database` →
`qa`. Runbook: `circlesfera-documentation/runbooks/incident-response.md`.

## 0 — Start a timeline

From the first minute, record every observation and action with a timestamp. It becomes the
postmortem, and it prevents two people undoing each other's work.

## 1 — Triage (target: 5 minutes)

- **Symptom:** endpoint or screen, status code, error.
- **Scope:** everyone or a subset; one route or all; since when.
- **Severity:** SEV1 platform down or data at risk / SEV2 major feature broken / SEV3 degraded.
- **Health:** `GET /api/v1/health` — Postgres, Redis, disk, memory.
- **Recent deploy:** the last SHA and its time. `deploy.yml` tags images by SHA and the VPS keeps the
  previous `.deploy-sha`.
- **Migrations:** did `prisma migrate deploy` run at container start, and did it succeed?
- **External:** Stripe, LiveKit, OpenAI, storage, email.

## 2 — Mitigate

Pick the fastest safe option, state which and why:

| Option | When | Caveat |
| --- | --- | --- |
| Roll back the image to the previous SHA | A recent deploy correlates | Does **not** roll back the database. Unavailable if the last migration is not backward compatible. |
| Disable via `FeatureFlag` | The broken path is flag-gated | Fastest and safest when available |
| Forward fix | Small, obvious, testable | Still needs CI; do not hot-patch the server |
| Restore from backup | Data corruption or loss | Last resort; `restore-postgres.md` requires `CONFIRM=YES`; state the data-loss window |

Confirm the symptom is actually gone before declaring mitigation. Then slow down.

## 3 — Root cause

Three hypotheses maximum, ordered by probability, each with evidence for, evidence against, and the
cheapest confirmation. Then confirm with evidence — do not assume the most likely one.

Check these first, based on this system's history:

- Schema present in code without a migration in the deployed database. This exact class of failure
  caused feed and stories to return 500 in Jul 2026 (`00-status.md`).
- A migration that failed at container start, so the backend never came up.
- Redis unavailable while a code path assumed a cache hit.
- Stripe webhooks returning 5xx by design, and the retry storm being a symptom rather than the cause.
- A missing required production env var — production fails fast on `ENCRYPTION_KEY`,
  `OPENAI_API_KEY` and LiveKit credentials.
- A CORS origin or CSRF exclusion change breaking authenticated requests.
- An unbounded query or a hot loop saturating the database, remembering that BullMQ processors share
  the API process.

## 4 — Permanent fix

Follow [`bug.md`](./bug.md) from step 5, with a test that fails without the fix. Ship it through
normal CI. If mitigation left the system in a degraded configuration, restoring it is part of the
fix, not a follow-up.

## 5 — Postmortem

Use [`../templates/postmortem.md`](../templates/postmortem.md). Blameless and specific. It must answer:

- Why did this reach production?
- Which test, review step or CI gate would have caught it?
- Which signal was missing or too noisy to notice?
- What concrete change prevents recurrence — and is it now a work item?

Then update the runbook if the response revealed a gap, and add an entry to
[`../core/known-gaps.md`](../core/known-gaps.md) for anything you found but did not fix.

## Hard rules

- Never run a destructive command on production data without the runbook and explicit confirmation.
- Never make an unrecorded production change.
- Never declare resolution without verifying the symptom.
- Never paste logs containing personal data, tokens or message content into the record.
- Never skip the postmortem.
