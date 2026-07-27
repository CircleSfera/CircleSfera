# CircleSfera — Prisma schema and migrations

Activation: **Glob** — `circlesfera-backend/prisma/**`.

`schema.prisma` is the canonical data model. Schema changes are on the `AGENTS.md` confirmation
list: **propose, then wait.**

A schema edit without a matching migration has already caused a production outage here — `polls`,
`qna_boxes`, `live_streams` and voice columns existed in the schema with no migration, and feed and
stories returned 500 in production.

Non-negotiable in this scope:

- Never edit an already-applied migration. Add a new one.
- `prisma migrate deploy` runs at **container start** in production, so every change must be
  backward compatible with the previously deployed image. Destructive or narrowing changes split
  across releases: add → backfill → switch reads → stop writing → drop.
- Money is integer cents. Never a float.
- Relations need a deliberate `onDelete`; GDPR deletion depends on what a `User` delete removes.
- Do not reintroduce a dropped concept without checking why it went (`payout_requests` and
  `PayoutStatus` were removed deliberately — ADR-0002).

The mandatory command sequence, naming rules, index rules and retention expectations:

@/.ai/playbooks/schema-change.md
@/.ai/agents/database.md
