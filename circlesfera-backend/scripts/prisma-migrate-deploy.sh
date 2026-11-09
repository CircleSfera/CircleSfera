#!/usr/bin/env sh
# Deploy Prisma migrations with one-shot recovery for migrations known to
# have failed on production (P3009). A failed run of each of them changed
# nothing, so it is marked rolled back and applied again.
set -eu

RECOVERABLE_MIGRATIONS="20260827160002_user_profile_ownership_sync 20261228090000_drop_person_payout_account_column"

run_deploy() {
  ./node_modules/.bin/prisma migrate deploy
}

if run_deploy 2> /tmp/prisma-migrate.err; then
  exit 0
fi

if grep -q "P3009" /tmp/prisma-migrate.err; then
  for migration in $RECOVERABLE_MIGRATIONS; do
    if grep -q "$migration" /tmp/prisma-migrate.err; then
      echo "⚠️  Detected failed migration $migration — marking rolled back and retrying..."
      ./node_modules/.bin/prisma migrate resolve --rolled-back "$migration"
      run_deploy
      exit 0
    fi
  done
fi

cat /tmp/prisma-migrate.err >&2
exit 1
