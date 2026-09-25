# ADR-0006: Redis + BullMQ for cache, pub/sub, and jobs

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering

## Context

The platform needs shared caching, WebSocket fan-out across instances, and durable background work (embeddings, video transcoding, feed fan-out, GDPR export/hard-delete, notification digests). Synchronous request paths cannot absorb that work.

## Decision

Use **Redis** as the shared infrastructure backbone and **BullMQ** for job queues:

- Redis: cache, Socket.IO adapter / pub-sub, BullMQ broker.
- BullMQ queues for async processors (e.g. AI, video, feed-fanout, GDPR, notifications).

Do not introduce a separate message bus (Kafka, SQS-only) for core app jobs unless scale requirements outgrow Redis/BullMQ.

## Consequences

- Operational dependency on Redis availability; queue backlog must be monitored.
- Workers and API share queue names/contracts — deploy migrations carefully when renaming queues.
- Horizontal API scaling is viable because state that must be shared lives in Redis/Postgres, not process memory alone.

### Amendment (2026-09-26): per-role failure and recovery procedure

Redis backs three roles with genuinely different failure semantics. This amendment states each
role's contract explicitly rather than treating "Redis is down" as one undifferentiated incident, and
points to where each mechanism actually lives so this doesn't drift into a second, competing
description.

**1. Cache (disposable).** `RedisCacheModule` (`common/cache/cache.module.ts`) and the derived
caches in `common/constants/derived-stores.constants.ts` (`FEED_ALGORITHM_CACHE`,
`SEARCH_QUERY_CACHE`) hold only TTL-bounded, on-demand-recomputable state. Losing this data loses
nothing but freshness: the Keyv/Redis store's `error` handler logs and continues rather than
crashing the process, and every cache-backed read recomputes from Postgres on a miss. No recovery
procedure is needed beyond "cache warms itself back up under normal traffic."

**2. Feed inbox (rebuildable).** `FeedInboxService` (`feed/feed-inbox.service.ts`,
`DERIVED_STORES.REDIS_FEED_INBOX`) is a Redis Sorted Set fan-out cache, not a source of truth —
canonical state is `posts` + `follows` in Postgres. `getInbox`/`isInboxEmpty` distinguish "genuinely
empty" from "Redis unavailable" (the latter returns `null`/throws rather than a false-empty result),
and `FeedService` already calls `rebuildInbox(profileId)` in the background on a miss
(`feed/feed.service.ts:504`) to repopulate from canonical data. Full Redis data loss self-heals
per-user, lazily, on next read — no operator action required.

**3. Queues (retryable, tiered by criticality).** BullMQ job data lives only in Redis, so this is the
role where data loss is a real risk, not a cosmetic one. Two layers apply:

- Every queue has an explicit per-workload retry/backoff/retention policy in
  `common/constants/queue-policy.constants.ts` (`QUEUE_POLICIES`) — e.g. `EMAIL_PROCESSING` retries
  8 times over ~53 minutes to survive transient Brevo failures within a password-reset token's 1h
  window; `VIDEO_TRANSCODING` caps at 2 attempts to avoid CPU thrashing on a corrupt file. This
  covers **transient job failure** (the job exists in Redis, the handler threw).
- It does not cover **Redis losing the job itself** (process crash between enqueue and processing,
  Redis restart, disk-level data loss). Production Redis runs with `--appendonly yes` on a persistent
  volume (`docker-compose.prod.yml`, `redis_data`), bounding an ordinary restart to at most ~1s of
  writes (AOF `everysec` fsync) — but for the highest-stakes jobs (GDPR export/hard-delete, media
  processing) this residual window is closed independently by a **transactional outbox**
  (`outbox/outbox.service.ts`, `OutboxEvent` Postgres table): the business write and the intent to
  enqueue commit atomically in the same Postgres transaction, and a 5-second cron
  (`OutboxService.handleCronSweep`) re-publishes any event still `PENDING` or stuck `PROCESSING` past
  its lease — recovering from an app crash or Redis being unreachable at enqueue time. Adopted at
  `uploads.service.ts`, `users.service.ts`, `users/data-export.service.ts` — i.e. the `CRITICAL_DATA`
  workload class. Non-critical queues (feed-fanout, analytics, notifications) intentionally skip the
  outbox: an occasional lost job there is an acceptable, cheaper trade-off than transactional
  overhead on high-throughput paths.

**Known residual risk (not closed by the above, noted rather than silently treated as solved):** the
outbox protects the window between a DB commit and a successful `queue.add()`. Once a critical job
has been added to BullMQ, its durability depends on Redis's AOF the same as any other job — a
catastrophic Redis data loss (volume corruption, accidental `FLUSHALL`) between publish and worker
pickup is not separately reconciled against Postgres for the `CRITICAL_DATA` queues. Given AOF
persistence bounds this to sub-second exposure under normal operation, this is treated as an accepted
residual risk rather than a defect — revisit if a Redis data-loss incident is ever observed to have
actually dropped one of these jobs.

**Operator summary:** cache down → no action. Feed inbox down → no action (self-heals per read).
Queue backlog/down → check `/health/readiness`'s `redis` indicator
(`health/redis-health.indicator.ts`); non-critical queues drain once Redis recovers; critical queues
additionally self-heal via the outbox sweep for anything not yet published.
