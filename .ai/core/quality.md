# Quality bar

What "done" means here. Gates that are checkable, plus the judgement calls that CI cannot make.

## Definition of done

A change is done when all of the following are true:

1. It compiles and typechecks.
2. Lint and format pass **for the files you touched** (see the scoped Biome command below — the
   unscoped root `npm run check` rewrites unrelated files, gap T1 in `known-gaps.md`).
3. Relevant tests pass, and new behaviour has at least one test that would fail without the change.
4. Contracts hold: DTOs, Prisma models, API responses and frontend types agree.
5. Authorization is explicit for every touched endpoint, including ownership.
6. No secret, token or personal data added to logs, errors or responses.
7. Docs updated when behaviour or contracts changed; an ADR added if the decision is durable.
8. The summary states exactly what changed, what was verified how, and what risk remains open.

Claiming any of 1–3 without running it violates `AGENTS.md`. If you could not run something, say so.

## Verification commands

```bash
# root — scope Biome to what you changed. The unscoped `npm run check`
# (biome check --write .) reformats 7 pre-existing files no CI job covers (gap T1).
BIOME="npx biome check --write --files-ignore-unknown=true --no-errors-on-unmatched"

$BIOME $(git diff --name-only HEAD)                              # working tree
$BIOME $(git diff --name-only $(git merge-base HEAD origin/main) HEAD)  # whole branch

# backend
cd circlesfera-backend
npm run lint && npm test
npm run build                    # the only real backend typecheck
npm run test:e2e                 # needs Postgres + Redis
npm run prisma:check-migrations  # schema/migration drift, needs an empty Postgres

# frontend
cd circlesfera-frontend
npm run lint && npm test
npm run build                    # tsc -b && vite build -> the frontend typecheck gate

# e2e (root)
npm run test:e2e -- e2e/smoke.spec.ts
```

PR and deploy share `.github/workflows/ci-quality.yml`, which runs root Biome, backend
`build` + `lint` + unit + e2e, Prisma drift check, and frontend `lint` + `test` + `build`. PRs also
run Playwright smoke. Prefer those gates over a weaker local subset when you touch CI-relevant
code.

## Hard limits

- **Size:** no giant functions or components. If a React component approaches ~300 lines or a
  service method spans multiple responsibilities, split it. The repo already decomposes heavy
  surfaces (`src/components/post/*`, `src/components/create-post/*`) — follow that.
- **Duplication:** do not add a second implementation of something that exists. Search first;
  `src/common/`, `src/services/`, `src/hooks/` and `src/components/ui/` are where reuse lives.
- **Every external input validated:** a request field without a decorated DTO property is rejected
  by `forbidNonWhitelisted`, so "it works" and "it is validated" are the same test here — do not
  work around it by loosening the pipe.
- **Every endpoint authorized:** a guard, plus an ownership or role check in the service where
  applicable. No implicit trust in a client-supplied `userId`.
- **No `any` added** unless you can justify it in the PR description.
- **No new dependency** without explicit confirmation (`AGENTS.md`).
- **No schema change without a migration**, and CI will catch drift
  (`scripts/check-prisma-schema-migrations.sh`). Production already broke once from
  schema-without-migration — see the Jul 2026 incident note in `00-status.md`.

## Testing expectations

Write tests that would catch a real regression:

- Business rules in services: ownership rejection, gating, state transitions, money math.
- Guards: allow and deny paths (`src/auth/guards/admin.guard.spec.ts` is the model).
- Webhooks and money flows: idempotency, failure retry, refund/revoke paths.
- Frontend: user-visible behaviour through Testing Library, not implementation internals.

Do not write tests that only assert your own mocks. If you skip tests, say why in the summary.

## Performance expectations on hot paths

Feed, chat, stories, search, profile and notification reads. Before shipping a change there, check:

- No N+1: batch with `include`/`select` or a single query; do not loop Prisma calls per item.
- Filters and sorts are index-backed — verify in `schema.prisma`, do not assume.
- `select` only the fields used; avoid returning whole rows to the client.
- Pagination is bounded; no unbounded `findMany`.
- Anything slow, external or fan-out shaped goes to a BullMQ queue.
- Cache reads have an explicit TTL and a documented invalidation path.

## Security expectations

- Cookie-based auth stays cookie-based; CSRF exclusions are a deliberate list in `src/main.ts` —
  do not extend it casually.
- Admin/moderation surfaces stay deny-by-default; moderator routes declare explicit permissions.
- Money endpoints keep `IdentityVerifiedGuard` where it already applies.
- Never log request cookies or authorization headers (Pino redacts them; do not undo that).
- Chat content stays encrypted through `CryptoService`.

## Observability expectations

If you touch critical logic, make failures diagnosable: structured Pino logs with useful context
and no sensitive fields, meaningful exception types so `AllExceptionsFilter` classifies correctly,
and 5xx reaching Sentry/Slack rather than being swallowed.

## Review lens

The reviewer asks, in order: is it secure, is it correct, is it the simplest thing that works, does
it match existing patterns, is it tested, is it observable, and could another developer change it
next month without archaeology. Anything answered "no" needs a reason in the PR description.
