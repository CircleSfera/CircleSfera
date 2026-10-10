#!/usr/bin/env bash
# Apply the versioned host configuration to the production VPS: ufw firewall,
# fail2ban, SSH and the response buffers of the host nginx. Safe to run again;
# every step converges to the same state.
#
# Usage (on the VPS, from a session that stays open until a second session
# has logged in):
#   sudo /srv/circlesfera/infra/host/apply.sh
#
# Docker publishes container ports past ufw, so the firewall only protects
# host services. Container ports must be published on 127.0.0.1; the script
# lists any that are not.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SSH_DROPIN=/etc/ssh/sshd_config.d/00-circlesfera-hardening.conf
JAIL=/etc/fail2ban/jail.d/circlesfera.local
NGINX_DROPIN=/etc/nginx/conf.d/00-circlesfera-proxy-buffers.conf

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

# Turning passwords off without a key would lock the owner out.
LOGIN_USER="${SUDO_USER:-}"
if [ -z "${LOGIN_USER}" ] || [ "${LOGIN_USER}" = root ]; then
  echo "Run with sudo from your own user, not as root." >&2
  exit 1
fi
LOGIN_HOME="$(getent passwd "${LOGIN_USER}" | cut -d: -f6)"
if ! grep -qE '^(ssh-|ecdsa-|sk-)' "${LOGIN_HOME}/.ssh/authorized_keys" 2>/dev/null; then
  echo "${LOGIN_USER} has no key in ~/.ssh/authorized_keys; refusing to turn password logins off." >&2
  exit 1
fi

echo "== Packages"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw fail2ban > /dev/null

echo "== SSH"
install -m 0644 "${HERE}/ssh/00-circlesfera-hardening.conf" "${SSH_DROPIN}"
if ! sshd -t; then
  rm -f "${SSH_DROPIN}"
  echo "sshd rejected the configuration; it was removed and SSH is unchanged." >&2
  exit 1
fi
systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) '

echo "== Firewall"
# The SSH rule goes in before the firewall is enabled, so the current
# session is never cut.
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow 22/tcp comment 'ssh' > /dev/null
ufw allow 80/tcp comment 'http, redirects to https and ACME challenges' > /dev/null
ufw allow 443/tcp comment 'https' > /dev/null
ufw --force enable > /dev/null
ufw status verbose

echo "== fail2ban"
install -m 0644 "${HERE}/fail2ban/circlesfera.local" "${JAIL}"
if ! fail2ban-client -t > /dev/null; then
  rm -f "${JAIL}"
  echo "fail2ban rejected the configuration; it was removed." >&2
  exit 1
fi
systemctl enable --now fail2ban > /dev/null 2>&1
systemctl restart fail2ban
sleep 2
fail2ban-client status

echo "== Host nginx response buffers"
# The drop-in is removed again if nginx rejects it (for instance when the
# same directives are already set in the http block), so nginx never reloads
# a configuration that does not pass its own test.
if command -v nginx > /dev/null && [ -d /etc/nginx/conf.d ]; then
  install -m 0644 "${HERE}/nginx/00-circlesfera-proxy-buffers.conf" "${NGINX_DROPIN}"
  if ! nginx -t 2> /dev/null; then
    rm -f "${NGINX_DROPIN}"
    echo "nginx rejected the configuration; it was removed and nginx is unchanged." >&2
    exit 1
  fi
  systemctl reload nginx
  # Every place the value is set: a site with its own, smaller value still
  # needs it raised or removed by hand.
  nginx -T 2> /dev/null | grep -E '^\s*proxy_buffer_size\s' | sort | uniq -c
else
  echo "nginx is not installed on the host; nothing to do."
fi

echo "== Container ports published on every interface (ufw does not cover these)"
PUBLIC_PORTS="$(ss -tlnHp | grep docker-proxy | awk '{print $4}' | grep -vE '^(127\.0\.0\.1|\[::1\]):' || true)"
if [ -n "${PUBLIC_PORTS}" ]; then
  echo "${PUBLIC_PORTS}"
  echo "Publish these on 127.0.0.1 in their docker-compose file."
else
  echo "none"
fi

cat <<EOF

Done. Keep this session open and log in from a new one before closing it.
If the new login fails, undo the SSH change from this session with:
  sudo rm ${SSH_DROPIN} && sudo systemctl reload ssh
EOF
