# Runbook: Restore PostgreSQL

## Goal

Restore the application database from a backup produced by `scripts/backup-postgres.sh`.

## Prerequisites

- Access to the backup file and the target Postgres instance
- Downtime window or read-only mode agreed with product/ops
- Confirm `DATABASE_URL` / connection target before writing

## Steps (stub)

1. Take a fresh safety backup of the current DB if it still has value: `scripts/backup-postgres.sh`.
2. Stop or drain writers (API/workers) as needed so restore is not racing with traffic.
3. Run `scripts/restore-postgres.sh` with the intended backup path and environment variables documented in that script.
4. Verify migrations match the restored schema (`npx prisma migrate status` in `circlesfera-backend`).
5. Smoke-test auth, feed, and payments webhooks before reopening traffic.

## Related

- `scripts/backup-postgres.sh`
- `circlesfera-documentation/11-backups-strategy.md`
