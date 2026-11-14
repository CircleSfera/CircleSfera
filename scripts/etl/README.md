# Analytics ETL — Postgres → ClickHouse

CircleSfera exports analytics **read-only** from PostgreSQL. Operational queues stay in Postgres; ClickHouse powers trends and BI.

## Primary path (production)

**BullMQ job** `nightly-analytics-export` on queue `warehouse-export`:

- Schedule: **03:30 UTC** daily (`30 3 * * *`)
- Registered in `WarehouseModule` on backend boot (same pattern as GDPR crons)
- Writes CSV under `ETL_DIR` (default `./backups/etl/<timestamp>/`)
- If `CLICKHOUSE_URL` is set → HTTP `INSERT ... FORMAT CSVWithNames` per table. Values go to the columns
  their CSV header names, never by position: a column of the table that the export does not carry takes
  its default (`NULL` when nullable), and a column the export carries that the table lacks is skipped.

### Backend environment

| Variable | Default | Description |
|----------|---------|-------------|
| `ETL_DIR` | `./backups/etl` | CSV output root (mount a volume in prod) |
| `ETL_SINCE_DAYS` | `1` | Incremental window for touched rows |
| `CLICKHOUSE_URL` | — | Optional. e.g. `https://user:pass@host:8443` |
| `CLICKHOUSE_DATABASE` | `circlesfera_analytics` | Target database |

On OVH Docker, `docker-compose.prod.yml` mounts the `etl_data` volume at `/app/circlesfera-backend/backups/etl` (the default `ETL_DIR` inside the image). The image makes that folder the `node` user's, and a new volume takes that owner, so the job can write to it. A folder of the host would keep the host's owner and the job would fail with EACCES.

### ClickHouse setup

1. Provision **ClickHouse Cloud** (recommended) or self-hosted.
2. Apply schema: [`clickhouse-schema.sql`](./clickhouse-schema.sql)
3. Set `CLICKHOUSE_URL` + `CLICKHOUSE_DATABASE` in production env (never commit secrets).
4. Deploy backend — next 03:30 UTC run loads automatically.

### Grafana / Metabase

Connect read-only to ClickHouse Cloud. P0 dashboards:

- Trust: daily median MTTR by queue (`reports`, `appeals`, `support_tickets`)
- Payments: daily sum `amount` by `type` from `transactions` (plans and promotions; each row names the
  person who paid, `senderId`, and the promotion, `promotionId`). A payment is loaded again each time it
  changes (a refund, a dispute), so take its latest row per `id` (`argMax(…, updatedAt)`);
  what a payment kept is `amount - refundedCents`, and `vatCents` is the VAT inside `amount`.
- Experiments: `feature_flags` snapshot + join with product metrics later

---

## Plan B (manual / disaster)

[`export-analytics-tables.sh`](./export-analytics-tables.sh) — bash + `psql` when backend is down or for one-off backfill:

```bash
ETL_SINCE_DAYS=90 DATABASE_URL=... ./scripts/etl/export-analytics-tables.sh
```

Load manually:

```bash
clickhouse-client --secure --input_format_with_names_use_header=1 --input_format_defaults_for_omitted_fields=1 \
  --query "INSERT INTO circlesfera_analytics.reports FORMAT CSVWithNames" < reports.csv
```

---

## References

- [Decision record: analytical warehouse on ClickHouse](../../docs/adr/0016-analytical-warehouse-clickhouse.md)
- Backend: `circlesfera-backend/src/warehouse/`
