#!/usr/bin/env bash
# Show the production site of the host nginx, written by hand, so that it can
# be kept in the repository (infra/host/nginx/sites/circlesfera-production.conf)
# exactly as it is. Reads only; changes nothing.
#
# Usage (on the VPS, from Termius):
#   sudo /srv/circlesfera/infra/host/show-production-site.sh
#
# Its output is for the conversation with the engineer, never for a public
# log: the server's configuration is not printed in GitHub Actions. The
# server also hosts other projects: their sites are counted, never named.
# The value of any line naming a credential is masked.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

echo "== CircleSfera sites nginx loads (file -> real path, sha256)"
others=0
for f in /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/*; do
  [ -e "$f" ] || continue
  target="$(readlink -f "$f")"
  if ! grep -qF circlesfera "$target"; then
    others=$((others + 1))
    continue
  fi
  echo "$f -> $target $(sha256sum "$target" | cut -d' ' -f1)"
done
echo "Sites of other projects (not read): ${others}"

# The production site is the one that names admin.circlesfera.com, as
# apply-production-addresses.sh finds it.
mapfile -t files < <(
  grep -RlF admin.circlesfera.com /etc/nginx/sites-enabled /etc/nginx/conf.d 2> /dev/null \
    | xargs -r -n1 readlink -f | sort -u
)
if [ "${#files[@]}" -ne 1 ]; then
  echo "Expected one site naming admin.circlesfera.com, found ${#files[@]}: ${files[*]:-none}." >&2
  exit 1
fi
file="${files[0]}"
echo
echo "== Production site: ${file}"
stat -c 'owner %U:%G, mode %a, %s bytes' "${file}"
echo "sha256 $(sha256sum "${file}" | cut -d' ' -f1)"
shown="$(mktemp)"
perl -pe 's/^(\s*(?!auth_basic_user_file\b|ssl_)\S+).*(authorization|bearer|token|secret|passw|api[_-]?key).*$/$1 <masked>;/i' \
  "${file}" > "${shown}"
echo "Lines masked: $(grep -c '<masked>' "${shown}" || true)"
echo "----- begin -----"
cat "${shown}"
echo "----- end -----"
rm -f "${shown}"

echo
echo "== Certificate renewal"
systemctl is-active certbot.timer 2> /dev/null | sed 's/^/certbot.timer: /' || true
systemctl list-timers --all --no-pager 2> /dev/null | grep -i -E 'certbot|letsencrypt' || echo "No certbot timer listed."

echo
echo "== Days each certificate has left"
for address in circlesfera.com www.circlesfera.com admin.circlesfera.com backoffice.circlesfera.com \
  staging.circlesfera.com admin.staging.circlesfera.com backoffice.staging.circlesfera.com \
  dev.circlesfera.com admin.dev.circlesfera.com backoffice.dev.circlesfera.com; do
  end="$(echo | timeout 15 openssl s_client -connect 127.0.0.1:443 -servername "${address}" 2> /dev/null \
    | openssl x509 -noout -enddate 2> /dev/null | cut -d= -f2 || true)"
  if [ -z "${end}" ]; then
    echo "  ${address}: no certificate read"
    continue
  fi
  echo "  ${address}: $(( ($(date -d "${end}" +%s) - $(date +%s)) / 86400 )) days (until ${end})"
done
