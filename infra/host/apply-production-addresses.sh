#!/usr/bin/env bash
# Make the production site of the host nginx, written by hand, answer every
# production address by name. An address it does not name is answered by
# whichever site nginx loads first: since the sites of staging and
# development were installed (conf.d, loaded before sites-enabled), that is
# development, so backoffice.circlesfera.com reached development, with its
# certificate and its password. Safe to run again: an address already named
# is left alone.
#
# Usage (on the VPS):
#   sudo /srv/circlesfera/infra/host/apply-production-addresses.sh
#   sudo /srv/circlesfera/infra/host/apply-production-addresses.sh --yes   # no questions
#
# The change is shown first and applied only after a yes. The file is copied
# to /var/backups/circlesfera-nginx before it changes, and put back if nginx
# rejects the result. Nothing else in the file changes.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSUME_YES=0
[ "${1:-}" = "--yes" ] && ASSUME_YES=1
BACKUPS=/var/backups/circlesfera-nginx
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# The production site is the one that names this address.
ANCHOR=admin.circlesfera.com
ADDRESSES=(circlesfera.com www.circlesfera.com admin.circlesfera.com backoffice.circlesfera.com)

mapfile -t files < <(
  grep -RlF "${ANCHOR}" /etc/nginx/sites-enabled /etc/nginx/conf.d 2> /dev/null \
    | xargs -r -n1 readlink -f | sort -u
)
if [ "${#files[@]}" -ne 1 ]; then
  echo "Expected one site naming ${ANCHOR}, found ${#files[@]}: ${files[*]:-none}." >&2
  echo "Nothing was changed." >&2
  exit 1
fi
file="${files[0]}"
echo "Production site: ${file}"

proposal="$(mktemp)"
cp "${file}" "${proposal}"
for address in "${ADDRESSES[@]}"; do
  if "${HERE}/answer-address.py" "${proposal}" "${ANCHOR}" "${address}" --check; then
    next="$(mktemp)"
    "${HERE}/answer-address.py" "${proposal}" "${ANCHOR}" "${address}" > "${next}"
    mv "${next}" "${proposal}"
  fi
done

if cmp -s "${file}" "${proposal}"; then
  rm -f "${proposal}"
  echo "The production site already names every production address. Nothing to do."
  exit 0
fi

echo "It would change like this:"
diff -u "${file}" "${proposal}" || true
if [ "${ASSUME_YES}" -ne 1 ]; then
  read -r -p "Apply this change to ${file}? [y/N] " answer < /dev/tty
  if [ "${answer}" != "y" ] && [ "${answer}" != "Y" ]; then
    rm -f "${proposal}"
    echo "Left as it was."
    exit 1
  fi
fi

install -d -m 0700 "${BACKUPS}"
copy="${BACKUPS}/$(basename "${file}").${STAMP}"
cp -p "${file}" "${copy}"
echo "Copy of the file as it was: ${copy}"
# Same owner and mode: the content alone changes.
cat "${proposal}" > "${file}"
rm -f "${proposal}"

if ! nginx -t 2> /dev/null; then
  # nginx never reloads a configuration that does not pass its own test.
  cat "${copy}" > "${file}"
  echo "nginx rejected the change; the file was put back as it was." >&2
  nginx -t || true
  exit 1
fi
systemctl reload nginx
echo "nginx reloaded."

# Each address now reaches production, with production's certificate.
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
exit "${failed}"
