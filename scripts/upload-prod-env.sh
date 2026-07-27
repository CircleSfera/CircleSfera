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
require_var() {
  local key="$1"
  local hint="${2:-}"
  if ! grep -q "^${key}=." .env.production; then
    echo "ERROR: ${key} is missing/empty in .env.production"
    [ -n "$hint" ] && echo "       $hint"
    exit 1
  fi
}

require_var REDIS_PASSWORD
require_var JWT_SECRET
require_var JWT_REFRESH_SECRET
require_var CSRF_SECRET
require_var ENCRYPTION_KEY "Min 32 chars. Re-encrypt existing DMs with scripts/reencrypt-messages.ts before rotating."
require_var OPENAI_API_KEY "Required in production"
require_var LIVEKIT_API_KEY
require_var LIVEKIT_API_SECRET
if ! grep -qE '^(LIVEKIT_URL|VITE_LIVEKIT_URL)=.' .env.production; then
  echo "ERROR: LIVEKIT_URL (or VITE_LIVEKIT_URL) is missing/empty in .env.production"
  echo "       Use your LiveKit Cloud WSS URL, e.g. wss://xxxx.livekit.cloud"
  exit 1
fi
if ! grep -q '^SENTRY_DSN=.' .env.production; then
  echo "WARNING: SENTRY_DSN is empty — backend error reporting will be disabled in production."
fi
if ! grep -q '^VITE_SENTRY_DSN=.' .env.production; then
  echo "WARNING: VITE_SENTRY_DSN is empty — frontend Sentry will be inactive unless baked another way."
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
