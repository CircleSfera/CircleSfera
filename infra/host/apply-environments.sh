#!/usr/bin/env bash
# Prepare the server for the environments that are not production: staging
# (staging.circlesfera.com) and development (dev.circlesfera.com). For each
# one it creates the checkout the deploy works in and gives the host nginx
# its site. Safe to run again; every step converges to the same state.
#
# Usage (on the VPS):
#   sudo /srv/circlesfera/infra/host/apply-environments.sh            # both
#   sudo /srv/circlesfera/infra/host/apply-environments.sh staging    # one
#   sudo /srv/circlesfera/infra/host/apply-environments.sh --yes      # no questions
#
# It never touches production's checkout or containers. An environment whose
# certificate or password file is missing is skipped, with the commands that
# create them.
#
# An address that an older site, written by hand, already answers (today
# dev.circlesfera.com, sent to production) is taken out of that site: the
# change is shown first and applied only after a yes. The file is copied to
# /var/backups/circlesfera-nginx before it changes, and everything is put
# back if nginx rejects the result.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRODUCTION_DIR="$(cd "${HERE}/../.." && pwd)"
DEPLOY_USER="$(stat -c '%U' "${PRODUCTION_DIR}")"
ORIGIN="$(sudo -u "${DEPLOY_USER}" git -C "${PRODUCTION_DIR}" remote get-url origin)"
ASSUME_YES=0
ENVIRONMENTS=()
for argument in "$@"; do
  case "${argument}" in
    --yes) ASSUME_YES=1 ;;
    *) ENVIRONMENTS+=("${argument}") ;;
  esac
done
[ "${#ENVIRONMENTS[@]}" -gt 0 ] || ENVIRONMENTS=(staging dev)
BACKUPS=/var/backups/circlesfera-nginx
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

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

  # A site written by hand that already answers one of these addresses would
  # win or lose against ours by file order, and it sends them to production.
  # The addresses are taken out of it; nothing else in it changes.
  declare -A originals=()
  refused=0
  for address in "${host}" "admin.${host}" "backoffice.${host}"; do
    # -R below: the enabled sites are links to the files, and -r does not
    # follow them.
    while IFS= read -r listed; do
      [ -n "${listed}" ] || continue
      file="$(readlink -f "${listed}")"
      [ "${file}" != "${site}" ] || continue
      "${HERE}/release-address.py" "${file}" "${address}" --check || continue
      proposal="$(mktemp)"
      "${HERE}/release-address.py" "${file}" "${address}" > "${proposal}"
      echo "${address} is answered by ${file}. It would change like this:"
      diff -u "${file}" "${proposal}" || true
      if [ "${ASSUME_YES}" -ne 1 ]; then
        read -r -p "Apply this change to ${file}? [y/N] " answer < /dev/tty
        if [ "${answer}" != "y" ] && [ "${answer}" != "Y" ]; then
          rm -f "${proposal}"
          refused=1
          continue
        fi
      fi
      if [ -z "${originals[${file}]:-}" ]; then
        install -d -m 0700 "${BACKUPS}"
        copy="${BACKUPS}/$(basename "${file}").${STAMP}"
        cp -p "${file}" "${copy}"
        originals[${file}]="${copy}"
        echo "Copy of the file as it was: ${copy}"
      fi
      # Same owner and mode: the content alone changes.
      cat "${proposal}" > "${file}"
      rm -f "${proposal}"
    done < <(grep -RlF "${address}" /etc/nginx/sites-enabled /etc/nginx/conf.d 2> /dev/null || true)
  done
  put_back() {
    for file in "${!originals[@]}"; do
      cat "${originals[${file}]}" > "${file}"
    done
  }
  if [ "${refused}" -eq 1 ]; then
    put_back
    echo "Left as it was: the older site still answers an address of ${name}." >&2
    unset originals
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
    put_back
    echo "nginx rejected the site of ${name}; everything was put back as it was." >&2
    nginx -t || true
    unset originals
    continue
  fi
  unset originals
  [ -z "${previous}" ] || rm -f "${previous}"
  changed=1
  echo "Site of ${name} installed."
done

if [ "${changed}" -eq 1 ]; then
  systemctl reload nginx
  echo "nginx reloaded."
fi
