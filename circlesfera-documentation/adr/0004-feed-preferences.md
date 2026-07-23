# ADR-0004: Feed preference domain tables (hide post/author, mute keywords)

- **Status:** Accepted
- **Date:** 2026-07-23
- **Deciders:** CircleSfera engineering (closure-to-100% pass)

## Context

CircleSfera previously only offered full-account `Mute` for feed control. Product needed lighter, reversible controls: hide one post, hide an author without the social semantics of mute, and mute caption keywords.

## Decision

Dedicated per-user tables (migration `20260723180000_live_gifts_and_feed_preferences`):

- `FeedHiddenPost` → `feed_hidden_posts`
- `FeedHiddenAuthor` → `feed_hidden_authors`
- `FeedMutedKeyword` → `feed_muted_keywords`

Keyword matching: case-insensitive substring on `posts.caption` via SQL `POSITION(keyword IN LOWER(caption))` in hybrid feed and in-memory filter on following-feed fallback.

API: `GET/POST/DELETE` under `/feed/preferences/*`. UI: Settings → Feed preferences; Post menu → Not interested / Hide author.

## Consequences

- Feed cache keys may briefly serve stale results until TTL; invalidate on preference write is recommended follow-up.
- Keyword matching is substring-based (not tokenized NLP); keep keywords short to avoid over-filtering.
