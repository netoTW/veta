#!/usr/bin/env bash
# ¿Puede el servicio escribir sus propios datos?
#
# El 21-sep un script de mantenimiento corrió como root y dejó los siete .json de
# /opt/veta-web/datos con dueño root:root. El usuario `veta` podía leerlos pero no
# reescribirlos, así que la sincronización fallaba cada diez minutos y la excepción
# mataba el proceso: la API se caía y volvía sola, y desde fuera parecía otra cosa.
# Es la misma familia que el incidente del instalador del 19-sep.
#
# Corriendo como root, lo arregla. Corriendo como cualquier otro, avisa y sale con
# error, que es lo que hace falta para que se vea en el log en vez de a las horas.
#
#   bash despliegue/comprobar-dueno.sh [carpeta] [usuario]
set -uo pipefail
CARPETA="${1:-${VETA_DATOS:-/opt/veta-web/datos}}"
DUENO="${2:-veta}"

[ -d "$CARPETA" ] || { echo "[dueño] no existe $CARPETA"; exit 0; }

# La pregunta no es de quién son, es si el servicio puede escribirlos: un fichero
# de otro dueño con permiso de grupo está bien, y uno propio sin permiso, mal.
AJENOS=$(find "$CARPETA" -mindepth 1 \( ! -user "$DUENO" -o ! -writable \) -printf '%p (%u:%g %M)\n' 2>/dev/null)

if [ -z "$AJENOS" ]; then
  echo "[dueño] $CARPETA correcto: todo de $DUENO y escribible"
  exit 0
fi

echo "[dueño] en $CARPETA hay ficheros que $DUENO no puede reescribir:"
echo "$AJENOS" | sed 's/^/  /'

if [ "$(id -u)" = "0" ]; then
  chown -R "$DUENO:$DUENO" "$CARPETA"
  echo "[dueño] corregido: chown -R $DUENO:$DUENO $CARPETA"
  exit 0
fi

echo "[dueño] AVISO: no soy root y no puedo corregirlo. La sincronización va a fallar."
echo "[dueño] arréglalo con:  sudo chown -R $DUENO:$DUENO $CARPETA"
exit 1
