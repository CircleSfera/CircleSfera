# ADR-0001: ProfileEmbedding retention

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** CircleSfera engineering (remediation pass)

## Context

Audit notes flagged `ProfileEmbedding` (`profile_embeddings`) as an orphan model. Inspection of the current codebase shows:

- **Read path:** `SearchService.semanticSearchProfiles` queries `profile_embeddings` via pgvector (`<=>`) for `/search/ai/profiles`.
- **Write path:** no `prisma.profileEmbedding.create/upsert` (or equivalent) exists yet. Embeddings for other domains (posts/firewall) are generated in AI/admin processors, but profiles are not indexed into this table.

## Decision

Keep the `ProfileEmbedding` model and the semantic search read path.

Do **not** drop the table/model as part of cleanup. Treat missing writers as a known product gap: semantic profile search returns empty until a backfill/indexing job is implemented.

## Consequences

- Schema and search API remain ready for AI profile discovery.
- Product/docs must not claim populated semantic profile results until a writer exists.
- Future work: enqueue embedding upserts on profile create/update (and optional backfill), then verify `/search/ai/profiles`.
