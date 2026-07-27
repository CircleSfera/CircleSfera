# CircleSfera — global engineering rules

Activation: **Always On**.

CircleSfera is a production social platform: NestJS 11 API, React 19 SPA, PostgreSQL + Prisma 7,
Redis, Stripe. Real users, real content, real money. Nothing here is a demo.

`AGENTS.md` at the repo root outranks this rule. The `.ai/` framework is the operational layer under
it, never a workaround for it.

## Before changing code

1. Read the owning module: service, DTOs, tests, and the Prisma models involved. Business rules live
   in services here, so reading a controller tells you almost nothing.
2. Never state a schema fact from memory. `circlesfera-backend/prisma/schema.prisma` is canonical
   (65 models, 27 enums). Never infer an endpoint — grep the controller.
3. Check `circlesfera-documentation/00-status.md` for the explicit OUT OF SCOPE list before
   proposing anything new.
4. Name the blast radius: schema, migrations, API contract, auth, cache keys, queues, sockets, i18n
   keys, tests, docs, money flows.

## Priority order when principles conflict

Security and privacy → correctness → simplicity → scalability → performance → maintainability → UX.

## Never

- Invent a model, endpoint, enum, relation, permission or flow that is not in the code or schema.
- Edit `schema.prisma` without a migration in the same commit. This has already caused a production
  outage.
- Weaken a guard, validation rule, throttle or CSRF exclusion to make something work.
- Move an authorization decision to the client, or trust a client-supplied amount, price or
  entitlement.
- Log or return a secret, token, cookie, message plaintext, payment payload or personal data.
- Add a dependency, change the schema, change auth/permissions/monetization, delete code or
  endpoints, or touch infrastructure and secrets without explicit confirmation.
- Claim a check you did not run, or alignment you did not verify.

## Reporting

Separate verified fact, reasonable inference and proposal. State what you ran, with real output, and
what risk remains open. Say what you do not know.

## Canonical context

@/AGENTS.md
@/.ai/core/principles.md
@/.ai/core/sources-of-truth.md
@/.ai/core/known-gaps.md

Read `known-gaps.md` before "fixing" something that looks wrong. Some of it is known, deliberate, or
load-bearing.
