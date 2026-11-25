# circlesfera-helpdesk

The Help Desk as a product of its own, with CircleSfera as its first customer
([ADR-0034](../docs/adr/0034-help-desk-own-package.md), owner decision BD-036).
It never imports from `circlesfera-backend/` or `circlesfera-frontend/`: the
`no-circlesfera-app-import` rule in `.dependency-cruiser.cjs` fails
`npm run check:deps` when it does.

## Where the move stands: step 1 of 5

ADR-0034 moves the Help Desk out of the CircleSfera monolith by expand, copy,
switch and contract, one change per step:

1. **The package and its database (this step).** A NestJS server with one
   endpoint, `GET /api/v1/health` (the server and its database answer), and
   its own Prisma schema and migrations. The schema holds the Help Desk models
   of `circlesfera-backend`, with the same tables and columns, every record
   with its organization; only the relations to CircleSfera's `User` and
   `Report` are gone, their columns kept as opaque references. The host
   contracts are copied to `src/host/helpdesk-host.contracts.ts`. Nothing is
   deployed, nothing is removed from `circlesfera-backend`, no ticket is moved,
   and the backend keeps serving support as it does today.
2. **Its own sign-in.** Agents of every organization sign in to the Help Desk
   with their own accounts and a second factor. There is no agent or sign-in
   model yet; that step adds it.
3. **The host contracts over HTTP.** Each contract becomes a call to an
   endpoint the organization configures, signed with a secret of that
   organization, with a timeout and a plain fallback. CircleSfera implements
   them in one integration module of `circlesfera-backend`.
4. **The tickets copied and the app switched.** CircleSfera's tickets are
   copied row for row (the `reference` sequence moved past the highest one),
   checked, and the app uses the Help Desk's public API with CircleSfera's
   organization key. The Help Desk gets its own container, host name and
   deploy workflow.
5. **Contract.** The Help Desk tables and code are removed from
   `circlesfera-backend`, once the copy is checked. Removing those tables
   waits for the owner (ED-015).

## Running it

```bash
npm ci                     # also generates the Prisma client
npm run build && npm run typecheck && npm run lint && npm run check:deps
npm run test:cov           # coverage floors in vitest.config.ts
```

The server reads `HELPDESK_DATABASE_URL` (never CircleSfera's `DATABASE_URL`)
and `HELPDESK_PORT` (default 3010). Migrations: `npm run prisma:migrate`
against a local database. The drift check, as CI runs it, needs an empty
Postgres:

```bash
HELPDESK_DATABASE_URL=postgresql://user:pass@localhost:5432/empty \
  ../scripts/check-prisma-schema-migrations.sh circlesfera-helpdesk HELPDESK_DATABASE_URL
```
