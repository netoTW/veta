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

**Contrato v2.1** (`CONTRATO-PANEL.md` §8, de la sesión de Mugiwara). Las formas están en
`src/luffy/tipos6b.ts`, cotejadas sección por sección con el contrato, y el simulador
(`server/luffySimulado.ts`, parte 6b) las sirve exactas, con datos de semilla fija. Si el
contrato cambia, se ajusta ahí y en el simulador, no en las pantallas. El cliente es
`src/luffy/api6b.ts`. Rutas: `/terminal/universo`, `/terminal/{activo}?rango=`,
`/terminal/plantillas[/{id}]`, `POST /terminal/{activo}/hilo` (y `contexto: {tipo: 'terminal',
activo}` en `/chat` para los hilos «Terminal · X»), `/cartera`, `/cartera/curva`,
`/cartera/movimientos` (GET, POST, DELETE), `POST /posiciones/declarar`, `/exchange/ordenes?estado=`,
`/exchange/fills`, `/exchange/comisiones`, `POST /exchange/propuestas` (responde `{propuestas,
propuesta, hilo_id}`; `modificar` trae dos; `409` con la viva en `detail.propuesta`),
`/radar/candidatas`, `/radar/modos`, `POST /modos/{id}/{v}/decidir {aprobar, motivo}`, `/caja`,
`/misiones/{id}/pausar|reanudar|cancelar`, `/panico`, `/gatillos` (PATCH, DELETE), `/manual`,
`/manual/diff?desde&hasta`, `POST /manual/propuestas/{id}/decidir {aprobar}`, `/costo?dias=`,
`/alertas/feed` (cursor `antes_de`) y `PATCH /alertas/{id}`, `/oficina/estado`, `/eventos` (SSE
con `latido` y reconexión por `desde_id`), `/informes`, `/informes/{fecha}`, `/revisiones`,
`/bitacora` (cursor), `/teorias`.

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

**Nada de texto ni de señales sobre las velas.** Compras, ventas y stops se dibujan sólo como
forma en su vela; las señales del radar van a un **riel al pie del panel de precio** (un rombo por
vela, con el número si hay varias; `Riel` en `charts/primitivas.ts`), con margen inferior propio
para que ninguna vela lo toque. En ningún caso la etiqueta («Compra 84,71 USDT a 0,038», «Radar: impulso v1») va encima: aparece junto a
la fecha al pasar la cruz por esa vela, y la lista completa sigue debajo del gráfico.

**Pruebas.** `scripts/probar-luffy.mjs` (Playwright, Chrome del sistema): los cinco perfiles
contra `/api/luffy/*` (404 salvo admin), un suscriptor pro en `/luffy` (no existe), y con el
simulador: chat con el gráfico dentro del mensaje, un turno en streaming con el paso visible,
el **caso guiado** (abrir el gráfico de ingresos de STONK desde el mensaje, agregar la mediana
de su categoría y la posición de Pablo, guardarlo en un tablero y verlo en Tableros) y las tres
pantallas a 1440 y a 390 px sin desborde. Casos guiados de la 6b (simulador): abrir WAL en el
terminal, cambiar de moneda con el teclado, arrastrar el stop y cancelar la propuesta, abrir
derivados en el laboratorio; declarar STONK y verla en la cartera; y las nueve vistas a 390 px.
Contra la API real (`VETA_LUFFY=http`, túnel al 8800) corre todo lo que sólo mira, terminal
incluido; arrastrar el stop y declarar se saltan porque escribirían propuestas reales. Las
esperas no dependen de que la red quede en reposo: la ficha real tarda de 3 a 6 s y precarga
las vecinas.

**Con datos reales (12-oct, Mugiwara `d6d0c03`).** Verde contra la API real; capturas en
`recursos/capturas/6b-real/`. Ajustes que dejó la prueba: ejecuciones pedidas por par (el
servidor exige `par`), gasto de estilo con los campos reales, familias inversas en rojo en el
radar, seguimiento vacío oculto, códigos en texto, bitácora y decisiones de la caja recortadas
con «ver más», capas vacías sin aviso. La curva de Pablo hoy suma la caja: es del servidor y
está pedido (`TRASPASO.md` §6).
Corre dentro de `npm run invariantes`; con una carpeta como argumento deja capturas
(`recursos/capturas/luffy/`). `scripts/shots-6b.mjs` captura las vistas nuevas y
`scripts/shots-pulida.mjs` el antes/después del acabado.

### Pendientes tras la 6b · bloque A: estabilidad y velocidad (12-oct-2026)

Pablo usó el panel real en el teléfono y estaba inutilizable: vistas que se caían enteras y
cambiar de moneda tardaba casi minutos. Contrato v2.2 de Mugiwara tomado (confluencia como
listas, frase llana por familia, fills sin `par`, ficha parcial `pendiente`, hora de la vitrina).

**Lo que fallaba y cómo quedó**

- **La ficha se caía entera** (`confluencia.obligatorias.join is not a function`, cuatro veces en
  producción, CFX y S): llegaba un diccionario. Se lee con `lista()` venga como venga, y cada
  tarjeta va dentro de `Seguro` (`src/luffy/Seguro.tsx`): si una revienta, se avisa sólo esa
  tarjeta, se registra en `/api/fallo` y el resto sigue. `Seguro` recibe una función porque un
  límite de React no atrapa el JSX escrito en línea en el padre. Aplicado a terminal, cartera,
  caja, radar, control, oficina e informes. Prueba de regresión en `probar-luffy.mjs` («datos raros»).
- **Cada cambio de moneda rearmaba el panel entero**: el límite de error general de `App.tsx`
  usaba la ruta como clave y desmontaba Luffy (carcasa, lista de monedas, gasto) en cada
  navegación. Bajo `/luffy` la clave es fija (el panel tiene su límite por vista), y la terminal
  y los informes son una sola ruta con el parámetro opcional.
- **El chat pedía 24 vistas previas de 5,7 s cada una** al servidor de Luffy y seguían ocupando
  la línea al pasar a la terminal: ahora sólo los diez primeros hilos, de a dos, guardadas por
  fecha de actualización, y se cortan al salir del chat.
- **Nada se quedaba sin tope**: todo pedido de la 6b corta a los 30 s (la ficha a los 25) y la
  vista ofrece «Reintentar»; los gráficos igual.
- **Al cambiar de moneda**: se cortan los pedidos de la anterior y las precargas; se pinta al
  instante lo último que se vio de esa moneda (o de otro rango) y lo nuevo lo reemplaza; la ficha
  parcial (`pendiente`) se vuelve a pedir sola; los gráficos de abajo se montan al acercarse a
  la pantalla; la terminal no espera los 220 ms del laboratorio; la siguiente de la lista se
  precarga con los datos de sus dos primeros gráficos, 2,5 s después.
- **Peso**: el chat ya no baja el módulo de gráficos (lightweight-charts) para mostrar la lista;
  `/luffy` no carga nada de la portada (ni three.js ni 3D). El gasto de la barra se muestra del
  guardado y se pide 3,5 s después.
- **Vidrio en el teléfono**: sobre los gráficos (leyendas) y en la cabecera fija de la ficha, sólido;
  las barras de arriba y abajo, desenfoque más liviano; `prefers-reduced-transparency`, sólido.
- **Puente**: manda `Server-Timing: mugiwara;dur=…` con lo que tardó `mugiwara-api`.

**Antes y después, en segundos** (teléfono de gama media: CPU ×4, 4G lento de 150 ms y 1,6 Mbit/s;
datos reales; mediana de tres vueltas en frío; `scripts/medir-luffy.mjs`, resultados en
`recursos/medidas/`). «Antes» es lo que sufría Pablo: front anterior y servidor sin vitrina,
medido con cargas de página completas y sin compresión, así que su primera carga está inflada
en uno o dos segundos. La columna del medio aísla el front: el anterior, ya con la vitrina.

| paso | antes | front anterior + vitrina | ahora |
|---|---|---|---|
| abrir `/luffy` | 7,6 | 4,0 | 3,6 |
| ir a la terminal | 14,7 | 7,9 | 2,9 |
| cambiar de moneda | 5,4 a 10,5 | 2,4 | 1,4 a 1,9 |
| volver a una moneda ya vista | — | 0,9 | 0,7 |
| cartera | 9,6 | 2,4 | 1,9 |
| caja | 5,4 | 0,8 | 1,3 |
| radar | 15,6 | 1,3 | 1,8 |
| control | 7,5 | 1,2 | 1,2 |
| oficina | 1,0 | 1,2 | 0,4 |
| informes | 2,5 | 1,2 | 1,4 |

JavaScript al abrir `/luffy`: 194 kB comprimidos antes, 130 kB ahora. Caja y radar quedan medio
segundo arriba del front anterior, dentro del ruido de la medida: el radar ahora dibuja la frase
llana de cada familia (recortado a doce candidatas con «ver más»).

**Red contra servidor.** Por Vercel cada pedido cuesta unos 80 ms más que directo a
`api.vetalab.io` (300 contra 223 ms con la conexión abierta). No se cambió: llamar directo exige
la cookie de sesión para todo `vetalab.io` y CORS con credenciales, y eso toca el inicio de sesión
de todo el sitio. Queda como opción si hace falta raspar esos 80 ms. Lo que más pesa hoy está del
lado de Mugiwara (`TRASPASO.md` §6): `/graficos/datos` (0,5 a 1,9 s, fuera de la vitrina) y la
vista previa de hilos.

**Recorrido.** `scripts/recorrer-luffy.mjs` abre cada vista en escritorio y a 390 px y toca cada
pestaña, filtro, chip, rango, «ver más» y reintentar; abre los formularios sin enviarlos y en
pánico y cancelar la misión abre la confirmación y responde «No». Verde con la API real y con el
simulador. Capturas: `recursos/capturas/a-real/`.

### Pendientes tras la 6b · bloque B: /luffy como app instalable (12-oct-2026)

**Qué es.** `/luffy` se instala como app («Luffy», el ícono de la gema esmeralda con su veta de
oro) y abre a pantalla completa, sin la barra del navegador. Fuente del ícono:
`recursos/icono-app-luffy.html` (se renderiza a `public/img/app/gema-*.png`, también en versión
adaptable para Android).

**Nadie más la ve.** El manifiesto y el service worker se sirven en `/api/luffy/app/`
(`server/luffyApp.ts`), detrás del mismo control del puente: para cualquiera que no sea el admin
real dan 404. La página sólo enlaza el manifiesto, el ícono de la app y las etiquetas del iPhone
después de verificar la sesión (`src/luffy/pwa.ts`, desde `LuffyShell`); el título «Luffy» también.
Los íconos son públicos, pero son una gema sin nombre. El service worker vive en `/api/luffy/app/sw.js`
y controla `/luffy` con la cabecera `Service-Worker-Allowed`.

**Abre al instante.** El service worker guarda la carcasa (`/luffy`) y los archivos con hash; la
carcasa se responde de lo guardado y se actualiza por detrás. Con el service worker activo, el
panel baja en segundo plano las vistas (terminal, cartera, radar…), así que también abren sin red
y, con red, cambiar de vista no espera su archivo. Su versión es la hora de arranque del servidor:
cada despliegue instala la nueva. Medido con el teléfono de gama media: la segunda apertura dibuja
la carcasa en 0,9 s (la primera, 2,0); con las vistas precalentadas la cartera abre en 0,4 s y el
radar en 0,8 (sin app, 1,9 y 1,8).

**Sin conexión.** Los datos del panel van siempre a la red; si no hay red, el service worker
responde la última respuesta guardada (también los gráficos, que van por POST), marcada con
`X-Luffy-Guardado`, y el panel muestra «Sin conexión · lo que ves es lo último que llegó». El aviso
se enciende también cuando un pedido falla por red, porque `navigator.onLine` sigue en «sí» con
una wifi que no deja pasar nada. Sin red y sin nada guardado, una pantalla propia (roca, la gema,
«Luffy vuelve con la red», reintentar, y se recarga sola al volver la red). Los errores de red se
leen «Sin conexión», no «TypeError». Para abrir sin red, la sesión recuerda lo último que se supo
del admin real (`veta.yo.admin`); cualquier dato sigue pidiendo la cookie al servidor. Al cerrar
sesión se borra eso y todo lo guardado del panel.

**iPhone.** «Agregar a inicio» toma la gema (`apple-touch-icon`), abre a pantalla completa
(`apple-mobile-web-app-capable`, barra de estado translúcida, `viewport-fit=cover`) y la barra
superior y lo que se pega debajo suman la zona segura (`--lf-arriba`).

**Notificaciones push: preparadas, sin activar.** El service worker ya muestra un aviso
`{titulo, texto, url, tag}` y al tocarlo abre esa vista; `suscribirPush(claveVapid)` en `pwa.ts`
pide permiso y devuelve la suscripción. Falta, del lado de Mugiwara: la clave VAPID, una ruta para
guardar suscripciones y el envío de las alertas por push. En el iPhone exige la app instalada
(iOS 16.4 o más).

**Pruebas.** `scripts/probar-app.mjs` (en las invariantes): visitante y suscriptor pro sin
manifiesto, sin service worker y sin título que nombre a Luffy; para Pablo, manifiesto sin errores,
instalable en Chrome, service worker al mando, carcasa y datos guardados, sin red abre el radar con
lo último que llegó y avisa, y la pantalla sin conexión en escritorio y a 390 px. Verde con el
simulador y con la API real. Capturas: `recursos/capturas/app/` y `app-real/`. La instalación en
un iPhone y en un Android de verdad la tiene que probar Pablo (no hay forma de hacerlo desde aquí).

**Un hallazgo de paso.** En `pulida.css` un `@media (prefers-reduced-motion)` estaba sin cerrar desde
la 6b; al estar al final no daba error, pero todo lo que se agregó después quedaba adentro: el vidrio
liviano del teléfono del bloque A sólo se aplicaba a quien tuviera el movimiento reducido. Cerrado, y
`pruebas/unidad/estilos.test.ts` revisa que toda hoja cierre sus llaves.

### Pendientes tras la 6b · bloque C: la oficina en vivo, rehecha (12-oct-2026)

**Hecha, a la espera de que Pablo la vea antes de desplegarla** (capturas y videos en
`recursos/capturas/oficina/`). Toma de la oficina de GROKBOT + JEV sólo la idea; el arte es
original y en el sistema visual de VETA.

**La sala** (`src/luffy/oficina/Escena.tsx`, SVG dibujado en código): isométrica, en roca pulida,
con un escritorio por agente y un personaje original en cada uno. Luffy es el jefe: cabeza de gema
esmeralda, hombros de oro y un escritorio de mando con dos pantallas, al frente. Cuant lleva lentes de oro,
el Investigador capucha y lupa, el Estratega visor y cresta, Jev audífonos y el Crawler gafas y un
cable a la pantalla. Quien trabaja teclea, se le enciende la pantalla y cabecea; al terminar
lleva un papel volando hasta Luffy, que brilla al recibirlo. Jev suelta publicaciones que suben.

**La araña de oro** vive en la pantalla grande de la pared (el crawler y el radar): teje hilos hacia
las monedas que se siguen (posiciones de Pablo y de la caja, candidatas de hoy, gatillos y
vigilancia, sacadas de la lista de la terminal), que cuelgan como fichas con su ticker y su
color. Cuando una alerta nombra una moneda, la araña camina hasta ella, refuerza su hilo y vuelve;
cada ciclo del radar barre la tela. Las fuentes son objetos con su luz (al día, atrasada, caída,
apagada): el servidor con los exchanges y los datos, la antena de celosía con lo social (X,
Telegram) y la parabólica con los anuncios y la gobernanza; parpadean al entregar o al fallar.

**Arriba**, una tarjeta por agente: su rol en una línea, lo último que hizo, su cifra de 24 h y si
está trabajando (en el teléfono, en carrusel). **Abajo**, la curva de la caja, el registro (que
arranca con los últimos 120 eventos; Jev agrupado en una línea que va sumando y los avisos
repetidos juntos) y los trabajos programados.

**Técnica.** Sólo se baja al abrir la vista. Un único bucle de `requestAnimationFrame` para lo
que viaja (araña, papeles, barrido), apagado cuando nada se mueve; el tecleo es CSS. Fuera de
pantalla o con la pestaña oculta, todo en pausa; con «reducir movimiento», nada se anima (medido:
cero animaciones en la escena). En el teléfono la escena entra entera en el ancho y las fichas se
agrandan para leerse.

**Pedido a Mugiwara** (`TRASPASO.md` §6): los eventos del crawler y del radar no dicen qué monedas
tocaron; con un campo `activos` en `fuente_leida` y `radar_ciclo`, la araña caminaría también a
esas. El panel ya lo lee si llega (el simulador lo manda).

**Pruebas.** En `probar-luffy.mjs`: seis tarjetas, fichas en la tela, un agente que se pone a
trabajar con los eventos y la araña que camina con una alerta. El recorrido de botones y la app
siguen en verde. Un hallazgo con datos reales: los eventos de fuentes traen su propio campo
`grupo` y chocaba con el que juntaba a Jev; el aislante de tarjetas lo contuvo (sólo el registro
se avisó) y quedó corregido, con un evento así en el simulador.

### La oficina viva e interactiva (12-oct-2026)

Pablo vio la oficina del bloque C linda pero estática: no se entendía si mostraba información, la
araña parecía un ícono quieto y no se podía profundizar. Rehecha para que trabaje a la vista, **sin
inventar nada**: todo lo que se mueve sale de un evento real de `GET /eventos`. Capturas y videos
con datos reales en `recursos/capturas/oficina-viva/` (`scripts/capturar-oficina.mjs`,
`scripts/video-oficina.mjs`). **Sin desplegar hasta que Pablo vea el video.**

- **La araña siempre trabajando.** Cada lectura del crawler, cada tanda de Jev, cada ciclo del radar
  y cada alerta la mandan a la ficha de la moneda que nombran; si el evento no nombra ninguna, va al
  puerto de su fuente en una esquina de la pantalla (X · Telegram, Listados, Votaciones, Datos).
  Camina dejando su seda, teje (refuerza el hilo) y muestra un rótulo corto de lo leído («X: 212
  leídos, 31 nuevos», «Listados: 3 al día · Upbit: en pausa 60 min tras un 429», «alerta media:
  ASTER · catalizador social»). Los viajes hacen cola; una ráfaga al mismo destino (Jev clasifica de a
  cinco por segundo) se junta en uno. El grosor del hilo es la actividad de la moneda en las últimas
  horas (media vida de 2 h); tres horas sin nada y la ficha se apaga. A las monedas de la terminal
  se suman las que se movieron en el día.
- **El proceso a la vista.** Sobre cada personaje, un globo en llano con lo que hace: los mismos
  pasos del chat y de Telegram (la tabla de `mugiwara/bot/progreso.py`, copiada en
  `oficina/historia.ts`), con la moneda si el evento la trae («revisando derivados de WAL…»,
  «convocando al Cuant…», «clasificando 15 publicaciones…», «revisando listados…»). Un papel viaja
  de escritorio a escritorio en cada entrega: Luffy → agente al convocarlo, agente → Luffy al terminar,
  Crawler → Jev con las publicaciones, Crawler → Luffy cuando el radar trae candidatas. Bajo la sala,
  lo mismo en letra legible (en el teléfono la sala es chica).
- **Puesta al día.** Al abrir, lo que pasó de verdad en los últimos 10 minutos se pasa rápido por la
  sala, con su aviso («Puesta al día · lo que pasó desde las 12:41»), y después sigue en vivo. Con datos
  reales hay un evento cada uno a cinco minutos; sin esto, quien abre la oficina veía una sala quieta.
- **Profundizar con un toque.** Un agente (en la sala o su tarjeta) abre una hoja con su día: Luffy,
  sus turnos (modo, canal, herramientas, duración, costo, enlace al hilo y sus pasos al desplegarlo);
  Cuant, Investigador y Estratega, sus encargos con herramientas; Jev, barras por hora y una línea por
  hora; el Crawler, las lecturas de cada fuente por hora y los ciclos del radar. Una moneda abre su
  ficha del terminal. Una fuente (servidor, antena, parabólica, un puerto o la línea de fuentes del
  pie) abre su salud: estado, detalle, 48 tramos de media hora de verde, ámbar y rojo, cuántas
  lecturas y el último error. Lo apagado a propósito («sin TALLY_API_KEY») no se pinta como fallo.
- **Repetir un turno.** Desde la hoja de Luffy (o «Repetir un turno»), cualquier turno cerrado de las
  últimas 24 h se reproduce paso a paso en la sala a 1×, 2×, 4× u 8×, con pausa, barra de avance, el
  paso en curso y el enlace al hilo; la pantalla se marca «Repetición». Lo que llega en vivo mientras
  tanto sigue entrando al registro; «Volver al vivo» recarga la foto.
- **Fondo sutil.** Sin eventos, las luces del servidor parpadean, la antena emite cada tanto, los
  monitores respiran y la araña tantea con una pata. Nada que parezca trabajo.

**La historia de 24 h** (`oficina/historia.ts`) se trae después de pintar: `GET /eventos/recientes`
pagina sólo hacia adelante, así que se pide de atrás hacia adelante en tandas de 1000, de a tres en
paralelo, hasta pasar las 24 h (unos 9000 eventos reales al día, casi todos de Jev; tope 12 tandas).
Si no alcanza, la hoja dice desde qué hora cubre. Pedido a Mugiwara un filtro para no bajar las tandas
de Jev (`TRASPASO.md` §6).

**Pruebas.** `probar-luffy.mjs` (simulador, con 20 h de historia y turnos completos): además de lo
anterior, un globo aparece, la araña muestra un rótulo, tocar a Luffy abre su día con turnos, un turno
se repite paso a paso y «Volver al vivo» lo cierra, tocar una fuente muestra su salud y tocar una
moneda abre su ficha. Con datos reales: cero errores de consola a 1440 y 390 px.

### La oficina viva, desplegada (12-oct-2026)

Con el visto bueno de Pablo sobre el video. Lo único que no le gustó, la antena de palitos, quedó rehecha con el
cuidado del servidor y la parabólica: un mástil de roca pulida en dos caras (luz y sombra) sobre una base en la
tapa del servidor, el filo y tres anillos de oro finos (la mitad de atrás tenue), un collar a media altura y el
emisor con su luz de estado y las ondas.

### Terminal v2, adelantado con datos simulados (12-oct-2026)

La pantalla que reemplaza la ficha del terminal (`Mugiwara/PROMPT-TERMINAL-v2-veta.md`, maqueta aprobada
`Mugiwara/MAQUETA-TERMINAL-v2.dc.html`), construida **antes de que Mugiwara publique su contrato**. Vive en
`/luffy/t2/:activo?`, **sin enlace en el menú y sin desplegar** hasta conectarla con datos reales; entonces
reemplaza a `/luffy/terminal`. Capturas en `recursos/capturas/terminal2/` (`scripts/capturar-terminal2.mjs`).

**Aislado para que el ajuste al contrato sea barato.** Todo lo que depende de Mugiwara está en
`src/luffy/terminal2/contrato.ts`: las rutas (`/terminal/v2/lista`, `/terminal/v2/{activo}?rango=`), los
tipos crudos provisionales (armados con `PROMPT-TERMINAL-v2-mugiwara.md`) y el adaptador al modelo que lee
la pantalla (`Ficha2`, `Fila2`). Cuando llegue la sección del contrato se cambia ese archivo y el simulador
(`server/luffySimuladoTerminal2.ts`, aparte del resto); la pantalla no se toca. Con `VETA_TERMINAL2=simulado`
el puente responde el terminal v2 desde el simulador aunque lo demás vaya a la API real.

**La pantalla**, en el orden de la maqueta:
- **Columna de monedas:** búsqueda, filtros en cápsula, «ordenar por» (fuerza contra BTC, volumen, interés
  abierto, funding, squeeze, capitalización). Filas con precio, «vs BTC 7 d» y chips; la elegida con el filo
  de oro; las que no se operan en BingX, marcadas.
- **Encabezado:** ticker, nombre y qué es; precio y cambio 24 h; la grilla de cifras; chips de posición,
  gatillos y radar; «Preguntarle a Luffy».
- **Controles comunes:** rango (30 d a máx); capas que se prenden y apagan sin rehacer el gráfico
  (posiciones, gatillos, catalizadores, radar, liquidaciones); «comparar contra» (nada, BTC, la mediana de su
  categoría u otra moneda, llevada al precio de esta al inicio del rango).
- **Las seis secciones**, cada una con su número en oro y su pregunta:
  1. Estadísticas.
  2. Movimiento: el gráfico A (velas, perfil de volumen al costado con su mayor volumen en oro, el mapa de
     liquidaciones en franjas con rótulo en las densas y su chip de calidad, marcas de las capas, el radar en
     su riel al pie), el delta acumulado spot y futuros con el interés abierto tenue, la grilla, «ver
     derivados en detalle» (cuatro paneles, cada uno con su eje y el funding real por intervalo, positivo
     arriba) y la lectura por código.
  3. Fundamento: el gráfico B (fees, revenue y holders revenue anidados por semana, la capitalización y la
     mediana de su categoría en base 100), la grilla, cómo captura valor y la ficha del proyecto con fuente y
     fecha por línea.
  4. Redes: la franja del mercado, el gráfico C (menciones apiladas con el precio encima y el tono de las
     personas en su franja), la grilla y «quién habla».
  5. On-chain: tenedores, flujo con exchanges, movimientos grandes y wallets que sigue Pablo (sólo lectura).
  6. Oportunidad: escenarios («no pronósticos»), la grilla y el radar en llano.
- **Gráficos sincronizados:** todos comparten eje de tiempo, zoom y cruz. La leyenda va arriba, fuera de los
  datos, con la fecha y todas las series bajo la cruz. En el teléfono, un toque o un arrastre horizontal pone
  la cruz (la librería sólo lo hacía con toque largo) y el arrastre vertical baja la página.

**Comportamiento:** lo que llega en `no_disponibles` va en su lugar con el motivo (KMNO, sin perpetuo: cada
cifra de futuros, el mapa y los derivados dicen por qué). La moneda guardada se pinta al instante; la
siguiente y la anterior se precargan; los gráficos de abajo cargan al acercarse; ↑ ↓ cambian de moneda; cada
sección en su `Seguro`. En 390 px: secciones apiladas, la lista en hoja, los controles fijos arriba de los
gráficos, las tablas con su scroll y rótulos cortos en el gráfico angosto.

**Pruebas:** `scripts/probar-terminal2.mjs` (en los invariantes, con el simulador). Comprueba las seis
secciones, cada capa apagada y prendida (el gráfico cambia y vuelve), comparar contra BTC, la cruz
compartida, los derivados con el funding real, ↓ ↑, la moneda sin perpetuo, la no operable, el laboratorio y,
a 390 px: sin desborde, la lista en hoja, controles fijos y tabla con scroll. Sin errores de consola.

**Precio en vivo (12-oct, pedido de Pablo).** El último precio, el cambio de 24 h y la vela en curso se mueven
al segundo con el ticker del websocket público de la bolsa, directo desde el navegador (`terminal2/vivo.ts`):
BingX primero (donde opera Pablo; manda cada mensaje en gzip y pide «Pong»), Binance si la moneda no se opera
en BingX, y la otra si la elegida no manda nada en 6 s. Se reconecta sola, se pausa con la pestaña oculta y el
encabezado dice «EN VIVO · BINGX» (o Binance); el precio destella verde o rojo al cambiar. La vela en curso es la
última del gráfico (se estira con cada precio y, pasado su período, abre la siguiente), así que no depende de a
qué hora corta cada bolsa la vela diaria. Con datos de ejemplo (`simulado: true`) no se conecta, salvo con
`?vivo=1`. Probado contra las bolsas reales: WAL y KMNO por BingX, HYPE por Binance.

**La cruz con el dedo:** la cruz del toque largo de la librería competía con la propia y quedaba unos días
corrida; con un dedo ahora sólo está la propia (con dos, el zoom sigue siendo de la librería). Prueba en
`probar-terminal2.mjs`: el arrastre deja todos los gráficos en la misma fecha, sin mover la página.

**Falta, para cerrarlo:** conectar con el contrato real (ajustar `contrato.ts` y el simulador), capturas con
datos reales de WAL y de una moneda sin perpetuo, pasar `/luffy/terminal` a esta pantalla y desplegar.

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
