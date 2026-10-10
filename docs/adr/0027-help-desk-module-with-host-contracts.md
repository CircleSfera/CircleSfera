# ADR-0027: Help Desk — a module of the monolith behind host contracts, with records per organization

- **Status:** Accepted
- **Date:** 2026-10-08
- **Deciders:** CircleSfera owner, engineering
- **Scope:** backend | data | frontend

## Context

Support is a form that creates a `SupportTicket` with one message and one reply by email. Its code
is spread over the `support` module (creating a ticket) and the staff operations service (listing,
answering, handing a ticket to moderation, the account card).

The owner decided that CircleSfera builds its own Help Desk, used by CircleSfera first and built so
that it can be offered to other companies later. That replaces the position recorded as a rejected
alternative in ADR-0026 ("a helpdesk of our own") and its note that a contracted helpdesk was left
undecided.

A Help Desk that reads profiles, plans and moderation records directly would work for CircleSfera
and for nobody else, and adding an owner to every record after there is data is the expensive way
to get tenancy.

## Decision

The Help Desk is a module of the modular monolith with a narrow boundary to the rest of the
product, and every one of its records belongs to an organization.

- **A module, not a service.** One deploy and one database, its own directory and its own tables.
  The API is REST under the existing API with the existing guards.
- **No imports from the social modules.** The Help Desk module does not import profiles, posts,
  payments, moderation or any other social module. A lint rule fails the build when it does.
- **The host plugs in through contracts.** What the Help Desk needs from the product around it, it
  asks through interfaces: requester directory, account card, agent directory, handover to another
  team, notifier, and team channel. A contract returns plain data, never a record of the host.
  CircleSfera's implementations live in a host module outside the Help Desk module.
- **Opaque references to the host.** A requester and an agent are stored as references the host
  understands, not as relations to the host's tables. For CircleSfera the requester reference is
  the `User` id and the agent reference is the `AdminIdentity` id.
- **Records per organization.** Every Help Desk table carries its organization, directly or
  through its ticket. One row exists today, CircleSfera. One data access layer inside the module
  applies the organization to every read and write; services do not query around it. The
  organization of a request comes from who is signed in, never from a request parameter.
- **Direct calls, not a bus.** The Help Desk calls its contracts. It adds no generic event bus.
  `support.ticket_created` stays as ADR-0019 lists it; any new signal between modules needs that
  record amended first.
- **Messages are append-only.** A ticket holds an ordered list of messages with an author kind and
  a visibility. Internal notes are excluded from requester routes, emails, notices and the data
  export by the query, not by the screen.
- **Staff access is unchanged.** Agents are staff with the `support` permission, signed in with
  their `AdminIdentity` and MFA. Staff access never uses `User.role`.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A contracted helpdesk tool | The owner decided technology is built in house where it can be; support data and the way support works stay with CircleSfera |
| Keep growing support inside the staff operations service | It reads the host's records directly, so it could never serve another product, and support rules stay mixed with firewall, flags and webhooks |
| A separate service with its own database | CircleSfera does not split the monolith; a second deploy and a network boundary for a team of one |
| A database or schema per organization | Operational cost with no benefit while there is one organization; a column and one access layer give isolation that tests can prove |
| Add the organization later, when a second one exists | Backfilling ownership on tables with data, and finding every query that forgot it, is the expensive order |
| Relations from Help Desk tables to `User` and `AdminIdentity` | Convenient joins, and the Help Desk schema would depend on the host's schema for good |

## Consequences

**Accepted costs.** An extra layer of interfaces for a product with one host today. No joins from
tickets to accounts: the account card is asked for per ticket. Moving the existing support code is
a change that adds no behaviour.

**Constraints.** No query on a Help Desk table outside the module's data access layer. No import of
a social module from the Help Desk module. A contract never returns a host record. Each new record
and each migration is confirmed by the owner before it is built. Today's tickets move by expand,
move, switch and contract, each its own change, and nothing is lost.

**What this does not decide.** Offering the Help Desk to other companies, which needs organizations
by sign-up, agents with their own sign-in, the contracts over HTTP, a widget and billing; how email
is received; a deployment of its own.

## Implementation anchors

- Product documentation: Notion → Product → Help Desk (specification, data, architecture, security
  and quality, roadmap).
- Decision: Notion → Product Decisions → PD-015.
- Today's code, which moves into the module: `circlesfera-backend/src/support/`, the support
  functions of `circlesfera-backend/src/admin/admin-ops.service.ts`, the `SupportTicket` model in
  `circlesfera-backend/prisma/schema.prisma`.
- Related records: [ADR-0019](./0019-bounded-domain-event-bus.md) (allowed events),
  [ADR-0026](./0026-backoffice-second-staff-site.md) (the Backoffice, where agents work).

## Revisiting

Revisit when a second organization is about to exist (the access layer and the isolation tests are
then the first thing to audit), or if the Help Desk needs a deploy cadence of its own.
