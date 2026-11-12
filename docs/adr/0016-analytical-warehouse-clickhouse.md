# ADR-0016: Analytical warehouse (ClickHouse) and ETL

**Status:** Accepted (owner)  
**Date:** August 2026; accepted November 2026

## Context

CircleSfera needs analytical KPIs (Trust MTTR aggregates, monetization MRR, retention cohorts) without overloading PostgreSQL or building one-off admin queries for every metric. Phase 2–4 product work already emits durable facts in Postgres (`Report.resolvedAt`, transactions, dwell events, feature flags).

`00-status.md` previously listed “data warehouse / BI” as OUT OF SCOPE for the Jul 2026 closure track. Product has reopened measurement at scale.

## Decision

1. **Warehouse engine:** **ClickHouse** (ClickHouse Cloud or self-hosted beside OVH VPS), not BigQuery as the first slice.
   - Aligns with existing OVH + Docker ops model; columnar OLAP fits event/time-series workloads (dwell, MTTR rollups, MRR daily).
   - BigQuery remains a valid future path if the stack moves to GCP; do not dual-write on day one.

2. **ETL pattern:** Nightly **incremental** jobs from Postgres → ClickHouse (no synchronous double-write on request path).
   - **Primary (shipped):** BullMQ `nightly-analytics-export` at 03:30 UTC (`WarehouseModule`) — CSV to `ETL_DIR`, optional HTTP load when `CLICKHOUSE_URL` is set.
   - **Plan B:** `scripts/etl/export-analytics-tables.sh` for manual/backfill when backend is unavailable.
   - Source reads stay bounded by `ETL_SINCE_DAYS`; avoid heavy analytics scans on primary during peak.

3. **P0 dashboards (internal, Admin or Metabase/Grafana):**
   - **Trust & Safety:** 30-day median MTTR by queue (reports, appeals, tickets) — mirrors Trust tab but trended.
   - **Monetization:** daily gross/net by `TransactionType`, Connect payout lag.
   - **Product (Phase 2):** dwell aggregates by feed variant when `feed_home_following_first` is enabled.

4. **Postgres remains source of truth** for operational queues and billing. ClickHouse is read-only analytics; no writes back to prod DB.

## Deployment (accepted)

- **Where:** ClickHouse runs on the production server, in its own container (`CircleSfera-ClickHouse`), image `clickhouse/clickhouse-server` on its long-term-support line (26.8), pinned by digest.
  - It publishes no port: only the backend reaches it, on the internal Docker network, at `http://clickhouse:8123`.
  - Its memory is capped at 2 GiB. When it was decided, the server had 23 GiB with about 19.7 GiB available, and the production containers used under 400 MiB.
- **Access:** one user, `circlesfera`. Its password is a repository secret (`CLICKHOUSE_PASSWORD`) that the production deploy writes, with `CLICKHOUSE_URL`, into the server's environment. Default access management is off.
- **Schema:** `scripts/etl/clickhouse-schema.sql`, applied by the container on its first start.
- **What is loaded:** the nightly export only. That is reports, appeals and support tickets (ids, statuses, dates) and payments (ids, type, amounts, VAT, refunds, status, and the ids of the paying person, the paid person and Profile, and the item). No names, emails, texts or messages.
- **How long:**
  - Rows older than 24 months are dropped by a table TTL.
  - The nightly CSVs are deleted 7 days after export (`ETL_RETENTION_DAYS`).
  - In production they live in the `etl_data` Docker volume, owned by the `node` user the backend runs as. They are a step on the way into the warehouse, not a backup: a lost folder is exported again.
  - When a person's account is erased, their rows are deleted from ClickHouse too.
- **Backups:** none. ClickHouse holds a copy of what Postgres holds and is rebuilt from it.
- **Dashboards:** not part of this step.

## Consequences

- New infra: ClickHouse instance, ETL cron (BullMQ or host cron + script), secrets in `.env.production` (not in git).
- New repo scripts under `scripts/etl/` — **v0 shipped:** `export-analytics-tables.sh` (plan B), `clickhouse-schema.sql`. **Primary:** BullMQ `WarehouseModule`.
- Trust tab MTTR stays on Postgres (real-time, last 30 days); warehouse powers trends and executive views.
- Ops runbook: `scripts/etl/README.md`
- The first load runs the night after the deploy that adds ClickHouse.

## Alternatives considered

| Option | Why not first |
|--------|----------------|
| BigQuery | No GCP footprint today; higher ops switch cost |
| Postgres materialized views only | Does not scale to dwell/event volume or cross-domain BI |
| Real-time CDC (Debezium) | Overkill before nightly SLA is proven |

## References

- Trust MTTR: `GET admin/trust/queue` (`reportMttr`, `appealMttr`, `ticketMttr`)
- Feed experiment: `feed_home_following_first` (retired runbook `feed-following-first-experiment.md`)
- Phase map: retired `12-global-roadmap.md` section 5; current roadmap in Notion → Execution → Roadmaps
