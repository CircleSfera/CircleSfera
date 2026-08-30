# Analytics ETL (v0 — Postgres export)

Nightly **read-only** exports from PostgreSQL for loading into ClickHouse (ADR-0016).
CircleSfera does not write analytics back to prod.

## Prerequisites

- `DATABASE_URL` (read-only role recommended on replica when available)
- `psql` on PATH
- Output directory writable (`ETL_DIR`, default `./backups/etl`)

ClickHouse ingest is **not** in this repo yet — export produces CSV files an operator or
`clickhouse-client` loads separately.

## Quick start

```bash
# Incremental window: rows touched in the last 1 day (default)
DATABASE_URL=postgresql://... ./scripts/etl/export-analytics-tables.sh

# Backfill example
ETL_SINCE_DAYS=90 DATABASE_URL=postgresql://... ./scripts/etl/export-analytics-tables.sh
```

Artifacts land in `${ETL_DIR}/YYYYMMDD_HHMMSS/*.csv`.

## Tables exported (minimal columns, no message bodies)

| File | Purpose |
|------|---------|
| `reports.csv` | Trust MTTR, queue volume |
| `appeals.csv` | Appeal MTTR |
| `support_tickets.csv` | Ticket MTTR (no email/subject/message) |
| `transactions.csv` | Monetization aggregates (no description) |
| `feature_flags.csv` | Experiment config snapshot |

## Cron (VPS)

Run off-peak after Postgres backups, e.g. 03:30 UTC:

```cron
30 3 * * * cd /srv/circlesfera && DATABASE_URL=... ETL_DIR=/srv/circlesfera/backups/etl ./scripts/etl/export-analytics-tables.sh >> /var/log/circlesfera-etl.log 2>&1
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Required |
| `ETL_DIR` | `./backups/etl` | Output root |
| `ETL_SINCE_DAYS` | `1` | Include rows with `created_at`, `updated_at`, or `resolved_at` in window |

## Next (ADR-0016)

- Provision ClickHouse (Cloud or Docker on OVH)
- Add `scripts/etl/load-clickhouse.sh` with `CLICKHOUSE_URL`
- Grafana/Metabase dashboards: MTTR trends, daily MRR, feed variant dwell

See [ADR-0016](../circlesfera-documentation/adr/0016-analytical-warehouse-clickhouse.md).
