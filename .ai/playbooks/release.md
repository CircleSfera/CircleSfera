# Playbook — Release

Specialists: `release-manager` → `qa` → `devops` → `documentation`.

**Read this first:** merging to `main` triggers `.github/workflows/deploy.yml`, which deploys to
production. There is no staging environment in this repository. Readiness must be established
**before** the merge, not after.

## 1 — Know what is shipping

- List the commits going out, grouped by user impact.
- Flag the risky categories explicitly: schema migrations, auth changes, payment changes, moderation
  changes, environment changes, dependency majors.
- If the set is large and mixed, split it. Diagnosing a bad deploy that changed twelve things costs far
  more than two deploys.

## 2 — Readiness gate

Every line true, or the exception stated:

1. CI green on the PR: required GitHub checks are **`Run Lint and Unit Tests`** (reusable
   `.github/workflows/ci-quality.yml`: Biome, shared build, backend build/lint/unit/e2e, Prisma
   drift, frontend lint/test/build) and **`Playwright Smoke (unauthenticated)`**. Deploy reuses the
   same quality workflow before building images.
2. Migrations backward compatible with the currently deployed image — `prisma migrate deploy` runs at
   container start and the two versions briefly coexist.
3. Every new env var present in `.env.example`, in `ENV_PRODUCTION_B64`, and in the compose service
   that consumes it. Production fails fast without `ENCRYPTION_KEY`, `OPENAI_API_KEY` and LiveKit
   credentials.
4. Rollback available, or its unavailability stated. An image rollback does **not** revert the
   database.
5. A fresh `pg_dump` exists. The deploy's own dump is best-effort, not a guarantee.
6. Specialist review done for money, auth and moderation changes.
7. `CHANGELOG.md` `[Unreleased]` updated with user- and operator-visible changes.
8. Documentation updated; durable decisions captured as ADRs.
9. Post-deploy smoke covers the changed surface. It currently checks `/health`, `/feed/foryou`,
   `/stories`, `/live/active` — add a route if the change is critical and unchecked.
10. Someone can watch the deploy and act on failure.

## 3 — Sequence risky changes

- Additive migration first, then the code that uses it.
- Never combine a destructive migration with a feature release.
- Ship behind a `FeatureFlag` off; enable after the deploy is healthy.
- Do a fresh backup immediately before anything involving data shape.

## 4 — Deploy

Merge to `main`, then watch the workflow. It will: run the test job, build and push GHCR images tagged
`latest` and the commit SHA, SSH to the VPS, `git reset --hard origin/main`, write `.env.production`
from the secret, attempt a `pg_dump`, `docker compose pull`, bring up `backend`, `frontend` and
`nginx-proxy` with `--no-deps`, poll health, run the API smoke, and roll back to the previous
`.deploy-sha` on failure.

Do not intervene mid-deploy unless the automatic rollback fails. If it does, follow
`circlesfera-documentation/runbooks/rollback-deploy.md`.

## 5 — Post-deploy verification

In order:

1. `GET /api/v1/health` — Postgres, Redis, disk, memory.
2. The smoke endpoints, plus the surface you actually changed.
3. Sentry for a new error signature.
4. Slack alert channels.
5. A real user journey through the changed feature, including its failure path.
6. Migration applied as expected, and no startup loop.

## 6 — If it goes wrong

Switch to [`incident.md`](./incident.md) immediately. Mitigate first: roll back the image, or disable
the flag. Do not debug in production with users affected.

## 7 — Close

- Confirm the changelog reflects what actually shipped.
- Note anything that had to be done manually — that is a gap in the pipeline worth fixing.
- Update `05-deployment-strategy.md` if the process changed.

Close with [`../checklists/release.md`](../checklists/release.md).

## Hard rules

- Never ship red CI, and never weaken a gate to unblock a release.
- Never ship a destructive migration without an approved plan and a verified dump.
- Never claim a release is verified without reading the actual workflow result.
- Never restore or deploy `circlesfera-landing/` (removed Jul 2026).
- Never do an unsupervised risky deploy.
