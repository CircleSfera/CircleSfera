# Playbook — Schema change

Touching `circlesfera-backend/prisma/schema.prisma`. This is the highest-consequence routine change
in the repository: it is on the `AGENTS.md` confirmation list, and a schema edit without a matching
migration has already caused a production outage here.

Specialists: `database` → `staff-architect` → `backend` → `security` → `privacy-compliance` (personal
data) → `devops`.

## 1 — Establish the current state

- Read the model in `schema.prisma`. All of it, including indexes and `@@map`.
- Check the last migrations in `prisma/migrations/` for related work.
- Check the ADRs — some modelling choices are deliberate and documented (for example no payout ledger,
  [ADR-0002](../../circlesfera-documentation/adr/0002-stripe-connect-payouts.md)).
- Identify every service that queries the model, and every consumer of the affected fields.

## 2 — Get confirmation

Present the proposed change and wait. Include: what changes, why, the migration SQL shape, backward
compatibility, backfill needs, rollback, and production impact. Do not proceed without approval.

## 3 — Design the change

- **Naming:** `PascalCase` singular model, `@@map` to snake_case plural table.
- **Nullability:** a new non-nullable column on a populated table needs a default or a backfill.
  State which.
- **Relations:** correct cardinality and a deliberate `onDelete`. Trace what a `User` hard delete now
  removes — GDPR deletion depends on it.
- **Indexes:** add composites in the query's actual column order. Follow the existing shape on `Post`
  and `Follow`.
- **Uniqueness:** encode real invariants with `@@unique`.
- **Enums:** adding a value is usually safe. Removing or renaming one breaks rows and code — enumerate
  every comparison first.
- **Money:** integer cents.
- **Growth:** if the table is high volume, state the retention mechanism. Retention crons live in
  `src/maintenance/`.

## 4 — Backward-compatibility rule

`prisma migrate deploy` runs at **container start** in production, so for a short window the new
schema coexists with the old application image, and a rollback restores the old image but **not** the
database.

Therefore:

- **Additive changes** (new nullable column, new table, new index, new enum value) are safe.
- **Destructive or narrowing changes** (drop column/table, rename, tighten a type, remove an enum
  value) must be split across releases: add → backfill → switch reads → stop writing → drop, each as
  its own deploy.
- If a change is not backward compatible, say plainly that rollback is unavailable.

## 5 — Execute

```bash
cd circlesfera-backend
npm run prisma:migrate            # generate the migration; then READ the SQL it produced
npm run prisma:generate
npm run build                     # fix every type error this surfaces
npm run prisma:check-migrations   # drift gate; needs an empty Postgres
npm test
npm run test:e2e                  # needs Postgres + Redis
```

Never edit a migration that has already been applied in production. Add a new one.

## 6 — Propagate

- Update the services and DTOs that touch the changed fields.
- Update `circlesfera-shared/src/` types if the field crosses the boundary — that package is
  hand-written and drifts easily.
- Update the frontend types and any component reading the field.
- Update the seed (`prisma/seed.ts`) if the new shape breaks it.

## 7 — Document

- `circlesfera-documentation/02-database-er-diagram.md`.
- An ADR if the modelling decision is durable ([`../templates/adr.md`](../templates/adr.md)).
- `CHANGELOG.md` if operator- or user-visible.
- Migration notes in the PR description — `CONTRIBUTING.md` requires them for schema changes.

## 8 — Close

Run [`../checklists/database.md`](../checklists/database.md) and
[`../checklists/pull-request.md`](../checklists/pull-request.md), plus
[`../checklists/security.md`](../checklists/security.md) if the change touches personal data,
permissions or money.

Report: the diff, the migration SQL, the backward-compatibility verdict, the rollback story, the
cascade audit, and everything you actually ran.
