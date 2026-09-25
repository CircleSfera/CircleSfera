# ADR-0019: Bounded in-process domain event bus (EventEmitter2)

- **Status:** Accepted
- **Date:** 2026-09-21
- **Deciders:** CircleSfera engineering

## Context

`00-status.md`, `01-architecture.md`, and `04-user-stories.md` all state that generic domain event buses (`EventEmitter2`, CQRS event sourcing) are forbidden without an approved ADR, naming only `user.session.terminate` (session eviction on ban/suspend/deletion) as an existing accepted exception.

In practice the backend has grown well beyond that single signal. `EventEmitterModule.forRoot()` is registered globally in `app.module.ts`, and 9 distinct event names are emitted and consumed across notifications, chat, posts/stories/uploads cleanup, payments, and operational alerting. This grew without a decision record. This ADR retroactively documents and bounds that usage so the prohibition in the other three documents stops contradicting the shipped code, and so further expansion requires a deliberate decision instead of accreting silently.

## Decision

Accept the following four categories as the full, closed list of what `EventEmitter2` may be used for in this codebase. Anything outside this list requires a new ADR, or an amendment to this one, before being added — it is not a general-purpose event bus or CQRS mechanism.

1. **Realtime transport bridge** — `chat.conversation.created|updated|deleted`, `chat.message.sent|edited|deleted`, `notification.dispatched`. Decouples chat/notification write paths (`src/chat/use-cases/**`, `NotificationsService`) from `AppGateway`, the only Socket.IO emission point for these events.
2. **Fan-out cleanup after an authoritative write** — `user.hard_deleted` (`USER_HARD_DELETED_EVENT`), `media.delete_batch`. Lets independently-owned modules (chat, posts, stories, search, feed inbox, uploads) react to a hard account delete or a batch media removal without the originating service (`AccountDeletionProcessor`, post/story cleanup) needing to know about every downstream module.
3. **Centralized notification creation** — `notification.create`. A single entry point (`NotificationsService.create`) so every module that can trigger a notification (comments, likes, follows, posts, reports, payments, the AI processor) does not duplicate persistence/dispatch/aggregation logic.
4. **Narrow cross-module operational signals** — `user.session.terminate` (already-approved session eviction), `payment.live_gift_completed` (payments → live gift overlay trigger), `system.incident` (uploads cleanup → Slack alerting), `moderation.report_filed` (reports/appeals → Slack moderation alerting, INT-002), `payment.alert` (payments/monetization webhooks → Slack payment alerting, INT-002), `support.ticket_created` (support → Slack support alerting, INT-002).

**Hard boundaries — why this stays a closed list and not a general pattern:**

- `EventEmitter2` must never be the system of record or the durability mechanism for a state transition. Financial/monetization writes, entitlement grants, and any Prisma state change stay direct service calls inside their transaction (or the outbox pattern in `src/outbox/` where cross-boundary durability is actually required). Events may only trigger *side effects* of a write that has already committed.
- `EventEmitter2` must never replace BullMQ where retry, backoff, or delivery across a process restart matters. It is in-process and fire-and-forget by default: a crash between `emit()` and a listener completing loses that delivery, and it does not fan out across horizontally-scaled API instances on its own.
- CQRS-style event sourcing (events as the source of truth, replayed to rebuild state) remains fully forbidden — nothing in this ADR authorizes it.
- No new event name may be introduced as a substitute for an existing direct service call without first updating this ADR.

## Consequences

- `00-status.md`, `01-architecture.md`, and `04-user-stories.md` are updated to reference this ADR and its closed list, instead of stating a blanket prohibition the shipped code already violates.
- `EventEmitterModule.forRoot()` has no global error listener or `onListenerError` hook configured. An unhandled rejection inside an `{ async: true }` listener (e.g. `NotificationsService.create`, `UploadsService.handleMediaDeleteBatch`) is not guaranteed to be observed — most existing listeners wrap their body in `try/catch` with logging, but this is a per-listener convention, not an enforced guarantee. This ADR does not fix that; it is a known gap, to be tracked separately rather than silently treated as fine.
- Adding a new event that fits an existing category above does not require a new ADR. A genuinely new category does.
