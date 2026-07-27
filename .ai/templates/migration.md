# Migration notes — <short title>

<!--
Goes in the PR description. CONTRIBUTING.md requires migration notes for schema changes.
Schema changes need explicit confirmation before implementation (AGENTS.md).
-->

**Migration:** `prisma/migrations/<timestamp>_<name>/migration.sql`
**Models affected:** …
**Confirmation obtained:** yes — <when/by whom>

## What changes

| Model | Change | Type |
| --- | --- | --- |
| | added field / new model / index / enum value / relation / drop | additive \| narrowing \| destructive |

## Generated SQL

```sql
-- paste the actual SQL the migration produced, not a paraphrase
```

## Backward compatibility

`prisma migrate deploy` runs at **container start** in production, so the new schema coexists briefly
with the previously deployed image.

- [ ] Additive only — safe with the old image running.
- [ ] Narrowing or destructive — **not** safe. Split across releases:
      add → backfill → switch reads → stop writing → drop. Describe which step this PR is.

**Verdict:** backward compatible / not backward compatible — <consequence>

## Backfill

Required? If so: how, how long, whether it locks, and whether it runs in the migration or as a
separate script.

## Cascade audit

What a `User` hard delete now removes. Any personal row that would be orphaned (GDPR deletion depends
on this). Any `onDelete` behaviour changed.

## Index and query impact

New indexes and the queries they serve, in column order. Queries that get faster, and any that
regress.

## Retention

For a high-volume table: the retention mechanism (a cron in `src/maintenance/`) or an explicit
justification for indefinite retention.

## Rollback

- Image rollback restores the previous code but **not** the database.
- To revert the schema: <steps>, or "not revertible without data loss because …".
- Fresh `pg_dump` taken: yes / no — <when>.

## Propagation

- [ ] Services and DTOs updated
- [ ] `circlesfera-shared/src/` types updated (if the field crosses the boundary)
- [ ] Frontend types and components updated
- [ ] `prisma/seed.ts` still works

## Verification

```text
npm run prisma:migrate            → result
npm run prisma:generate           → result
npm run build                     → result
npm run prisma:check-migrations   → result
npm test                          → result
npm run test:e2e                  → result
```

## Documentation

- [ ] `circlesfera-documentation/02-database-er-diagram.md` updated
- [ ] ADR added if the modelling decision is durable
