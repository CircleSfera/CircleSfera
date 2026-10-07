#!/usr/bin/env bash
# Emergency deploy and rollback on the VPS, for when GitHub Actions cannot
# deploy (GitHub outage, runner queue stuck). Normal deploys always go
# through the deploy workflow; this is the break-glass path.
#
# Run as the CircleSfera deploy user, from a Termius session:
#   sudo -u csadmin /srv/circlesfera/infra/host/emergency-deploy.sh status
#   sudo -u csadmin /srv/circlesfera/infra/host/emergency-deploy.sh rollback
#   sudo -u csadmin /srv/circlesfera/infra/host/emergency-deploy.sh deploy <commit-sha>
#
# rollback  switches to the previous version's images, which every deploy
#           keeps on disk, so it works without GitHub or GHCR.
# deploy    switches to the images of a given commit; it pulls them from
#           GHCR if they are not on disk, so it needs GHCR to be up.
#
# Both take a database dump first, switch only backend, frontend and proxy,
# wait for the backend health check, and switch back to the version that was
# running if the new one does not become healthy.
#
# Only images change: the checkout (compose file, nginx template) and
# .env.production stay as they are. Migrations are additive (expand and
# contract), so an older backend runs on a newer schema.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REGISTRY="ghcr.io/circlesfera/circlesfera"
DC=(docker compose -f docker-compose.prod.yml --env-file .env.production)
HEALTH_URL="http://127.0.0.1:8082/api/v1/health"

current() { cat .deploy-sha 2>/dev/null || echo "unknown"; }
previous() { cat .deploy-sha.previous 2>/dev/null || true; }

has_images() {
  docker image inspect "${REGISTRY}/backend:$1" >/dev/null 2>&1 \
    && docker image inspect "${REGISTRY}/frontend:$1" >/dev/null 2>&1
}

healthy() {
  for _ in $(seq 1 30); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || true)" = "200" ]; then
      return 0
    fi
    sleep 4
  done
  return 1
}

switch_to() {
  local sha="$1"
  docker tag "${REGISTRY}/backend:${sha}" "${REGISTRY}/backend:latest"
  docker tag "${REGISTRY}/frontend:${sha}" "${REGISTRY}/frontend:latest"
  # Never pull: the images were checked or pulled above, and a pull of
  # :latest would replace the version just selected (or fail offline).
  "${DC[@]}" up -d --no-deps --pull never backend frontend nginx-proxy
}

backup() {
  local dir="${ROOT}/backups/postgres"
  mkdir -p "$dir"
  chmod 700 "${ROOT}/backups"
  local file
  file="${dir}/pre_emergency_$(date -u +%Y%m%d_%H%M%S).dump"
  # shellcheck disable=SC1091
  ( set -a; . ./.env.production; set +a
    umask 077
    "${DC[@]}" exec -T postgres pg_dump -U "${POSTGRES_USER}" -Fc "${POSTGRES_DB}" > "$file" )
  echo "Database dump: $(du -h "$file" | cut -f1)"
}

go() {
  local target="$1" from
  from="$(current)"
  if [ "$target" = "$from" ]; then
    echo "Already running ${target}."
    return 0
  fi
  echo "Switching ${from} -> ${target}"
  backup
  # A switch that fails half way (Compose error) takes the same way back as
  # a version that does not become healthy.
  if switch_to "$target" && healthy; then
    echo "$from" > .deploy-sha.previous
    echo "$target" > .deploy-sha
    echo "OK: running ${target}. Check the app and Sentry now."
    return 0
  fi
  echo "The switch to ${target} failed or it did not become healthy; switching back to ${from}."
  if has_images "$from"; then
    if switch_to "$from" && healthy; then
      echo "Back on ${from}."
    else
      echo "STILL UNHEALTHY after switching back: restore from the OVH snapshot or the dump."
    fi
  else
    echo "Images of ${from} are not on disk; restore from the OVH snapshot or the dump."
  fi
  return 1
}

case "${1:-}" in
  status)
    echo "Running:  $(current)"
    echo "Previous: $(previous || true)"
    for sha in "$(current)" "$(previous)"; do
      [ -n "$sha" ] && { has_images "$sha" && echo "Images on disk: ${sha}" || echo "Images missing: ${sha}"; }
    done
    "${DC[@]}" ps --format '{{.Name}} {{.Status}}'
    echo "Health: $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH_URL" || echo down)"
    ;;
  rollback)
    target="$(previous)"
    [ -n "$target" ] || { echo "No previous version recorded."; exit 1; }
    has_images "$target" || { echo "Images of ${target} are not on disk; use: deploy ${target} (needs GHCR)."; exit 1; }
    go "$target"
    ;;
  deploy)
    target="${2:-}"
    [[ "$target" =~ ^[0-9a-f]{40}$ ]] || { echo "Give the full 40-character commit SHA."; exit 1; }
    if ! has_images "$target"; then
      docker pull "${REGISTRY}/backend:${target}"
      docker pull "${REGISTRY}/frontend:${target}"
    fi
    go "$target"
    ;;
  *)
    sed -n '2,20p' "$0"
    exit 1
    ;;
esac
