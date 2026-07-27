#!/usr/bin/env bash
# Full PostgreSQL logical backup (custom format) with local retention.
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/backup-postgres.sh
# Optional:
#   BACKUP_DIR=/srv/circlesfera/backups RETENTION_DAYS=30 S3_BACKUP_BUCKET=...
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${BACKUP_DIR}/postgres/full"
BACKUP_FILE="${OUT_DIR}/pg_backup_${TIMESTAMP}.dump"

log() { echo -e "\033[0;32m[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]\033[0m $*"; }
err() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

mkdir -p "${OUT_DIR}"
log "Starting PostgreSQL backup → ${BACKUP_FILE}"

pg_dump --dbname="${DATABASE_URL}" -Fc --file="${BACKUP_FILE}" || {
  err "pg_dump failed"
  exit 1
}

SIZE="$(wc -c < "${BACKUP_FILE}" | tr -d ' ')"
if [ "${SIZE}" -lt 1000 ]; then
  err "Backup file suspiciously small (${SIZE} bytes)"
  exit 1
fi
log "Backup OK (${SIZE} bytes)"

# Quick integrity check (list TOC without restoring)
pg_restore --list "${BACKUP_FILE}" >/dev/null || {
  err "pg_restore --list failed; dump may be corrupt"
  exit 1
}
log "TOC verification OK"

if [ -n "${S3_BACKUP_BUCKET}" ]; then
  log "Uploading to s3://${S3_BACKUP_BUCKET}/postgres/full/"
  aws s3 cp "${BACKUP_FILE}" \
    "s3://${S3_BACKUP_BUCKET}/postgres/full/pg_backup_${TIMESTAMP}.dump"
fi

# Local retention
find "${OUT_DIR}" -type f -name 'pg_backup_*.dump' -mtime "+${RETENTION_DAYS}" -delete || true
log "Retention: removed dumps older than ${RETENTION_DAYS} days (if any)"
echo "${BACKUP_FILE}"
