# Checklist — Pull request

Run on every change.

## Scope

- [ ] The diff does one thing. Unrelated refactors, formatting and cleanup are not mixed in.
- [ ] Schema, auth/payments and large UI changes are split into their own PRs (`CONTRIBUTING.md`).
- [ ] Nothing on the `AGENTS.md` confirmation list was done without explicit confirmation: schema,
      public API contracts, auth/permissions/monetization, deletions, critical business logic, new
      dependencies, infrastructure/deploy/secrets, destructive data operations.

## Correctness

- [ ] The change does what the description claims, including the error paths.
- [ ] Contracts agree: DTO, Prisma model, API response, `circlesfera-shared` types, frontend service.
- [ ] Any breaking contract change is called out explicitly and the frontend is updated in the same
      release.
- [ ] No `schema.prisma` edit without a migration in the same commit.

## Security

- [ ] Every touched endpoint has an explicit authorization decision.
- [ ] Ownership is checked in the service for every mutation of user-owned data.
- [ ] No privileged field (`role`, `verificationLevel`, `isPremium`, `priceCents`,
      `moderationStatus`) is settable from a client DTO.
- [ ] No secret, token, cookie, message plaintext, payment payload or personal data in logs, errors or
      responses.
- [ ] No guard, validation rule, throttle or CSRF exclusion weakened.

## Quality

- [ ] `npm run check` passes at the root.
- [ ] Backend: `npm run lint`, `npm test`, `npm run build` pass (build is the real typecheck).
- [ ] Frontend: `npm run lint`, `npm test`, `npm run build` pass.
- [ ] Backend `npm run test:e2e` run if the API contract changed.
- [ ] At least one test fails without this change.
- [ ] Deny paths tested, not only happy paths.
- [ ] No `.skip`, no `.only`, no weakened assertion.
- [ ] No new `any`, no ignored TypeScript error, no debug `console.log`, no commented-out block.

## Conventions

- [ ] Backend relative imports carry the `.js` extension.
- [ ] User-facing strings go through i18n, with keys in **both** `en.json` and `es.json`.
- [ ] Money is integer cents.
- [ ] Files, names and placement match the module's existing pattern.
- [ ] Reused what exists (`src/common/`, `src/services/`, `src/hooks/`, `src/components/ui/`) instead
      of adding a parallel implementation.

## Documentation

- [ ] Behaviour or contract change reflected in `circlesfera-documentation/`.
- [ ] Durable decision captured as an ADR and listed in `adr/README.md`.
- [ ] `CHANGELOG.md` `[Unreleased]` updated for user- or operator-visible changes.
- [ ] Drift found but not fixed logged in `.ai/core/known-gaps.md` with evidence.

## Hygiene

- [ ] No secrets, `.env` files or `storageState.json` staged.
- [ ] `package-lock.json` committed if dependencies changed.
- [ ] Commit messages are imperative and explain **why**.

## Report

- [ ] Summary states: what changed, what was verified and how (with real output), what is deferred,
      what risk remains open.
- [ ] Verified fact, inference and proposal are clearly separated.
