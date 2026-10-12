# Estado de la web de VETA

Documento de traspaso. Qué existe, cómo se opera y qué falta. Sin historial: sólo el presente.

VETA es una plataforma de research cripto. El **motor** (agentes, datos, informes) vive en otro
repositorio y en el mismo servidor; la **web** es este repositorio y no calcula nada: formatea,
compara, cuenta y decide qué se publica.

| | |
|---|---|
| sitio | `https://www.vetalab.io` (canónico; `vetalab.io` responde 308 hacia él) |
| API | `https://api.vetalab.io` |
| repo | `github.com/netoTW/veta` (privado) |
| motor | `/opt/veta/gem-pipeline` en `144.91.123.49`, repo `netoTW/crypto-research-factory` |

**La regla que ordena todo el producto:** la plataforma **no calcula nada**. Si un número no
viene del motor, no se muestra; lo que falta se anota en `HUECOS-CONTRATO.md` y se le pide al
motor. La segunda regla: **nada se publica sin pasar por la bandeja**.

---

## 1. Stack y estructura

**Cliente:** React 19, Vite 8, react-router 7. La portada lleva una escena 3D con React Three
Fiber (`@react-three/fiber`, `drei`, `postprocessing`) y Three.js; el resto del producto es
HTML y CSS a mano, sin librería de componentes ni de charts.

**Servidor:** Hono sobre Node (`@hono/node-server`), TypeScript ejecutado con `tsx` (no hay
paso de compilación del servidor). Autenticación con better-auth 1.7.4 y su plugin `admin`.
Base de datos: Postgres (`pg`) en producción, SQLite (`better-sqlite3`) en local.

```
site/
  src/
    components/      portada: Hero (3D y móvil), Nav, Sistema, Footer, GLBoundary
    three/           HeroScene.tsx: la roca PBR, el ciclo del hero y el modo controlado
    auth/            AuthEscena.tsx (la roca obedeciendo al formulario) y Paginas.tsx
    producto/        todo lo que hay detrás de una sesión
      paginas/       Gemas, InformeDetalle, Seguimiento, Analisis, Watchlist,
                     Analizar, Votacion, Cuenta, Piezas
      admin/         Bandeja, BandejaDetalle, Cuentas, CuentaDetalle, Operacion,
                     Consumo, Votacion, Acciones, SoloAdmin, piezasAdmin
      charts/        Heatmap.tsx (liquidación proyectada) y Series.tsx, SVG a mano
      analizar/      piezasAnalizar.tsx, aviso.tsx (cupo y avisos en la barra)
      votacion/      piezasVoto.tsx (las piedras candidatas, la mecha, el cierre)
      Shell.tsx      cáscara del producto: barra, navegación, pie
      piezas.tsx     piezas comunes: Puerta, PlanBadge, Advertencias, Dato, TierBadge
      cifras.tsx     las cifras que venden y la prosa que se desautoriza
      marcador.tsx   benchmark vivo, predicción del usuario, marcador personal
    lib/             matriz.ts (acceso), sesion.tsx, datos.ts (fetch), contrato.ts (tipos),
                     formato.ts, lenguaje.ts (llano), contradicciones.ts, acceso.ts
    styles/          base, sistema, producto, auth, admin, charts, votacion, analizar
    ui/              Loader, EmptyState, TierIcon
    luffy/           el panel privado de Mugiwara (/luffy): LuffyShell, Chat, Laboratorio,
                     Tableros, api.ts (cliente del puente, SSE), tipos.ts (CONTRATO-PANEL.md),
                     md.tsx (el texto de Luffy), charts/ (lwc.ts, primitivas.ts, Grafico.tsx,
                     Distribucion.tsx y Comparacion.tsx con ECharts)
  server/
    index.ts         rutas y arranque
    bd.ts            la base abstraída: Postgres o SQLite tras una interfaz asíncrona
    db.ts            esquema de las tablas de VETA y helpers de escritura
    auth.ts          better-auth: sesión, roles, impersonación, recuperación
    semilla.ts       primer admin desde el entorno; cuentas demo sólo fuera de producción
    contenido.ts     lee lo compilado del motor y lo filtra por rol y por publicación
    admin.ts         bandeja, cuentas, registro de acciones
    analizar.ts      analiza tu moneda: determinista, profundo, cupos, consumo
    votacion.ts      votación semanal y su administración
    operacion.ts     proxy de /operacion/* del motor y sincronización de contenido
    luffy.ts         el puente /api/luffy/* hacia mugiwara-api (sólo admin real; el resto, 404)
    luffySimulado.ts mugiwara-api simulado con la forma del contrato (desarrollo e invariantes)
    cupo.ts          el cupo por ciclo de renovación y el tope global de gasto
    motor.ts         el contrato con el motor; motorHttp.ts (real) y motorSimulado.ts
    correo.ts        SMTP o archivo
    entorno.ts       todas las variables de entorno en un solo lugar
  scripts/
    datos.mjs                   compila base_contenido/*.jsonl a server/datos/*.json
    sincronizar-servidor.sh     trae el contenido del motor y recompila
    shots-*.mjs                 capturas fijas con puppeteer, una por fase
    piedras.py                  recorta las piedras generadas en assets
  despliegue/
    instalar-web.sh             instala la API en el servidor (idempotente)
    veta-web.service            unidad de systemd
    Caddyfile                   HTTPS automático para api.<dominio>
    env.produccion.ejemplo      plantilla del .env de producción
```

**Cómo se relacionan.** El cliente sólo habla con `/api` en su mismo origen. En local, Vite
proxea `/api` al servidor Hono; en producción, Vercel reescribe `/api/*` hacia
`api.vetalab.io` del lado del servidor. El servidor lee el contenido del motor ya compilado en
`server/datos/*.json` y la base sólo guarda lo que es de la plataforma: usuarios, sesiones,
decisiones de publicación, cupos, votos, predicciones y pedidos de análisis.

### Correr en local

```
cd site
npm install
cp .env.example .env        # completar BETTER_AUTH_SECRET y VETA_ADMIN_*
npm run dev                 # servidor en :8787 + Vite en :5173
```

Sin `DATABASE_URL` usa SQLite en `server/data/veta.sqlite`. Con `VETA_DEMO_PASSWORD` crea tres
cuentas de prueba (`gratis@`, `base@`, `pro@veta.local`) que en producción no existen.

| script | qué hace |
|---|---|
| `npm run dev` | servidor y Vite a la vez |
| `npm run build` | typecheck y build de la web |
| `npm run build:web` | sólo la build (es lo que corre Vercel) |
| `npm run preview` | sirve `dist/` y la API en `:5310`; es el modo de las capturas |
| `npm run datos` | recompila `server/datos/` desde `datos-motor/base_contenido` |
| `npm run typecheck` | cliente y servidor |

---

## 2. Las pantallas

Rol mínimo para ver algo con contenido. Todas las rutas del producto existen para cualquiera;
lo que cambia es lo que devuelve el servidor.

| ruta | qué muestra | quién la aprovecha |
|---|---|---|
| `/` | portada: la roca que se abre y revela la veta, el sistema, el pie | cualquiera |
| `/entrar` `/registro` `/recuperar` `/restablecer` | autenticación con la escena del hero reaccionando al formulario | cualquiera |
| `/gemas` | las gemas publicadas agrupadas por tier de riesgo | visitante ve titular y tier; **base** ve el informe |
| `/gemas/:id` | el informe: tesis, cifras, dos varas, escenarios, riesgo, microestructura, on-chain, fundamentales, escéptico, heatmap de liquidación proyectada, series, marcador y predicción | **base** |
| `/seguimiento` | estado diario de cada tesis, invalidación evaluada, benchmarks, alertas | **base**; alertas sólo **pro** |
| `/analisis` | el análisis diario y los informes de monedas sin tesis | cualquiera |
| `/analisis/:id` | el informe completo de un análisis | cualquiera, si está aprobado |
| `/watchlist` | las filas en vigilancia con su gatillo en lenguaje llano | **base** |
| `/analizar` | analiza tu moneda: busca, lectura estructural gratis, decisión de gastar cupo | determinista para **cualquiera**; profundo desde **base** |
| `/analizar/s/:id` | la espera: la roca refleja la etapa real del motor; después, el informe | dueño del pedido y admin |
| `/votacion` | votación semanal: candidatas como piedras, voto único, cierre e histórico | **pro** ve y vota; base y gratis ven la mesa velada |
| `/cuenta` | quién sos, plan, cupo, cambiar contraseña, planes | con sesión |
| `/piezas` | laboratorio de piezas visuales | cualquiera (interno) |
| `/admin/bandeja` | cada informe con el sello del Verificador, objeciones, advertencias y contradicciones; aprobar, rechazar, pedir más, despublicar | **admin** |
| `/admin/bandeja/:id` | el detalle con pestañas: informe, advertencias, escéptico, verificador, paquete, historial | **admin** |
| `/admin/cuentas` y `/:id` | usuarios: plan, rol, estado, cupo, consumo, impersonar | **admin** |
| `/admin/operacion` | el estado del servidor del motor: componentes, alertas, hits del Vigía, cola, última tanda | **admin** |
| `/admin/consumo` | gasto contra el tope mensual, por usuario y pedido a pedido | **admin** |
| `/admin/votacion` | armar la votación desde el ranking, recuento en vivo, cerrar, lanzar | **admin** |
| `/admin/acciones` | registro de todo lo que hizo un admin | **admin** |
| `/luffy`, `/luffy/h/:hilo` | el chat con Luffy (Mugiwara): los mismos hilos de Telegram, respuesta en streaming, gráficos interactivos y órdenes propuestas | **admin real** (para el resto no existe: 404) |
| `/luffy/laboratorio[/:spec]`, `/luffy/laboratorio/t/:tablero` | el laboratorio de gráficos: series del catálogo, benchmarks, transformaciones, posiciones encima, paneles sincronizados | **admin real** |
| `/luffy/tableros` | los gráficos guardados | **admin real** |
| `/luffy/terminal[/:activo]` | el terminal por moneda: lista con filtros y búsqueda; la ficha (precio y volumen con posiciones, gatillos y marcas del radar; derivados; fundamento contra la categoría; atención), ficha del radar, catalizadores, notas; mover el stop arrastrándolo | **admin real** |
| `/luffy/cartera` | la cartera de Pablo (posiciones, curva de capital, exposición, exchange: órdenes, historial, comisiones, propuestas) y la caja (misión, decisiones, pausar, cancelar, pánico) | **admin real** |
| `/luffy/radar` | candidatas por modo con seguimiento, y los modos con su estudio y track record; aprobar o rechazar modos propuestos | **admin real** |
| `/luffy/control` | gatillos, manual vivo, gasto y alertas | **admin real** |
| `/luffy/oficina` | la oficina en vivo (SSE): Luffy, agentes y fuentes | **admin real** |
| `/luffy/informes[/:fecha]` | informes diarios con gráficos, revisiones de la caja, bitácora y teorías | **admin real** |

---

## 3. La matriz de acceso, y cómo se aplica de verdad

La matriz vive en `src/lib/matriz.ts` y la importan **el cliente y el servidor**: una sola
fuente de verdad.

| sección | visitante | base | pro | admin |
|---|:--:|:--:|:--:|:--:|
| `gemas.titular` | ✅ | ✅ | ✅ | ✅ |
| `gemas.informe` | | ✅ | ✅ | ✅ |
| `gemas.anticipado` | | | ✅ | ✅ |
| `seguimiento` | | ✅ | ✅ | ✅ |
| `alertas` | | | ✅ | ✅ |
| `watchlist` | | ✅ | ✅ | ✅ |
| `analisis` | ✅ | ✅ | ✅ | ✅ |
| `ledger.resumen` | ✅ | ✅ | ✅ | ✅ |
| `ledger.detalle` | | ✅ | ✅ | ✅ |
| `ledger.bloqueados` | | | | ✅ |
| `analiza.determinista` | ✅ | ✅ | ✅ | ✅ |
| `analiza.profundo` | | ✅ | ✅ | ✅ |
| `scanner.solicitar` | | | ✅ | ✅ |
| `exportar` | | | ✅ | ✅ |
| `bandeja` | | | | ✅ |
| `cuentas` | | | | ✅ |

**Un plan `gratis` es el rol `visitante`.** `rolDe()` mapea: admin manda sobre el plan; `pro` y
`base` por plan; cualquier otra cosa, incluido gratis y suspendido, es visitante.

El servidor no se fía de la interfaz. Hay **cuatro capas**, y las tres primeras son de servidor:

1. **Middleware `exige(seccion)`** en las rutas que son de un plan entero
   (`/api/contenido/seguimiento`, `watchlist`, `alertas`, `exportar`): 401 si no hay sesión,
   403 si el rol no alcanza.
2. **Filtro por publicación** en `server/contenido.ts`. Toda lectura de contenido pasa por
   `visiblePara(registro, rol)`, que exige estado `aprobado` con fecha de publicación. El admin
   es la única excepción y por eso ve lo pendiente en la bandeja.
3. **Recorte por rol.** Si el rol no tiene `gemas.informe`, el servidor devuelve `soloTitular`:
   quince campos (id, símbolo, nombre, cadena, tier, factores del tier, estado económico y poco
   más). Sin tesis, sin escenarios, sin cifras, sin advertencias. El informe completo nunca sale
   del servidor para quien no puede verlo.
4. **La interfaz** muestra una `Puerta` que dice qué plan abre esa sección. Es cortesía, no
   seguridad.

Los routers de admin (`admin.ts`, `operacion.ts`, `analizar.ts` consumo, `votacion.ts` admin)
vuelven a pedir la sesión y exigen **rol admin real**: rechazan si la sesión está impersonando.

**Acceso anticipado:** una gema aprobada es visible para pro de inmediato y para base
`VETA_HORAS_ANTICIPO` después (6 por defecto). A base se le dice que existe y desde cuándo la
va a ver.

**El selector "ver como"** de la barra existe sólo en desarrollo y sólo para admin; el servidor
honra la cabecera `x-veta-ver-como` en las mismas condiciones. En producción no existe.

---

## 4. Los sistemas

### Autenticación
better-auth con correo y contraseña, mínimo 10 caracteres, contraseñas hasheadas con scrypt y
nunca legibles ni exportables. Sesión por cookie de 30 días, `__Secure`, `HttpOnly`,
`SameSite=Lax` y **sin atributo `Domain`**, así que queda atada a `www.vetalab.io`. Recuperación
por enlace de un solo uso que vale una hora. Plugin `admin`: suspender con motivo e impersonar
por una hora. Rotar `BETTER_AUTH_SECRET` cierra todas las sesiones y no afecta las contraseñas.

El primer admin sale de `VETA_ADMIN_EMAIL` y `VETA_ADMIN_PASSWORD` la primera vez que arranca.
Cambiar la contraseña propia se hace en `/cuenta`, que cierra las demás sesiones al guardar.

### Planes y cupos
Tres planes: gratis, base, pro. El plan lo asigna admin a mano desde Cuentas; **no hay pagos**.
Cada cambio de plan reescribe `suscripcion` y `cupo`.

El cupo de análisis profundos se reinicia **el día de renovación del plan**, no el 1 de cada
mes, y no acumula. Base 2, pro 6, admin ilimitado (`VETA_CUPO_BASE` / `VETA_CUPO_PRO`). Se
reserva al pedir y **se devuelve si el análisis falla o lo bloquea la verificación**. El
contador está siempre visible en la barra.

Sobre todo eso hay un **tope global mensual** (`VETA_TOPE_MENSUAL_USD`, 60 por defecto,
editable desde `/admin/consumo`): si el gasto comprometido lo supera, los pedidos nuevos quedan
retenidos y se le dice al usuario. La columna `solicitud.enviada` separa lo retenido por el tope
de lo que el motor ya tiene.

### Analiza tu moneda
Dos niveles. El **determinista** es instantáneo, gratis para todos incluido el visitante, no
consume cupo, y responde cinco bloques: demanda, riesgo de cola, concentración, tokenomics y
liquidez, cada uno con una lectura enumerada, una frase llana y sus cifras. **Nunca dice si es
gema.** El **profundo** consume cupo, lo hace el motor y tarda minutos; mientras corre, la roca
del hero refleja la etapa real que reporta el motor y al terminar se abre según el tier. El
resultado es del usuario de inmediato y además entra a la bandeja por si vale publicarlo.

### Votación semanal (pro)
Las candidatas salen del ranking del scanner y sólo de ahí. Se presentan como piedras con la
señal que disparó cada una; la más votada se ilumina en vivo. Un voto por socio, con fecha, sin
cambio. El admin cierra a mano y decide si lanza el análisis de la ganadora. Base y gratis ven
la mesa velada, sin símbolos, con la invitación a pasar a Pro.

### Predicción y benchmark
Cada gema publicada lleva un marcador vivo contra dos benchmarks (B1 canasta, B2 regla simple)
que **calcula el motor**; la web compara y cuenta. El usuario puede marcar una vez, con fecha y
sin cambio, si cree que la gema le gana a la canasta, y tiene su marcador personal. Un
benchmark no medible cuenta como "sin medir", nunca como cero.

### Bandeja de aprobación
Es el único lugar donde se decide qué se publica. Cada informe llega con el sello del
Verificador, las objeciones del Escéptico, sus advertencias por severidad y las
**contradicciones** detectadas entre la prosa del Redactor y los números actuales. Cuatro
acciones: aprobar, rechazar, pedir más, despublicar. Rechazar y pedir más exigen motivo escrito.
**Aprobar un informe que el Verificador dejó bloqueado exige confirmación explícita** y queda
registrado. Cada decisión se guarda en la tabla `publicacion` y se escribe además en
`base_contenido/publicacion.jsonl`: es lo único que la web escribe hacia el motor.

### Gestión de cuentas
Crear usuarios (reciben invitación para elegir contraseña), cambiar plan, rol, estado y cupo,
impersonar, y ver consumo. Todo queda en `acciones_admin` con quién, qué y cuándo.

### Operación
`/admin/operacion` muestra el estado del servidor del motor con criterio de producción: cada
componente se juzga por **lo último que produjo**, no por estar vivo. Cuatro estados: `ok`,
`MUDO` (corrió y no produjo nada, que es el peor porque se disfraza de éxito), `VIEJO` y
`SIN DATOS`. Además: alertas por severidad, hits del Vigía, la cola de pedidos con botón de
lanzar, y la última tanda registrada con tiempos y motivos de bloqueo.

---

## 5. El sistema visual

La referencia completa es `SISTEMA-VISUAL.md`. Lo esencial:

**Metáfora:** la roca que se abre y revela la veta. Materiales: roca 80 %, esmeralda, oro en
hilos. Nada de ámbar ni neón.

| color | hex | uso |
|---|---|---|
| roca | `#0C0E10` | fondo (con `#070809`, `#15181B`, `#1F2327`) |
| esmeralda | `#1FA46F` / luz `#5FE0A6` | lo sano, lo positivo |
| oro | `#C9A24B` / luz `#EAD189` | lo destacado, el plan Pro, la atención |
| hueso | `#ECE6D8` | texto principal |
| ceniza | `#8E918C` / `#5C605D` | secundario y terciario |
| rojo | `#B5473E` / luz `#D9695F` | riesgo y error |

**Tipografías**, todas autoalojadas: Outfit 300 para display, Geist para cuerpo, JetBrains Mono
para números y etiquetas.

**Reglas que no cambian:**
- Mismo cuidado en todo, **mismo espectáculo no**. La materialidad rica está en el hero, el
  login, los iconos de tier, las puertas, los vacíos, el loader y las piedras de la votación.
  Tablas, listas y comparables siguen planos: ahí manda densidad y legibilidad.
- **En vistas de cliente nunca aparece lenguaje interno**: motor, Redactor, Verificador,
  versiones, `§`, parser, hueco del contrato. El origen de la tesis es invisible. Las
  contradicciones sólo se ven en admin.
- Nada de casillas "sin dato" en la zona que vende.
- El admin tiene identidad propia y **tiene que verse mejor que el plan Pro**.

**El método, para cada pieza:** construir → **captura fija** → criticar sin piedad → rehacer.
Ninguna pieza se da por buena sin pasar por una captura mirada con atención.

Las capturas viven en `recursos/capturas/`, una carpeta por fase: `piezas`, `auth`, `admin-v2`,
`jerarquia`, `limpieza`, `charts`, `charts-v2`, `benchmark`, `votacion`, `analizar`, `motor`,
`operacion`, `producto-s6`, `producto-s7`. Los scripts que las generan son
`site/scripts/shots-*.mjs` y necesitan el servidor en modo preview. Esa carpeta **no está en el
repositorio** por peso: se comparte aparte.

---

## 6. Cómo se conecta al motor

Tres caminos, y ninguno deja que la web calcule nada.

**1. El contenido, por archivos.** El motor deja registros en
`base_contenido/{gema,analisis,watchlist,seguimiento_diario,visuales}.jsonl`. El script
`scripts/datos.mjs` los compila a `server/datos/*.json` tomando la última versión de cada id.
`scripts/sincronizar-servidor.sh` es el que lo dispara, en dos modos:

| `VETA_SYNC_MODO` | dónde | qué hace |
|---|---|---|
| `local` | **servidor** | la web y el motor comparten disco: sólo recompila |
| `ssh` | **local** | trae por rsync `base_contenido/` y `reports/` del servidor y recompila |

Corre al arrancar y cada `VETA_SYNC_MINUTOS` (10), y a mano desde el botón de la pestaña
Operación. En modo `ssh` nunca pisa `publicacion.jsonl` ni `cola-web.jsonl`, que son de la web,
y excluye lo pesado (liquidaciones, series, snapshots).

**2. Los análisis a pedido, por HTTP.** `server/motor.ts` define la interfaz y hay dos
implementaciones: `motorSimulado.ts` recorre las etapas con tiempos reales sin gastar un peso, y
`motorHttp.ts` habla con el servicio del motor. Se elige con `VETA_MOTOR=simulado|http` y
`VETA_MOTOR_URL`. El contrato de esas cuatro rutas (`/universo`, `/determinista`, `/profundo`,
`/progreso/:id`) está en `CONTRATO-ANALISIS-A-PEDIDO.md`, que es el documento que lee el otro
lado. **En producción está en `http` contra `127.0.0.1:8787`.**

**3. La operación, por HTTP con token.** `/operacion/estado`, `/hits`, `/cola`, `/alertas` y
`/lanzar` exigen token, **también las de lectura**. El token vive en `VETA_OPERACION_TOKEN` del
entorno de la web, es el mismo de `/opt/veta/.env` del motor, y **nunca llega al navegador**: el
servidor de la web hace de proxy y lo pone en la cabecera `X-Veta-Token`. Lanzar manda además
`X-Veta-Quien` con el correo del admin y queda registrado en los dos lados.

En local, el motor se alcanza por un túnel SSH que hay que abrir a mano y suele caerse:

```
ssh -i ~/.ssh/veta_vps -f -N -L 8788:127.0.0.1:8787 root@144.91.123.49
```

Con el túnel abierto, `VETA_MOTOR_URL` y `VETA_OPERACION_URL` apuntan a `http://127.0.0.1:8788`.
La pestaña Operación avisa en rojo cuando el túnel está caído y muestra el comando.

---

## 7. Despliegue

Tres piezas. El paso a paso completo está en `DESPLIEGUE.md`.

| pieza | dónde | por qué ahí |
|---|---|---|
| la web (`dist/`) | **Vercel** | estática, CDN, HTTPS solo |
| la base | **Supabase** (Postgres) | gestionada, con respaldo |
| la API | **Contabo**, junto al motor | necesita el disco del motor, hablar con él por loopback y correr timers |

**Por qué la API no puede ser funciones de Vercel:** no puede montar el disco del motor, no
puede hablar con `127.0.0.1:8787` sin exponerlo a internet, y no sostiene procesos largos
(recompilar cada 10 minutos, espejar el progreso de los análisis cada 3 segundos).

**Un solo origen.** El navegador sólo habla con `https://www.vetalab.io`. Vercel reescribe
`/api/*` hacia `https://api.vetalab.io` **del lado del servidor** (`site/vercel.json`), así que
no hay CORS y la cookie es de un único dominio.

**En Contabo:** servicio `veta-web` de systemd, corriendo como usuario `veta`, escuchando sólo
en `127.0.0.1:8790`, detrás de Caddy que resuelve el HTTPS solo en `api.vetalab.io`. El
firewall abre nada más que 22, 80 y 443. Los secretos están en `/opt/veta-web/site/.env` con
permisos 600, fuera de git. `NODE_ENV=production` lo pone la unidad, no el `.env`.

```
# actualizar la API
cd /opt/veta-web && sudo -u veta git pull --ff-only && cd site \
  && npm ci --omit=dev --ignore-scripts && sudo systemctl restart veta-web

# ver qué pasa
systemctl status veta-web && journalctl -u veta-web -n 50
```

**En Vercel:** Root Directory `site`, build `npm run build:web`, salida `dist`, install
`npm ci --ignore-scripts`. **No necesita ninguna variable de entorno**: el host de la API está
escrito en `vercel.json` porque Vercel no interpola variables en las reescrituras. Cada push a
`main` redespliega.

**En Supabase:** nada que configurar. Las tablas de better-auth las crean sus migraciones y las
de VETA se crean con `CREATE TABLE IF NOT EXISTS` al arrancar. La conexión usa el **session
pooler** (puerto 5432), que es el compatible con IPv4 y con las migraciones. La contraseña va
percent-encoded en la URI.

---

## 7bis. Cobro con Whop

Dos rutas, en `site/server/pagos.ts`:

| Ruta | Qué hace |
|---|---|
| `GET /api/pagos/checkout/:plan` | Devuelve el enlace de pago del plan, con el correo de la sesión precargado. |
| `POST /api/pagos/whop` | Recibe el aviso firmado de Whop y sube o baja el plan. |

**La URL del webhook es `https://api.vetalab.io/api/pagos/whop`**, directa al VPS.
No pasa por Vercel a propósito: la firma se calcula sobre el cuerpo crudo y no
conviene meter un proxy en medio.

**Los dos planes** (confirmados leyendo cada página de checkout, no adivinados):

| Plan | Identificador de Whop | Precio |
|---|---|---|
| Base | `plan_YeHwOrJGLxA4J` | 30 US$/mes |
| Pro | `plan_JmztLGWjafGJQ` | 50 US$/mes |

**El interruptor.** `cobro_automatico` es verdadero sólo si `VETA_WHOP_PLAN_BASE`
y `VETA_WHOP_PLAN_PRO` tienen valor. Mientras estén vacías, `/precios` sigue con
el botón de correo. Se encienden **junto con** `VETA_WHOP_WEBHOOK_SECRETO`: un
botón de pago sin secreto del webhook cobra sin poder activar el plan.

**Tres garantías del webhook:**

- *Firma obligatoria.* Standard Webhooks: HMAC-SHA256 sobre
  `{webhook-id}.{webhook-timestamp}.{cuerpo crudo}`, en base64, con ventana de
  cinco minutos. Sin secreto configurado la ruta contesta 503 y no mira nada.
- *Idempotencia.* El id del mensaje es la llave primaria de `pago_evento`. Un
  reenvío choca contra la llave, no aplica nada y contesta 200.
- *Orden.* Se compara la fecha del evento con la del último aplicado a esa
  membresía en `pago_membresia`: un aviso viejo no apaga un plan ya repagado.

**Qué evento hace qué.** Son los cinco suscritos en Whop (API 2026-09-15);
`went_valid`, `went_invalid`, `resumed`, `cancelled` y `expired` **no existen** en
esta versión y no están en el código.

| Evento | Efecto |
|---|---|
| `payment.succeeded` | sube el plan |
| `membership.activated` | sube el plan |
| `membership.deactivated` | baja a Gratis — **única vía de baja** |
| `payment.failed` | sólo se anota en `suscripcion.pago_fallido_en` |
| `membership.cancel_at_period_end_changed` | sólo se anota en `suscripcion.cancela_al_final` |

Un cobro fallido no baja el plan: Whop reintenta, y si el acceso se pierde de
verdad llega el `deactivated`. Cancelar tampoco: quien cancela sigue con acceso
hasta el final del ciclo que pagó. Los dos salen en la ficha de la cuenta en
admin, para verlos venir.

**De dónde viene cada suscriptor.** Al entrar al sitio se anotan los UTM de la
visita en `sessionStorage` (`src/lib/origen.ts`), una sola vez y sin pisarse. Al
pulsar un botón de plan, `GET /api/pagos/checkout/:plan` crea una sesión de pago
(`POST /v1/checkout_sessions`) con esos campos en `metadata`, y Whop los devuelve
en el aviso. Quedan en `suscripcion.origen` y se ven en la ficha de la cuenta.
Si la creación de la sesión falla, el botón cae al enlace de siempre: se pierde
el origen, no la venta.

**El cupo** se reinicia en la fecha que informa Whop. `asignarPlanExterno`
(en `db.ts`) calcula el periodo igual que `cupo.ts` —renovación menos un mes—
porque si las dos cuentas no coinciden, el cupo que se escribe no es el que se
lee después.

**La copia de cinco minutos de la sesión** dejó de mandar sobre el plan:
`planVigente` (en `db.ts`) recuerda diez segundos y el cobro la invalida con
`olvidarPlan`. Quien acaba de pagar entra a lo que pagó sin cerrar sesión, y no
se paga un viaje a la base en cada petición.

**Registro.** Todo cambio de plan entra en `acciones_admin` como `whop@pagos`,
con el identificador de la membresía y el plan de Whop en el detalle.

**Tablas nuevas:** `pago_evento` (un aviso recibido por fila) y `pago_membresia`
(qué membresía de Whop es de qué cuenta).

**La clave de API** está restringida por IP a 144.91.123.49, así que **sólo
funciona desde el servidor** —desde cualquier otra máquina responde «Your API Key
is invalid», que no es un problema de la clave—. La API buena es la **v1** con
`Authorization: Bearer`: v2, v5 y GraphQL rechazan esta clave. Lectura por id
(`/v1/plans/{id}`, `/v1/memberships/{id}`) funciona; los listados y la lectura de
sesiones de checkout, no.

## 7ter. Luffy: el panel privado de Mugiwara (`/luffy`)

Mugiwara es el sistema de inversión personal de Pablo; Luffy, su agente. Vive en Telegram y
desde la fase 6a también en la web, en una sección privada que **sólo existe para el rol
admin real** (sin impersonar). Para cualquier otro, `/luffy` dice «esta página no existe» sin
nombrar nada, y `/api/luffy/*` responde 404 en lectura y en escritura. No toca el producto
público.

**El puente (`server/luffy.ts`).** La web nunca habla con `mugiwara-api` directo: cada
petición a `/api/luffy/*` se reenvía a `MUGIWARA_API_URL` (`127.0.0.1:8800` en el servidor)
con la cabecera `X-Mugiwara-Token`, que vive en `MUGIWARA_API_TOKEN` del `.env` y nunca llega
al navegador. El chat es un stream de eventos (`text/event-stream`) y pasa **sin buffer** de
punta a punta: el cuerpo de Mugiwara es el cuerpo de nuestra respuesta, y el de la petición
(imágenes adjuntas) también va en streaming. Caddy no comprime `text/event-stream` y vacía al
instante (`flush_interval -1`); Vercel reescribe `/api/*` hacia la API y pasa el stream. Un
turno de chat puede tardar minutos: esa ruta no tiene tope de tiempo; el resto, un minuto.
Sin token, o con `VETA_LUFFY=simulado`, responde `server/luffySimulado.ts`: la misma forma
de `CONTRATO-PANEL.md` v1.1 con series de semilla fija, sin red ni gasto. Es lo que corren los
invariantes.

**El contrato** es `~/Documents/Mugiwara/CONTRATO-PANEL.md` (lo escribe la sesión de
Mugiwara). Lo que falte del otro lado se pide ahí, no se parchea aquí.

**Chat.** Hilos a la izquierda (cajón en el teléfono), los mismos que Telegram; «Usar en
Telegram» cambia el hilo activo del bot (`PATCH /hilos/{id}`). La respuesta llega por SSE
(`src/luffy/api.ts › chat`): `paso` se muestra mientras Luffy trabaja («revisando derivados…»),
`texto` se concatena, `grafico` se dibuja interactivo dentro del mensaje por su `spec_id` (con
el PNG de respaldo si falla), `propuesta` es una tarjeta con Confirmar (dos pasos), Cambiar
(rellena el cuadro con `cambiar (propuesta #id): `) y Cancelar; `fin` manda sobre el texto
acumulado. Un pedido repetido mientras el turno sigue en curso recibe el 409 del contrato y se
enseña como aviso. Imágenes: hasta 4 de 5 MB, por botón o pegando. La confirmación de una
orden es siempre por código (`POST /propuestas/{id}/confirmar`), nunca por el modelo.

**Gráficos (`src/luffy/charts/`).** Un spec v2 se pide a `POST /graficos/datos` y se dibuja
con **lightweight-charts 5**: un solo chart, un panel por `paneles[]` (eje de tiempo
compartido: zoom, arrastre y cruz sincronizados de fábrica, con dedos y con rueda), velas,
líneas, áreas, barras y baseline (PnL, tono, funding) según `estilo`; marcadores de entradas,
salidas, historial de stops y candidatas del radar; niveles como líneas de precio (precio
actual, stop, invalidación, gatillos…); zonas, eventos y perfiles por precio (volumen,
imán de liquidaciones) como **primitivas propias** (`primitivas.ts`). Las leyendas de cada
panel son HTML encima del lienzo y muestran todas las series a la vez al mover la cruz. El
rango se cambia con chips sin recargar. **ECharts** dibuja las distribuciones por precio
(`Distribucion.tsx`) y la comparación de variación por serie en el rango (`Comparacion.tsx`).
Colores de `SISTEMA-VISUAL.md` §6: esmeralda para lo positivo y la serie principal, oro sólo
en hilos (medias móviles, niveles destacados), rojo apagado para lo negativo, ceniza para los
benchmarks. El eje 2 (`eje: der`) no se dibuja: la leyenda viva ya dice su valor y dos ejes se
pisaban. La atribución de lightweight-charts va en el logo del lienzo y en el pie del gráfico.

**Laboratorio.** Abre un gráfico del chat (`GET /graficos/spec/{id}`), un tablero o uno nuevo,
y edita el spec: activos, rango, intervalo, comparar contra BTC, ETH, otro par o la mediana
(media, suma) de la categoría del protocolo, la posición de Pablo o de la caja encima,
paneles con sus series (catálogo de `GET /graficos/catalogo`), estilos, eje, transformaciones
(base 100, % desde fecha, ratio, promedio móvil, acumulado, por TVL, por usuario) y escala
log por panel. El spec que vuelve normalizado del servidor es la base de edición (sin el atajo
`benchmarks`, ya materializado en series). Guardar crea o actualiza un tablero; «Enlace» guarda
el spec (`POST /graficos/spec`) y copia la URL. En el teléfono los controles son una hoja
inferior («Ajustar»).

**Tableros.** `GET /tableros` por grupo, vista previa dibujada al entrar en pantalla, abrir en
el laboratorio, renombrar, subir/bajar (`PUT /tableros/orden`) y borrar en dos pasos.

### Fase 6b: el panel completo (12-oct-2026)

**Sistema visual v2 «roca pulida»** (`SISTEMA-VISUAL.md` §20, `src/styles/pulida.css`): radios,
vidrio en la carcasa, hilo metálico, barra de escritura tipo Siri. Aplicado por tokens a todo el
sitio.

**Navegación** (`LuffyShell.tsx`): escritorio con Chat, Terminal, Cartera, Radar y «Más»
(Laboratorio, Tableros, Control, Oficina, Informes); teléfono con barra inferior de vidrio y
hoja «Más».

**Contrato v2, supuesto.** Lo que el panel espera de `mugiwara-api` para el terminal, la
cartera, el exchange, la caja, el radar, el control, la oficina y los informes está en
`src/luffy/tipos6b.ts` con la forma que describe `PROMPT-FASE-6b-mugiwara.md`, y el simulador
(`server/luffySimulado.ts`, parte 6b) lo sirve con datos de semilla fija. **Cuando llegue
`CONTRATO-PANEL.md` v2, lo que difiera se ajusta en `tipos6b.ts` y en el simulador, no en las
pantallas.** El cliente es `src/luffy/api6b.ts`. Rutas usadas: `/terminal/universo`,
`/terminal/{activo}`, `/terminal/{activo}/preguntar`, `/cartera`, `/cartera/curva`,
`/posiciones/declarar`, `/exchange/ordenes`, `/exchange/historial`, `/exchange/proponer`,
`/caja`, `/caja/mision/{id}/{pausar|reanudar|cancelar}`, `/panico`, `/radar/candidatas`,
`/radar/modos`, `/modos/{id}/{v}/decidir`, `/gatillos` (GET, PATCH, DELETE), `/manual`,
`/manual/diff`, `/manual/propuestas/{id}/decidir`, `/costo` (ampliado), `/alertas` (paginado
con `pagina`), `/oficina/estado`, `/eventos` (SSE), `/informes`, `/informes/{fecha}`.

**Terminal** (`Terminal.tsx`): lista con filtros (mis posiciones, caja, candidatas, vigilancia,
gatillos, todo) y búsqueda; la ficha se arma sin recargar y se recuerda 45 s; ↑ ↓ cambian de
moneda en escritorio, deslizar sobre la cabecera en el teléfono (donde la lista es una hoja);
la siguiente y la anterior se precargan. Las cuatro secciones son specs v2 que vienen del
servidor (plantillas versionadas) y se dibujan con `Grafico`; todas comparten una
`Sincronia` (`charts/sincronia.ts`): cruz, zoom y rango visible se mueven juntos, y el rango
de la ficha manda sobre todas. Cada sección se abre en el laboratorio (guarda el spec y
navega); «Preguntarle a Luffy» crea o reutiliza un hilo del activo. **El stop vigente se
arrastra en el gráfico de precio** (asa sobre la línea, `onMoverStop` de `Grafico`) y al soltar
crea una propuesta de mover el stop, que se confirma en dos pasos con la misma tarjeta del
chat.

**Cartera** (`Cartera.tsx`): dos pestañas. La de Pablo: posiciones con mandato, PnL, stop y
distancia, peso; curva de capital con aportes y drawdown (ECharts); exposición; órdenes abiertas,
historial y comisiones del exchange; cancelar, modificar, mover stop y orden nueva generan una
propuesta; declarar una posición previa (STONK) crea la propuesta y pide confirmación. La caja:
misión, límites, decisiones de cada ciclo con su porqué, pausar o cancelar la misión y pánico
(los dos con confirmación); se mira, no se opera. Lo simulado se etiqueta siempre.

**Radar** (`Radar.tsx`), **Control** (`Control.tsx`: gatillos con pausar, reanudar y borrar y
«Cambiar con Luffy» que abre el hilo; manual con versiones, diff y propuestas; gasto por tipo de
turno y por día contra el presupuesto; alertas paginadas con filtros), **Oficina** (`Oficina.tsx`:
canvas 2D con Luffy al centro, agentes y fuentes; hilos que se encienden con los eventos del SSE;
se pausa con la pestaña oculta y no repinta sin cambios) e **Informes** (`Informes.tsx`).

**Pruebas.** `scripts/probar-luffy.mjs` (Playwright, Chrome del sistema): los cinco perfiles
contra `/api/luffy/*` (404 salvo admin), un suscriptor pro en `/luffy` (no existe), y con el
simulador: chat con el gráfico dentro del mensaje, un turno en streaming con el paso visible,
el **caso guiado** (abrir el gráfico de ingresos de STONK desde el mensaje, agregar la mediana
de su categoría y la posición de Pablo, guardarlo en un tablero y verlo en Tableros) y las tres
pantallas a 1440 y a 390 px sin desborde. Casos guiados de la 6b (simulador): abrir WAL en el
terminal, cambiar de moneda con el teclado, arrastrar el stop y cancelar la propuesta, abrir
derivados en el laboratorio; declarar STONK y verla en la cartera; y las nueve vistas a 390 px.
Corre dentro de `npm run invariantes`; con una carpeta como argumento deja capturas
(`recursos/capturas/luffy/`). `scripts/shots-6b.mjs` captura las vistas nuevas y
`scripts/shots-pulida.mjs` el antes/después del acabado.

## 8. Huecos del contrato abiertos

Lista completa en `HUECOS-CONTRATO.md`. Lo que sigue abierto, con qué falta de cada uno:

| # | qué falta |
|---|---|
| 4 | Fecha del catalizador: `escenarios[].catalizador_datado` es booleano, sin la fecha. |
| 5 | Fecha de cierre del horizonte: sólo hay `dias_al_cierre`, no una fecha. |
| 8 | Ledger y track record: no hay registro de gemas cerradas ni agregado del historial. La sección está en la matriz pero **no se construyó**. |
| 11 | `fundamentales.rubrica[].fuente` viene `null`: evidencia sin fuente. |
| 12 | `varas.revenue` cambia de forma según la moneda. |
| 13 | `ruta_informe` es una ruta local del motor; la web la borra al compilar. |
| 14 | `watchlist.tier_actual` e `historial_revisiones` vienen vacíos. |
| 15 | `esceptico.objeciones[].fuente` mezcla URLs y texto en un solo campo. |
| 16 | `onchain.concentracion_top50` y `hhi` vienen `null`. |
| 19 | La prosa del Redactor no se regenera cuando el motor recalcula. La web la desautoriza (`contradicciones.ts`) y lo marca en la bandeja. |
| 20 | Watchlist: las filas del radar no tienen contenido propio. |
| 22 | TVL sin serie: sólo hoy y hace 30 días. |
| 23 | Tenedores sin porcentaje en las fotos. |
| 24 | El mapa de liquidación no cubre todos los venues y sigue **sin calibrar**; se declara en pantalla. |
| 25 | Serie de precio con dos fuentes de distinto largo: el máximo histórico de ORCA queda fuera del lienzo. |
| 26 | Benchmark: faltan `ventaja_vs_b1/b2` y `fecha_cierre` para no tener que restar ni inferir. |
| 27 | El ranking del scanner: el motor ya exporta `base_contenido/ranking.jsonl`, pero la web **todavía lee la copia manual** en `scanner/candidatas-*.jsonl`. Falta cambiar el lector. |
| 28 | La corrida del scanner no declara periodicidad ni próxima pasada. |
| 29 | Dos formatos de ranking (v1 JSONL y v2 CSV); la web consume v1. |
| 30 | Las candidatas no traen cadena ni dirección de contrato. |
| 31 | El lanzamiento no devuelve estado: la web sólo sabe si apareció un informe publicado después del cierre. |
| 32 | Los disparadores vienen como frases; la web los reconoce por expresión regular. Falta un código enumerado. |
| 36 | La tanda no existe para `/operacion`: la cola muestra pedidos sueltos, sin agrupar, sin tiempos ni motivo. La pestaña lo suple leyendo `tanda_depuracion/rendimiento.jsonl`. |
| 37 | Los informes de una tanda **no llegan solos** a `base_contenido`. Se exportan a mano con `pipeline/migrar_contrato.py <SÍMBOLOS>` (cero agentes). Hecho el 2026-09-18 para 19 símbolos. |
| 38 | `/operacion/lanzar` responde 503 en el servidor: no tiene el CLI de los agentes. Por eso un análisis profundo no puede ejecutarse ahí todavía. |

---

## 9. Qué falta construir

| qué | estado |
|---|---|
| **Noticias** | No existe. Nunca se construyó. |
| **Landing y páginas públicas** | Sólo existe la portada. Faltan precios, qué es VETA, términos, privacidad y contacto. Los planes se piden hoy por `mailto:`. |
| **Pagos** | No hay proveedor. El plan lo asigna admin a mano. Las tablas `suscripcion` (con `proveedor_pago` e `id_externo` vacíos) y `cupo` ya están listas para recibirlo. |
| **Ledger y track record** | La matriz de acceso lo contempla en tres niveles, pero no hay página ni fuente (hueco 8). |
| **Ejecutar un análisis profundo en el servidor** | La interfaz completa está hecha y conectada al motor real, pero el servidor no tiene el CLI de agentes: los pedidos quedan en cola y `lanzar` devuelve 503 (hueco 38). |
| **Rate limiting** | La API no tiene límite de peticiones. |

Dos cosas que **sí están hechas** y a veces se dan por pendientes: el **heatmap de liquidación
proyectada** existe (`charts/Heatmap.tsx`, dentro del informe, con sus supuestos y el sello
"sin calibrar"), y **analiza tu moneda ya está conectado al motor real** por HTTP.

---

## 10. Pendientes de infraestructura

**Correo sin SMTP.** `VETA_CORREO=archivo` en producción: el enlace para elegir contraseña se
escribe en `server/correo-saliente/` del servidor y en el journal, en vez de enviarse. Afecta a
recuperar contraseña y a las invitaciones al crear cuentas. Se resuelve con una API key de
Resend o similar: `VETA_CORREO=smtp` y `VETA_SMTP_URL=smtps://usuario:clave@host:465`.

**Supabase en la región equivocada.** El proyecto está en `us-east-1` y el servidor en
Alemania. Cada consulta cruza el Atlántico.

| | ahora | en Frankfurt |
|---|---|---|
| una consulta | 98 ms | 5 a 10 ms |
| abrir la bandeja | 0,40 s | ~0,05 s |

Mover el proyecto a `eu-central-1` mientras haya poco dato es cuestión de minutos: crear el
proyecto y cambiar `DATABASE_URL`. Después será una migración.

**Respaldo externo sin configurar.** `veta-backup.timer` del motor corre pero no deja recibo:
faltan las credenciales del bucket. La pestaña Operación lo muestra como `SIN DATOS` y es la
única alerta que pide atención hoy. La base de la web sí tiene respaldo, el de Supabase.

**Además:** el servidor no tiene las carpetas de informe de RAY ni de SSV, sólo sus registros,
así que la pestaña Paquete de esos dos aparece vacía. La consulta N+1 de `estadoPublicacion`
hace una consulta por informe al armar la bandeja; con la base en Europa deja de importar.
