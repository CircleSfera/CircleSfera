# Sources of truth

Precedence is defined in [`AGENTS.md`](../../AGENTS.md) ("Fuente de Verdad"). This file does not
restate it — it maps *which question is answered by which artifact*, so an agent can stop guessing
and go read the right file.

## Where the answer lives

| Question | Read this | Notes |
| --- | --- | --- |
| What data exists? Fields, relations, indexes, enums | `circlesfera-backend/prisma/schema.prisma` | Single file, 1652 lines, 65 models, 27 enums. Canonical. |
| What migrations shipped? | `circlesfera-backend/prisma/migrations/` | 62 migrations, first `20260206213507_init`. Drift check: `scripts/check-prisma-schema-migrations.sh` |
| What endpoints exist? | `circlesfera-backend/src/**/*.controller.ts` | Inventory snapshot: `circlesfera-documentation/03-api-detailed-endpoints.md` (generated Jul 2026, additive sync). Controllers win. |
| What business rules apply? | The service that owns the domain, e.g. `src/posts/posts.service.ts` | Ownership and gating are enforced in services, not in a shared layer. |
| Why was it built this way? | `circlesfera-documentation/adr/` | 10 accepted ADRs. Includes fee split, auth cookies, fan-out, storage, LiveKit. |
| What is the product supposed to be? | `circlesfera-documentation/01-product-requirements-document.md` | PRD v4.0 (Jul 2026). |
| What is in and out of scope right now? | `circlesfera-documentation/00-status.md` | Has an explicit OUT OF SCOPE list. Check it before proposing features. |
| What are the design tokens? | `circlesfera-frontend/src/index.css` | `:root` + Tailwind v4 `@theme`. `09-design-system.md` is the narrative layer and already flags where it diverges. |
| How is it deployed? | `.github/workflows/deploy.yml`, `docker-compose.prod.yml`, `nginx/master.conf.template` | Narrative: `05-deployment-strategy.md`. |
| How do we operate an incident? | `circlesfera-documentation/runbooks/` | `incident-response.md`, `rollback-deploy.md`, `restore-postgres.md`. |
| What types cross the boundary? | `circlesfera-shared/src/` | Partial: 5 enums, 20 model interfaces, 7 DTO interfaces. Not generated from Prisma. |
| What does CI enforce? | `.github/workflows/pr.yml` | The real definition of "green". |

## Rules for agents

1. **Never state a schema fact from memory.** Read `schema.prisma`. Enum values, nullability and
   index shape are load-bearing and change often.
2. **Never infer an endpoint.** Grep the controller. The global prefix is `api/v1`
   (`src/main.ts`, `setGlobalPrefix('api/v1')`).
3. **A documented behaviour that the code contradicts is a documentation bug.** Fix the doc, flag
   it, and never "fix" the code to match the doc without explicit confirmation.
4. **`.ai/` is derived.** If a statement in `.ai/core/` cannot be traced to code, schema, config or
   an ADR, treat it as suspect and verify before acting on it.
5. **When two canonical sources disagree**, stop and report the conflict with both file paths
   instead of picking one. `AGENTS.md` requires making the inconsistency explicit.

## Freshness

The `.ai/core/` files were verified against the repository on **2026-07-27**. Anything that
changes the following must be reflected here in the same PR:

- `schema.prisma` models or enums
- dependency major versions in any `package.json`
- auth, CSRF, guard or rate-limit configuration
- the 20% platform fee, plan names, or gating decorators
- CI workflow steps that define the quality gate
