#!/bin/sh
set -e

echo "Starting CircleSfera Backend Entrypoint..."

if [ -n "$DATABASE_URL" ]; then
  echo "Deploying Prisma database migrations..."
  if [ -x /app/circlesfera-backend/scripts/prisma-migrate-deploy.sh ]; then
    /app/circlesfera-backend/scripts/prisma-migrate-deploy.sh
  elif [ -x /app/scripts/prisma-migrate-deploy.sh ]; then
    /app/scripts/prisma-migrate-deploy.sh
  else
    npx prisma migrate deploy
  fi
fi

exec "$@"
