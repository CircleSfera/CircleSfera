# Backup Strategy - CircleSfera

**Version:** 2.0 (Adapted for PostgreSQL)  
**Date:** June 2026  
**Owner:** DevOps Lead @ CircleSfera

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

## Backup Strategy

### PostgreSQL

#### Frequency
- **Full backups (Full Dumps):** Daily at 02:00 UTC
- **Incremental / continuous backups (WAL Archiving):** Configured at cluster / cloud provider level (continuous Point-In-Time Recovery - PITR)
- **Pre-migration backups:** Manual (executed in CI/CD before `npx prisma migrate deploy`)

#### Retention
- **Daily backups (Dumps):** 30 days
- **WAL files (PITR):** 7 to 14 days (depending on environment and provider)
- **Monthly backups (Archived):** 12 months (last backup of each month in cold storage)

#### Method
For manual logical extractions or on-premise scripts:
```bash
# Full backup in compressed directory format (optimized for pg_restore)
pg_dump --dbname="$DATABASE_URL" --format=directory --jobs=4 --file=/backups/postgres/full/$(date +%Y%m%d_%H%M%S)
```

#### Compression
- Use native `pg_dump` compression or subsequently compress the tarball with `gzip`/`zstd` to save space.
- Estimated compression time depends on database size and allocated resources.

#### Storage
- **Temporary local:** `/backups/postgres/`
- **Remote:** S3 bucket `circlesfera-db-backups` (medium/long retention)
- **Region:** Multiple regions for redundancy (Cross-Region Replication on S3).

### MinIO/S3

#### Frequency
- **Full backups (Base sync):** Weekly (Sundays at 03:00 UTC)
- **Incremental sync:** Daily at 04:00 UTC (depending on whether Lifecycle Policies or native AWS Backup are used)

#### Retention
- **Weekly backups:** 8 weeks
- **Monthly backups:** 12 months in archival Storage Class (Glacier).

#### Method
```bash
# Sync to backup bucket
aws s3 sync s3://$S3_BUCKET_MEDIA s3://$BACKUP_BUCKET/media/latest --storage-class STANDARD_IA
```

#### Storage
- **Primary bucket:** `circlesfera-media` (production)
- **Backup bucket:** `circlesfera-backups-media` (Glacier/IA class for savings)

### Redis

#### Frequency
- Not critical for long-term retention.

#### Method (If RDB is required)
```bash
redis-cli --rdb /backups/redis/dump_$(date +%Y%m%d).rdb
```

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
