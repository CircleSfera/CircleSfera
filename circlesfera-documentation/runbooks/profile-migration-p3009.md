# Runbook: Profile ownership migration P3009

**Symptom:** Backend crash loop on deploy. Logs show:

```text
Error: P3009
migrate found failed migrations in the target database
The `20260827160002_user_profile_ownership_sync` migration ... failed
```

**Cause:** The original migration dropped `userId` and added `profileId NOT NULL` without backfilling from `profiles`, and used bare `DROP CONSTRAINT` (no `IF EXISTS`). On production data this fails mid-migration.

**Fix in repo (main):**

- `circlesfera-backend/prisma/migrations/20260827160002_user_profile_ownership_sync/migration.sql` — idempotent, data-safe rewrite (backfill + remap FKs).
- `circlesfera-backend/scripts/prisma-migrate-deploy.sh` — auto `migrate resolve --rolled-back` + retry on P3009.
- `docker-compose.prod.yml` — backend uses the script before `node dist/main`.

## Automatic recovery (preferred)

Redeploy main after the fix is merged. On startup the backend container:

1. Runs `prisma migrate deploy`.
2. If P3009 references `20260827160002_user_profile_ownership_sync`, marks it rolled back.
3. Re-runs `migrate deploy` (applies the fixed SQL, then pending migrations).

Pre-deploy workflow already takes a Postgres backup under `/srv/circlesfera/backups/postgres/`.

## Manual recovery (SSH on VPS)

If auto-recovery does not run (old image) or you need to unblock before redeploy:

```bash
cd /path/to/circlesfera   # deploy checkout on VPS
set -a && source .env.production && set +a

# Optional: backup
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > /srv/circlesfera/backups/postgres/manual_pre_p3009.dump

# Mark failed migration as rolled back
docker compose -f docker-compose.prod.yml run --rm --no-deps backend \
  npx prisma migrate resolve --rolled-back 20260827160002_user_profile_ownership_sync

# Pull latest image and recreate backend (runs fixed migrate deploy)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps backend
docker logs -f CircleSfera-Backend
```

Verify:

```bash
docker inspect --format='{{.State.Health.Status}}' CircleSfera-Backend
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8082/api/v1/health
```

## Checksum note

The migration file on disk was **replaced** after the failed prod attempt. Only environments that recorded this migration as **failed** should use `resolve --rolled-back` and re-apply. If a database already has `20260827160002` in `_prisma_migrations` with `finished_at` set, do **not** roll it back; open an incident and compare schema to `schema.prisma` instead.

## Related

- [ADR-0015](../adr/0015-user-profile-identity-split.md)
- [15-identity-profile-model.md](../15-identity-profile-model.md)
- [rollback-deploy.md](./rollback-deploy.md)
- [restore-postgres.md](./restore-postgres.md)
