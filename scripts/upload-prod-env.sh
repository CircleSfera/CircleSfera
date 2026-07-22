#!/usr/bin/env bash
# Upload rotated .env.production to GitHub secret ENV_PRODUCTION_B64 and
# optionally trigger the deploy workflow.
#
# Prerequisites: gh auth login && repo secrets write access
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install: brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Not authenticated. Run: gh auth login"
  exit 1
fi

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production"
  exit 1
fi

# Ensure REDIS_PASSWORD is present before uploading
if ! grep -q '^REDIS_PASSWORD=.' .env.production; then
  echo "ERROR: REDIS_PASSWORD is missing/empty in .env.production"
  exit 1
fi
if ! grep -q '^JWT_SECRET=.' .env.production; then
  echo "ERROR: JWT_SECRET is missing/empty in .env.production"
  exit 1
fi
if ! grep -q '^JWT_REFRESH_SECRET=.' .env.production; then
  echo "ERROR: JWT_REFRESH_SECRET is missing/empty in .env.production"
  exit 1
fi

echo "Uploading .env.production as secret ENV_PRODUCTION_B64..."
base64 < .env.production | tr -d '\n' | gh secret set ENV_PRODUCTION_B64

echo "Secret ENV_PRODUCTION_B64 updated."

if [[ "${1:-}" == "--deploy" ]]; then
  echo "Triggering Deploy workflow on main..."
  gh workflow run deploy.yml --ref main
  echo "Triggered. Watch: gh run list --workflow=deploy.yml"
else
  echo "Skipped deploy trigger. Re-run with --deploy to start production deploy,"
  echo "or push/merge to main if that is your usual path."
fi
