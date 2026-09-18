#!/usr/bin/env bash
# Instala la API de VETA en el servidor del motor (Ubuntu 24). Idempotente.
#   sudo bash despliegue/instalar-web.sh <repo-git> <dominio>
# Deja: Node 22, Caddy, /opt/veta-web (clon), datos compilados, servicio systemd y HTTPS en api.<dominio>.
set -euo pipefail
REPO="${1:?repo git de VETA (ssh o https)}"; DOMINIO="${2:?dominio, p. ej. veta.com}"
DEST=/opt/veta-web
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update && apt-get install -y caddy
fi
id veta >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin veta
if [ -d "$DEST/.git" ]; then git -C "$DEST" pull --ff-only; else git clone "$REPO" "$DEST"; fi
cd "$DEST/site"
npm ci --omit=dev --ignore-scripts
npm rebuild better-sqlite3 >/dev/null 2>&1 || true   # no se usa en producción (Postgres), pero está en dependencies
[ -f .env ] || { cp despliegue/env.produccion.ejemplo .env; echo ">> completá $DEST/site/.env y volvé a correr"; }
chmod 600 .env; mkdir -p "$DEST/datos"; chown -R veta:veta "$DEST"
# el usuario veta tiene que leer base_contenido y reports del motor (mismo grupo)
usermod -aG veta veta 2>/dev/null || true
# datos compilados por primera vez
sudo -u veta env VETA_BASE_CONTENIDO=/opt/veta/gem-pipeline/base_contenido VETA_DATOS="$DEST/datos" node scripts/datos.mjs
install -m 644 despliegue/veta-web.service /etc/systemd/system/veta-web.service
systemctl daemon-reload && systemctl enable --now veta-web
# Caddy: HTTPS automático para api.<dominio>
sed "s/{\$VETA_DOMINIO}/$DOMINIO/" despliegue/Caddyfile > /etc/caddy/Caddyfile
mkdir -p /var/log/caddy && chown caddy:caddy /var/log/caddy
systemctl enable --now caddy && systemctl reload caddy
ufw allow 80,443/tcp >/dev/null 2>&1 || true
echo "listo: https://api.$DOMINIO/api/contenido/meta"
