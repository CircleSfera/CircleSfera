# ADR-0020: Media entity with an explicit lifecycle state machine

- **Status:** Accepted
- **Date:** 2026-09-23
- **Deciders:** CircleSfera engineering
- **Scope:** backend, data

## Context

MEDIA-005 (Notion — CircleSfera Architecture Refactoring Backlog) requires: "Media needs durable
pending/processing/ready/failed/deleting/deleted lifecycle," target state "idempotent media state
machine," acceptance criterion "retries/deletion cannot produce ambiguous or prematurely served
assets."

No `Media` model exists in `schema.prisma` today. Media is represented by duplicated URL columns
(`url`, `standardUrl`, `thumbnailUrl`) inline across **7 models**, amounting to **9 independent media
slots**, none of which has a status field — state is entirely implicit via column nullability:

| Model | Slot(s) | Notes |
| --- | --- | --- |
| `PostMedia` | media | supports video (HLS transcode) |
| `Story` | media | supports video (HLS transcode) |
| `Message` | media | supports video (HLS transcode) |
| `Message` | voice note (`voiceUrl`/`voiceDuration`/`voiceWaveform`) | audio only, never transcoded |
| `Comment` | media | supports video (HLS transcode) |
| `Comment` | voice note (`voiceUrl`/`voiceDuration`/`voiceWaveform`) | audio only, never transcoded |
| `Profile` | avatar (`avatar`/`standardUrl`/`thumbnailUrl`) | image only |
| `Profile` | cover (`cover`/`coverStandardUrl`/`coverThumbnailUrl`) | image only |
| `Collection` | cover (`coverUrl`/`standardUrl`/`thumbnailUrl`) | image only |

Verified current upload flow (`circlesfera-backend/src/uploads/uploads.service.ts:109-200`):

- Images are fully synchronous — three variants uploaded before the API response returns. No
  "pending" state is possible or needed for images.
- Video: the raw file is stored and its `url` returned immediately; an HLS transcode job is enqueued
  fire-and-forget (`videoQueue.add`, deterministic `jobId: transcode:${uuid}`, 3 retries with backoff
  — UPLOAD-006). The caller persists the raw `url` right away, so a freshly created video post has
  `standardUrl: null, thumbnailUrl: null` until the background job completes.
- On completion, `video.processor.ts:278-339` does a **blind reverse-lookup `updateMany({where:
  {url}, ...})` independently against all 7 video-capable slots** — a string match, not a foreign key
  to the owning row. Idempotency is filesystem-based (checks the HLS output already exists on disk),
  not DB-state-based.
- Verified (audit, this ADR's originating investigation): no state resurrection or ambiguous-serve
  bug exists today. Deleting a post mid-transcode makes the processor's `updateMany` silently affect
  zero rows. Raw MP4 plays immediately; HLS/thumbnail arriving later is progressive enhancement, not
  a broken intermediate state.
- **The one confirmed real gap:** there is no `failed` state. A transcode that permanently exhausts
  its 3 retries leaves the row with `standardUrl: null` forever — indistinguishable from "still
  queued" or "never had a video." No error marker, no operator visibility.

Closing this properly — not just papering over the one confirmed gap — requires a real state machine
with one authoritative implementation, not a ninth or tenth copy of ad hoc nullability logic.

## Decision

Introduce a `Media` entity as the single source of truth for upload lifecycle state, referenced by a
nullable foreign key from each of the 7 owning models. Roll it out in three releases, matching this
repo's Expand/Contract backward-compatibility rule (`.ai/playbooks/schema-change.md` §4) — a
single-PR "big bang" migration touching 9 slots' worth of read and write sites is not verifiable with
enough confidence to ship safely in one step, and would leave rollback unavailable if anything broke.

```prisma
enum MediaKind {
  IMAGE
  VIDEO
  AUDIO
}

enum MediaStatus {
  PENDING     // upload accepted, variant generation not started
  PROCESSING  // transcode job running
  READY       // all expected variants exist
  FAILED      // permanently failed after exhausting retries
  DELETING    // owning row deleted; storage cleanup not yet confirmed
  DELETED     // storage cleanup confirmed (terminal)
}

model Media {
  id            String      @id @default(uuid())
  kind          MediaKind
  status        MediaStatus @default(READY) // existing rows backfill as READY (or FAILED — see Phase 1)
  url           String
  standardUrl   String?
  thumbnailUrl  String?
  failedAt      DateTime?
  failureReason String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  @@index([status])
  @@map("media")
}
```

Each of the 7 owning models gets one nullable `mediaId String?` column per slot (9 columns total,
since `Profile`, `Comment` and `Message` have more than one slot), each with its own relation to
`Media`.

### Phase 1 — Expand (this item's scope; implemented once this ADR is accepted)

Purely additive, zero functional/behavioral change:

1. Add the `Media` model and the 9 nullable `mediaId` columns via migration.
2. Backfill script: for every existing non-null `url` across the 9 slots, create one `Media` row
   (`kind` inferred from the slot; `status: READY` if a `standardUrl`/`thumbnailUrl` variant exists
   where one is expected, `status: PENDING` for image-only slots that never produce those variants by
   design, `status: FAILED` for a video slot whose variant columns are still null — this is exactly
   the one confirmed gap becoming visible for the first time instead of staying silent) and set the
   corresponding `mediaId`.
3. Existing inline URL columns are **not touched** and remain the sole read path for all application
   code. `Media` rows exist but nothing reads them yet.
4. Update `video.processor.ts` to also write `status`/`failedAt`/`failureReason` onto the matching
   `Media` row (in addition to, not instead of, its existing 7-table blind `updateMany`) — this alone
   closes the literal "no failed state" gap, observably, without any read-site migration.

### Phase 2 — Switch (separate item, own review; not in this ADR's implementation scope)

Migrate every write site (upload flow, the 7-table transcode `updateMany`) and every read site (feed,
post/story/comment/message serializers, profile responses — dozens of call sites across the API
surface) to create/update/read through `Media` and its `mediaId` relation instead of the inline
columns. This is where `PENDING`→`PROCESSING`→`READY`/`FAILED` becomes a real, observed transition
instead of an inferred one, and where "retries cannot produce an ambiguous state" becomes fully true
end-to-end rather than true-by-accident. Estimated multi-PR; needs its own scoping pass per slot
group (posts/stories first, chat second, profile/collection last, in decreasing traffic order) before
starting.

### Phase 3 — Contract (separate item, much later; not in this ADR's implementation scope)

Once Phase 2 has run in production with no incidents for a full deploy cycle, drop the now-redundant
inline URL/variant columns from the 7 models. Destructive; requires its own confirmation per
`AGENTS.md` at that time, independent of this ADR's approval now.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Leave state implicit (status quo) | This is literally what MEDIA-005 was opened to fix — the backlog item exists because implicit state via nullability hides the permanently-failed-transcode case with no operator signal. |
| Add a `status` enum column directly on each of the 7 models/9 slots, no shared `Media` table | Keeps 9 independent copies of the same state logic — the divergent-implementation problem this session's AUTHZ-002 item specifically existed to eliminate elsewhere in the codebase. Doesn't fix the transcode processor's blind reverse-lookup `updateMany`, since there'd still be no single row a job can address directly. |
| Single-PR "big bang" migration (schema + all read/write sites at once) | Violates this repo's own Expand/Contract backward-compatibility rule for schema changes touching this much surface area; a mid-rollout crash would leave `prisma migrate deploy`'s new schema running against old application code with no tested compatibility story, and no viable rollback. |
| Minimal fix only — add `failedAt`/`failureReason` directly to the 7 video-capable slots, skip the `Media` entity entirely | Closes the one confirmed gap cheaply, but does not deliver "idempotent media state machine" as the backlog item's target state actually asks for, and still leaves 7 duplicated implementations instead of one. Considered and rejected in favor of doing Phase 1 properly, since Phase 1 is barely larger in scope than this minimal fix would have been (one new table + 9 nullable columns is still purely additive) while actually laying the foundation Phase 2 needs. |

## Consequences

**Accepted costs.** Phase 1 adds one new table and 9 nullable columns that nothing reads yet — dead
weight until Phase 2 ships. The backfill script must run once against production data before Phase 1
is considered complete; it is read-heavy (one pass over 9 tables) but write-light (only inserts new
`Media` rows and sets new FK columns, never touches existing columns).

**Constraints this imposes.** Any new content type that stores an uploaded asset going forward should
get a `mediaId` relation to `Media` from day one rather than inline URL columns, to avoid growing a
tenth duplicated slot while Phase 2/3 are still in flight.

**What this does not decide.** The exact backfill batching/throttling strategy (left to the Phase 1
implementation PR); whether `AUDIO` (voice notes) ever needs `PROCESSING`/`FAILED` states in practice
— today voice notes are synchronous uploads with no transcode step, so in practice they only ever
reach `READY` directly, and this ADR does not commit to changing that; the exact per-slot-group
ordering and PR boundaries for Phase 2 (noted as a starting suggestion above, not a commitment); and
whether Phase 3's column drop happens table-by-table or in one pass once Phase 2 is fully soaked.

## Implementation anchors

- `circlesfera-backend/prisma/schema.prisma` — `Media` model, `MediaKind`/`MediaStatus` enums, and the
  9 new `mediaId` columns on `PostMedia`, `Story`, `Message` (×2), `Comment` (×2), `Profile` (×2),
  `Collection`.
- `circlesfera-backend/src/uploads/uploads.service.ts:109-200` — upload entry point (Phase 2 write
  site).
- `circlesfera-backend/src/uploads/processors/video.processor.ts:278-339` — transcode completion
  handler; Phase 1 adds `Media.status`/`failedAt`/`failureReason` writes here alongside its existing
  logic.
- A new one-off backfill script under `circlesfera-backend/scripts/` (Phase 1), not a `prisma/seed.ts`
  change.

## Revisiting

If Phase 2's per-call-site migration proves too large to land safely even split by slot group, this
ADR should be revisited to consider a narrower version of `Media` (e.g. video-capable slots only,
leaving image-only slots — Profile avatar/cover, Collection cover — on inline columns permanently,
since they never have a pending/processing window to represent). That would reduce Phase 2/3 scope at
the cost of the model staying non-uniform across content types.
