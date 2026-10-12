# Traspaso — estado al 12-oct-2026 (fase 6b: roca pulida y panel completo de Luffy)

Para retomar hace falta leer **tres archivos y nada más**: `CLAUDE.md` (las reglas
que mandan sobre todo lo demás), `CONTRATO-ANALISIS-A-PEDIDO.md` (la interfaz con
el motor, que es donde se pide lo que no es mío) y este.

Lo que este archivo no repite: `ESTADO-WEB.md` cuenta cómo funciona cada parte por
dentro, `DESPLIEGUE.md` cómo se instala, `SISTEMA-VISUAL.md` la paleta y las piezas.
Aquí va sólo lo que hace falta para **seguir trabajando**.

**Desde el 26-sep manda `ESPECIFICACION-LANZAMIENTO.md`**, aprobada y construida: la evidencia de
cada criterio está en `INFORME-LANZAMIENTO.md`. Lo que no está ahí vive en `BACKLOG.md`.

---

## 1. Reglas de coordinación  ·  LO PRIMERO

**No se edita el repositorio del motor.** `~/Documents/Crypto sistem/gem-pipeline`
es de otra sesión. Leerlo, ejecutarlo y correr sus tests, sí; modificar sus
ficheros, no. Lo que se necesite de ese lado **se escribe en el contrato** y Pablo
se lo encarga a la sesión del motor. Los cambios sin commitear que aparezcan ahí
son de esa sesión: no se tocan ni se commitean.

*(Los 39 ficheros del arreglo de formato del 21-sep ya los revisó y commiteó la
sesión del motor, en `b301733`. Su árbol está limpio: no queda nada mío ahí.)*

**Un arreglo, un commit, un despliegue, una verificación.** Sin acumular. Se
verifica **en producción**, no en local, antes de pasar al siguiente.

**Se despliega sólo con `site/scripts/desplegar.sh`.** Corre los invariantes y, si
pasan, marca el commit para que Vercel lo construya (un push normal no despliega:
ver §7). **Nunca hagas commit mientras corre:** el script lo detecta y se para.

**Cada escritura en la base de producción** se le enseña a Pablo como comando
exacto y se ejecuta sólo cuando la aprueba en el momento.

**Lo que no se hace sin que Pablo lo pida:** aprobar o despublicar informes, pedir
análisis nuevos, hacer pagos, reescribir historia de git, borrar datos o cuentas.

**Si algo necesita una decisión suya:** se anota y se sigue con lo demás. No se
bloquea el trabajo esperando.

---

## 2. Dónde está cada cosa

### En el Mac
| | |
|---|---|
| Web (mía) | `~/Documents/VETA` · el código en `site/` |
| Motor (ajeno) | `~/Documents/Crypto sistem/gem-pipeline` |
| Mugiwara (ajeno; su contrato con la web es `CONTRATO-PANEL.md`) | `~/Documents/Mugiwara` |
| Datos del motor espejados | `~/Documents/VETA/datos-motor/base_contenido` |
| Archivo de calibración | `~/Documents/VETA/archivo/` (fuera de git) |

### En el servidor (Contabo, `144.91.123.49`, acceso `ssh -i ~/.ssh/veta_vps root@…`)
| Ruta | Qué es |
|---|---|
| `/opt/veta-web` | clon de la web · 286 MB |
| `/opt/veta-web/site/.env` | secretos de la web · `veta:veta`, 600 |
| `/opt/veta-web/datos/` | los 7 JSON que sirve la API · **tiene que ser de `veta:veta`** |
| `/opt/veta/gem-pipeline/` | el motor · `base_contenido/` 148 MB, `reports/` 30 MB |
| `/opt/veta/gem-pipeline/base_contenido/noticias/` | piezas, agenda y tendencias del noticiero |
| `/opt/veta/archivo/` | lo archivado de la calibración · 87 MB |
| `/opt/veta/gem-pipeline/base_contenido/publicados-web.json` | lo publicado, para el motor (contrato §22) · lo escribe la web |
| `/opt/veta/gem-pipeline/config/conflictos_interes.yaml` | monedas con tenencia declarada · la web lo lee |
| `/opt/mugiwara` · `mugiwara-api` en `127.0.0.1:8800` | Mugiwara (Luffy) · la web llega por el puente `/api/luffy/*` con `MUGIWARA_API_TOKEN` |

### Servicios y temporizadores
`veta-web` (la API, siempre activa) · `veta-servicio` (el motor por HTTP, :8787) ·
`veta-grabador` (liquidaciones, siempre activo) · y por temporizador:
`veta-cron` (diario 08:37 CEST), `veta-noticias` (12:30 UTC), `veta-snapshots`,
`veta-fotos`, `veta-backup`.

### Dominios
`www.vetalab.io` → Vercel (el front) · `api.vetalab.io` → Caddy → `veta-web` en el
VPS. Vercel reescribe `/api/*` hacia `api.vetalab.io`. **El webhook de Whop apunta
al dominio de la API directamente**, para que el cuerpo crudo llegue intacto a la
firma.

---

## 3. Qué está hecho

**Fase 6b (12-oct): sistema visual v2 «roca pulida» y panel completo** (`ESTADO-WEB.md` §7ter,
`SISTEMA-VISUAL.md` §20). Navegación nueva, terminal por moneda con gráficos sincronizados y
stop arrastrable, cartera y exchange con propuestas, caja, radar, control, oficina en vivo e
informes. **Cotejado con `CONTRATO-PANEL.md` v2.1** (§8) el 12-oct: tipos, cliente, simulador y pantallas
con las formas exactas. **Falta que Mugiwara despliegue su backend de la 6b**: a la fecha todas sus
rutas nuevas dan 404 en el servidor (el código está sin commitear en su repo). Cuando esté:
`scripts/probar-luffy.mjs` y `scripts/shots-6b.mjs` contra la API real (túnel al 8800 y
`VETA_LUFFY=http`), revisar capturas y anotar aquí lo que difiera. Capturas: `recursos/capturas/6b/`.

**Fase 6a (11-oct): el panel de Mugiwara en `/luffy`** (`ESTADO-WEB.md` §7ter). Puente
`/api/luffy/*` sólo para el admin real (el resto, 404), SSE sin buffer, chat con los hilos de
Telegram, gráficos interactivos dentro del mensaje (lightweight-charts 5 con paneles
sincronizados y primitivas propias; ECharts para distribuciones y comparación), tarjetas de
orden con Confirmar/Cambiar/Cancelar, imágenes adjuntas, laboratorio con catálogo,
benchmarks, transformaciones y posiciones encima, tableros; todo a 390 px. Simulador del
contrato (`server/luffySimulado.ts`) para desarrollo e invariantes; prueba de Playwright
(`scripts/probar-luffy.mjs`) con el caso guiado de STONK dentro de `npm run invariantes`.
**Lo que depende de Mugiwara:** el servidor todavía corre un `mugiwara-api` anterior a la 6a
(sin `/graficos/datos`, `/tableros`, `spec_id` en los mensajes); cuando esa sesión despliegue,
el panel funciona sin tocar nada aquí. **Lo que depende de Pablo:** `MUGIWARA_API_TOKEN` en el
`.env` de `veta-web` y recargar el Caddyfile nuevo (§8).

Lo del 26-sep (detalle y evidencia en `INFORME-LANZAMIENTO.md`):

- **Invariantes y despliegue** (`npm run invariantes`, `scripts/desplegar.sh`): tipos,
  lint, navegaciones automáticas, pruebas unitarias, lenguaje, matriz de acceso en el
  servidor, tenencia declarada, barrido y prueba de contrato. Vercel sólo construye
  commits marcados.
- **Recuperación de contraseña sin bucles:** guardia única de navegaciones
  (`src/lib/guardaNavegacion.ts`); sin 3D en `/recuperar` y `/restablecer`.
- **Tiempos:** publicación, sesión y resultados en memoria; pool caliente; lista de
  análisis ligera. En el VPS, las rutas de contenido en p95 ≤ 13 ms.
- **`publicados-web.json`** (contrato §22), que el motor ya lee.
- **Estados del pedido** (contrato §20): una tabla de textos, el reloj es del motor,
  alertas en `/admin/consumo`.
- **Datos incompletos** (contrato §20.2): «Sobre los datos de este informe»; lo
  corregido, sólo admin.
- **Prueba de contrato** (§23) sobre `fixtures-contrato/`.
- **Ficha gratis de cualquier moneda** (contrato §21) con límite por usuario e IP.
- **Combustible**, sólo admin.
- **Tenencia declarada** fuera de toda respuesta a clientes (`server/tenencia.ts`).

Lo de antes sigue: cobro con Whop, enlaces cortos, noticias y agenda, sitio público,
límite de error, archivado de la calibración.

---

## 4. Pendientes, por prioridad

### Alta
00. **Conectar la 6b con datos reales** cuando Mugiwara despliegue (hoy 404): correr `probar-luffy.mjs`
    y `shots-6b.mjs` contra la API real, revisar las capturas y corregir lo que difiera del contrato.
0. **Encender Luffy en producción** (fase 6a): `MUGIWARA_API_TOKEN` en `/opt/veta-web/site/.env`,
   copiar `despliegue/Caddyfile` a `/etc/caddy/Caddyfile` y recargar Caddy; esperar a que la
   sesión de Mugiwara despliegue su backend de la 6a. Después: capturas con datos reales y
   probar el SSE de punta a punta en `www.vetalab.io/luffy`.
1. **El banco de 20 informes del motor** en `fixtures-contrato/`: sin él, «listo»
   (§13 de la especificación) no está completo. Es del motor.
2. **El respaldo fuera del servidor no ha funcionado nunca** (`veta-backup` en
   `failed`, credenciales R2 de marcador). Necesita las credenciales de Pablo.
3. **Borrar la cuenta de prueba de producción** `prueba-base-20260926@vetalab.io`
   (comando en el informe, espera aprobación).

### Media
4. **A1.2 en producción:** abrir el correo de recuperación que salió a la cuenta de
   prueba (Resend `01a0dedc…`) y completar el cambio.
5. **El pago real de Base** (lo hace Pablo) y comprobar `pago_evento`.
6. **Ficha lenta:** p95 10,8 s en frío (objetivo del motor, 8 s). Pedido en el contrato.
7. **DefiLlama falla mucho** (35 %): fichas flacas en algunas monedas.

### Baja
8. Todo lo de `BACKLOG.md`.

---

## 5. Decisiones tomadas, y por qué

| Decisión | Por qué |
|---|---|
| **La aprobación se ata al `id` de la corrida**, no a `version_registro` ni al tipo | Una reexportación del motor subió la versión de todos y el sitio público se quedó en cero sin que nadie decidiera nada. Y por id **también cuando cambia de tipo**: una gema reclasificada a análisis conserva el id, es la misma corrida. |
| **Nada se despublica solo** | Si cambia el contenido, el informe sigue publicado y se marca en oro para que Pablo lo mire. Bajar algo sin que nadie lo decida es cómo se llega a un sitio vacío. |
| **El track record es sólo lo que el público vio como gema** | No se deduce del dato de hoy: se marca cuando ocurre, en `gema_publica`. Una vez dentro no sale, aunque el motor la reclasifique. Un track record del que se caen las que salieron mal no es un track record. |
| **`retirado` es retirado en todas partes** | §17 del contrato. Estaba sólo en el seguimiento y PUMP seguía en Gemas. |
| **Una invalidación con valor cero no rompe una tesis** | Un cero casi nunca es una medición: es una fuente caída. Se muestra «Dato en revisión». Decirle a un suscriptor que su tesis se rompió por eso es el peor error de esa pantalla. |
| **Al suscriptor sólo se le avisa de lo que puede abrir** | Las alertas iban sobre el seguimiento crudo y avisaban de gemas que el público nunca vio. Admin las sigue recibiendo todas. |
| **302 en los enlaces cortos, nunca 301** | Un permanente se queda pegado en cada navegador y cambiar el destino después dejaría fuera a quien ya pasó. |
| **Firmado o nada en el webhook** | Sin secreto configurado, la ruta contesta 503 y no mira el cuerpo. |
| **El enrutado de enlaces cortos va por lista positiva** | Primero las 21 pantallas por nombre, después lo que queda al resolvedor. Una expresión negativa mal puesta se lleva por delante el sitio entero. |
| **Los múltiplos de escenario, sólo en admin** | Se parecen demasiado a una promesa de retorno. |
| **Coma decimal y espacio duro antes del %** | Se arregla donde nace el número. Un reemplazo al final no distingue un decimal de un separador de miles. |
| **El verificador corrige, no bloquea; el cliente no ve lo corregido** | Decisión de Pablo del 26-sep. Sólo «sin verificar» y una línea de no disponibles. |
| **El reloj de un pedido es del motor** | La web cerraba pedidos que el motor todavía iba a entregar. Ahora sólo avisa a admin a los 30 min. |
| **La tenencia declarada se filtra a la salida de toda la API** | Un filtro por ruta se olvida en la ruta nueva: la watchlist le enseñaba SYN a cualquier Base. |
| **Lo de admin no sale del servidor** (retiradas, combustible, solo_admin) | Esconderlo en pantalla no basta: viajaba en la API. |
| **`/luffy` responde 404 a quien no es admin, no 403, y sin nombrar nada** | Es el sistema personal de Pablo: para un socio no existe. Un 403 ya cuenta que hay algo. La puerta es doble: el servidor (rol real, sin impersonar) y la pantalla. |
| **El eje 2 de los gráficos no se dibuja** | Dos ejes a izquierda y derecha se pisaban con las leyendas; la leyenda viva ya dice el valor del benchmark. |
| **Sin token, Luffy es un simulador con la forma exacta del contrato** | Los invariantes y las capturas no pueden depender de un túnel SSH ni de gastar dinero en un turno real. |
| **Desde el lanzamiento (`VETA_LANZAMIENTO`, 27-sep) nada se saca del historial** | Contrato §17.1, D1 de Pablo. Una retirada se queda con su resultado congelado; lo anterior es calibración y se archiva. |

---

## 6. Lo que se le ha pedido al motor  ·  vive en el contrato

**A Mugiwara (CONTRATO-PANEL.md, sesión `mugiwara`), de la prueba real del 12-oct:**
- `POST /graficos/datos` con `benchmarks: ["categoria"]` sobre un activo sin categoría en DefiLlama
  (WAL) descarta el benchmark en silencio: no entra en `no_disponibles`. El contrato dice que lo que
  no hay se declara con su motivo.
- A las 00:00 UTC del 12-oct `mugiwara-api` devolvió, para cualquier spec con `posiciones`,
  `no_disponibles: [{serie: "pnl", motivo: "FeatureNotSupported: cached plan must not change result type"},
  {serie: "posiciones", motivo: "…"}]` y `marcadores: []`: un plan preparado de Postgres que quedó viejo
  tras la migración 018 en una conexión del pool. Una hora antes la misma petición traía la entrada y el
  stop de WAL; a las 00:10 volvía a traerlos. Se cura reiniciando el servicio o descartando los planes
  (`DISCARD ALL`) al migrar. La web enseña el motivo tal cual en la nota del gráfico.
- Las velas diarias de BingX vienen con `t` a las 16:00 UTC (no a las 00:00); el panel coloca cada marcador en
  la vela abierta en ese momento, así que funciona, pero conviene decirlo en el contrato.

En `CONTRATO-ANALISIS-A-PEDIDO.md`, acuse de §20 y §21 (al final). Lo abierto hoy:
el banco de 20 exportaciones; la ficha más rápida; `no_disponibles[].que`,
catalizadores y prosa en lenguaje de cliente y con la tabla de §23 (hoy la web lo
limpia, pero es un parche); `titulo_cliente` por sección; el aviso de «versión nueva
sólo de forma».

---

## 7. Trampas conocidas  ·  leer antes de tocar

Cada una costó un incidente. Están aquí para no repetirlas.

1. **Dos cálculos para una sola verdad.** Es el error que más veces ha aparecido:
   la cabecera contra el marcador, el marcador contra el seguimiento, `visiblePara`
   contra la lista de anticipadas. **Si dos pantallas cuentan lo mismo, tienen que
   salir de la misma función.** El guardia único es `ocultoSiempre()` en
   `server/contenido.ts`.
2. **Los ficheros de `/opt/veta-web/datos/` tienen que ser de `veta:veta`.** Un
   script de mantenimiento corrido con `sudo` los dejó de root, la sincronización
   falló cada diez minutos y la excepción tumbaba el proceso. Ya se comprueba al
   instalar, en cada sincronización y al arrancar la API.
3. **Cada despliegue borra los fragmentos de código anteriores.** Una pestaña
   abierta desde antes pide nombres que ya dan 404. Resuelto con `lazySeguro()` en
   `src/lib/fragmentos.ts`, que recarga una vez.
4. **Colisión de nombres al importar.** Importar `pct` rompió 24 tests del motor
   porque varios módulos ya usaban `pct` como variable local. Alias privados.
5. **`npx tsc -p tsconfig.json` no comprueba nada** (es una solución con
   `files: []`). Los de verdad son `tsconfig.app.json` y `tsconfig.server.json`.
6. **Vercel descarta el cuerpo de las peticiones DELETE.** Por eso borrar cuentas es
   un POST.
7. **El motor manda formas que el contrato no promete.** `entidades_etiquetadas`
   llegaba como `[]` en vez de objeto y dejó seis informes en blanco. Cuando el tipo
   diga la verdad, el compilador encuentra el resto de los sitios.
8. **Un push a `main` no despliega el front.** Vercel sólo construye un commit con
   `Invariantes-ok: <árbol>` (vercel.json › ignoreCommand). Usa `desplegar.sh`.
9. **La IP del cliente llega en `X-Vercel-Forwarded-For`.** Caddy sustituye
   `X-Forwarded-For` por la IP de Vercel: leer ésa junta a todos los visitantes.
10. **`.p-datos` ya existía** (rejilla de cifras en cinco pantallas). Antes de crear
    una clase, búscala.
11. **El puerto 8799 del Mac lo tiene un `node /tmp/motor-stub.mjs` del 20-sep** que
    no es de esta sesión. Las pruebas usan un puerto libre.
12. **Un mismo id puede ser gema reclasificada (oculta) y análisis (visible).** Elige
    el registro que el rol ve, no el primero: así se perdían los gráficos de STONK.

---

## 8. Cómo desplegar y verificar

```bash
cd ~/Documents/VETA/site
git status                       # limpio: los invariantes se corren sobre lo que se despliega
scripts/desplegar.sh "un texto nuevo que tenga que aparecer en el front"
```
Corre `npm run invariantes` (~12 min; incluye la prueba de Playwright de /luffy), marca y empuja, despliega la API (fetch, reset,
reinicio, espera a que responda) y espera a que Vercel sirva la build y el texto.
Si algo falla, se para y no empuja nada.

Pruebas sueltas (con la vista previa o su propio servidor): `probar-recuperacion`,
`probar-estados`, `probar-integridad`, `probar-contrato`, `probar-ficha local|produccion`,
`probar-combustible`, `probar-planes`, `probar-publicados`, `medir`.

---

## 9. Estado de producción al cerrar

Todo en `0fcb868` (web y API), desplegado con los invariantes en verde. Servicio
activo, sin errores. `publicados-web.json` en secuencia creciente con CELO y STONK
publicados y la noticia de SYN despublicada; el motor lo lee.

**Publicado:** nada. CELO y STONK despublicados el 27-sep (metodología anterior al
lanzamiento, se archivan; filas `publicacion` 7 y 8). SYN despublicado el 26-sep (tenencia
declarada) y fuera de toda respuesta a clientes. Track record público vacío.

**Tiempos en el VPS:** rutas de contenido p95 ≤ 20 ms con y sin sesión; la primera
petición con sesión tras una pausa, ~430 ms (Supabase en us-east-1).

**Cuenta de prueba en producción:** `prueba-base-20260926@vetalab.io` (Base), pendiente
de borrar con aprobación de Pablo (comando en `INFORME-LANZAMIENTO.md`).
