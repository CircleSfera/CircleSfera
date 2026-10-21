#!/usr/bin/env bash
# Give the host nginx the production site kept in the repository
# (nginx/sites/circlesfera-production.conf), so that the site is changed by a
# reviewed pull request, never by hand on the server. Safe to run again: when
# the server's file already matches, nothing changes.
#
# Usage (on the VPS, from Termius):
#   sudo /srv/circlesfera/infra/host/apply-production-site.sh
#   sudo /srv/circlesfera/infra/host/apply-production-site.sh --yes   # no questions
#
# The change is shown first and applied only after a yes. The file is copied
# to /var/backups/circlesfera-nginx before it changes; if nginx rejects the
# result, or any address of production, staging or development stops
# answering after the reload, the copy is put back and nginx reloaded. Only
# this one file is touched: the sites of other projects on the server are
# never read or changed.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${HERE}/nginx/sites/circlesfera-production.conf"
ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1
BACKUPS=/var/backups/circlesfera-nginx
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ADDRESSES=(
  circlesfera.com www.circlesfera.com admin.circlesfera.com backoffice.circlesfera.com
  staging.circlesfera.com admin.staging.circlesfera.com backoffice.staging.circlesfera.com
  dev.circlesfera.com admin.dev.circlesfera.com backoffice.dev.circlesfera.com
)

# The production site is the one that names admin.circlesfera.com.
mapfile -t files < <(
  grep -RlF admin.circlesfera.com /etc/nginx/sites-enabled /etc/nginx/conf.d 2> /dev/null \
    | xargs -r -n1 readlink -f | sort -u
)
if [ "${#files[@]}" -ne 1 ]; then
  echo "Expected one site naming admin.circlesfera.com, found ${#files[@]}: ${files[*]:-none}." >&2
  echo "Nothing was changed." >&2
  exit 1
fi
file="${files[0]}"
echo "Production site: ${file}"

if cmp -s "${file}" "${SOURCE}"; then
  echo "The server's file already matches the repository's. Nothing to do."
  exit 0
fi

echo "It would change like this:"
diff -u "${file}" "${SOURCE}" || true
if [ "${ASSUME_YES}" -ne 1 ]; then
  read -r -p "Apply this change to ${file}? [y/N] " answer < /dev/tty
  if [ "${answer}" != "y" ] && [ "${answer}" != "Y" ]; then
    echo "Left as it was."
    exit 1
  fi
fi

install -d -m 0700 "${BACKUPS}"
copy="${BACKUPS}/$(basename "${file}").${STAMP}"
cp -p "${file}" "${copy}"
echo "Copy of the file as it was: ${copy}"

put_back() {
  cat "${copy}" > "${file}"
  if nginx -t 2> /dev/null; then
    systemctl reload nginx
    echo "The file was put back as it was and nginx reloaded." >&2
  else
    echo "The file was put back, but nginx rejects it too: check nginx -t now." >&2
  fi
}

# Same owner and mode: the content alone changes.
cat "${SOURCE}" > "${file}"

if ! nginx -t 2> /dev/null; then
  # nginx never reloads a configuration that does not pass its own test.
  nginx -t || true
  cat "${copy}" > "${file}"
  echo "nginx rejected the change; the file was put back as it was." >&2
  exit 1
fi
systemctl reload nginx
echo "nginx reloaded."

# Every address still reaches its environment, with its certificate. The
# health route answers without the environments' password.
sleep 2
failed=0
for address in "${ADDRESSES[@]}"; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
    --resolve "${address}:443:127.0.0.1" "https://${address}/api/v1/health" || echo 000)"
  if [ "${code}" = "200" ]; then
    echo "  OK   ${address}"
  else
    echo "  FAIL ${address} (${code})"
    failed=1
  fi
done
if [ "${failed}" -ne 0 ]; then
  put_back
  exit 1
fi
echo "Done: the production site is the repository's."
