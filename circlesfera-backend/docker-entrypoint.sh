#!/bin/sh
set -e

echo "Starting CircleSfera Backend Entrypoint..."

# Run database migrations if DATABASE_URL is present.
# Fail hard: a skipped/failed migrate must not start the app against a stale schema.
if [ -n "$DATABASE_URL" ]; then
  echo "Deploying Prisma database migrations..."
  npx prisma migrate deploy
fi

# Execute main CMD
exec "$@"
