# Playbook — Feature

Specialists: `product` → `staff-architect` → `database` → `api` → `backend` → `frontend` →
`ux-researcher` → `security` → `qa` → `documentation`. Add `payments` for money, `trust-and-safety`
for moderation, `privacy-compliance` for personal data.

## 1 — Frame the problem

- State the user problem in one sentence, without a solution in it.
- Identify the user: consumer, creator, moderator, admin.
- Check `circlesfera-documentation/00-status.md`. If the request is on the OUT OF SCOPE list, stop and
  say so.
- Check whether it partly exists already — the data model covers more than the UI exposes
  ([`../core/glossary.md`](../core/glossary.md)).
- Write the explicit non-goals.

Output of this step is a filled [`../templates/prd.md`](../templates/prd.md) for anything non-trivial.

## 2 — Ground in the code

Read, do not assume:

- The Prisma models involved, in `schema.prisma`.
- The owning backend module: controller, service, DTOs, spec.
- The frontend surface: the page, its service wrapper, its query keys, its store.
- Existing patterns for the same shape of problem elsewhere in the repo.
- Relevant ADRs and [`../core/known-gaps.md`](../core/known-gaps.md).

## 3 — Design

Answer all of these before writing code:

**Data.** New models, fields, enums, indexes, relations, cascade behaviour, retention. Any change
here means [`schema-change.md`](./schema-change.md) and explicit confirmation.

**API.** Endpoints under `api/v1`, DTOs with `class-validator`, response shape, status codes,
pagination via `createPaginatedResult`, backwards compatibility.

**Authorization.** Which guard, plus the ownership check inside the service. Which role or plan may
do this. Is `IdentityVerifiedGuard` needed?

**Async.** What goes to a BullMQ queue, what stays inline, what needs a socket event, what needs
cache invalidation.

**Frontend.** Route, components (reusing `src/components/ui/`), query keys and their invalidation,
store changes, loading/empty/error states, i18n keys for `en` and `es`.

**Edge cases.** Blocked, muted, private, pending follow, close friends, `MATURE`, premium/locked,
moderated, suspended, scheduled for deletion, empty and single-item lists.

**Observability.** What tells you it works in production, and what tells you it broke.

**Kill switch.** `FeatureFlag` / `UserExperiment`, or an explicit statement that there is none.

Present at least two options where a real trade-off exists, choose one, and justify it. Flag
everything on the `AGENTS.md` confirmation list and **wait**.

## 4 — Implement

Order matters:

1. Schema + migration (if any), verified with `npm run prisma:check-migrations`.
2. Backend: DTO → service → controller, with the ownership check.
3. Backend tests, including the deny path.
4. Shared types if the contract crosses the boundary.
5. Frontend: service wrapper → query/mutation → component → route.
6. i18n keys in both locales.
7. Frontend tests.

Keep the feature behind a flag if it is risky. Do not refactor unrelated code on the way.

## 5 — Verify

```bash
cd circlesfera-backend && npm run lint && npm test && npm run build
cd circlesfera-backend && npm run test:e2e            # if the contract changed
cd circlesfera-frontend && npm run lint && npm test && npm run build
cd /workspace && npm run check
```

Report real output. Then walk the primary flow manually if a UI is involved, and try the edge cases
from step 3.

## 6 — Document

- Update `01-product-requirements-document.md` / `04-user-stories.md` if product behaviour changed.
- Update `03-api-detailed-endpoints.md` if endpoints changed.
- Update `02-database-er-diagram.md` if the model changed.
- Add an ADR for a durable decision ([`../templates/adr.md`](../templates/adr.md)).
- Add a `CHANGELOG.md` entry under `[Unreleased]`.

## 7 — Close

Run [`../checklists/feature.md`](../checklists/feature.md) and
[`../checklists/pull-request.md`](../checklists/pull-request.md), plus `security.md`, `database.md`,
`api.md`, `ui.md` and `accessibility.md` as applicable.

Report: what shipped, what was verified how, what is deliberately deferred, what risk remains.
