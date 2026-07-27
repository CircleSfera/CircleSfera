# Checklist — Performance

Run for changes on hot paths: feed, chat, stories, search, profile, notifications.

## Method

- [ ] A baseline number was measured before the change, with the method recorded.
- [ ] The dominant cost was identified with evidence, not assumed.
- [ ] One change addresses that cost, rather than several speculative ones.
- [ ] The same measurement was repeated after, and reported honestly.
- [ ] If the change did not help, it was reverted.

## Backend

- [ ] No Prisma call inside a loop or `map` (no N+1).
- [ ] Every new filter, sort and join is index-backed, verified in `schema.prisma` in the query's
      column order.
- [ ] `select`/`include` narrowed to fields actually used, and every caller still gets what it needs.
- [ ] No unbounded `findMany`; pagination bounded and not degrading with depth.
- [ ] Independent awaits parallelized; no accidental serial chain.
- [ ] Related writes in a single `$transaction` rather than several round trips.
- [ ] Repeated per-request computation moved to cache or a queue.
- [ ] Queue jobs did not get heavier — BullMQ processors share the API process, so job cost becomes
      request latency.
- [ ] Response payload size checked, remembering it multiplies by page size on feed and chat.

## Cache

- [ ] Explicit TTL set.
- [ ] Invalidation points written down and implemented in the service that writes.
- [ ] Cache key includes every input that changes the result, including the viewer for personalized
      reads.
- [ ] No authorization decision cached.
- [ ] No private, close-friends or locked premium content cached in a shared key.
- [ ] The read path still works with a cold cache and with Redis unavailable.

## Frontend

- [ ] No unstable objects, callbacks or keys created inline in list rows.
- [ ] Context values are stable; no provider re-rendering the tree on every keystroke.
- [ ] No duplicate queries for the same key; `enabled` guards where appropriate.
- [ ] Invalidation is targeted, not a blanket refetch of the whole feed after a small mutation.
- [ ] Images go through `ProgressiveImage`, using `thumbnailUrl` / `standardUrl` where available, with
      dimensions set to avoid layout shift.
- [ ] Heavy libraries (`recharts`, `konva`, `@ffmpeg/*`, LiveKit) stay out of the initial chunk;
      `manualChunks` and `React.lazy` boundaries respected.
- [ ] Media processing runs in `src/workers/mediaProcessor.worker.ts`, not on the main thread.
- [ ] Long lists rely on the existing mitigations (`content-visibility`, `IntersectionObserver`
      infinite scroll); adding virtualization was not done silently as a dependency change.
- [ ] Mobile is not made more expensive — `backdrop-filter` remains disabled under 768px.
- [ ] Perceived speed favoured: optimistic update or skeleton over a spinner.

## Correctness after optimization

- [ ] Narrowed queries do not drop a field a caller uses.
- [ ] Cached responses cannot leak another viewer's data.
- [ ] Tests still pass: backend `npm test` + `npm run build`, frontend `npm test` + `npm run build`.
- [ ] Trade-offs stated: memory, staleness, complexity.
