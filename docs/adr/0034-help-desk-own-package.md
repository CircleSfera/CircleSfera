# ADR-0034: Help Desk — a product of its own, in its own package of this repository, with CircleSfera as its first customer

- **Status:** Accepted
- **Date:** 2026-11-24
- **Deciders:** CircleSfera owner, engineering
- **Scope:** repository structure | backend | data | frontend | deployment
- **Amends:** [ADR-0027](./0027-help-desk-module-with-host-contracts.md) (its "a module, not a
  service" point and the "separate service" row of its alternatives)

## Context

ADR-0027 built the Help Desk as a module of the CircleSfera monolith, behind host contracts, with
every record per organization, so that it could be offered to other companies later. It left open
"offering the Help Desk to other companies … the contracts over HTTP … a deployment of its own".

On 2026-11-24 the owner decided that the Help Desk is a product developed apart from the social
network, used by CircleSfera for its own support and sold to other companies (Notion → Decision
Register, BD-036, which supersedes BD-017). Asked how to separate it, the owner chose a package of
its own in this repository over a repository of its own or staying inside the monolith.

A product sold to other companies cannot share CircleSfera's database, sign-in or deploy: a
customer's data would sit beside CircleSfera's users, an outage of one would be an outage of the
other, and the Help Desk could never be sold, moved or scaled on its own.

## Decision

The Help Desk becomes a separate product with its own package, database, sign-in and deploy, in
this repository. CircleSfera uses it as an ordinary customer, through the same public interface
any other company would use.

- **Its own package.** `circlesfera-helpdesk/` beside `circlesfera-backend/`,
  `circlesfera-frontend/` and `circlesfera-shared/`: a server (NestJS, the stack the team already
  runs) and a web app for agents, the requester portal and the embeddable widget. It shares the
  repository's CI, lint, formatting, dependency rules and merge queue. It never imports from
  `circlesfera-backend/` or `circlesfera-frontend/`; a lint rule fails the build when it does.
  What both need (for example types of the API between them) goes in a package both depend on.
- **Its own database.** A database of its own (its own Prisma schema and migrations), on the same
  PostgreSQL server while volume allows. No table is shared and no query crosses databases.
  Every record keeps its organization (ADR-0027 still holds inside the Help Desk).
- **Its own sign-in.** Agents of every organization, CircleSfera's included, sign in to the Help
  Desk with its own accounts and a second factor. CircleSfera staff identities
  (`AdminIdentity`) are not reused; an agent's link to CircleSfera staff is a reference the
  CircleSfera organization keeps.
- **The host contracts go over HTTP.** The contracts of ADR-0027 (requester directory, account
  card, service level, agent directory, handover, notifier) become calls from the Help Desk to an
  endpoint each organization configures, signed with a secret of that organization. CircleSfera
  implements them in `circlesfera-backend` as one small, authenticated integration module; that
  module is the only place CircleSfera knows the Help Desk. A company without such an endpoint
  gets the plain behaviour: no account card, standard service level.
- **CircleSfera calls the Help Desk as a customer.** Creating a ticket from the app, listing a
  person's tickets and their replies go through the Help Desk's public API with CircleSfera's
  organization key, never by reading its tables.
- **Its own deploy.** Its own container and its own host name, deployed by its own workflow, so a
  release of one product never restarts the other.
- **Moved in steps, nothing lost.** Expand, copy, switch, contract, each its own change, as
  ADR-0020 and ADR-0027 do: the package and its database first; then its own sign-in; then the
  HTTP contracts and CircleSfera's integration module; then the existing tickets copied and the
  app switched to the API; last, the Help Desk tables and code removed from CircleSfera.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Stay a module of the monolith with a separate web app (ADR-0027 as it is) | Shares CircleSfera's database, sign-in and deploy: another company's support data would live beside CircleSfera's users, and the product could not be sold or run apart |
| A repository and infrastructure of its own | The cleanest separation, but a second CI, a second set of dependency and security rules and a second merge queue for a team of one; the package can move to its own repository later without changing its design |
| A schema per organization in a shared database | Operational cost before there is a second organization; per-row organization with one access layer already isolates, and tests prove it |

## Consequences

**Accepted costs.** A second deploy, database and sign-in to run and secure. A network boundary
where today there is a function call: a call to CircleSfera can fail, so every contract has a
timeout and a plain fallback (ADR-0023). Moving the existing support code and tickets is work
that adds no feature.

**Scope.** This is not a split of the CircleSfera monolith into services, which stays out of scope
(Product Scope & Boundaries, section 8a): CircleSfera remains one modular monolith, and the Help
Desk is a different product that CircleSfera buys from itself.

**The owner's gate (ED-015).** Prices and plans for other companies, the terms they accept, the
product's name and domain if it is sold under a brand of its own, a new paid service or a rise in
recurring cost, and removing the Help Desk tables that hold CircleSfera's tickets from its
database (the last step, after the copy is checked) wait for the owner.

**What this does not decide.** Billing other companies; the widget's design; how email is
received for other organizations; when the database moves off CircleSfera's PostgreSQL server.

## Implementation anchors

- Decision: Notion → Governance → Decision Register, BD-036; product: Notion → Product → Help Desk.
- Today's code: `circlesfera-backend/src/helpdesk/` (the module), `circlesfera-backend/src/helpdesk-host/`
  (CircleSfera's implementations of the contracts), `helpdesk-host.contracts.ts` (the contracts),
  the `Helpdesk*` models in `circlesfera-backend/prisma/schema.prisma`.

## Revisiting

Revisit when the Help Desk has paying customers (its database on a server of its own, its own
repository), or if running two deploys costs more than selling it brings in.
