#!/usr/bin/env bash
# Switch production's lives between the hosted live service and the live
# service on CircleSfera's own server, in the local .env.production that
# scripts/upload-prod-env.sh sends to the deploy.
#
#   scripts/switch-prod-live-service.sh --to-own   # own server, new key
#   scripts/switch-prod-live-service.sh --back     # the copy made before
#
# --to-own keeps a copy of the file (mode 600), makes a new key and secret
# for the own live service, and sets the live service's addresses. No value
# is ever printed: only the names of the settings it changed.
# Then run scripts/upload-prod-env.sh and deploy.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/.env.production"
COPY_PREFIX="${ENV_FILE}.before-live-switch-"
# Production's address; the live service answers on it (host nginx /rtc,
# /twirp), and the backend calls it on the environment's own network.
PUBLIC_URL="wss://circlesfera.com"
INTERNAL_URL="http://livekit:7880"

[ -f "$ENV_FILE" ] || { echo "Missing .env.production" >&2; exit 1; }

case "${1:-}" in
  --to-own)
    umask 077
    copy="${COPY_PREFIX}$(date -u +%Y%m%dT%H%M%SZ)"
    cp -p "$ENV_FILE" "$copy"
    chmod 600 "$copy"
    KEY="CS$(openssl rand -hex 8)" \
    SECRET="$(openssl rand -base64 48 | tr -d '\n=+/' | cut -c1-48)" \
    PUBLIC_URL="$PUBLIC_URL" INTERNAL_URL="$INTERNAL_URL" ENV_FILE="$ENV_FILE" \
    python3 - <<'PY'
import os, re

path = os.environ['ENV_FILE']
wanted = {
    'LIVEKIT_URL': os.environ['PUBLIC_URL'],
    'VITE_LIVEKIT_URL': os.environ['PUBLIC_URL'],
    'LIVEKIT_API_URL': os.environ['INTERNAL_URL'],
    'LIVEKIT_API_KEY': os.environ['KEY'],
    'LIVEKIT_API_SECRET': os.environ['SECRET'],
}
with open(path) as f:
    lines = f.read().split('\n')
seen = set()
for i, line in enumerate(lines):
    m = re.match(r'^([A-Z0-9_]+)=', line)
    if m and m.group(1) in wanted:
        lines[i] = f'{m.group(1)}={wanted[m.group(1)]}'
        seen.add(m.group(1))
missing = [k for k in wanted if k not in seen]
if lines and lines[-1] == '':
    lines.pop()
lines += [f'{k}={wanted[k]}' for k in missing]
with open(path, 'w') as f:
    f.write('\n'.join(lines) + '\n')
print('Set:', ', '.join(wanted))
PY
    chmod 600 "$ENV_FILE"
    echo "Copy of the file before: $(basename "$copy")"
    echo "Next: scripts/upload-prod-env.sh, then deploy."
    ;;
  --back)
    last="$(ls -1 "${COPY_PREFIX}"* 2>/dev/null | sort | tail -1 || true)"
    [ -n "$last" ] || { echo "No copy to go back to" >&2; exit 1; }
    cp -p "$last" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    echo "Back to $(basename "$last"). Next: scripts/upload-prod-env.sh, then deploy."
    ;;
  *)
    echo "Usage: $0 --to-own | --back" >&2
    exit 1
    ;;
esac
