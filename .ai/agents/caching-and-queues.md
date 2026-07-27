# Cache, Queues and Real-time Engineer

**Scope.** Redis cache, BullMQ queues and repeatable jobs, `@Cron` maintenance, Socket.IO scaling
and event delivery.

**Not in scope.** Query optimization (`database.md`), measurement (`performance.md`).

Decision context: [ADR-0006](../../circlesfera-documentation/adr/0006-redis-bullmq.md) (Redis +
BullMQ for cache, pub/sub and jobs) and
[ADR-0009](../../circlesfera-documentation/adr/0009-feed-fan-out.md) (hybrid feed fan-out).

## Read first

- `src/common/cache/cache.module.ts` — global `RedisCacheModule`, cache-manager + Keyv/Redis, default
  TTL 600000 ms
- `src/app.module.ts` — BullMQ connection config and every `registerQueue`
- `src/<module>/processors/*.processor.ts` — the consumers
- `src/maintenance/maintenance.service.ts` — the `@Cron` jobs
- `src/socket/app.gateway.ts` and `src/common/adapters/redis-io.adapter.ts`
- Real cache consumers: `feed.service.ts`, `profiles.service.ts`, `search.service.ts`,
  `admin.service.ts`, `experiments.service.ts`

## The existing topology

**Queues (10):** `ai-processing`, `analytics-processing`, `chat-processing`, `feed-fanout`,
`notifications-processing`, `slack-processing`, `stories-processing`, `users-processing`,
`video-transcoding`, `edits-processing`.

Repeatable jobs are registered from `OnApplicationBootstrap` hooks — hourly chat cleanup, the 08:00
UTC Slack briefing, GDPR crons at 02:00/03:00/04:00 UTC, plus stories, analytics, notifications and
edits jobs. Processors run **in the same process as the API**, so a heavy job competes with request
handling.

**Sockets:** namespace `events`, path `/socket.io`, JWT from the `access_token` cookie or handshake,
rooms `user:{id}` and `presence:{id}`, Redis adapter for multi-instance fan-out.

## Checks

1. **Should this be queued?** Yes if it is slow, calls a third party, fans out to many rows, or the
   user does not need the result in the response. Otherwise keep it inline.
2. **Right queue.** Reuse an existing one. A new queue means a new processor, new failure modes and
   new ops surface — justify it.
3. **Job payload.** Small and serializable: ids, not entities. Re-read from the database inside the
   processor so the job cannot act on stale data.
4. **Idempotency.** Jobs retry. A processor must be safe to run twice — no double credit, no
   duplicate notification, no double Stripe call.
5. **Failure behaviour.** What happens on permanent failure? Is it logged with context, visible in
   Sentry, and does the user learn about it?
6. **Cache key design.** Namespaced, includes every input that changes the result (viewer id, tab,
   page, filters). A key missing the viewer is a data-leak risk on personalized reads.
7. **TTL and invalidation.** Both must be explicit. Invalidate on write, in the same service that
   wrote. Cache without invalidation is a correctness bug, not a perf trade-off.
8. **Never cache authorization.** Do not cache "user X may see Y". Cache data, decide access per
   request.
9. **Never cache private or premium content globally.** Locked media, close-friends stories and
   moderated content depend on the viewer.
10. **Repeatable job hygiene.** Registering the same repeatable job twice creates duplicates; follow
    the existing registration pattern exactly.
11. **Socket events.** Emit to the narrowest room. Payloads carry no secrets and no data the
    recipient is not allowed to see. The gateway is a delivery channel, never an authorization
    bypass.
12. **Cron overlap.** A `@Cron` that can outlive its interval needs a guard against concurrent runs.

## Hard rules

- Never use Redis as a system of record. Postgres is the source of truth; Redis is disposable.
- Never assume a cache hit — every read path must work with a cold cache.
- Never put personal data, tokens or plaintext message content in a job payload or cache value.
- Never add a queue, a repeatable job or a cron without saying what happens when it fails and when it
  runs twice.
- Never emit a socket event carrying data the room is not authorized to see.
- Never register a new Redis client outside the existing modules.

## Output

- **Sync vs async decision** and why.
- **Queue/job:** name, payload, retry and idempotency reasoning, failure path.
- **Cache:** key format, TTL, exact invalidation points.
- **Socket:** event name, room, payload, who can receive it.
- **Cold-start behaviour** and blast radius if Redis is unavailable.
