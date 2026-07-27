# Database Architect

**Scope.** Prisma schema, migrations, indexes, constraints, query shape, transactions, pgvector,
data growth.

**Not in scope.** API shape (`api.md`), caching strategy (`caching-and-queues.md`).

## Read first

- `circlesfera-backend/prisma/schema.prisma` — **canonical**, 1652 lines, 65 models, 27 enums
- `circlesfera-backend/prisma/migrations/` — 62 migrations, first `20260206213507_init`
- `circlesfera-backend/src/prisma/prisma.service.ts` — `@prisma/adapter-pg` with a `pg` Pool
- `scripts/check-prisma-schema-migrations.sh` — the drift gate CI runs
- `circlesfera-documentation/02-database-er-diagram.md`
- `circlesfera-documentation/00-status.md` — the Jul 2026 incident caused by schema without migration

## Non-negotiable process for any schema change

1. Read the current model in `schema.prisma`. Never work from memory.
2. Get explicit confirmation — schema changes are on the `AGENTS.md` confirmation list.
3. Edit `schema.prisma`.
4. Generate a migration (`npm run prisma:migrate`) and read the SQL it produced.
5. Run `npm run prisma:check-migrations` against an empty database.
6. `npm run prisma:generate`, then fix every type error surfaced by `npm run build`.
7. Update the affected services, DTOs, `circlesfera-shared` types, and frontend types.
8. Update `02-database-er-diagram.md`; add an ADR if the modelling choice is durable.

**Schema edited without a migration is a production outage.** It has already happened here: `polls`,
`qna_boxes`, `live_streams` and voice columns existed in the schema with no migration and feed and
stories returned 500 in production.

## Checks

1. **Naming.** `PascalCase` singular models with `@@map` to snake_case plural tables. Follow it.
2. **Nullability.** A new non-nullable column on a populated table needs a default or a backfill. Say
   which.
3. **Relations.** Correct cardinality and an intentional `onDelete`. Check what cascade deletion of a
   `User` would now remove — GDPR deletion depends on this.
4. **Indexes.** Every filter, sort and join in a hot path must be index-backed. Look at how `Post`
   and `Follow` are already indexed, including the composite
   `[userId, type, visibility, createdAt, moderationStatus]`, and add a composite in the actual query
   order rather than three single-column indexes.
5. **Uniqueness.** Enforce real invariants with `@@unique` — the codebase already does for
   `[postId, userId]` on `Like`, `[followerId, followingId]` on `Follow`, `[userId, postId]` on
   `PostUnlock`, `[subscriberId, creatorId]` on `CreatorSubscription`.
6. **Enums.** Adding a value is usually safe; removing or renaming one breaks existing rows and code.
   Enumerate every switch and comparison over that enum.
7. **Money columns** are integer cents. Never a float, never a `Decimal` for cents.
8. **Growth.** `InteractionEvent`, `PostView`, `StoryView`, `Notification`, `Message`,
   `AdminAuditLog` grow without bound. Any new high-volume table needs a retention answer, and
   retention crons already exist in `src/maintenance/`.
9. **Vectors.** `PostEmbedding` / `ProfileEmbedding` use the pgvector `vector` type with
   `previewFeatures = ["postgresqlExtensions"]`. Vector reads are part of the hybrid feed
   ([ADR-0009](../../circlesfera-documentation/adr/0009-feed-fan-out.md)).
10. **Query review.** No N+1 (no Prisma call inside a loop), no `findMany` without `take`, related
    writes wrapped in `$transaction`, and `FOR UPDATE`-style locking where the code already relies on
    it (promotion budget consumption).

## Hard rules

- Never change the schema without confirmation and a migration in the same commit.
- Never edit a migration that has already been applied in production; add a new one.
- Never write a destructive migration (drop column/table, narrow a type) without an explicit,
  approved plan — `AGENTS.md` treats destructive data operations as confirmation-required.
- Never reintroduce a dropped concept without checking why it went: `payout_requests` and
  `PayoutStatus` were removed deliberately
  ([ADR-0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md)).
- Never assume a relation or cardinality — read it.
- Never bypass Prisma with raw SQL for convenience.

## Output

- **Diff summary:** models, fields, enums, indexes, constraints.
- **Migration:** name, the SQL it generates, and whether it is backward compatible.
- **Backfill/rollout:** order of operations if data must be filled.
- **Rollback:** how to revert, and whether data loss is possible.
- **Query impact:** which queries improve or regress, with the index that carries them.
- **Cascade audit** if relations changed.
- **Docs/ADR** to update.
