# ClickHouse Cloud — analytics warehouse

Connect CircleSfera’s nightly BullMQ export to **ClickHouse Cloud** for MTTR trends,
monetization aggregates, and experiment snapshots. Operational Trust KPIs stay in
Postgres + Admin; ClickHouse is read-only analytics.

**Related:** [ADR-0016](../adr/0016-analytical-warehouse-clickhouse.md),
[`scripts/etl/README.md`](../../scripts/etl/README.md),
[`clickhouse-schema.sql`](../../scripts/etl/clickhouse-schema.sql).

## Prerequisites

| Requirement | Notes |
| --- | --- |
| Backend deploy | Includes `WarehouseModule` (commit `e07aa7d` or later) |
| Migration applied | `20260830190000_appeal_ticket_resolved_at_feed_flag` (and all prior) |
| Redis healthy | BullMQ queue `warehouse-export` registers on backend boot |
| Host backup path | Recommended: `/srv/circlesfera/backups/etl` on the VPS |

Without ClickHouse env vars, the job still runs and writes **CSV only** (plan B path).

---

## 1. ClickHouse Cloud account

1. Go to [https://clickhouse.cloud/](https://clickhouse.cloud/) and sign up.
2. Create an **organization** (e.g. `CircleSfera`).
3. **New service**
   - Cloud provider / region: pick closest to OVH prod (e.g. EU).
   - Name: e.g. `circlesfera-analytics`.
   - Size: start with the smallest dev/starter tier; scale when query volume grows.
4. Wait until the service status is **Running**.

Do not paste service passwords into git, chat, or this runbook.

---

## 2. Apply schema (once per service)

From your laptop (with [ClickHouse client](https://clickhouse.com/docs/install) or Cloud SQL console):

```bash
# Replace HOST with the HTTPS endpoint from the Cloud console (no protocol)
clickhouse-client \
  --host HOST \
  --secure \
  --user default \
  --password \
  --multiquery < scripts/etl/clickhouse-schema.sql
```

**Alternative:** ClickHouse Cloud → **SQL console** → paste contents of
`scripts/etl/clickhouse-schema.sql` → run.

Verify:

```sql
SHOW TABLES FROM circlesfera_analytics;
```

Expect: `reports`, `appeals`, `support_tickets`, `transactions`, `feature_flags`.

---

## 3. Build `CLICKHOUSE_URL`

From the Cloud console → **Connect**:

- Host: e.g. `abc123.eu-central-1.aws.clickhouse.cloud`
- Port: **8443** (HTTPS)
- User: usually `default`
- Password: generated at service creation (rotate if lost)

Format for CircleSfera backend:

```env
CLICKHOUSE_URL=https://default:YOUR_PASSWORD@abc123.eu-central-1.aws.clickhouse.cloud:8443
CLICKHOUSE_DATABASE=circlesfera_analytics
```

If the password contains `@`, `#`, or `%`, URL-encode it
(e.g. `@` → `%40`).

---

## 4. Production env (OVH)

Add to **local** `.env.production` (never commit):

```env
# Analytics ETL (optional ClickHouse load)
ETL_DIR=/srv/circlesfera/backups/etl
ETL_SINCE_DAYS=1
CLICKHOUSE_URL=https://default:YOUR_PASSWORD@YOUR_HOST.clickhouse.cloud:8443
CLICKHOUSE_DATABASE=circlesfera_analytics
```

Upload and deploy (same flow as Stripe secrets):

```bash
./scripts/upload-prod-env.sh
# or trigger deploy workflow after gh secret ENV_PRODUCTION_B64 is updated
```

Restart backend so the process loads the new variables.

---

## 5. Persist CSV on the VPS

`docker-compose.prod.yml` bind-mounts analytics CSV to the host:

```yaml
${ETL_HOST_DIR:-./backups/etl}:/app/circlesfera-backend/backups/etl
```

On the OVH VPS, set in `.env.production`:

```env
ETL_HOST_DIR=/srv/circlesfera/backups/etl
ETL_DIR=/app/circlesfera-backend/backups/etl
```

Deploy creates `/srv/circlesfera/backups/etl` automatically. Ensure the deploy user owns it:

```bash
sudo chown -R "$USER:$USER" /srv/circlesfera/backups/etl
```

Redeploy compose after the first time you add `ETL_HOST_DIR`.

---

## 6. Verify the pipeline

### 6.1 Backend registered the cron

After deploy, backend logs on boot should include:

```text
Registered repeatable job: nightly-analytics-export (30 3 * * *)
```

### 6.2 First run timing

The repeatable job fires at **03:30 UTC** after backend boot. For an immediate smoke test
before waiting for cron, use plan B on the VPS (same tables, same window):

```bash
ETL_SINCE_DAYS=7 DATABASE_URL=... ./scripts/etl/export-analytics-tables.sh
```

Then load one file manually via `clickhouse-client` (see §8) to confirm credentials.

After `CLICKHOUSE_URL` is set, the next **03:30 UTC** BullMQ run should log
`clickhouse=true`.

### 6.3 CSV on disk

```bash
ls -la /srv/circlesfera/backups/etl/*/
# expect reports.csv, appeals.csv, support_tickets.csv, transactions.csv, feature_flags.csv
```

### 6.4 ClickHouse rows

In ClickHouse SQL console:

```sql
SELECT count() FROM circlesfera_analytics.reports;
SELECT count() FROM circlesfera_analytics.transactions;
SELECT key, isEnabled, percentage FROM circlesfera_analytics.feature_flags;
```

Backend logs on success:

```text
ClickHouse loaded N rows → reports
Warehouse export complete (... clickhouse=true)
```

If `CLICKHOUSE_URL` is unset, logs show `clickhouse=false` and CSV-only export — that is OK.

---

## 7. Grafana Cloud (optional, P0 dashboards)

1. [Grafana Cloud](https://grafana.com/products/cloud/) free tier or self-hosted Grafana.
2. **Connections → Add new connection → ClickHouse** (official plugin).
3. Use the same host, port `8443`, TLS on, database `circlesfera_analytics`.
4. Read-only user in ClickHouse Cloud is recommended for Grafana (create under **Access management**).

Starter queries:

**Daily transaction volume (cents → EUR):**

```sql
SELECT
  toDate(createdAt) AS day,
  type,
  sum(amount) / 100 AS amount_eur
FROM circlesfera_analytics.transactions
GROUP BY day, type
ORDER BY day DESC, type;
```

**Report resolution hours (median proxy):**

```sql
SELECT
  toDate(resolvedAt) AS day,
  quantile(0.5)(dateDiff('second', createdAt, resolvedAt)) / 3600 AS median_hours
FROM circlesfera_analytics.reports
WHERE resolvedAt IS NOT NULL
GROUP BY day
ORDER BY day DESC;
```

Duplicate the pattern for `appeals` and `support_tickets`.

---

## 8. Plan B (no ClickHouse / incident)

If Cloud is down or credentials rotate:

1. Leave `CLICKHOUSE_URL` unset — nightly job still writes CSV.
2. Manual export:

   ```bash
   ETL_SINCE_DAYS=90 DATABASE_URL=... ./scripts/etl/export-analytics-tables.sh
   ```

3. Manual load when ClickHouse is back:

   ```bash
   clickhouse-client --secure --query \
     "INSERT INTO circlesfera_analytics.reports FORMAT CSVWithNames" < reports.csv
   ```

---

## 9. Troubleshooting

| Symptom | Likely cause | Action |
| --- | --- | --- |
| No CSV files | `ETL_DIR` not writable / no volume mount | Fix permissions or bind mount |
| `clickhouse=false` in logs | `CLICKHOUSE_URL` missing or backend not restarted | Set env + redeploy |
| HTTP 401 on insert | Wrong password or URL encoding | Fix `CLICKHOUSE_URL` |
| HTTP 404 / unknown table | Schema not applied | Run `clickhouse-schema.sql` |
| Duplicate rows in CH | Nightly incremental re-inserts same ids | OK for v1; add ReplacingMergeTree or dedup job later |
| Job never runs | Redis down or backend boot failed | Check health + BullMQ logs |

---

## 10. Security checklist

- [ ] ClickHouse password only in `.env.production` / GitHub `ENV_PRODUCTION_B64`
- [ ] Grafana uses read-only ClickHouse user when possible
- [ ] No PII exported: tickets omit email/subject; transactions omit `description`
- [ ] ClickHouse IP allowlist (Cloud setting) includes VPS egress IP if enabled

---

**Last updated:** August 2026
