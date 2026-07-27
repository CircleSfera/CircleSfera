#!/usr/bin/env bash
# Install daily backup cron on the OVH VPS (run from /srv/circlesfera as deploy user).
# Usage (on VPS):
#   cd /srv/circlesfera && ./scripts/install-backup-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/srv/circlesfera/backups}"
CRON_MARKER="# circlesfera-backups"

mkdir -p "${BACKUP_DIR}/postgres/full" "${BACKUP_DIR}/uploads"

# Wrapper that loads .env.production for DATABASE_URL / POSTGRES_* and runs both scripts.
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
# Prefer compose postgres when host pg_dump is unavailable
if ! command -v pg_dump >/dev/null 2>&1; then
  export DATABASE_URL="postgresql://\${POSTGRES_USER}:\${POSTGRES_PASSWORD}@127.0.0.1:5432/\${POSTGRES_DB}"
fi
# Uploads volume path inside compose project (adjust if using named volume mount)
export UPLOADS_DIR="\${UPLOADS_DIR:-${ROOT}/circlesfera-backend/uploads}"
"${ROOT}/scripts/backup-postgres.sh" >> "${BACKUP_DIR}/backup.log" 2>&1 || true
"${ROOT}/scripts/backup-uploads.sh" >> "${BACKUP_DIR}/backup.log" 2>&1 || true
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
