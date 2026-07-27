#!/usr/bin/env bash
# Backup local media volume (uploads_data / ./uploads) as a compressed tarball.
# Usage:
#   UPLOADS_DIR=/path/to/uploads ./scripts/backup-uploads.sh
# Optional: BACKUP_DIR, RETENTION_DAYS, S3_BACKUP_BUCKET
set -euo pipefail

UPLOADS_DIR="${UPLOADS_DIR:-./circlesfera-backend/uploads}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BACKUP_BUCKET="${S3_BACKUP_BUCKET:-}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${BACKUP_DIR}/uploads"
ARCHIVE="${OUT_DIR}/uploads_${TIMESTAMP}.tar.gz"

log() { echo -e "\033[0;32m[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]\033[0m $*"; }
err() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

if [ ! -d "${UPLOADS_DIR}" ]; then
  err "UPLOADS_DIR does not exist: ${UPLOADS_DIR}"
  exit 1
fi

mkdir -p "${OUT_DIR}"
log "Archiving ${UPLOADS_DIR} → ${ARCHIVE}"
tar -czf "${ARCHIVE}" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")"

SIZE="$(wc -c < "${ARCHIVE}" | tr -d ' ')"
log "Archive OK (${SIZE} bytes)"

if [ -n "${S3_BACKUP_BUCKET}" ]; then
  log "Uploading to s3://${S3_BACKUP_BUCKET}/uploads/"
  aws s3 cp "${ARCHIVE}" "s3://${S3_BACKUP_BUCKET}/uploads/uploads_${TIMESTAMP}.tar.gz"
fi

find "${OUT_DIR}" -type f -name 'uploads_*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete || true
echo "${ARCHIVE}"
