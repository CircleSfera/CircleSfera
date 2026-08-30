# ADR-0016: Analytical warehouse (ClickHouse) and ETL

**Status:** Proposed  
**Date:** August 2026

## Context

CircleSfera needs analytical KPIs (Trust MTTR aggregates, monetization MRR, retention cohorts) without overloading PostgreSQL or building one-off admin queries for every metric. Phase 2–4 product work already emits durable facts in Postgres (`Report.resolvedAt`, transactions, dwell events, feature flags).

`00-status.md` previously listed “data warehouse / BI” as OUT OF SCOPE for the Jul 2026 closure track. Product has reopened measurement at scale.

## Decision

1. **Warehouse engine:** **ClickHouse** (ClickHouse Cloud or self-hosted beside OVH VPS), not BigQuery as the first slice.
   - Aligns with existing OVH + Docker ops model; columnar OLAP fits event/time-series workloads (dwell, MTTR rollups, MRR daily).
   - BigQuery remains a valid future path if the stack moves to GCP; do not dual-write on day one.

2. **ETL pattern:** Nightly **incremental** jobs from Postgres → ClickHouse (no synchronous double-write on request path).
   - Source: read replicas or off-peak `pg_dump`/logical export of bounded tables — **never** heavy analytics scans on the primary during peak.
   - First tables: `reports`, `appeals`, `support_tickets`, `transactions`, `users` (account facts only), `feature_flags` / assignment snapshots.

3. **P0 dashboards (internal, Admin or Metabase/Grafana):**
   - **Trust & Safety:** 30-day median MTTR by queue (reports, appeals, tickets) — mirrors Trust tab but trended.
   - **Monetization:** daily gross/net by `TransactionType`, Connect payout lag.
   - **Product (Phase 2):** dwell aggregates by feed variant when `feed_home_following_first` is enabled.

4. **Postgres remains source of truth** for operational queues and billing. ClickHouse is read-only analytics; no writes back to prod DB.

## Consequences

- New infra: ClickHouse instance, ETL cron (BullMQ or host cron + script), secrets in `.env.production` (not in git).
- New repo scripts under `scripts/etl/` (to be added in a follow-up PR after ClickHouse provisioning).
- Trust tab MTTR stays on Postgres (real-time, last 30 days); warehouse powers trends and executive views.
- Update `00-status.md` when first ETL job ships — until then this ADR is design-only.

## Alternatives considered

| Option | Why not first |
|--------|----------------|
| BigQuery | No GCP footprint today; higher ops switch cost |
| Postgres materialized views only | Does not scale to dwell/event volume or cross-domain BI |
| Real-time CDC (Debezium) | Overkill before nightly SLA is proven |

## References

- Trust MTTR: `GET admin/trust/queue` (`reportMttr`, `appealMttr`, `ticketMttr`)
- Feed experiment: `feed_home_following_first` ([runbook](../runbooks/feed-following-first-experiment.md))
- Phase map: [12-global-roadmap.md](../12-global-roadmap.md) §5
