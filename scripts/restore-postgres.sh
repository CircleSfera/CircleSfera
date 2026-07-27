#!/usr/bin/env bash
# Restore a PostgreSQL custom-format dump produced by backup-postgres.sh.
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/restore-postgres.sh /path/to/pg_backup_YYYYMMDD.dump
# WARNING: Destructive. Prefer restoring into a fresh database first.
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
DUMP_FILE="${1:?Usage: $0 /path/to/pg_backup.dump}"
CONFIRM="${CONFIRM:-}"

log() { echo -e "\033[0;32m[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]\033[0m $*"; }
err() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

if [ ! -f "${DUMP_FILE}" ]; then
  err "Dump not found: ${DUMP_FILE}"
  exit 1
fi

if [ "${CONFIRM}" != "YES" ]; then
  err "Refusing to restore without CONFIRM=YES"
  err "Example: CONFIRM=YES DATABASE_URL=... $0 ${DUMP_FILE}"
  exit 1
fi

log "Verifying dump TOC…"
pg_restore --list "${DUMP_FILE}" >/dev/null

log "Restoring into DATABASE_URL (clean + create)…"
# --clean drops objects before recreate; --if-exists avoids errors on missing objects
pg_restore --dbname="${DATABASE_URL}" --clean --if-exists --no-owner --no-acl "${DUMP_FILE}"

log "Restore finished. Run: npx prisma migrate deploy (if needed) and smoke tests."
