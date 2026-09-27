/* ============================================================================
   Entorno del servidor. Todo secreto viene de variables de entorno (.env en
   local, nunca en el código). Lo que no es secreto tiene un valor por defecto
   razonable para desarrollo.
   ========================================================================== */
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const RAIZ_SITE = resolve(here, '..')

// .env mínimo, sin dependencia: KEY=valor por línea, # comentarios.
function cargarDotenv() {
  const f = resolve(RAIZ_SITE, '.env')
  if (!existsSync(f)) return
  for (const linea of readFileSync(f, 'utf8').split('\n')) {
    const l = linea.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i < 0) continue
    const k = l.slice(0, i).trim()
    let v = l.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}
cargarDotenv()

const req = (k: string) => {
  const v = process.env[k]
  if (!v) throw new Error(`Falta la variable de entorno ${k} (ver .env.example)`)
  return v
}
const num = (k: string, d: number) => { const v = process.env[k]; return v === undefined || v === '' ? d : Number(v) }

export const ENV = {
  PRODUCCION: process.env.NODE_ENV === 'production',
  PUERTO: num('PORT', 8787),
  /** Interfaz donde escucha. En producción, 127.0.0.1: sólo Caddy llega, el firewall deja de ser lo único que protege. */
  HOST: process.env.VETA_HOST ?? '',
  /** Origen público de la web (lo que ve el navegador). En dev es el de Vite. */
  URL_PUBLICA: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  ORIGENES_CONFIABLES: (process.env.VETA_ORIGENES ?? 'http://localhost:5173,http://localhost:5310').split(',').map((s) => s.trim()).filter(Boolean),
  SECRETO: req('BETTER_AUTH_SECRET'),
  /** Postgres (Supabase) si hay DATABASE_URL; si no, SQLite local. */
  DATABASE_URL: (process.env.DATABASE_URL ?? '').trim(),
  DB: resolve(RAIZ_SITE, process.env.VETA_DB ?? 'server/data/veta.sqlite'),
  DATOS: resolve(RAIZ_SITE, process.env.VETA_DATOS ?? 'server/datos'),
  /** Carpeta base_contenido del motor: lo ÚNICO que la plataforma escribe hacia el motor es publicacion.jsonl. */
  BASE_CONTENIDO: resolve(RAIZ_SITE, process.env.VETA_BASE_CONTENIDO ?? '../datos-motor/base_contenido'),
  /** Carpeta reports/ del motor (paquete.json, informe.md, verificador.json, esceptico.json por informe). */
  REPORTS: resolve(RAIZ_SITE, process.env.VETA_REPORTS_DIR ?? '../datos-motor/reports'),
  SERVIR_DIST: process.env.VETA_SERVIR_DIST === '1',
  /** Acceso anticipado del plan pro: horas antes de que el base vea una gema recién aprobada. [JUICIO] */
  HORAS_ANTICIPO: num('VETA_HORAS_ANTICIPO', 6),
  /** Contrato §17.1: lo que el público vio antes de esta fecha es calibración y se archiva
      (fuera del historial público); desde ella, nada se saca. */
  LANZAMIENTO: (process.env.VETA_LANZAMIENTO ?? '2026-09-27').trim(),
  CUPO: { gratis: 0, base: num('VETA_CUPO_BASE', 2), pro: num('VETA_CUPO_PRO', 6) } as Record<string, number>,
  /* Precios de cara al público, en USD al mes. Se cambian por variable de entorno,
     sin tocar código, porque van a moverse cuando el motor mida el costo real. */
  PRECIO: { gratis: 0, base: num('VETA_PRECIO_BASE', 30), pro: num('VETA_PRECIO_PRO', 50) } as Record<string, number>,
  /** Dirección pública a la que escribe quien quiere un plan, mientras no haya cobro
      automático. Se declara a propósito: NO cae al correo del admin, que es personal. */
  CONTACTO: process.env.VETA_CONTACTO ?? '',
  /* Analiza tu moneda (spec §5): tope global de gasto mensual y costo estimado por análisis profundo. [JUICIO] */
  TOPE_MENSUAL_USD: num('VETA_TOPE_MENSUAL_USD', 60),
  COSTO_ESTIMADO_USD: num('VETA_COSTO_ESTIMADO_USD', 1.8),
  /** Qué motor responde los pedidos: 'simulado' (recorre las etapas sin gastar) o 'http' (el real, CONTRATO-ANALISIS-A-PEDIDO.md). */
  MOTOR: process.env.VETA_MOTOR === 'http' ? 'http' : 'simulado',
  MOTOR_URL: process.env.VETA_MOTOR_URL ?? 'http://127.0.0.1:8790',
  /** Sólo el simulador: multiplica la velocidad de las etapas (1 = tiempos reales, ~2,5 min). */
  SIM_VELOCIDAD: num('VETA_SIM_VELOCIDAD', 1),
  /* Servidor del motor: rutas /operacion por el túnel SSH y sincronización de contenido. El token nunca sale del entorno. */
  OPERACION_URL: process.env.VETA_OPERACION_URL ?? 'http://127.0.0.1:8788',
  OPERACION_TOKEN: (process.env.VETA_OPERACION_TOKEN ?? '').trim(),
  SERVIDOR_SSH: process.env.VETA_SERVIDOR_SSH ?? '',
  SERVIDOR_CLAVE: process.env.VETA_SERVIDOR_CLAVE ?? '~/.ssh/veta_vps',
  SERVIDOR_RUTA: process.env.VETA_SERVIDOR_RUTA ?? '',
  SYNC_MINUTOS: num('VETA_SYNC_MINUTOS', 10),
  /** 'ssh' (rsync desde otra máquina) o 'local' (la web corre junto al motor y sólo recompila). */
  SYNC_MODO: process.env.VETA_SYNC_MODO === 'local' ? 'local' : 'ssh',
  CORREO_TRANSPORTE: process.env.VETA_CORREO ?? 'archivo',
  SMTP_URL: (process.env.VETA_SMTP_URL ?? '').trim(),
  CORREO_DESDE: process.env.VETA_CORREO_DESDE ?? 'VETA <no-responder@veta.local>',
  /** A dónde contesta quien responde a un correo nuestro. Vacío = no se pone cabecera. */
  CORREO_RESPONDER_A: (process.env.VETA_CORREO_RESPONDER_A ?? process.env.VETA_CONTACTO ?? '').trim(),
  /** Clave de Resend. Sólo en el .env del servidor; nunca en el repositorio. */
  RESEND_API_KEY: (process.env.VETA_RESEND_API_KEY ?? '').trim(),
  CORREO_SALIENTE: resolve(RAIZ_SITE, 'server/correo-saliente'),
  /* Cobro con Whop. Todo sale del .env del servidor: ni la clave ni el secreto
     entran al repositorio, y los identificadores de plan cambian sin tocar código.
     Mientras WHOP.PLAN_BASE y WHOP.PLAN_PRO estén vacíos, /precios sigue con el
     botón de correo: el cobro automático se enciende cuando hay con qué cobrar. */
  WHOP: {
    API_KEY: (process.env.VETA_WHOP_API_KEY ?? '').trim(),
    /** Secreto del webhook (ws_…). Sin él no se procesa ningún aviso: firmado o nada. */
    SECRETO: (process.env.VETA_WHOP_WEBHOOK_SECRETO ?? '').trim(),
    PLAN_BASE: (process.env.VETA_WHOP_PLAN_BASE ?? '').trim(),
    PLAN_PRO: (process.env.VETA_WHOP_PLAN_PRO ?? '').trim(),
    /** Dónde vuelve el usuario después de pagar. */
    RETORNO: (process.env.VETA_WHOP_RETORNO ?? '').trim(),
  },
  ADMIN_EMAIL: process.env.VETA_ADMIN_EMAIL ?? '',
  ADMIN_PASSWORD: process.env.VETA_ADMIN_PASSWORD ?? '',
  DEMO_PASSWORD: process.env.VETA_DEMO_PASSWORD ?? '',
}
