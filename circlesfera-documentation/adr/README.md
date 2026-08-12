# Architecture Decision Records (ADRs)

ADRs live here and sit at priority tier 4 in `AGENTS.md` (after schema, code, and API contracts).

| ADR | Title | Status |
| --- | --- | --- |
| [0001](./0001-profile-embedding-retention.md) | ProfileEmbedding retention | Accepted |
| [0002](./0002-stripe-connect-payouts.md) | Stripe Connect Express payouts only, no internal payout ledger | Accepted |
| [0003](./0003-one-active-platform-plan.md) | One active platform subscription plan per user | Accepted |
| [0004](./0004-feed-preferences.md) | Feed preference domain tables (hide post/author, mute keywords) | Accepted |
| [0005](./0005-livekit-live-streaming.md) | LiveKit for live streaming | Accepted |
| [0006](./0006-redis-bullmq.md) | Redis + BullMQ for cache, pub/sub, and jobs | Accepted |
| [0007](./0007-auth-cookies-csrf.md) | HTTP-only auth cookies + CSRF double-submit | Accepted |
| [0008](./0008-storage-providers.md) | Pluggable storage providers (S3, Cloudinary, local) | Accepted |
| [0009](./0009-feed-fan-out.md) | Hybrid feed fan-out | Accepted |
| [0010](./0010-platform-fee-20-percent.md) | 20% platform application fee on Connect charges | Accepted |
| [0011](./0011-ai-engineering-framework.md) | In-repository AI engineering framework under `.ai/` | Accepted |
| [0012](./0012-webrtc-signaling-architecture.md) | WebRTC Voice & Video Call Signaling Architecture and Socket Event Compatibility | Accepted |

When adding a durable architectural choice, create `NNNN-slug.md` and link it from this table and from [00-status.md](../00-status.md) when relevant.
