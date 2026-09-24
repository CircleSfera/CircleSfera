# ADR-0022: Pagination and high-volume query policy

- **Status:** Accepted
- **Date:** 2026-09-24
- **Deciders:** CircleSfera engineering
- **Scope:** backend, data

## Context

DATA-003 (Notion — CircleSfera Architecture Refactoring Backlog) requires: "High-volume social
histories need stable bounded pagination," target state "Cursor/keyset pagination where appropriate
with explicit limits," acceptance criterion "No unbounded result endpoints; concurrent-write pagination
stable."

Verified current state (this ADR's originating audit, `circlesfera-backend/src/`):

- `createPaginatedResult` (`src/common/dto/pagination.dto.ts`) is a response-shape wrapper only — it
  never implemented a pagination strategy. Every one of its call sites computed
  `skip = (page - 1) * limit` underneath; `nextCursor` existed in the return type but nothing ever
  populated it. "Uses `createPaginatedResult`" therefore meant "offset-paginated with a decorated
  shape," not "cursor-paginated" — true keyset pagination did not exist anywhere in the codebase.
- Two public endpoints were **fully unbounded** — no `take`, `skip`, or row cap at all:
  `FollowsService.getFollowers`/`getFollowing` (`src/follows/follows.service.ts`) and
  `StoriesService.getViews`/`getReactions` (`src/stories/stories.service.ts`). An account with a large
  follower count, or a story with a large viewer count, returned every matching row — with full
  profile/user joins — in one response.
- `CommentsService.findByPost` used classic offset pagination (`skip`/`take`) on `Comment`, a table a
  single post's thread can grow arbitrarily large and unpredictably fast on (a viral post).
- `FeedService.getHybridFeed`'s ranked "for you" feed used raw SQL ending in `ORDER BY final_score DESC
  LIMIT $limit OFFSET $skip` — offset pagination over a live, constantly-growing table, the shape
  `LiveService.getActiveStreams` also read (see below).
- `LiveService.getActiveStreams` had no cap at all, but is bounded in practice by concurrent live
  streams platform-wide, not by a growing history — a materially smaller risk than the other findings.

Not found: any endpoint anywhere in the codebase using true cursor/keyset pagination
(`WHERE (sort_key) > cursor ORDER BY sort_key LIMIT n`) prior to this change.

## Decision

Keep `createPaginatedResult`'s response shape (`{ data, meta: { total, page, limit, totalPages,
nextCursor } }`) as the default for endpoints that need arbitrary page-number jumping, but require the
following per-endpoint choice going forward, and apply it retroactively to the findings above:

### 1. Cursor/keyset pagination — for public lists on high-fan-out, append-heavy tables

Use `src/common/pagination/keyset.util.ts` (`keysetBeforeDesc`, `toKeysetPage`) — a `(createdAt, id)`
composite keyset, descending, with `id` as a tie-breaker for rows sharing a timestamp. Stable under
concurrent inserts: a new row inserted ahead of the cursor never shifts an already-fetched page, because
the WHERE clause anchors on the last-seen row's own values, not a numeric position.

Applied to: `FollowsService.getFollowers`/`getFollowing`, `StoriesService.getViews`/`getReactions`. Both
were the confirmed-unbounded findings and both are genuinely "high-volume social histories" the backlog
item's description names. Response shape changed to `{ data, nextCursor? }` (a public API contract
change, executed with explicit user confirmation) — callers page forward only, they cannot jump to an
arbitrary page number. `CommentsService.findByPost` got a **hybrid** treatment instead: the existing
`page`-based path is preserved for backward compatibility (no known caller advances past page 1 today,
but the contract allows it), and a new `cursor`-based path using the same keyset utility is available
alongside it — `nextCursor` is populated on both paths so a caller can switch to cursor continuation
from any page onward.

### 2. Frozen ranking snapshot (`asOf`) — for score-based feeds where the sort key isn't a stable column

`FeedService.getHybridFeed`'s `final_score` is computed against `NOW()` at query time (exponential
time-decay) — not a stored column, so naive keyset pagination on it would compare a stale cursor score
against a freshly-recomputed one on every page, which is not exactly correct (though the practical drift
is small, since the decay factor is a uniform multiplier applied to every row in a given query
execution — see Alternatives Considered). The correct fix is a **frozen ranking snapshot**: the client
captures an `asOf` timestamp from the first page's response (`PaginationDto.asOf`, ISO-8601) and echoes
it back on subsequent pages; the SQL substitutes `${asOf}` for every `NOW()` inside the score
computation. A post created after `asOf` cannot be inserted into an already-fetched page, because it was
never part of the ranked set that session queried against. This is the standard pattern production
ranked feeds use (freeze-and-page, not re-rank-every-request) — outside the ranking computation itself
(e.g. mute-expiry filters), `NOW()` is left untouched, since those are correctness filters, not part of
what needs to stay stable across pages.

Cache key: page 1 keeps the original TTL-shared key (unrelated users hitting page 1 around the same
moment still share a cache entry, as before). Page 2+ requests fold `asOf` into the key, since they are
continuations of one specific session's snapshot, not requests other sessions should transparently
share.

Applied to: `FeedService.getHybridFeed` only. `getFollowingFeed` (the chronological "following" tab) and
`getTrendingFeed` (the `performanceScore`/`createdAt`-ordered fallback) both order by real stored
columns, not a `NOW()`-computed value — they don't have this instability and were left on their existing
pagination.

### 3. Bounded, not paginated — for lists that are self-limiting by nature

A safety `take` cap with no pagination metadata at all, when the collection isn't a growing "history" in
the first place. Applied to `LiveService.getActiveStreams` (`take: 200`) — concurrent live streams
platform-wide are bounded by how many creators can be live at once, not by an ever-growing log; a full
keyset implementation would be effort disproportionate to the actual risk. This is a deliberate,
narrower category than "unbounded" — it must not be used for anything that can grow with content or
social-graph history over time.

### Explicit limits

Every endpoint touched by this ADR validates and caps its `limit` (10–100 depending on the endpoint's
typical payload size) via `PaginationDto`'s existing `@Max(100)` constraint. No endpoint accepts an
unbounded or unvalidated limit.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keyset-paginate the hybrid feed directly on `final_score` | Technically imprecise: the cursor's captured score value and a freshly-computed page-2 score are evaluated against different `NOW()` values. The time-decay factor is a uniform multiplier per query execution, so relative ordering is *usually* preserved in practice over a short scroll session, but "usually" is not the same guarantee the acceptance criterion asks for ("stable"), and the failure mode (a boundary post skipped or duplicated) is exactly the bug being fixed. The frozen-snapshot approach removes the ambiguity entirely rather than relying on the decay factor's typical behavior. |
| Full keyset pagination for `CommentsService.findByPost`, dropping page-number support | Would be a breaking API contract change with no currently-known caller requiring page-jump semantics, but no caller was confirmed to *not* need it either (the frontend's post-detail view only ever requests page 1 today; other API consumers are not fully enumerable). The hybrid page/cursor approach delivers the stability improvement without a compatibility risk that wasn't independently confirmed. |
| Full keyset pagination for `LiveService.getActiveStreams` | Disproportionate: concurrent live streams are bounded by real-world concurrency, not by accumulating history — a `take` cap closes the "no unbounded result endpoints" gap at a fraction of the implementation cost. |
| Leave `createPaginatedResult` as the only pagination primitive, add cursor support to it directly | `nextCursor` already existed unused in its shape, but the function has no way to know which underlying query strategy produced its `data` — cursor resolution (looking up the cursor row, building the keyset WHERE clause) is inherently query-specific. A shared response-shape helper plus a shared keyset-WHERE helper (`keyset.util.ts`) does not need to be one function. |

## Consequences

**Breaking API contract changes (executed with explicit user confirmation).** `GET
/users/:username/follow/followers`, `/following`, and `GET /stories/:id/views`, `/reactions` changed
response shape from a bare array to `{ data, nextCursor? }`. All three known frontend consumers
(`Profile.tsx`'s followers/following modal, `NewChatModal.tsx`, `StoryViewer.tsx`) were updated in the
same change — `Profile.tsx`'s modal now supports real "load more" via `useInfiniteQuery` +
`useInfiniteScroll`; `NewChatModal.tsx` and `StoryViewer.tsx` take the first page only (100 and 50 rows
respectively), which is proportionate to their UX (a chat-starter picker and a reactions/viewers
overlay, not a primary scrollable surface) and was a deliberate scope decision, not an oversight.

**`FeedService.getHybridFeed`'s response gained a top-level `asOf` field.** Additive — existing
consumers reading only `.data`/`.meta` are unaffected. `Home.tsx`'s `useInfiniteQuery` now threads
`{ page, asOf }` as its `pageParam` instead of a bare page number to carry the snapshot across pages.

**What this does not decide.** Whether `feedInbox`'s Redis-backed skip/limit read in
`getFollowingFeed` has its own concurrent-mutation stability characteristics was not independently
re-verified in this pass (noted, not re-derived, from the originating audit) — left as a known
uncertainty, not a confirmed gap, since it reads from a pre-computed inbox rather than a live ranked
query. `NewChatModal.tsx`/`StoryViewer.tsx`'s first-page-only simplification does not add a "load more"
affordance for accounts with more than 100 people they follow, or stories with more than 50
viewers/reactions past the first page — acceptable given the existing search flow and the panels' scope,
but a real UX limitation if a future requirement needs full pagination there.

## Implementation anchors

- `circlesfera-backend/src/common/pagination/keyset.util.ts` — the shared `(createdAt, id)` keyset
  WHERE-clause and page-splitting helpers.
- `circlesfera-backend/src/common/dto/pagination.dto.ts` — `PaginationDto.asOf`, the frozen
  ranking-snapshot field.
- `circlesfera-backend/src/follows/follows.service.ts`, `src/stories/stories.service.ts` — cursor
  pagination applied to the two confirmed-unbounded findings.
- `circlesfera-backend/src/comments/comments.service.ts` — hybrid page/cursor `findByPost`.
- `circlesfera-backend/src/feed/feed.service.ts` — `getHybridFeed`'s `asOf` snapshot.
- `circlesfera-backend/src/live/live.service.ts` — `getActiveStreams`'s safety cap.
- `circlesfera-frontend/src/pages/Profile.tsx`, `src/components/FollowersModal.tsx`,
  `src/components/chat/NewChatModal.tsx`, `src/components/StoryViewer.tsx`, `src/pages/Home.tsx` —
  frontend consumers updated for the new response shapes.
