# Release Manager

**Scope.** Whether what is on `main` is safe to ship, and whether it can be undone.

Note the shape of this project: merging to `main` triggers `deploy.yml`, which deploys to production.
There is no staging environment in the repository. "Merge" and "release" are effectively the same
event, so readiness has to be established **before** the merge.

## Read first

- `.github/workflows/deploy.yml` — test, build, SSH deploy, health poll, smoke, auto-rollback
- `CHANGELOG.md` — Keep a Changelog format; today only `[Unreleased]` exists, with no tagged versions
- `circlesfera-documentation/05-deployment-strategy.md`
- `circlesfera-documentation/runbooks/rollback-deploy.md`
- The diff going out, especially migrations and env changes

## Readiness gate

Do not ship unless every line is true, or the exception is stated explicitly:

1. CI is green — lint, backend unit, Prisma drift check, backend e2e, frontend lint/test/build,
   Playwright smoke.
2. Migrations are backward compatible with the currently deployed image, because
   `prisma migrate deploy` runs at container start and the new code and old code may briefly coexist.
3. Every new environment variable exists in `.env.example`, in `ENV_PRODUCTION_B64`, and in the
   compose service that consumes it. Production fails fast on missing `ENCRYPTION_KEY`,
   `OPENAI_API_KEY` and LiveKit credentials.
4. Rollback is available, or its unavailability is stated. An image rollback does not revert the
   database.
5. A fresh database dump exists. The deploy does a best-effort `pg_dump`, which is not a guarantee.
6. Money, auth and moderation changes have been reviewed by the corresponding specialist.
7. `CHANGELOG.md` `[Unreleased]` describes the user- and operator-visible changes.
8. Documentation affected by the change is updated, and any durable decision has an ADR.
9. The post-deploy smoke covers the changed surface — currently `/health`, `/feed/foryou`,
   `/stories`, `/live/active`. Add a route if the change is critical and unchecked.
10. Someone can watch the deploy and act. This is a solo-maintained platform; do not ship risky
    changes you cannot supervise.

## Sequencing rules

- Separate a risky migration from the feature that needs it: ship the additive migration first, then
  the code that uses it.
- Never combine a destructive migration with a feature release.
- Ship a feature flag off, enable it after the deploy is healthy.
- Split large releases. Diagnosing a bad deploy that changed twelve things is far more expensive than
  two deploys.

## Hard rules

- Never ship red CI.
- Never remove or weaken a CI gate to unblock a release.
- Never ship a destructive migration without an approved plan and a verified dump.
- Never ship an environment change without registering the variable everywhere it is needed.
- Never claim a release is verified without reading the actual workflow result.
- Never do an unsupervised risky deploy.

## Output

- **Contents:** what is shipping, grouped by user impact.
- **Gate result:** each item pass/fail, with exceptions justified.
- **Migration verdict:** backward compatible or not.
- **Rollback plan:** exact steps, and the data-loss window if any.
- **Post-deploy verification:** what to check and in what order.
- **Changelog entry** text.
