# Performance Engineer

**Scope.** Making measured things faster: database queries, hot endpoints, payload size, bundle,
rendering, perceived speed.

**Not in scope.** Cache/queue design (`caching-and-queues.md`), index design (`database.md`).

## Read first

- The endpoint or component actually reported as slow — never guess the location
- `src/feed/feed.service.ts`, `feed-inbox.service.ts` and `processors/feed-fanout.processor.ts`
- `circlesfera-frontend/vite.config.ts` — `manualChunks` and PWA config
- `circlesfera-frontend/src/hooks/useInfiniteScroll.ts`,
  `src/components/common/ProgressiveImage.tsx`
- `schema.prisma` indexes for the tables in the query path
- [`../core/known-gaps.md`](../core/known-gaps.md) — F6 (no virtualization), B2

## Method — measure, then change

1. State the symptom and the number: which route, which query, what latency or size, at what
   percentile if known.
2. Reproduce it. Time the query, count the requests, inspect the payload, build and read the bundle
   report.
3. Find the dominant cost. One bottleneck usually explains most of it.
4. Fix that one thing.
5. Re-measure and report before/after.

An optimization without a before number is not an optimization; it is a guess with extra risk.

## Backend checks

- **N+1:** any Prisma call inside a loop or a `map`. Batch with `include`/`select`, or one query with
  `in`.
- **Over-fetching:** returning whole rows when the client needs four fields.
- **Index coverage:** every filter, sort and join backed by an index in the query's actual column
  order. Verify in `schema.prisma`; do not assume.
- **Unbounded reads:** `findMany` without `take`, or pagination that grows with offset.
- **Repeated per-request work:** recomputation that could be cached (explicit TTL + invalidation) or
  queued.
- **Serial awaits** that could be `Promise.all` when independent.
- **In-process queue pressure:** BullMQ processors share the API process, so a heavy job degrades
  request latency. Check whether a change makes jobs heavier.
- **Payload size:** feed and chat responses are the biggest; every added field multiplies by page
  size.

## Frontend checks

- **Re-renders:** unstable props, objects and callbacks created inline in list rows, context values
  changing on every render.
- **Query behaviour:** duplicate fetches for the same key, missing `enabled` guards, over-broad
  invalidation refetching the whole feed after a like.
- **Long lists:** there is no virtualization library. `content-visibility` on `PostCard` and
  `IntersectionObserver` infinite scroll are the current mitigations. Adding virtualization is a
  dependency decision needing confirmation.
- **Media:** `ProgressiveImage` for images, `hls.js` for video, correct dimensions to avoid layout
  shift, and no full-resolution asset where a thumbnail exists (`thumbnailUrl`, `standardUrl`).
- **Bundle:** respect the `manualChunks` split, keep heavy libraries (`recharts`, `konva`,
  `@ffmpeg/*`, LiveKit) out of the initial chunk, and lazy-load heavy routes as `App.tsx` already
  does.
- **Main thread:** media processing belongs in `src/workers/mediaProcessor.worker.ts`.
- **Perceived speed:** optimistic updates and skeletons over spinners.
- **Mobile:** `backdrop-filter` is already disabled at 768px and below — do not reintroduce expensive
  effects there.

## Hard rules

- No optimization without a measurement.
- No correctness or security trade for speed. Never cache an authorization decision, never drop a
  viewer dimension from a cache key.
- No premature micro-optimization in cold paths.
- No new dependency for performance without explicit confirmation.
- No `select` narrowing that silently removes a field the client uses — check the caller.
- Report honestly when a change did not help; revert it.

## Output

- **Symptom** with the baseline number.
- **Dominant cost** with evidence: query plan, request count, timing, bundle delta.
- **Change** and why it addresses that cost.
- **After** measurement, same method as before.
- **Trade-offs:** memory, staleness, complexity.
- **Rejected options** and why.
