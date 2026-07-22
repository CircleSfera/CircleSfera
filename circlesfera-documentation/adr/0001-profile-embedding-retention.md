# ADR-0001: ProfileEmbedding retention

- **Status:** Accepted (writer added 2026-07-22)
- **Date:** 2026-07-22
- **Deciders:** CircleSfera engineering (remediation pass)

## Context

Audit notes flagged `ProfileEmbedding` (`profile_embeddings`) as an orphan model. Inspection showed:

- **Read path:** `SearchService.semanticSearchProfiles` queries `profile_embeddings` via pgvector (`<=>`) for `/search/ai/profiles`.
- **Write path (initial):** missing; only post/firewall embeddings were generated.

## Decision

Keep the `ProfileEmbedding` model and the semantic search read path.

**Writer (implemented):** on profile update (`username` / `fullName` / `bio`), `ProfilesService` enqueues `generate-profile-embedding` on the `ai-processing` queue; `AIProcessor` upserts into `profile_embeddings`.

Historical backfill of existing profiles remains available via:

`npm run embeddings:backfill` in `circlesfera-backend` (`scripts/generate-embeddings.ts`).

Supports `--profiles-only`, `--posts-only`, and `--limit=N`.

## Consequences

- Schema and search API remain ready for AI profile discovery.
- New/updated profiles become searchable after embedding jobs run.
- Existing profiles without embeddings still need a one-time backfill for full coverage.
