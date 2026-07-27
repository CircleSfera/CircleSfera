#!/usr/bin/env bash
# Install daily backup cron on the OVH VPS (run from /srv/circlesfera as deploy user).
# Usage (on VPS):
#   cd /srv/circlesfera && ./scripts/install-backup-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/srv/circlesfera/backups}"
CRON_MARKER="# circlesfera-backups"

mkdir -p "${BACKUP_DIR}/postgres/full" "${BACKUP_DIR}/uploads"

# Wrapper: dump Postgres via compose (host has no published 5432), then uploads tarball.
WRAPPER="${ROOT}/scripts/.run-daily-backups.sh"
cat > "${WRAPPER}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "${ROOT}"
set -a
# shellcheck disable=SC1091
source "${ROOT}/.env.production"
set +a
export BACKUP_DIR="${BACKUP_DIR}"
export RETENTION_DAYS="\${RETENTION_DAYS:-30}"
TIMESTAMP="\$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${BACKUP_DIR}/postgres/full"
mkdir -p "\${OUT_DIR}" "${BACKUP_DIR}/uploads"
DUMP="\${OUT_DIR}/pg_backup_\${TIMESTAMP}.dump"
{
  echo "[\$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting Postgres dump → \${DUMP}"
  if docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \\
    pg_dump -U "\${POSTGRES_USER}" -Fc "\${POSTGRES_DB}" > "\${DUMP}"; then
    echo "[\$(date -u +%Y-%m-%dT%H:%M:%SZ)] Postgres backup OK"
  else
    echo "[\$(date -u +%Y-%m-%dT%H:%M:%SZ)] Postgres backup FAILED" >&2
    rm -f "\${DUMP}" || true
  fi
  find "\${OUT_DIR}" -type f -name 'pg_backup_*.dump' -mtime "+\${RETENTION_DAYS}" -delete || true
  # Uploads: prefer bind-mounted path; fall back to docker volume copy if missing
  UPLOADS_DIR="\${UPLOADS_DIR:-${ROOT}/circlesfera-backend/uploads}"
  if [ -d "\${UPLOADS_DIR}" ]; then
    UPLOADS_DIR="\${UPLOADS_DIR}" ${ROOT}/scripts/backup-uploads.sh || true
  else
    echo "[\$(date -u +%Y-%m-%dT%H:%M:%SZ)] UPLOADS_DIR missing (\${UPLOADS_DIR}); skip uploads backup"
  fi
} >> "${BACKUP_DIR}/backup.log" 2>&1
EOF
chmod +x "${WRAPPER}"

# 02:00 UTC daily
CRON_LINE="0 2 * * * ${WRAPPER} ${CRON_MARKER}"

EXISTING="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "${EXISTING}" | grep -v "${CRON_MARKER}" || true)"
{
  printf '%s\n' "${FILTERED}"
  echo "${CRON_LINE}"
} | crontab -

echo "Installed cron:"
crontab -l | grep "${CRON_MARKER}" || true
echo "BACKUP_DIR=${BACKUP_DIR}"
