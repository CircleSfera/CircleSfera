# Analytics ETL — Postgres → ClickHouse (ADR-0016)

CircleSfera exports analytics **read-only** from PostgreSQL. Operational queues stay in Postgres; ClickHouse powers trends and BI.

## Primary path (production)

**BullMQ job** `nightly-analytics-export` on queue `warehouse-export`:

- Schedule: **03:30 UTC** daily (`30 3 * * *`)
- Registered in `WarehouseModule` on backend boot (same pattern as GDPR crons)
- Writes CSV under `ETL_DIR` (default `./backups/etl/<timestamp>/`)
- If `CLICKHOUSE_URL` is set → HTTP `INSERT ... FORMAT CSVWithNames` per table

### Backend environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ETL_DIR` | `./backups/etl` | CSV output root (mount a volume in prod) |
| `ETL_SINCE_DAYS` | `1` | Incremental window for touched rows |
| `CLICKHOUSE_URL` | — | Optional. e.g. `https://user:pass@host:8443` |
| `CLICKHOUSE_DATABASE` | `circlesfera_analytics` | Target database |

On OVH Docker, set `ETL_HOST_DIR=/srv/circlesfera/backups/etl` and `ETL_DIR=/app/circlesfera-backend/backups/etl` in `.env.production` (compose bind mount is shipped).

### ClickHouse setup

Full step-by-step: **[runbook: ClickHouse Cloud analytics](../circlesfera-documentation/runbooks/clickhouse-cloud-analytics.md)**.

1. Provision **ClickHouse Cloud** (recommended) or self-hosted.
2. Apply schema: [`clickhouse-schema.sql`](./clickhouse-schema.sql)
3. Set `CLICKHOUSE_URL` + `CLICKHOUSE_DATABASE` in production env (never commit secrets).
4. Deploy backend — next 03:30 UTC run loads automatically.

### Grafana / Metabase

Connect read-only to ClickHouse Cloud. P0 dashboards (ADR-0016):

- Trust: daily median MTTR by queue (`reports`, `appeals`, `support_tickets`)
- Monetization: daily sum `amount` by `type` from `transactions`
- Experiments: `feature_flags` snapshot + join with product metrics later

---

## Plan B (manual / disaster)

[`export-analytics-tables.sh`](./export-analytics-tables.sh) — bash + `psql` when backend is down or for one-off backfill:

```bash
ETL_SINCE_DAYS=90 DATABASE_URL=... ./scripts/etl/export-analytics-tables.sh
```

Load manually:

```bash
clickhouse-client --secure --query "INSERT INTO circlesfera_analytics.reports FORMAT CSVWithNames" < reports.csv
```

---

## References

- [ADR-0016](../circlesfera-documentation/adr/0016-analytical-warehouse-clickhouse.md)
- Backend: `circlesfera-backend/src/warehouse/`
