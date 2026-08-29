#!/usr/bin/env sh
# Deploy Prisma migrations with one-shot recovery for a known failed
# User/Profile ownership migration (P3009) on production.
set -eu

FAILED_MIGRATION="20260827160002_user_profile_ownership_sync"

run_deploy() {
  npx prisma migrate deploy
}

if run_deploy 2> /tmp/prisma-migrate.err; then
  exit 0
fi

if grep -q "P3009" /tmp/prisma-migrate.err && grep -q "$FAILED_MIGRATION" /tmp/prisma-migrate.err; then
  echo "⚠️  Detected failed migration $FAILED_MIGRATION — marking rolled back and retrying..."
  npx prisma migrate resolve --rolled-back "$FAILED_MIGRATION"
  run_deploy
  exit 0
fi

cat /tmp/prisma-migrate.err >&2
exit 1
