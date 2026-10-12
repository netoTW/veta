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

HEAD_PROBADO=$(git rev-parse HEAD)
npm run -s invariantes

# La marca certifica el árbol que se probó: si alguien hizo commit mientras corrían los
# invariantes, HEAD ya no es ese árbol y no se marca nada.
if [ "$(git rev-parse HEAD)" != "$HEAD_PROBADO" ] || [ -n "$(git status --porcelain)" ]; then
  echo "✗ El árbol cambió mientras corrían los invariantes: no se marca ni se despliega."; exit 1
fi
ARBOL=$(git rev-parse 'HEAD^{tree}')
git commit -q --allow-empty -m "Despliegue: invariantes en verde" -m "Invariantes-ok: $ARBOL"
git push -q origin main
echo "✓ push $(git rev-parse --short HEAD) con la marca del árbol $ARBOL"

echo "━━ API ━━"
"${SSH[@]}" 'cd /opt/veta-web && git fetch -q origin && git reset -q --hard origin/main && git rev-parse --short HEAD && systemctl restart veta-web && sleep 8 && systemctl is-active veta-web'
# Arrancar tarda ~9 s (conectar a Supabase y migrar): se espera hasta 60 s, y si no responde se para aquí.
for i in $(seq 1 30); do
  if curl -sf -o /dev/null https://api.vetalab.io/api/contenido/meta; then echo "✓ api.vetalab.io responde (a los $((i * 2)) s)"; break; fi
  [ "$i" = 30 ] && { echo "✗ api.vetalab.io no responde 60 s después del reinicio"; exit 1; }
  sleep 2
done

echo "━━ front ━━ (esperando a Vercel, hasta 8 min)"
ENTRADA=$(grep -o 'assets/index-[A-Za-z0-9_-]*\.js' dist/index.html | head -1)
SHA=$(git rev-parse HEAD)
REPO=$(git remote get-url origin | sed -E 's#.*github.com[:/](.*)\.git#\1#')
DESAFIO=0
for i in $(seq 1 48); do
  if curl -s https://www.vetalab.io/ | grep -q "$ENTRADA"; then echo "✓ www.vetalab.io sirve esta build ($ENTRADA)"; break; fi
  # Vercel puede poner un desafío anti-bots a curl (403 «Security Checkpoint», TRASPASO §7): entonces la
  # prueba es el estado del despliegue de producción que Vercel deja en el commit
  if curl -sI https://www.vetalab.io/ | grep -qi 'x-vercel-mitigated: challenge' \
     && gh api "repos/$REPO/commits/$SHA/statuses" --jq '.[] | select(.context == "Vercel – veta") | .state' 2>/dev/null | grep -q success; then
    echo "✓ Vercel publicó $SHA en producción (estado en GitHub; el sitio le pone un desafío a curl)"; DESAFIO=1; break
  fi
  [ "$i" = 48 ] && { echo "✗ Vercel no publicó la build en 8 min ($ENTRADA)"; exit 1; }
  sleep 10
done
if [ -n "$TEXTO" ] && [ "$DESAFIO" = 0 ]; then
  F=$(grep -l -- "$TEXTO" dist/assets/*.js | head -1 | xargs basename)
  N=$(curl -s "https://www.vetalab.io/assets/$F" | grep -c -- "$TEXTO" || true)
  [ "$N" -gt 0 ] && echo "✓ «${TEXTO}» está en el fragmento publicado $F" || { echo "✗ «${TEXTO}» no aparece en $F publicado"; exit 1; }
elif [ -n "$TEXTO" ]; then
  echo "· «${TEXTO}»: con el desafío de Vercel, el fragmento se comprueba con un navegador"
fi
echo "━━ desplegado y verificado ━━"
