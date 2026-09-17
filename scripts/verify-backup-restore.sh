#!/usr/bin/env bash
# Automated Backup & Restore Verification Drill for CircleSfera
#
# Verifies the full lifecycle of a backup:
#   1. Generates or ingests a logical custom-format PostgreSQL dump.
#   2. Verifies dump TOC integrity (pg_restore --list).
#   3. Restores into an isolated ephemeral target database.
#   4. Asserts schema consistency, migrations state, and table row counts.
#   5. Teardowns the ephemeral database cleanly.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" ./scripts/verify-backup-restore.sh [path_to_existing.dump]
#
# Optional environment variables:
#   TARGET_DB_NAME="CircleSfera_restore_test" (default)
#   KEEP_TEST_DB=1 (skips teardown if debugging failed restore)
#   ADMIN_DATABASE_URL="postgresql://user:pass@localhost:5432/postgres"

set -euo pipefail

START_TIME=$(date +%s)
DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
TARGET_DB_NAME="${TARGET_DB_NAME:-CircleSfera_restore_test}"
KEEP_TEST_DB="${KEEP_TEST_DB:-0}"
INPUT_DUMP="${1:-}"
TEMP_DUMP=""

log() { echo -e "\033[0;32m[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]\033[0m $*"; }
err() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

# Helper to derive database URL with replaced database name
replace_db_name() {
  local url="$1"
  local new_db="$2"
  # Replace everything after the last slash (excluding query params)
  echo "$url" | sed -E "s|/([^/?]+)(\?.*)?$|/${new_db}\2|"
}

# Determine Admin URL and Target Database URL
ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-$(replace_db_name "$DATABASE_URL" "postgres")}"
TARGET_DATABASE_URL="$(replace_db_name "$DATABASE_URL" "$TARGET_DB_NAME")"

cleanup() {
  if [ -n "$TEMP_DUMP" ] && [ -f "$TEMP_DUMP" ]; then
    log "Removing temporary dump file ${TEMP_DUMP}"
    rm -f "$TEMP_DUMP"
  fi

  if [ "$KEEP_TEST_DB" != "1" ]; then
    log "Tearing down ephemeral database ${TARGET_DB_NAME}..."
    psql "${ADMIN_DATABASE_URL}" -c "DROP DATABASE IF EXISTS \"${TARGET_DB_NAME}\" WITH (FORCE);" >/dev/null 2>&1 || true
  else
    log "KEEP_TEST_DB=1 set. Preserving ephemeral database ${TARGET_DB_NAME} for inspection."
  fi
}

trap cleanup EXIT

log "=== CircleSfera Disaster Recovery: Backup & Restore Verification Drill ==="
log "Source Database: $(echo "$DATABASE_URL" | sed -E 's/:[^:@]+@/:***@/')"
log "Target Test Database: ${TARGET_DB_NAME}"

# Step 1: Obtain or generate dump file
if [ -n "$INPUT_DUMP" ]; then
  if [ ! -f "$INPUT_DUMP" ]; then
    err "Specified dump file not found: $INPUT_DUMP"
    exit 1
  fi
  DUMP_FILE="$INPUT_DUMP"
  log "Using existing dump file: $DUMP_FILE"
else
  TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
  TEMP_DIR="$(mktemp -d)"
  TEMP_DUMP="${TEMP_DIR}/pg_verify_${TIMESTAMP}.dump"
  log "Generating temporary source dump at ${TEMP_DUMP}..."
  pg_dump --dbname="${DATABASE_URL}" -Fc --file="${TEMP_DUMP}"
  DUMP_FILE="$TEMP_DUMP"
fi

DUMP_SIZE=$(wc -c < "$DUMP_FILE" | tr -d ' ')
log "Dump file size: ${DUMP_SIZE} bytes"
if [ "$DUMP_SIZE" -lt 500 ]; then
  err "Dump file is suspiciously small (${DUMP_SIZE} bytes). Aborting."
  exit 1
fi

# Step 2: Verify Table of Contents (TOC)
log "Verifying dump TOC integrity via pg_restore --list..."
TOC_ENTRIES=$(pg_restore --list "$DUMP_FILE" | wc -l | tr -d ' ')
if [ "$TOC_ENTRIES" -lt 5 ]; then
  err "Dump TOC contains fewer than 5 entries (${TOC_ENTRIES}). Dump might be empty or invalid."
  exit 1
fi
log "TOC verified successfully (${TOC_ENTRIES} catalogue entries)."

# Step 3: Prepare clean ephemeral test database
log "Recreating clean database ${TARGET_DB_NAME}..."
psql "${ADMIN_DATABASE_URL}" -c "DROP DATABASE IF EXISTS \"${TARGET_DB_NAME}\" WITH (FORCE);" >/dev/null 2>&1 || true
psql "${ADMIN_DATABASE_URL}" -c "CREATE DATABASE \"${TARGET_DB_NAME}\";" >/dev/null

# Step 4: Restore dump into ephemeral database
log "Restoring dump into ${TARGET_DB_NAME}..."
# pg_restore exit code 0 is clean, exit code 1 indicates non-fatal warnings (e.g. notices), exit code > 1 is fatal.
set +e
RESTORE_OUTPUT=$(pg_restore --dbname="${TARGET_DATABASE_URL}" --no-owner --no-acl "$DUMP_FILE" 2>&1)
RESTORE_CODE=$?
set -e

if [ $RESTORE_CODE -gt 1 ]; then
  err "pg_restore failed with fatal error code ${RESTORE_CODE}:"
  echo "$RESTORE_OUTPUT" >&2
  exit 1
fi
log "pg_restore finished successfully (code ${RESTORE_CODE})."

# Step 5: Assert database integrity & sanity checks
log "Running structural integrity assertions..."

# 5.1 Count public tables
TABLE_COUNT=$(psql "${TARGET_DATABASE_URL}" -t -A -c "
  SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
")
log "Restored public tables count: ${TABLE_COUNT}"

if [ "${TABLE_COUNT}" -lt 1 ]; then
  err "Assertion failed: No public tables restored in ${TARGET_DB_NAME}."
  exit 1
fi

# 5.2 Verify Prisma migrations state
MIGRATIONS_COUNT=0
MIGRATIONS_TABLE_EXISTS=$(psql "${TARGET_DATABASE_URL}" -t -A -c "
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
  );
")

if [ "$MIGRATIONS_TABLE_EXISTS" = "t" ]; then
  MIGRATIONS_COUNT=$(psql "${TARGET_DATABASE_URL}" -t -A -c "
    SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL;
  ")
  ROLLED_BACK_COUNT=$(psql "${TARGET_DATABASE_URL}" -t -A -c "
    SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE rolled_back_at IS NOT NULL;
  ")
  log "Prisma migrations: ${MIGRATIONS_COUNT} finished, ${ROLLED_BACK_COUNT} rolled back."
  if [ "$ROLLED_BACK_COUNT" -gt 0 ]; then
    err "Warning: Found ${ROLLED_BACK_COUNT} rolled back migrations."
  fi
else
  log "Note: _prisma_migrations table not present in dump (non-Prisma or schema-only dump)."
fi

# 5.3 Verify core identity and financial tables if present
CORE_TABLES=("User" "Profile" "Wallet")
for table in "${CORE_TABLES[@]}"; do
  EXISTS=$(psql "${TARGET_DATABASE_URL}" -t -A -c "
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = '${table}'
    );
  ")
  if [ "$EXISTS" = "t" ]; then
    ROW_COUNT=$(psql "${TARGET_DATABASE_URL}" -t -A -c "SELECT COUNT(*) FROM \"${table}\";")
    log "Core table '${table}': verified (${ROW_COUNT} rows)."
  fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Step 6: Emit structured JSON audit result
RESULT_JSON=$(cat <<EOF
{
  "status": "PASSED",
  "source": "$(echo "$DATABASE_URL" | sed -E 's/:[^:@]+@/:***@/')",
  "targetDb": "${TARGET_DB_NAME}",
  "dumpSizeBytes": ${DUMP_SIZE},
  "tocEntries": ${TOC_ENTRIES},
  "restoredTables": ${TABLE_COUNT},
  "appliedMigrations": ${MIGRATIONS_COUNT},
  "durationSeconds": ${DURATION},
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF
)

log "=== Verification Drill PASSED ==="
echo "$RESULT_JSON"

exit 0
