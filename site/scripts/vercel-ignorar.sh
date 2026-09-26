#!/usr/bin/env bash
# Vercel lo corre antes de cada build (vercel.json › ignoreCommand).
# Salir con 0 = NO construir; salir con 1 = construir.
#
# Sólo se construye un commit que desplegar.sh marcó tras pasar los invariantes
# sobre ese mismo árbol: la línea «Invariantes-ok: <hash del árbol>» tiene que
# coincidir con el árbol del commit. Un push normal a main no despliega nada.
arbol=$(git rev-parse 'HEAD^{tree}')
marca=$(git log -1 --format=%B | sed -n 's/^Invariantes-ok: *\([0-9a-f]\{40\}\).*/\1/p' | tail -1)
if [ -n "$marca" ] && [ "$marca" = "$arbol" ]; then
  echo "Invariantes en verde para el árbol $arbol: se construye."
  exit 1
fi
echo "Sin marca de invariantes para este árbol ($arbol): no se despliega. Usa scripts/desplegar.sh."
exit 0
