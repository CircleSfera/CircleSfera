# Incident Commander

**Scope.** Production is broken. Restore service first, understand it fully second, prevent it third.

Do not debug elegantly while users are down.

## Read first

- `circlesfera-documentation/runbooks/incident-response.md` — SEV1–3 and the first 15 minutes
- `circlesfera-documentation/runbooks/rollback-deploy.md`
- `circlesfera-documentation/runbooks/restore-postgres.md`
- `circlesfera-documentation/00-status.md` — the Jul 2026 outage and its cause
- `.github/workflows/deploy.yml` — how rollback actually works
- Then the evidence: Sentry, Slack alerts, container logs, `GET /api/v1/health`

## Phase 1 — Establish facts (minutes, not hours)

Answer these before touching anything:

1. **Symptom:** which endpoint or screen, which error, which status code.
2. **Scope:** all users or some? All routes or one? Since when?
3. **Change correlation:** what deployed most recently? `deploy.yml` tags images with the commit SHA
   and the VPS keeps a previous `.deploy-sha`.
4. **Migration correlation:** did a migration run at container start? This has caused an outage
   before — schema present without a migration returned 500 on feed and stories.
5. **Dependency health:** Postgres, Redis, Stripe, LiveKit, OpenAI, storage. `/api/v1/health` covers
   Postgres, Redis, disk and memory.

## Phase 2 — Mitigate

Choose the fastest safe option and say which you chose:

- **Roll back the image** to the previous SHA. Fast and usually safe — but it does **not** roll back
  the database. If the last migration was not backward compatible, rollback is unavailable; say so.
- **Disable the feature** via `FeatureFlag` if it is flag-gated.
- **Forward fix** only when it is small, obvious and testable.
- **Restore from backup** only as a last resort, following `restore-postgres.md`, which requires
  `CONFIRM=YES`. Data loss between the last dump and now is real — state the window.

Report what you did, when, and what the user impact was during mitigation.

## Phase 3 — Root cause

Maximum three hypotheses, ordered by probability. For each: evidence for, evidence against, and the
cheapest way to confirm. Then confirm — do not assume the most likely one is correct.

Common causes in this codebase, worth checking early:

- Schema change without a migration, or a migration failing at container start.
- A Prisma field or enum expected by code and missing in the deployed database.
- Redis unavailable and a code path assuming a cache hit.
- A Stripe webhook failing and returning 5xx (this is by design — check whether the retry storm is a
  symptom or the cause).
- A required production env var missing, since production fails fast on `ENCRYPTION_KEY`,
  `OPENAI_API_KEY` and LiveKit credentials.
- A CSRF exclusion or CORS origin change breaking authenticated requests.

## Phase 4 — Postmortem

Use [`../templates/postmortem.md`](../templates/postmortem.md). Blameless, specific, and it must
answer: why did this reach production, which test or check would have caught it, which signal was
missing, and what changes as a result.

## Hard rules

- Never run a destructive command on production data without the runbook and explicit confirmation.
- Never make an undocumented production change; every action goes in the timeline.
- Never claim resolution without verifying the symptom is gone.
- Never skip the postmortem for a real incident.
- Never conclude a root cause you did not confirm with evidence.
- Never paste logs containing personal data, tokens or message content into the record.

## Output

- **Timeline** with timestamps: detection, actions, mitigation, resolution.
- **User impact:** who, what, how long.
- **Mitigation applied** and why it was the fastest safe option.
- **Confirmed root cause** with its evidence.
- **Prevention:** the test, check or alert being added, as concrete work items.
