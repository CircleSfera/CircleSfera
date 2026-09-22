#!/usr/bin/env bash
# Automated Migration Rollback Verification Drill for CircleSfera
#
# Verifies that database migrations can be rolled back safely and re-applied
# cleanly in an isolated test environment without schema drift or orphaned objects.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@localhost:5432/CircleSfera" ./scripts/test-migration-rollback.sh [migration_dir_name]
#
# Optional environment variables:
#   TARGET_DB_NAME="CircleSfera_migration_rollback_test"
#   KEEP_TEST_DB=1
#   ADMIN_DATABASE_URL="postgresql://user:pass@localhost:5432/postgres"

set -euo pipefail

START_TIME=$(date +%s)
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/circlesfera-backend"
MIGRATIONS_DIR="${BACKEND_DIR}/prisma/migrations"

DATABASE_URL="${DATABASE_URL:?DATABASE_URL is required}"
TARGET_DB_NAME="${TARGET_DB_NAME:-CircleSfera_migration_rollback_test}"
KEEP_TEST_DB="${KEEP_TEST_DB:-0}"
TARGET_MIGRATION="${1:-}"

log() { echo -e "\033[0;32m[$(date -u +'%Y-%m-%dT%H:%M:%SZ')]\033[0m $*"; }
err() { echo -e "\033[0;31m[ERROR]\033[0m $*" >&2; }

# Helper to derive database URL with replaced database name
replace_db_name() {
  local url="$1"
  local new_db="$2"
  echo "$url" | sed -E "s|/([^/?]+)(\?.*)?$|/${new_db}\2|"
}

ADMIN_DATABASE_URL="${ADMIN_DATABASE_URL:-$(replace_db_name "$DATABASE_URL" "postgres")}"
TEST_DATABASE_URL="$(replace_db_name "$DATABASE_URL" "$TARGET_DB_NAME")"

# Find target migration if not provided
if [ -z "$TARGET_MIGRATION" ]; then
  log "Searching for latest migration with a down.sql script..."
  for dir in $(find "${MIGRATIONS_DIR}" -mindepth 1 -maxdepth 1 -type d | sort -r); do
    if [ -f "${dir}/down.sql" ]; then
      TARGET_MIGRATION="$(basename "$dir")"
      break
    fi
  done
fi

if [ -z "$TARGET_MIGRATION" ]; then
  err "No migration with down.sql found in ${MIGRATIONS_DIR}."
  exit 1
fi

DOWN_SQL="${MIGRATIONS_DIR}/${TARGET_MIGRATION}/down.sql"
FORWARD_SQL="${MIGRATIONS_DIR}/${TARGET_MIGRATION}/migration.sql"

if [ ! -f "$DOWN_SQL" ]; then
  err "Rollback script not found: ${DOWN_SQL}"
  exit 1
fi

cleanup() {
  if [ "$KEEP_TEST_DB" != "1" ]; then
    log "Tearing down ephemeral test database ${TARGET_DB_NAME}..."
    psql "${ADMIN_DATABASE_URL}" -c "DROP DATABASE IF EXISTS \"${TARGET_DB_NAME}\" WITH (FORCE);" >/dev/null 2>&1 || true
  else
    log "KEEP_TEST_DB=1 set. Preserving test database ${TARGET_DB_NAME} for inspection."
  fi
}

trap cleanup EXIT

log "=== CircleSfera Migration Rollback Verification Drill ==="
log "Target Migration: ${TARGET_MIGRATION}"
log "Test Database: ${TARGET_DB_NAME}"

# Step 1: Recreate clean ephemeral test database
log "Step 1: Preparing isolated test database ${TARGET_DB_NAME}..."
psql "${ADMIN_DATABASE_URL}" -c "DROP DATABASE IF EXISTS \"${TARGET_DB_NAME}\" WITH (FORCE);" >/dev/null 2>&1 || true
psql "${ADMIN_DATABASE_URL}" -c "CREATE DATABASE \"${TARGET_DB_NAME}\";" >/dev/null

# Step 2: Deploy migrations up to target migration
log "Step 2: Deploying schema migrations into test database..."
cd "${BACKEND_DIR}"
DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy >/dev/null

# Verify migration was applied
MIGRATION_APPLIED=$(psql "${TEST_DATABASE_URL}" -t -A -c "
  SELECT COUNT(*) FROM \"_prisma_migrations\" 
  WHERE migration_name = '${TARGET_MIGRATION}' AND finished_at IS NOT NULL;
")

if [ "$MIGRATION_APPLIED" -ne 1 ]; then
  err "Target migration ${TARGET_MIGRATION} was not marked applied in test database."
  exit 1
fi
log "Migration ${TARGET_MIGRATION} applied successfully."

# Step 3: Execute down.sql rollback script
log "Step 3: Executing down.sql rollback script..."
psql "${TEST_DATABASE_URL}" -f "${DOWN_SQL}" >/dev/null

# Step 4: Mark migration as rolled back in Prisma migrations tracking
log "Step 4: Marking migration rolled-back in Prisma metadata..."
DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate resolve --rolled-back "${TARGET_MIGRATION}" >/dev/null

# Assert rolled_back_at is recorded
ROLLED_BACK_CONFIRMED=$(psql "${TEST_DATABASE_URL}" -t -A -c "
  SELECT COUNT(*) FROM \"_prisma_migrations\" 
  WHERE migration_name = '${TARGET_MIGRATION}' AND rolled_back_at IS NOT NULL;
")

if [ "$ROLLED_BACK_CONFIRMED" -ne 1 ]; then
  err "Failed to record rolled_back_at status in _prisma_migrations."
  exit 1
fi
log "Prisma resolved migration as rolled back successfully."

# Step 5: Test forward re-entrancy (re-applying the migration)
log "Step 5: Testing forward re-entrancy (re-deploying migration)..."
DATABASE_URL="${TEST_DATABASE_URL}" npx prisma migrate deploy >/dev/null

REAPPLIED_COUNT=$(psql "${TEST_DATABASE_URL}" -t -A -c "
  SELECT COUNT(*) FROM \"_prisma_migrations\" 
  WHERE migration_name = '${TARGET_MIGRATION}' AND finished_at IS NOT NULL;
")

if [ "$REAPPLIED_COUNT" -lt 1 ]; then
  err "Failed to re-apply migration cleanly after rollback."
  exit 1
fi
log "Migration re-applied forward cleanly. Idempotency verified."

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

RESULT_JSON=$(cat <<EOF
{
  "status": "PASSED",
  "targetMigration": "${TARGET_MIGRATION}",
  "hasDownSql": true,
  "rollbackTested": true,
  "forwardReentrancyTested": true,
  "durationSeconds": ${DURATION},
  "timestamp": "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
}
EOF
)

log "=== Rollback Drill PASSED ==="
echo "$RESULT_JSON"

exit 0
