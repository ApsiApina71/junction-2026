#!/bin/bash
# Runs ON the Verda machine, as root, from deploy.sh. Installs or updates owl-api and Owl Studio (JUN-114).
#
#   setup.sh <git ref>        e.g. main, or aapo/jun-114-host-owl-api-on-verda
#
# Needs /etc/owl/owl-api.env (the keys; deploy.sh copies it). Safe to run again: it updates the checkout,
# the Python and Node dependencies and the Studio build, then restarts owl-api.
set -euo pipefail

REF="${1:-main}"
REPO="https://github.com/ApsiApina71/junction-2026.git"
IP="$(curl -s -4 https://api.ipify.org)"
DOMAIN="${IP//./-}.sslip.io"
export DEBIAN_FRONTEND=noninteractive

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "packages"
if ! command -v caddy >/dev/null || ! command -v node >/dev/null; then
  apt-get update -q
  apt-get install -y -q git curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
  if ! command -v caddy >/dev/null; then
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  fi
  if ! command -v node >/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  fi
  apt-get update -q
  apt-get install -y -q caddy nodejs
fi

say "user and folders"
id owl >/dev/null 2>&1 || useradd --system --home /opt/owl --shell /usr/sbin/nologin owl
mkdir -p /opt/owl /var/lib/owl /etc/owl
chown owl:owl /opt/owl /var/lib/owl
test -f /etc/owl/owl-api.env || { echo "Missing /etc/owl/owl-api.env (the keys). Run deploy.sh."; exit 1; }
chmod 640 /etc/owl/owl-api.env && chown root:owl /etc/owl/owl-api.env

say "uv"
if [ ! -x /opt/owl/uv ]; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/opt/owl UV_NO_MODIFY_PATH=1 sh
fi

say "checkout ${REF}"
if [ ! -d /opt/owl/repo/.git ]; then
  sudo -u owl git clone -q "$REPO" /opt/owl/repo
fi
sudo -u owl git -C /opt/owl/repo fetch -q origin
sudo -u owl git -C /opt/owl/repo checkout -q --detach "origin/${REF}" 2>/dev/null || sudo -u owl git -C /opt/owl/repo checkout -q --detach "$REF"
echo "at $(sudo -u owl git -C /opt/owl/repo log --oneline -1)"

say "owl-api dependencies (with V-JEPA)"
cd /opt/owl/repo/apps/owl-api
sudo -u owl env HOME=/opt/owl UV_CACHE_DIR=/opt/owl/uv-cache /opt/owl/uv sync -q --locked --extra jepa

say "Owl Studio build for https://api.${DOMAIN}"
cd /opt/owl/repo/apps/owl-studio
sudo -u owl env HOME=/opt/owl npm ci --no-audit --no-fund --loglevel=error
sudo -u owl env HOME=/opt/owl VITE_API_URL="https://api.${DOMAIN}" npm run -s build
rm -rf /opt/owl/studio && cp -R dist /opt/owl/studio && chown -R owl:owl /opt/owl/studio

say "settings, service and https"
cat > /etc/owl/deploy.env <<EOF
OWL_STORY=junction
DATA_DIR=/var/lib/owl/junction
OWL_STAGE=1
LLM_BACKEND=nemotron
JEPA_BACKEND=vjepa21
PUBLIC_BASE_URL=https://api.${DOMAIN}
EOF
install -m 644 /opt/owl/repo/infra/verda/owl-api.service /etc/systemd/system/owl-api.service
sed "s/__DOMAIN__/${DOMAIN}/g" /opt/owl/repo/infra/verda/Caddyfile.tmpl > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable -q owl-api caddy
systemctl restart owl-api
systemctl reload caddy || systemctl restart caddy

say "waiting for owl-api (the first start downloads V-JEPA 2.1, about 1.6 GB)"
for _ in $(seq 1 180); do
  HEALTH="$(curl -sf http://127.0.0.1:8000/health || true)"
  if [[ "$HEALTH" == *vjepa21* && "$HEALTH" != *loading* ]]; then break; fi
  sleep 5
done
echo "$HEALTH"
echo
echo "owl-api:  https://api.${DOMAIN}"
echo "Studio:   https://studio.${DOMAIN}"
echo "Stage:    https://api.${DOMAIN}/stage"
