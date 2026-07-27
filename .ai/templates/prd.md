# Feature — <name>

<!-- Fill before writing code. Empty sections are findings, not omissions. -->

## 1. Problem

The user problem in one sentence, with no solution in it.

**Evidence it is real:** support tickets, telemetry, an observed flow, a maintainer decision.

## 2. Target user and frequency

Consumer / creator / moderator / admin. Daily, weekly or rare. This decides how prominent it may be.

## 3. Scope

**In scope:** …

**Explicit non-goals:** … <!-- An unstated non-goal becomes scope creep. -->

**Checked against `00-status.md` OUT OF SCOPE list:** yes / no — result.

## 4. Principle check

From `.ai/core/identity.md`:

1. Is the user reasonably in control of this experience?
2. Can we explain why the system made this decision?
3. Is the action transparent, traceable and consistent with declared policy?

## 5. Main flow

Numbered steps from entry point to completion, from the user's perspective.

## 6. Edge cases

| Case | Expected behaviour |
| --- | --- |
| Anonymous / suspended / banned / scheduled for deletion | |
| Blocked, muted, private account, pending follow, close friends | |
| `ContentRating.MATURE`, premium/locked, moderated content | |
| Roles: `USER`, `MODERATOR` (with and without permission), `ADMIN` | |
| Plan state: none, `Premium`, `Elite Creator`, `Business`, `PAST_DUE` | |
| Empty list, single item, exactly one page, last page | |
| Redis cold, external service failing | |

## 7. Data model

New or changed models, fields, enums, indexes, relations, `onDelete` behaviour, retention. If anything
changes, this needs `.ai/playbooks/schema-change.md` and explicit confirmation.

## 8. API

| Method | Path (under `api/v1`) | Guards | Request DTO | Response | Status codes |
| --- | --- | --- | --- | --- | --- |

Additive or breaking? If breaking, the coordination plan.

## 9. Authorization

Guard, ownership check location, role/plan requirement, KYC requirement, rate limiting.

## 10. Async, cache, real-time

Queue jobs (existing queue, payload, idempotency), cache keys with TTL and invalidation points, socket
events with their room.

## 11. Frontend

Route, components (reused vs new), query keys and invalidation, store changes, the four states, i18n
keys for `en` and `es`.

## 12. Metrics

What signal tells us it worked. Existing `InteractionEvent` / `UserEventType`, or new and
consent-gated.

## 13. Rollback

`FeatureFlag` / `UserExperiment` name, or an explicit statement that there is no kill switch and why
that is acceptable.

## 14. Open questions

Decisions that need a human. Do not guess these.
