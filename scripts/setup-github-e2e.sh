#!/usr/bin/env bash
# Optional: store E2E credentials as GitHub repository secrets/vars.
# The E2E Smoke workflow uses workflow_dispatch inputs (no undeclared-secret
# linter warnings). Secrets are still useful for other automation.
#
# Prerequisites: gh auth login && repo admin/secrets write access
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

EMAIL="${E2E_USER_EMAIL:-}"
PASSWORD="${E2E_USER_PASSWORD:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  if [[ -f .env ]]; then
    # shellcheck disable=SC2046
    export $(grep -E '^E2E_USER_(EMAIL|PASSWORD)=' .env | xargs) || true
  fi
  EMAIL="${E2E_USER_EMAIL:-}"
  PASSWORD="${E2E_USER_PASSWORD:-}"
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Set E2E_USER_EMAIL and E2E_USER_PASSWORD in the environment or .env"
  exit 1
fi

echo "Setting repository secrets E2E_USER_EMAIL / E2E_USER_PASSWORD..."
printf '%s' "$EMAIL" | gh secret set E2E_USER_EMAIL
printf '%s' "$PASSWORD" | gh secret set E2E_USER_PASSWORD

echo "Setting repository variable E2E_ENABLED=true..."
gh variable set E2E_ENABLED --body "true"

echo "Done. Verify with: gh secret list && gh variable list"
echo "Run smoke manually: Actions → E2E Smoke → Run workflow (pass email/password inputs)."
