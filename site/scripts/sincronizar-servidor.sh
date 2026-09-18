#!/usr/bin/env bash
# Trae del servidor lo que el motor deja (base_contenido y reports) y recompila los datos
# de la web. Lo corre el servidor de la web cada VETA_SYNC_MINUTOS y el admin a mano.
# Nada se copia a mano: si la tanda deja un informe en el servidor, aparece en la bandeja.
set -euo pipefail
cd "$(dirname "$0")/.."
# .env sin exportar: sólo las variables del servidor
leer() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
SSH_DEST="${VETA_SERVIDOR_SSH:-$(leer VETA_SERVIDOR_SSH)}"
CLAVE="${VETA_SERVIDOR_CLAVE:-$(leer VETA_SERVIDOR_CLAVE)}"; CLAVE="${CLAVE/#\~/$HOME}"
RUTA="${VETA_SERVIDOR_RUTA:-$(leer VETA_SERVIDOR_RUTA)}"
DEST="${VETA_DATOS_MOTOR:-../datos-motor}"
# Modo local (la web corre en el mismo servidor que el motor): no hay nada que traer, sólo recompilar.
if [ "${VETA_SYNC_MODO:-}" = "local" ] || { [ -z "$SSH_DEST" ] && [ -n "${VETA_BASE_CONTENIDO:-}" ]; }; then
  node scripts/datos.mjs
  echo "compilado en local $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  exit 0
fi
[ -n "$SSH_DEST" ] && [ -n "$RUTA" ] || { echo "faltan VETA_SERVIDOR_SSH / VETA_SERVIDOR_RUTA"; exit 2; }
mkdir -p "$DEST/base_contenido" "$DEST/reports"
SSH="ssh -i $CLAVE -o BatchMode=yes -o ConnectTimeout=10"
# base_contenido: los registros y lo chico; lo pesado (liquidaciones, series) no lo lee la web.
# cola-web.jsonl y publicacion.jsonl son de la web: no se pisan.
rsync -az --timeout=40 -e "$SSH" \
  --exclude liquidaciones --exclude series --exclude snapshots_holders --exclude universo_elegible \
  --exclude cola-web.jsonl --exclude publicacion.jsonl --exclude scanner \
  "$SSH_DEST:$RUTA/base_contenido/" "$DEST/base_contenido/"
rsync -az --timeout=40 -e "$SSH" "$SSH_DEST:$RUTA/reports/" "$DEST/reports/"
node scripts/datos.mjs
echo "sincronizado $(date -u +%Y-%m-%dT%H:%M:%SZ)"
