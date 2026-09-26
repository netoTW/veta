#!/usr/bin/env bash
# La única forma de desplegar (ESPECIFICACION-LANZAMIENTO.md §9).
#
#   1. árbol limpio: los invariantes se corren sobre lo que se va a desplegar, no sobre otra cosa
#   2. npm run invariantes: si uno falla, aquí se acaba
#   3. commit vacío con «Invariantes-ok: <árbol>»: es la marca que deja construir a Vercel
#   4. push a main → Vercel publica el front (sólo con esa marca)
#   5. la API en el VPS: fetch, reset, reinicio, is-active
#   6. verificación en producción: el front servido es esta build y la API responde
#
# Uso: scripts/desplegar.sh "texto que tiene que aparecer en el front publicado" (opcional)
set -euo pipefail
cd "$(dirname "$0")/.."
TEXTO="${1:-}"
SSH=(ssh -i "$HOME/.ssh/veta_vps" -o ConnectTimeout=15 root@144.91.123.49)

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ Hay cambios sin commitear. Los invariantes se corren sobre el árbol que se despliega: commitea primero."; exit 1
fi
if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then echo "✗ Sólo se despliega desde main."; exit 1; fi

npm run -s invariantes

ARBOL=$(git rev-parse 'HEAD^{tree}')
git commit -q --allow-empty -m "Despliegue: invariantes en verde" -m "Invariantes-ok: $ARBOL"
git push -q origin main
echo "✓ push $(git rev-parse --short HEAD) con la marca del árbol $ARBOL"

echo "━━ API ━━"
"${SSH[@]}" 'cd /opt/veta-web && git fetch -q origin && git reset -q --hard origin/main && git rev-parse --short HEAD && systemctl restart veta-web && sleep 8 && systemctl is-active veta-web'
curl -sf -o /dev/null https://api.vetalab.io/api/contenido/meta && echo "✓ api.vetalab.io responde"

echo "━━ front ━━ (esperando a Vercel, hasta 8 min)"
ENTRADA=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
for i in $(seq 1 48); do
  if curl -s https://www.vetalab.io/ | grep -q "$ENTRADA"; then echo "✓ www.vetalab.io sirve esta build ($ENTRADA)"; break; fi
  [ "$i" = 48 ] && { echo "✗ Vercel no publicó la build en 8 min ($ENTRADA)"; exit 1; }
  sleep 10
done
if [ -n "$TEXTO" ]; then
  F=$(grep -l -- "$TEXTO" dist/assets/*.js | head -1 | xargs basename)
  N=$(curl -s "https://www.vetalab.io/assets/$F" | grep -c -- "$TEXTO" || true)
  [ "$N" -gt 0 ] && echo "✓ «${TEXTO}» está en el fragmento publicado $F" || { echo "✗ «${TEXTO}» no aparece en $F publicado"; exit 1; }
fi
echo "━━ desplegado y verificado ━━"
