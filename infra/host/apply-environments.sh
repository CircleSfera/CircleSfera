#!/usr/bin/env bash
# Prepare the server for the environments that are not production: staging
# (staging.circlesfera.com) and development (dev.circlesfera.com). For each
# one it creates the checkout the deploy works in and gives the host nginx
# its site. Safe to run again; every step converges to the same state.
#
# Usage (on the VPS):
#   sudo /srv/circlesfera/infra/host/apply-environments.sh            # both
#   sudo /srv/circlesfera/infra/host/apply-environments.sh staging    # one
#
# It never touches production: not its checkout, its containers or its site.
# An environment whose certificate or password file is missing is skipped,
# with the commands that create them.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRODUCTION_DIR="$(cd "${HERE}/../.." && pwd)"
DEPLOY_USER="$(stat -c '%U' "${PRODUCTION_DIR}")"
ORIGIN="$(sudo -u "${DEPLOY_USER}" git -C "${PRODUCTION_DIR}" remote get-url origin)"
ENVIRONMENTS=("$@")
[ "${#ENVIRONMENTS[@]}" -gt 0 ] || ENVIRONMENTS=(staging dev)

changed=0
for name in "${ENVIRONMENTS[@]}"; do
  case "${name}" in
    staging | dev) ;;
    *)
      echo "Unknown environment: ${name} (staging or dev)." >&2
      exit 1
      ;;
  esac
  host="${name}.circlesfera.com"
  site_source="${HERE}/nginx/sites/circlesfera-${name}.conf"
  site="/etc/nginx/conf.d/circlesfera-${name}.conf"
  passwords="/etc/nginx/circlesfera-${name}.htpasswd"
  dir="/srv/circlesfera-${name}"

  echo "== ${name}"

  # The checkout the deploy of this environment works in, owned by the same
  # user that deploys production.
  if [ ! -d "${dir}/.git" ]; then
    install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" -m 0750 "${dir}"
    sudo -u "${DEPLOY_USER}" git clone --quiet "${ORIGIN}" "${dir}"
    echo "Created ${dir}."
  fi

  missing=0
  if [ ! -f "/etc/letsencrypt/live/${host}/fullchain.pem" ]; then
    missing=1
    echo "No certificate for ${host}. Its three names must resolve to this server first; then:"
    echo "  sudo certbot certonly --nginx --cert-name ${host} \\"
    echo "    -d ${host} -d admin.${host} -d backoffice.${host}"
  fi
  if [ ! -s "${passwords}" ]; then
    missing=1
    echo "No password file for ${name}. Create it (apache2-utils gives htpasswd):"
    echo "  sudo htpasswd -c ${passwords} <name>"
  fi
  if [ "${missing}" -eq 1 ]; then
    echo "Skipped the site of ${name}; run this script again afterwards."
    continue
  fi

  # A site written by hand that already answers this address would win or
  # lose against ours by file order. It is never edited from here.
  others="$(grep -rlE "server_name[^;]*[[:space:]]${host//./\\.}[[:space:];]" \
    /etc/nginx/sites-enabled /etc/nginx/conf.d 2> /dev/null | grep -vxF "${site}" || true)"
  if [ -n "${others}" ]; then
    echo "Another site already answers ${host}:" >&2
    echo "${others}" >&2
    echo "Remove ${host} from it (it sends that address to production), then run this script again." >&2
    continue
  fi

  previous=""
  if [ -f "${site}" ]; then
    previous="$(mktemp)"
    cp "${site}" "${previous}"
  fi
  install -m 0644 "${site_source}" "${site}"
  if ! nginx -t 2> /dev/null; then
    # nginx never reloads a configuration that does not pass its own test.
    if [ -n "${previous}" ]; then cp "${previous}" "${site}"; else rm -f "${site}"; fi
    echo "nginx rejected the site of ${name}; it was put back as it was." >&2
    nginx -t || true
    continue
  fi
  [ -z "${previous}" ] || rm -f "${previous}"
  changed=1
  echo "Site of ${name} installed."
done

if [ "${changed}" -eq 1 ]; then
  systemctl reload nginx
  echo "nginx reloaded."
fi
