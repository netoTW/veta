# Despliegue a producción — web en Vercel, base en Supabase, motor y API en Contabo

Tres piezas, y por qué están donde están:

| pieza | dónde | por qué |
|---|---|---|
| **la web** (React, `dist/`) | **Vercel** | estática, CDN, HTTPS solo |
| **la base** (usuarios, sesiones, cupos, votos, pedidos) | **Supabase** (Postgres) | gestionada, con respaldo |
| **la API** (Hono: auth, contenido, bandeja, analizar, operación) | **Contabo**, junto al motor | necesita lo que Vercel no da: leer `base_contenido/` y `reports/` del motor del mismo disco, hablar con el motor en `127.0.0.1:8787` sin exponerlo, y correr timers (recompilar contenido cada 10 min, espejar el progreso de los análisis cada 3 s) |
| **el motor** | **Contabo** | ya está |

**Qué necesita correr fuera de Vercel y dónde:** toda la API. Como funciones de Vercel no
sirve: no puede montar el disco del motor, no puede abrir un túnel SSH, no tiene procesos
largos y obligaría a exponer el motor a internet con otro token. En Contabo la API es un
servicio de systemd (`veta-web`) detrás de Caddy con HTTPS automático en `api.<dominio>`. La
web en Vercel reescribe `/api/*` hacia ese host **del lado del servidor**, así que el navegador
sólo habla con `https://<dominio>`: **un solo origen, una sola cookie**, sin CORS.

El túnel SSH y la sincronización por rsync desaparecen en producción: la API lee la carpeta
del motor directamente (`VETA_SYNC_MODO=local`). El Mac ya no participa.

---

## 0. Antes de empezar (Pablo)

- Dominio comprado, con acceso a sus DNS.
- Cuenta de Vercel y de Supabase.
- El repo de VETA subido a GitHub (Vercel y Contabo lo clonan). `site/.env` y `server/data/`
  no entran al repo (están en `.gitignore`).
- Un proveedor SMTP para el correo de recuperación de contraseña (Resend tiene plan gratis:
  se verifica el dominio, se crea una API key y se usa como clave SMTP).

Vas a necesitar generar dos secretos, una sola vez:

```
openssl rand -base64 48        # BETTER_AUTH_SECRET
```

y el `VETA_OPERACION_TOKEN` que ya existe en `/opt/veta/.env` del servidor.

---

## 1. Supabase (10 minutos)

1. **New project** → nombre `veta`, región Frankfurt (`eu-central-1`, la más cerca de Contabo
   Alemania), contraseña de base fuerte (guardala: va en la URI).
2. Cuando termine de crear: **Project Settings → Database → Connection string**.
   Elegí **Session pooler** (no *Transaction pooler*; puerto **5432**). La URI tiene esta forma:

   ```
   postgresql://postgres.<ref>:<CLAVE>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

   Por qué el *session pooler*: es compatible con IPv4 (Contabo no tiene IPv6) y con las
   migraciones de better-auth. Reemplazá `<CLAVE>` por la contraseña del paso 1 (si tiene
   caracteres raros, codificalos: `@` → `%40`).
3. Nada más. **Las tablas las crea la API al arrancar** (better-auth corre sus migraciones y
   VETA crea las suyas con `CREATE TABLE IF NOT EXISTS`). No hace falta tocar el editor SQL
   ni activar RLS: la API es el único cliente de la base y entra con la clave de servicio.
4. Opcional, recomendado: **Settings → Database → Network Restrictions** → permitir sólo la
   IP del servidor `144.91.123.49`.

---

## 2. Contabo: la API (20 minutos)

Entrás como siempre: `ssh -i ~/.ssh/veta_vps root@144.91.123.49`.

1. **DNS primero** (para que Caddy pueda pedir el certificado al final del instalador):
   en el panel del dominio, registro **A** `api` → `144.91.123.49`. Esperá a que resuelva:
   `dig +short api.<dominio>` tiene que devolver la IP.
2. Instalador (Node 22, Caddy, clon del repo, servicio, HTTPS):

   ```
   sudo bash -c 'git clone <repo-git> /tmp/veta-web-src 2>/dev/null; bash /tmp/veta-web-src/site/despliegue/instalar-web.sh <repo-git> <dominio>'
   ```

   La primera pasada se detiene en «completá /opt/veta-web/site/.env».
3. Completá el `.env` (`nano /opt/veta-web/site/.env`), a partir de
   `despliegue/env.produccion.ejemplo`. Lo que hay que rellenar:

   | variable | valor |
   |---|---|
   | `BETTER_AUTH_URL` | `https://<dominio>` (el de Vercel, **sin** `api.`) |
   | `VETA_ORIGENES` | `https://<dominio>` |
   | `BETTER_AUTH_SECRET` | el `openssl rand -base64 48` |
   | `DATABASE_URL` | la URI del *session pooler* de Supabase |
   | `VETA_ADMIN_EMAIL` / `VETA_ADMIN_PASSWORD` | tu cuenta admin (se crea al primer arranque; la contraseña se puede cambiar después desde la web) |
   | `VETA_OPERACION_TOKEN` | el de `/opt/veta/.env` (`grep VETA_OPERACION_TOKEN /opt/veta/.env`) |
   | `VETA_SMTP_URL` / `VETA_CORREO_DESDE` | los de Resend (`smtps://resend:re_xxx@smtp.resend.com:465`) |

   El resto ya viene puesto (rutas del motor, `VETA_SYNC_MODO=local`, cupos, tope).
   **`NODE_ENV` no va en el .env**: lo pone la unidad de systemd.
4. Volvé a correr el instalador (misma línea del paso 2). Termina con
   `listo: https://api.<dominio>/api/contenido/meta`. Probalo con `curl`: tiene que devolver
   el JSON con `generado_en` y `version_motor`.
5. Verificaciones:

   ```
   systemctl status veta-web            # activo
   journalctl -u veta-web -n 30         # "[bd] postgres", "[semilla] creada <tu email> · admin"
   systemctl status caddy               # activo, certificado emitido
   ```

   Si `journalctl` muestra `password authentication failed`, la URI de Supabase está mal
   (clave o codificación). Si muestra `ENOTFOUND … pooler.supabase.com`, DNS del servidor.

Qué hace la API en el servidor, para que no sorprenda:
- Recompila el contenido del motor cada 10 min (`VETA_SYNC_MINUTOS`) leyendo
  `/opt/veta/gem-pipeline/base_contenido` y `reports/` directamente. La bandeja ve lo que el
  motor deje, sin rsync ni túnel.
- Habla con el motor a pedido y con `/operacion/*` en `127.0.0.1:8787`.
- Escribe en `base_contenido/publicacion.jsonl` y `cola-web.jsonl` (por eso el usuario `veta`
  tiene permiso de escritura ahí).
- Escucha en `127.0.0.1:8790`; sólo Caddy lo expone, en `https://api.<dominio>`.

---

## 3. Vercel (10 minutos)

1. **Add New → Project → Import** el repo de GitHub.
2. Ajustes del proyecto:

   | campo | valor |
   |---|---|
   | Framework Preset | **Vite** |
   | **Root Directory** | `site` |
   | Build Command | `npm run build:web` |
   | Output Directory | `dist` |
   | Install Command | `npm ci --ignore-scripts` |

3. **Una línea en el repo, antes del deploy**: en `site/vercel.json` cambiá `TU-DOMINIO` por
   el dominio real (`"destination": "https://api.<dominio>/api/:path*"`) y hacé commit.
   Vercel no interpola variables en las reescrituras, así que el host va escrito. La build no
   necesita variables de entorno: la web llama a `/api` relativo.
4. **Deploy**. Al terminar, **Settings → Domains → Add** `<dominio>` (y `www.<dominio>` con
   redirección al principal). Vercel te da los registros:
   - `A` `@` → `76.76.21.21`
   - `CNAME` `www` → `cname.vercel-dns.com`
   
   Cargalos en el panel del dominio (al lado del `A api` del paso 2.1). Vercel emite el
   certificado solo cuando el DNS resuelve.
5. Verificación de punta a punta:
   - `https://<dominio>` carga la portada.
   - `https://<dominio>/api/contenido/meta` devuelve el mismo JSON que `api.<dominio>`
     (la reescritura funciona).
   - Entrar con tu cuenta admin → la barra muestra **Plan Admin** y las pestañas de admin.
     Si el login devuelve 403 «origen no confiable»: `VETA_ORIGENES` del `.env` no coincide
     con el dominio exacto. Si la cookie no se guarda: `BETTER_AUTH_URL` tiene que ser
     `https://<dominio>` y el sitio tiene que abrirse por ese dominio, no por
     `*.vercel.app`.
   - `/admin/operacion`: veredicto del servidor, «Contenido sincronizado», cola del motor.

---

## 4. Después del primer despliegue

- **Usuarios de prueba**: en producción no se crean (`gratis@/base@/pro@veta.local` sólo
  existen con `VETA_DEMO_PASSWORD` fuera de producción). Los socios se crean desde
  **Admin → Cuentas → Crear**, reciben el correo para elegir contraseña.
- **Actualizar la web**: `git push` → Vercel despliega solo.
- **Actualizar la API**: en el servidor,
  `cd /opt/veta-web && sudo -u veta git pull --ff-only && cd site && npm ci --omit=dev --ignore-scripts && sudo systemctl restart veta-web`.
- **Respaldo de la base**: lo hace Supabase (diario en el plan gratis, 7 días). El contenido
  del motor ya tiene su propio respaldo (`veta-backup.timer`).
- **Rotar el secreto** (`BETTER_AUTH_SECRET`) cierra todas las sesiones: hacerlo a propósito.
- **Lo que sigue pendiente** y no bloquea el despliegue: pagos (el plan lo asigna admin a
  mano), `/operacion/lanzar` devuelve 503 hasta que el servidor tenga el CLI de agentes
  (P8), rate limiting en la API.

---

## 5. Si algo falla: el mapa

```
navegador ──HTTPS──▶ Vercel (dist/)  ──/api/* reescrito──▶ Caddy api.<dominio> ──▶ veta-web :8790
                                                                                   ├─▶ Supabase (Postgres)
                                                                                   ├─▶ motor :8787 (a pedido, /operacion)
                                                                                   └─▶ /opt/veta/gem-pipeline/{base_contenido,reports}
```

| síntoma | dónde mirar |
|---|---|
| la portada carga, `/api/*` da 502 | `systemctl status veta-web`, `journalctl -u veta-web` |
| `/api/*` da 404 desde el dominio pero funciona en `api.<dominio>` | el `destination` de `site/vercel.json` |
| login «origen no confiable» | `VETA_ORIGENES` |
| nadie recibe el correo de contraseña | `VETA_SMTP_URL`; `journalctl -u veta-web | grep correo` |
| bandeja vacía | `/opt/veta-web/datos/*.json` (los compila el servicio cada 10 min; a mano: `sudo -u veta env VETA_BASE_CONTENIDO=/opt/veta/gem-pipeline/base_contenido VETA_DATOS=/opt/veta-web/datos node scripts/datos.mjs`) |
| Operación dice «caído» | `systemctl status veta-servicio` (el motor) |
