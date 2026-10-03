#!/usr/bin/env bash
# Install daily backup cron on the OVH VPS (run from /srv/circlesfera as deploy user).
# Usage (on VPS):
#   cd /srv/circlesfera && ./scripts/install-backup-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/srv/circlesfera/backups}"
CRON_MARKER="# circlesfera-backups"

mkdir -p "${BACKUP_DIR}/postgres/full" "${BACKUP_DIR}/uploads" "${BACKUP_DIR}/etl"

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
UP_DIR="${BACKUP_DIR}/uploads"
UP_ARCHIVE="\${UP_DIR}/uploads_\${TIMESTAMP}.tar"
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
FAILED=0
ts() { date -u +%Y-%m-%dT%H:%M:%SZ; }
{
  echo "[\$(ts)] Starting Postgres dump → \${DUMP}"
  if \${DC} exec -T postgres pg_dump -U "\${POSTGRES_USER}" -Fc "\${POSTGRES_DB}" > "\${DUMP}"; then
    echo "[\$(ts)] Postgres backup OK"
  else
    echo "[\$(ts)] Postgres backup FAILED" >&2
    rm -f "\${DUMP}" || true
    FAILED=1
  fi
  find "\${OUT_DIR}" -type f -name 'pg_backup_*.dump' -mtime "+\${RETENTION_DAYS}" -delete || true

  # Media lives in the uploads_data Docker volume, mounted only inside the
  # containers, so the archive is streamed from the backend container. Media
  # files are already compressed, so the archive is plain tar. It is read back
  # before it replaces the partial file, and old archives are pruned only after
  # a good one exists.
  echo "[\$(ts)] Starting media backup → \${UP_ARCHIVE}"
  if \${DC} exec -T backend tar -cf - -C /app/circlesfera-backend uploads > "\${UP_ARCHIVE}.partial" \\
    && tar -tf "\${UP_ARCHIVE}.partial" > /dev/null; then
    mv "\${UP_ARCHIVE}.partial" "\${UP_ARCHIVE}"
    echo "[\$(ts)] Media backup OK (\$(du -h "\${UP_ARCHIVE}" | cut -f1), \$(tar -tf "\${UP_ARCHIVE}" | grep -vc '/\$') files)"
    find "\${UP_DIR}" -type f \\( -name 'uploads_*.tar' -o -name 'uploads_*.tar.gz' \\) -mtime "+\${RETENTION_DAYS}" -delete || true
  else
    echo "[\$(ts)] Media backup FAILED" >&2
    rm -f "\${UP_ARCHIVE}.partial" || true
    FAILED=1
  fi

  if [ "\${FAILED}" = 1 ] && [ -n "\${SLACK_WEBHOOK_ALERTS:-}" ]; then
    curl -s -m 10 -X POST -H 'Content-type: application/json' \\
      --data '{"text":"CircleSfera: the nightly backup FAILED on the VPS. See backups/backup.log."}' \\
      "\${SLACK_WEBHOOK_ALERTS}" > /dev/null 2>&1 || true
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
