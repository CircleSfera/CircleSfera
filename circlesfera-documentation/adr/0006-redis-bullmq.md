# ADR-0006: Redis + BullMQ for cache, pub/sub, and jobs

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** CircleSfera engineering

## Context

The platform needs shared caching, WebSocket fan-out across instances, and durable background work (embeddings, video transcoding, feed fan-out, GDPR export/hard-delete, notification digests). Synchronous request paths cannot absorb that work.

## Decision

Use **Redis** as the shared infrastructure backbone and **BullMQ** for job queues:

- Redis: cache, Socket.IO adapter / pub-sub, BullMQ broker.
- BullMQ queues for async processors (e.g. AI, video, feed-fanout, GDPR, notifications).

Do not introduce a separate message bus (Kafka, SQS-only) for core app jobs unless scale requirements outgrow Redis/BullMQ.

## Consequences

- Operational dependency on Redis availability; queue backlog must be monitored.
- Workers and API share queue names/contracts — deploy migrations carefully when renaming queues.
- Horizontal API scaling is viable because state that must be shared lives in Redis/Postgres, not process memory alone.
