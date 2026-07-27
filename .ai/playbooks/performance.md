# Playbook — Performance

Specialists: `performance` → `database` → `caching-and-queues` → `frontend` → `observability`.

Rule of the playbook: **measure, change one thing, measure again.** An optimization without a
baseline is a guess with extra risk.

## 1 — Define the symptom with a number

- Which route, endpoint, query or interaction.
- The observed number: latency, payload size, query count, bundle size, dropped frames.
- Under which conditions: which user state, how much data, which device class.
- Whether it is a regression (and since when) or a long-standing cost.

"The feed feels slow" is not a symptom. "`GET /api/v1/feed/foryou` takes 1.4s with 200 followed
accounts" is.

## 2 — Reproduce and locate the dominant cost

- Backend: time the endpoint, count the queries the request issues, inspect the response size, read
  the query plan for the slow query.
- Frontend: count renders, count network requests per interaction, build and read the chunk sizes,
  check main-thread work.
- One bottleneck usually explains most of the cost. Find it before changing anything.

Do not skip to a fix because it is obvious. Obvious is frequently wrong here — the in-process BullMQ
processors mean an unrelated job can be the real cause of API latency.

## 3 — Diagnose against the usual suspects

**Backend**

- N+1: a Prisma call inside a loop or `map`.
- Missing index for a new filter or sort — verify in `schema.prisma`, in the query's column order.
- Over-fetching: whole rows returned when four fields are used.
- Unbounded `findMany`, or offset pagination growing with depth.
- Per-request recomputation that could be cached or queued.
- Serial `await`s that are independent.
- Heavy queue jobs competing with request handling in the same process.

**Frontend**

- Unstable props/callbacks in list rows; context values changing every render.
- Duplicate queries for the same key; over-broad invalidation refetching the feed after a like.
- Long lists with no virtualization (none is installed — see
  [`../core/known-gaps.md`](../core/known-gaps.md) F6).
- Full-resolution media where `thumbnailUrl` or `standardUrl` exists.
- Heavy libraries in the initial chunk instead of a lazy route or `manualChunks`.
- Media work on the main thread instead of `src/workers/mediaProcessor.worker.ts`.

## 4 — Choose the change

Prefer, in order:

1. Fix the algorithm or the query (batch it, index it, narrow it).
2. Remove work (do not compute what nobody reads).
3. Move work off the request path (BullMQ) or off the main thread (worker).
4. Cache, with an explicit TTL **and** an invalidation path.
5. Only then, micro-optimize.

State the trade-off: memory, staleness, complexity. If the change introduces caching, name the exact
invalidation points; a cache without invalidation is a correctness bug.

## 5 — Verify

Re-measure with the **same method** as step 2 and report before/after honestly. Then confirm you did
not break anything:

```bash
cd circlesfera-backend && npm test && npm run build
cd circlesfera-frontend && npm test && npm run build
```

Check correctness on the optimized path specifically: narrowed `select` must still include every field
the client uses, and cache keys must still carry the viewer dimension so a private or premium item
cannot leak.

## 6 — Report

- **Baseline** with the measurement method.
- **Dominant cost** with evidence.
- **Change** and why it addresses that cost.
- **After** number, same method.
- **Trade-offs accepted.**
- **Options rejected** and why.
- If the change did not help: say so and revert it.

Close with [`../checklists/performance.md`](../checklists/performance.md).
