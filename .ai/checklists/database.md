# Checklist — Database change

A schema edit without a migration has already caused a production outage in this repository. Treat
every box here as load-bearing.

## Process

- [ ] Read the current model in `schema.prisma` before editing — not from memory.
- [ ] Explicit confirmation obtained (schema changes are on the `AGENTS.md` confirmation list).
- [ ] Migration generated and its SQL **read**, not just produced.
- [ ] `npm run prisma:generate` run and every resulting type error fixed via `npm run build`.
- [ ] `npm run prisma:check-migrations` run against an empty database.
- [ ] No already-applied migration edited; a new one was added instead.
- [ ] `prisma/seed.ts` still works with the new shape.

## Modelling

- [ ] `PascalCase` singular model with `@@map` to the snake_case plural table.
- [ ] New non-nullable column has a default or a stated backfill plan.
- [ ] Relations have correct cardinality and a deliberate `onDelete`.
- [ ] Cascade audited: what a `User` hard delete now removes, and whether any personal row is orphaned
      (GDPR deletion depends on this).
- [ ] Real invariants enforced with `@@unique` rather than in application code alone.
- [ ] Money columns are integer cents — no float, no decimal-for-cents.
- [ ] Enum change assessed: adding a value is usually safe; removing or renaming one was traced through
      every comparison and switch.

## Indexes and queries

- [ ] Every new filter, sort and join is index-backed.
- [ ] Composite indexes are in the query's actual column order, not three single-column indexes.
- [ ] No N+1 introduced — no Prisma call inside a loop.
- [ ] No unbounded `findMany` on a user-facing path.
- [ ] `select`/`include` narrowed to the fields actually used, and every caller still gets what it
      needs.
- [ ] Related writes wrapped in `$transaction`.
- [ ] Row locking preserved where the existing code depends on it (for example promotion budget
      consumption).

## Deployment safety

- [ ] Change is backward compatible with the currently deployed image, because
      `prisma migrate deploy` runs at container start.
- [ ] If it is not backward compatible, that is stated and the change is split across releases:
      add → backfill → switch reads → stop writing → drop.
- [ ] Rollback story written, including whether data loss is possible.
- [ ] A fresh `pg_dump` exists before anything destructive.

## Growth and retention

- [ ] For a high-volume table (`InteractionEvent`, `PostView`, `StoryView`, `Notification`,
      `Message`, `AdminAuditLog` class), retention is answered — a cron in `src/maintenance/` or an
      explicit justification for indefinite retention.
- [ ] Vector columns use the pgvector `vector` type consistently with `PostEmbedding` /
      `ProfileEmbedding`.

## Propagation

- [ ] Services and DTOs touching the changed fields updated.
- [ ] `circlesfera-shared/src/` types updated if the field crosses the boundary.
- [ ] Frontend types and components reading the field updated.

## Documentation

- [ ] `02-database-er-diagram.md` updated.
- [ ] ADR added if the modelling decision is durable.
- [ ] Migration notes included in the PR description.
