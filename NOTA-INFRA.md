# VETA — Nota de infraestructura

Qué va a requerir ajuste cuando esto se monte en infra. Hoy todo corre local:
un proceso Node (Hono) que sirve la API y, en preview, la build; SQLite en
disco; correos como archivos. Nada de esto está pensado para más de una
máquina, y eso es lo que cambia.

## 1. Arquitectura local (lo que hay)

```
navegador ──► Vite :5173 (dev)  ──/api──►  Node :8787 (Hono)
                                            ├─ /api/auth/*      better-auth
                                            ├─ /api/contenido/* matriz de acceso (spec §4)
                                            ├─ /api/admin/*     bandeja · cuentas · registro
                                            ├─ SQLite  server/data/veta.sqlite
                                            ├─ datos   server/datos/*.json  (compilados por scripts/datos.mjs)
                                            └─ escribe datos-motor/base_contenido/publicacion.jsonl
preview / capturas: un solo proceso en :5310 sirviendo dist/ + API (VETA_SERVIR_DIST=1)
```

Elección de auth: **better-auth**. Agnóstico al framework (corre en el mismo
Node con Hono), trae registro/login/logout, sesión por cookie, recuperación por
correo con token de un solo uso y el plugin admin (suspensión, impersonación);
migra a producción cambiando el adaptador de base de datos y las variables de
entorno, sin tocar el frontend.

## 2. Variables de entorno (`site/.env`, ver `.env.example`)

| variable | local | producción |
|---|---|---|
| `BETTER_AUTH_SECRET` | 32 bytes aleatorios | **otro** secreto, generado en la infra, nunca reutilizado |
| `BETTER_AUTH_URL` | `http://localhost:5173` | el origen público real, `https://app.veta.xxx` |
| `VETA_ORIGENES` | `localhost:5173,5310` | sólo el/los dominios reales (CORS y cookies) |
| `VETA_DB` | `server/data/veta.sqlite` | ruta en volumen persistente, o cambiar a Postgres (§4) |
| `VETA_DATOS` | `server/datos` | donde el job de compilación deja los JSON |
| `VETA_BASE_CONTENIDO` | `../datos-motor/base_contenido` | carpeta compartida con el motor (ver §5) |
| `VETA_REPORTS_DIR` | `../datos-motor/reports` | carpeta `reports/` del motor |
| `VETA_HORAS_ANTICIPO` | 6 | `[JUICIO]` de Pablo |
| `VETA_CUPO_BASE` / `VETA_CUPO_PRO` | 2 / 6 | `[JUICIO]` de Pablo |
| `VETA_CORREO` | `archivo` | `smtp` + credenciales (§3) |
| `VETA_ADMIN_EMAIL` / `VETA_ADMIN_PASSWORD` | semilla del primer admin | se usan una vez y se quitan del entorno |
| `VETA_DEMO_PASSWORD` | cuentas de prueba | **vacío** (no crear cuentas demo) |
| `NODE_ENV` | sin definir (desarrollo) | `production` en el entorno del proceso, **no** en `.env` (Vite también lee ese archivo y compilaría en modo desarrollo) |

`NODE_ENV=production` activa además el limitador de tasa de better-auth y
desactiva "ver como" en el servidor.

## 3. Redirecciones, dominios y cookies

- **Un solo origen.** La cookie de sesión es de primera parte; la API tiene que
  vivir bajo el mismo dominio que la web (`app.veta.xxx/api/*`), sea por el
  mismo proceso Node sirviendo `dist/` o por un proxy inverso (Caddy/nginx)
  que enrute `/api` al Node y el resto a estáticos. Si se separan dominios
  (`api.veta.xxx`), hay que configurar `trustedOrigins`, `crossSubDomainCookies`
  y CORS con credenciales: evitable, mejor no hacerlo.
- **HTTPS obligatorio**: las cookies salen con `Secure` cuando `BETTER_AUTH_URL`
  es https. Sin TLS no hay sesión.
- **Enlaces de correo**: el reset construye `${BETTER_AUTH_URL}/api/auth/reset-password/<token>?callbackURL=/restablecer`.
  Si `BETTER_AUTH_URL` no es el dominio público, los enlaces no sirven.
- **Rutas SPA**: cualquier `/gemas/...`, `/admin/...`, `/restablecer` tiene que
  caer en `index.html` (fallback), excepto `/api/*`. El servidor ya lo hace
  en modo `VETA_SERVIR_DIST`; con nginx/Caddy es `try_files`.
- **Correo saliente**: hoy `VETA_CORREO=archivo` escribe a `server/correo-saliente/`.
  Producción: implementar el transporte `smtp` en `server/correo.ts` (Resend,
  Postmark o SES) con dominio verificado (SPF/DKIM) para que el reset llegue.

## 4. Base de datos

- SQLite (better-sqlite3) es un archivo: sirve para una instancia con volumen
  persistente y copias de seguridad del archivo. Si hay más de una réplica o se
  quiere gestión aparte, pasar a **Postgres**: en `server/auth.ts` cambiar
  `database` por el adaptador Kysely/pg y en `server/db.ts` las sentencias
  (`INSERT ... ON CONFLICT` ya es compatible; `AUTOINCREMENT` → `SERIAL`;
  `pragma` fuera).
- Las tablas de auth las crea `runMigrations()` al arrancar. En producción
  conviene correr la migración como paso de despliegue y no al arrancar.
- Copias: `veta.sqlite` + `-wal` + `-shm` (o `sqlite3 .backup`).

## 5. Lo que cruza al motor

La plataforma **sólo escribe** `publicacion.jsonl` (append-only) en la carpeta
`base_contenido` del motor, y **lee** `base_contenido/*.jsonl` (vía
`scripts/datos.mjs`) y `reports/<id>/` (paquete, informe.md, verificador,
escéptico) para la bandeja. En infra eso implica:

- Una carpeta compartida (volumen) o un sync (rsync/S3) del motor hacia la web,
  y `publicacion.jsonl` de vuelta. Alternativa: que el motor lea la tabla
  `publicacion` por API.
- Un job que corra `node scripts/datos.mjs` cuando el motor escriba (cron o
  hook): el servidor relee los JSON por `mtime`, sin reinicio.
- Si un informe cambia de versión después de aprobado, pasa a
  "nueva versión sin revisar" y **deja de verse** hasta que se apruebe de nuevo.

## 6. Seguridad pendiente para producción

- Poner `NODE_ENV=production` (rate limit, sin "ver como").
- Cabeceras (HSTS, CSP) en el proxy.
- Verificación de correo al registrarse (`requireEmailVerification`) si se
  quiere impedir cuentas con correos ajenos; hoy no está activada.
- Rotar `BETTER_AUTH_SECRET` invalida todas las sesiones: hacerlo a propósito.
- `VETA_ADMIN_PASSWORD` sale del entorno después del primer arranque.
- Las contraseñas están hasheadas (scrypt) por better-auth; no hay endpoint
  que las lea ni exporte, y la recuperación es sólo por enlace de correo.

## 7. Qué NO está en esta fase

Pagos y proveedor de suscripción (la tabla `suscripcion` existe con
`proveedor_pago` e `id_externo` vacíos), "analiza tu moneda" con cupos (las
tablas `cupo` y `uso_analisis` existen y se administran), landing y páginas
públicas, despliegue, heatmap del mapa de liquidación.

## 8. Votación semanal (añadido 2026-09-13)

- Tablas nuevas en SQLite: `votacion` (una por semana, estado abierta/cerrada, candidatas
  congeladas como JSON al crearla, ganadora, `cola_estado`) y `voto` (clave primaria
  `votacion_id + usuario_id`: un voto, sin cambio).
- La lista sale de `datos-motor/base_contenido/scanner/candidatas-*.jsonl` (el más reciente por
  nombre). Hoy está copiado a mano desde el repo del motor; ver hueco 27.
- «Lanzar análisis» sólo escribe `base_contenido/cola-web.jsonl` y registra la acción. Nada
  corre solo: alguien del motor tiene que tomar la cola (hueco 31).
- Cuentas de demo añadidas por la semilla de capturas (`scripts/shots-votacion.mjs`):
  ana/bruno/carla/diego/elena/fede@veta.local, plan Pro, misma contraseña de demo. En
  producción no existen (la semilla sólo corre con `VETA_DEMO_PASSWORD`).
- La votación de la semana 36 de la demo se retrofechó a mano en la base (sólo datos, ningún
  código lo hace): en producción las fechas las pone el servidor.

## 9. Analiza tu moneda (añadido 2026-09-13)

- Tablas nuevas: `solicitud` (cada pedido, con el progreso espejado del motor y el resultado
  completo) y `ajustes` (tope mensual). `alerta` se recreó una vez para admitir el tipo
  `analisis_listo`.
- El cupo se reinicia el **día de renovación** (`suscripcion.fecha_renovacion`), no el 1 del
  mes: la fila de `cupo` se identifica por la fecha de inicio del ciclo (`server/cupo.ts`).
- Variables: `VETA_MOTOR=simulado|http`, `VETA_MOTOR_URL` (por defecto `http://127.0.0.1:8790`),
  `VETA_TOPE_MENSUAL_USD` (60), `VETA_COSTO_ESTIMADO_USD` (1,80), `VETA_SIM_VELOCIDAD` (1; las
  capturas se hacen a 12). El tope se puede cambiar desde `/admin/consumo` y queda en `ajustes`.
- El simulador vive en memoria: si el servidor se reinicia con pedidos en curso, quedan
  `en_curso` sin progreso. Hoy no hay recuperación; con el motor real el progreso es del motor y
  el reinicio de la web no lo pierde. Pendiente: marcar `fallido` los pedidos huérfanos al
  arrancar (y devolver el cupo).
- Notificaciones del navegador: sólo si el usuario las acepta desde la espera; sin service
  worker, así que sólo con la pestaña abierta.
- El contrato con el motor está en `CONTRATO-ANALISIS-A-PEDIDO.md` (copia en el repo del motor).

## 10. Motor real conectado (2026-09-14)

- `.env` lleva `VETA_MOTOR=http` y `VETA_MOTOR_URL=http://127.0.0.1:8787`. Sin el servicio del
  motor corriendo, la búsqueda queda vacía (universo vacío) y el determinista responde 503
  «no respondió»; nada se rompe, pero conviene levantarlo antes que la web:
  `cd ~/Documents/Crypto\ sistem && .venv/bin/python gem-pipeline/servicio/app.py`.
- Los pedidos profundos quedan en la cola del motor hasta que alguien corra
  `pipeline/lanzar_pedidos.py --lanzar <id>`. La web lo muestra en `/admin/consumo`.
- La columna `solicitud.enviada` separa lo retenido por el tope de lo que el motor ya tiene.
- El simulador sigue disponible con `VETA_MOTOR=simulado` (capturas, demos sin motor).

## 11. Conectada al servidor (2026-09-17)

- **Túnel SSH** (lo abre el Mac, hay que dejarlo vivo como ngrok):
  `ssh -i ~/.ssh/veta_vps -f -N -L 8788:127.0.0.1:8787 root@144.91.123.49`. Por ese túnel van
  el motor a pedido (`VETA_MOTOR_URL=http://127.0.0.1:8788`) y las rutas de operación
  (`VETA_OPERACION_URL`). Si se cae, la pestaña Operación lo dice en rojo con el comando para
  volver a abrirlo; el determinista responde 503 «no respondió» y la búsqueda queda vacía.
- **Token de operación**: `VETA_OPERACION_TOKEN` en `site/.env`, copiado del `/opt/veta/.env`
  del servidor. Nunca llega al navegador: el servidor de la web lo pone en la cabecera
  `X-Veta-Token` al hacer de proxy (`server/operacion.ts`). Lanzar manda además
  `X-Veta-Quien` con el correo del admin y queda en `acciones_admin` y en
  `base_contenido/operacion/lanzamientos.jsonl` del servidor.
- **Sincronización de contenido**: `scripts/sincronizar-servidor.sh` trae por rsync
  `base_contenido/` (sin liquidaciones, series, snapshots ni universo; sin pisar
  `publicacion.jsonl` ni `cola-web.jsonl`) y `reports/` del servidor a `datos-motor/`, y corre
  `datos.mjs`. La corre el servidor de la web al arrancar y cada `VETA_SYNC_MINUTOS` (10), y
  el admin con «Sincronizar ahora». Tarda ~10 s. Lo que la tanda deje en
  `/opt/veta/gem-pipeline/base_contenido/{gema,analisis}.jsonl` y `reports/` aparece en la
  bandeja solo.
- El servicio local del motor (Mac, puerto 8787) ya no se usa; queda `VETA_MOTOR=http` contra
  el servidor. Para demos sin servidor: `VETA_MOTOR=simulado`.
- Los resultados que dejó el simulador en `solicitud` se borraron para que la bandeja muestre
  sólo informes del servidor.

## 12. Listo para producción (2026-09-18)

- **Base de datos abstraída** (`server/bd.ts`): con `DATABASE_URL` corre en Postgres
  (Supabase); sin ella, SQLite local. Toda la capa de servidor es asíncrona. El SQL es común a
  los dos motores; lo que difiere (autoincremento, REAL, ADD COLUMN IF NOT EXISTS) lo traduce
  `bd.ts`. Las tablas de better-auth se llaman `"user"`, `"session"`… y sus columnas camelCase
  van entre comillas en las consultas propias. Probado contra Postgres 16 en Docker: migraciones,
  semilla, login, bandeja, votación, predicción, analizar, consumo, correo de recuperación.
- **Topología de producción**: web estática en Vercel (`site/vercel.json` reescribe `/api/*`
  hacia `https://api.<dominio>`), API Hono como servicio systemd en Contabo junto al motor
  (`despliegue/veta-web.service`, Caddy con HTTPS automático, `despliegue/instalar-web.sh`),
  base en Supabase. Un solo origen para la cookie: el navegador sólo habla con el dominio de
  Vercel. Sin túnel ni rsync: `VETA_SYNC_MODO=local` recompila desde el disco del motor.
- **Correo**: `VETA_CORREO=smtp` con `VETA_SMTP_URL` (nodemailer). En local sigue `archivo`.
- **Paso a paso para Pablo**: `DESPLIEGUE.md`. Plantilla del `.env` de producción:
  `site/despliegue/env.produccion.ejemplo`.
- Pendiente fuera del despliegue: pagos, rate limiting, `/operacion/lanzar` (P8 del motor).
