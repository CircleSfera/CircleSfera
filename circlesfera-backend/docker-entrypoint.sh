#!/bin/sh
set -e

echo "Starting CircleSfera Backend Entrypoint..."

# Run database migrations if DATABASE_URL is present
if [ -n "$DATABASE_URL" ]; then
  echo "Deploying Prisma database migrations..."
  npx prisma migrate deploy || echo "Prisma migration deploy skipped or failed gracefully."
fi

# Execute main CMD
exec "$@"
