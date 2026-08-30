#!/usr/bin/env bash
# Export bounded analytics tables to CSV for warehouse load (ADR-0016 v0).
# Read-only; no ClickHouse client required yet.
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/etl/export-analytics-tables.sh
# Optional:
#   ETL_DIR=./backups/etl ETL_SINCE_DAYS=1
set -euo pipefail

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
ETL_DIR="${ETL_DIR:-./backups/etl}"
ETL_SINCE_DAYS="${ETL_SINCE_DAYS:-1}"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${ETL_DIR}/${TIMESTAMP}"

log() { echo -e "\033[0;32m[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]\033[0m $*"; }
err() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

if ! command -v psql >/dev/null 2>&1; then
  err "psql not found"
  exit 1
fi

mkdir -p "${OUT_DIR}"
log "Analytics export → ${OUT_DIR} (window: last ${ETL_SINCE_DAYS} day(s))"

export_csv() {
  local name="$1"
  local query="$2"
  local file="${OUT_DIR}/${name}.csv"
  log "Exporting ${name}..."
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -c "\copy (${query}) TO STDOUT WITH CSV HEADER" > "${file}"
  local rows
  rows="$(wc -l < "${file}" | tr -d ' ')"
  if [ "${rows}" -lt 1 ]; then
    err "${name}: empty export"
    exit 1
  fi
  log "${name}: $((rows - 1)) data rows"
}

SINCE="NOW() - INTERVAL '${ETL_SINCE_DAYS} days'"

export_csv "reports" "
  SELECT id, status, \"targetType\", \"createdAt\", \"updatedAt\", \"resolvedAt\"
  FROM reports
  WHERE \"createdAt\" >= ${SINCE}
     OR \"updatedAt\" >= ${SINCE}
     OR (\"resolvedAt\" IS NOT NULL AND \"resolvedAt\" >= ${SINCE})
"

export_csv "appeals" "
  SELECT id, status, \"targetType\", \"createdAt\", \"updatedAt\", \"resolvedAt\"
  FROM appeals
  WHERE \"createdAt\" >= ${SINCE}
     OR \"updatedAt\" >= ${SINCE}
     OR (\"resolvedAt\" IS NOT NULL AND \"resolvedAt\" >= ${SINCE})
"

export_csv "support_tickets" "
  SELECT id, status, \"createdAt\", \"updatedAt\", \"resolvedAt\"
  FROM support_tickets
  WHERE \"createdAt\" >= ${SINCE}
     OR \"updatedAt\" >= ${SINCE}
     OR (\"resolvedAt\" IS NOT NULL AND \"resolvedAt\" >= ${SINCE})
"

export_csv "transactions" "
  SELECT id, type, amount, currency, status,
         \"senderId\", \"receiverId\", \"postId\", \"storyId\",
         \"promotionId\", \"liveStreamId\", \"createdAt\"
  FROM transactions
  WHERE \"createdAt\" >= ${SINCE}
"

export_csv "feature_flags" "
  SELECT id, key, name, \"isEnabled\", percentage, \"createdAt\", \"updatedAt\"
  FROM feature_flags
"

log "Done. Load into ClickHouse when provisioned (see scripts/etl/README.md)."
echo "${OUT_DIR}"
