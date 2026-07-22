#!/usr/bin/env bash
# Fail if prisma/schema.prisma is ahead of (or behind) the migrations directory.
# Replays migrations onto DATABASE_URL, then diffs the DB against the schema.
#
# Usage (CI / local with empty Postgres):
#   DATABASE_URL=postgresql://user:pass@host:5432/db \
#     ./scripts/check-prisma-schema-migrations.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/circlesfera-backend"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (empty Postgres dedicated to this check)."
  exit 1
fi

cd "$BACKEND"

echo "→ prisma migrate deploy"
npx prisma migrate deploy

echo "→ prisma migrate diff (migrations DB vs schema.prisma)"
set +e
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --exit-code
code=$?
set -e

if [[ "$code" -eq 0 ]]; then
  echo "✓ Schema and migrations are aligned."
  exit 0
fi

if [[ "$code" -eq 2 ]]; then
  echo "✗ Drift detected: schema.prisma does not match applied migrations."
  echo "  Create a migration with: cd circlesfera-backend && npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script"
  echo "  (against a DB that has migrate deploy applied), then commit the SQL under prisma/migrations/."
  npx prisma migrate diff \
    --from-config-datasource \
    --to-schema prisma/schema.prisma \
    --script || true
  exit 2
fi

echo "✗ prisma migrate diff failed with exit code $code"
exit "$code"
