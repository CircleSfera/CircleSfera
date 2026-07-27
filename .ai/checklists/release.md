# Checklist — Release

Merging to `main` deploys to production (`.github/workflows/deploy.yml`). There is no staging
environment in this repository, so everything here must be true **before** the merge.

## CI

- [ ] Backend `npm run lint` green.
- [ ] Backend `npm test` green.
- [ ] `scripts/check-prisma-schema-migrations.sh` green (no schema/migration drift).
- [ ] Backend `npm run test:e2e` green.
- [ ] Frontend `npm run lint`, `npm test` and `npm run build` green.
- [ ] Playwright `e2e/smoke.spec.ts` green.
- [ ] No CI gate removed or weakened to get here.

## Migrations

- [ ] Backward compatible with the currently deployed image — `prisma migrate deploy` runs at
      container start and both versions briefly coexist.
- [ ] If not backward compatible: the release is split, or the loss of rollback is explicitly accepted
      and stated.
- [ ] Nothing destructive in this deploy without an approved plan.
- [ ] A fresh `pg_dump` exists (the deploy's own dump is best-effort, not a guarantee).

## Environment

- [ ] Every new variable added to `.env.example`.
- [ ] Every new variable added to `ENV_PRODUCTION_B64`.
- [ ] Every new variable wired into the compose service that consumes it.
- [ ] Production fail-fast requirements satisfied: `ENCRYPTION_KEY`, `OPENAI_API_KEY`, LiveKit
      credentials.
- [ ] No secret in a workflow file, image layer, log line or commit.

## Review

- [ ] Money changes reviewed against `.ai/checklists/security.md` money section.
- [ ] Auth and permission changes reviewed.
- [ ] Moderation changes reviewed for transparency and audit obligations.
- [ ] Dependency majors are in their own PR, not bundled with a feature.

## Rollback

- [ ] Rollback path known: previous image SHA on the VPS (`.deploy-sha`), or the feature flag to
      disable.
- [ ] Data-loss window stated if a restore would be required.
- [ ] `runbooks/rollback-deploy.md` still accurate for this change.

## Documentation

- [ ] `CHANGELOG.md` `[Unreleased]` describes user- and operator-visible changes.
- [ ] Affected documents in `circlesfera-documentation/` updated.
- [ ] ADRs added for durable decisions.
- [ ] `05-deployment-strategy.md` updated if the deploy process itself changed.

## Post-deploy verification

- [ ] `GET /api/v1/health` healthy: Postgres, Redis, disk, memory.
- [ ] Smoke endpoints healthy: `/feed/foryou`, `/stories`, `/live/active`, plus the surface changed by
      this release.
- [ ] Sentry shows no new error signature.
- [ ] Slack alert channels quiet.
- [ ] A real user journey through the changed feature completed, including its failure path.
- [ ] Migration applied and the backend is not restart-looping.

## After

- [ ] Anything done manually is recorded — it is a pipeline gap worth fixing.
- [ ] If something went wrong, `.ai/playbooks/incident.md` was followed and a postmortem written.
