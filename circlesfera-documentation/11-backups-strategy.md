# Backup Strategy - CircleSfera

**Version:** 2.1 (OVH VPS + scripts in repo)  
**Date:** July 2026  
**Owner:** DevOps Lead @ CircleSfera

---

## Implemented scripts (source of truth)

| Script | Purpose |
|--------|---------|
| [`scripts/backup-postgres.sh`](../scripts/backup-postgres.sh) | `pg_dump -Fc` + TOC verify + local retention (+ optional S3) |
| [`scripts/backup-uploads.sh`](../scripts/backup-uploads.sh) | Tar.gz of local uploads volume (+ optional S3) |
| [`scripts/restore-postgres.sh`](../scripts/restore-postgres.sh) | `pg_restore` (requires `CONFIRM=YES`) |

Deploy CD takes a **best-effort pre-migrate dump** on the VPS before rolling backend/frontend (see `.github/workflows/deploy.yml`), writing to `/srv/circlesfera/backups/postgres` when the deploy user can create that path. Schedule daily cron on the VPS for `backup-postgres.sh` and `backup-uploads.sh` with `BACKUP_DIR=/srv/circlesfera/backups` (writable by the deploy user; avoid `/var/backups` unless the user has write access).

Runbooks: [`runbooks/restore-postgres.md`](./runbooks/restore-postgres.md), [`runbooks/rollback-deploy.md`](./runbooks/rollback-deploy.md).

---

## Objective

Define the backup strategy to ensure data recovery in case of loss, corruption, or disaster. This strategy covers PostgreSQL (structured application data), MinIO/S3 (media files), and Redis (cache and sessions, not critical for backups).

---

## Scope

### Critical Data to Back Up

1. **PostgreSQL (via Prisma)** - Primary relational database
   - Tables: users, profiles, posts, frames, comments, likes, follows, saves, collections, stories, notifications, messages, platform_subscriptions, admin_audit_logs, etc.
   - **Priority:** 🔴 CRITICAL

2. **MinIO/S3** - Multimedia file storage
   - Frame videos
   - Post images
   - User avatars
   - Thumbnails
   - **Priority:** 🔴 CRITICAL

3. **Redis** - Cache and WebSockets PubSub
   - Feed cache and rate limiting
   - Presence / session state
   - **Priority:** 🟡 MEDIUM (normally discarded; rebuilt hot)

---

## Backup Strategy (Current Implementation)

### PostgreSQL

#### Frequency
- **Full backups (Full Dumps):** Executed via `scripts/backup-postgres.sh` (typically scheduled daily).
- **Pre-migration backups:** Manual (executed in CI/CD before `npx prisma migrate deploy`).

#### Retention
- **Local backups:** 30 days (managed by `backup-postgres.sh` via `-mtime`).

#### Method
- Logical extraction using the custom format (`-Fc`) via the `backup-postgres.sh` script:
```bash
pg_dump --dbname="${DATABASE_URL}" -Fc --file="${BACKUP_FILE}"
```

#### Storage
- **Local:** `postgres/full` inside the defined `BACKUP_DIR` (e.g., `/srv/circlesfera/backups`).
- **Remote (Optional):** Uploaded via `aws s3 cp` to `S3_BACKUP_BUCKET` if the environment variable is set.

### Media (Uploads)

#### Frequency
- **Full backups (Tarball):** Executed via `scripts/backup-uploads.sh` (typically scheduled daily).

#### Retention
- **Local backups:** 30 days (managed by `backup-uploads.sh` via `-mtime`).

#### Method
- Compressed tarball creation of the local Docker volume `uploads_data`:
```bash
tar -czf "${ARCHIVE}" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")"
```

#### Storage
- **Local:** `uploads/` inside the defined `BACKUP_DIR`.
- **Remote (Optional):** Uploaded via `aws s3 cp` to `S3_BACKUP_BUCKET` if the environment variable is set.

### Redis

- **Frequency:** Not critical for long-term retention.
- **Method:** Rebuilt hot; sessions/cache discarded on catastrophic failure.

---

## Future Roadmap (Not Implemented)

> [!WARNING]
> The following features are aspirational and **DO NOT** exist in the current implementation. Do not rely on them during an incident.

- **PostgreSQL WAL Archiving (PITR):** Continuous Point-In-Time Recovery configured at the cluster/cloud provider level.
- **MinIO/S3 Primary Media Storage:** Syncing media to S3 as the primary source of truth.
- **Glacier/Cold Storage:** Moving older backups (e.g., monthly backups) to an archival storage class.
- **Cross-Region Replication:** Replicating S3 buckets automatically across multiple regions.

---

## Backup Scripts (Example)

### Main Script: `scripts/backup.sh`

```bash
#!/bin/bash
set -euo pipefail

# Configuration
DATABASE_URL="${DATABASE_URL:-}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-circlesfera-backups}"

log() { echo -e "\033[0;32m[$(date +'%Y-%m-%d %H:%M:%S')]\033[0m $1"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $1" >&2; }

# PostgreSQL backup
backup_postgres() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/postgres/full/pg_backup_${timestamp}.dump"
    
    log "Starting PostgreSQL backup..."
    mkdir -p "${BACKUP_DIR}/postgres/full"
    
    # Custom format (-Fc) is recommended for better compression and restore options
    pg_dump --dbname="${DATABASE_URL}" -Fc --file="${backup_file}" || {
        error "Error in full PostgreSQL backup"
        return 1
    }
    
    log "Uploading PostgreSQL backup to S3..."
    aws s3 cp "${backup_file}" "s3://${S3_BACKUP_BUCKET}/postgres/full/pg_backup_${timestamp}.dump" || {
        error "Error uploading backup to S3"
        return 1
    }
    
    log "Backup completed successfully."
}

# (For the restore script, use pg_restore -d "${DATABASE_URL}" "${backup_file}")

main() {
    backup_postgres
}

main "$@"
```

---

## Backup Verification

### Weekly Verification Checklist
- [ ] Backup script completed with exit code `0`.
- [ ] `.dump` file in S3 has a coherent size (> 0 and similar/larger than the previous day).
- [ ] Mandatory monthly test: Instantiate a temporary local database, run `pg_restore`, and validate via `npx prisma db pull` or E2E tests that schemas match and data is intact.

---

## Partial vs Full Restore Procedure

### Full Restore (Disaster Recovery)
1. **Shutdown:** Stop containers and traffic to the backend (avoid concurrent transactions).
2. **Recreation:** Drop and recreate an empty database.
3. **Restore:**
   ```bash
   pg_restore --dbname="$DATABASE_URL" --jobs=4 --clean --if-exists /path/to/backup.dump
   ```
4. **Validation:** Start Prisma Client and run internal validation (health checks).
5. **Open:** Reactivate traffic.

### Partial Restore (Per table)
- Occurs very rarely. To recover specific corrupted data (e.g., a user deleted by mistake), restore the full dump into an *auxiliary database* and run `INSERT INTO db_prod.users SELECT * FROM db_backup.users WHERE id = 'xyz'` queries.

---

**Last updated:** June 2026
