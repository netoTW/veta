/* ============================================================================
   Enlaces cortos para redes.

   `vetalab.io/ig` lleva al inicio marcando de dónde viene la visita. La bio de
   Instagram enseña la URL entera, así que no puede llevar los UTM a la vista:
   el enlace corto los pone por detrás.

   **Viven en la base, no en el código.** Añadir un enlace nuevo o cambiar a
   dónde apunta uno existente se hace desde admin, sin desplegar. Por eso la
   redirección la sirve la API y no una regla estática del alojamiento.

   **302, no 301 ni 308.** Un permanente se queda pegado en el navegador de cada
   visitante y en cada intermediario: cambiar el destino después dejaría fuera a
   quien ya pasó una vez. Con temporal, el destino se cambia y surte efecto en
   la siguiente visita.

   **Un slug que no existe no es un error.** Una errata en una bio no puede
   acabar en una página de fallo: se manda al inicio, sin marcar origen, y queda
   en el registro para que alguien lo vea.
   ========================================================================== */
import { Hono } from 'hono'
import { bd, ahora, registrarAccion } from './db.ts'
import { ENV } from './entorno.ts'
import type { Sesion } from './auth.ts'
import type { Rol } from '../src/lib/matriz.ts'

export interface EnlaceCorto {
  slug: string
  destino: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  activo: number
  notas: string | null
  visitas: number
  ultima_visita: string | null
  creado: string
  actualizado: string
}

/** Minúsculas, sin espacios ni barras: lo que se puede escribir en una bio. */
export const normalizar = (s: string) => (s ?? '').trim().toLowerCase().replace(/^\/+|\/+$/g, '')
const SLUG_OK = /^[a-z0-9][a-z0-9_-]{0,23}$/

/* Los nombres que ya usa la aplicación. Un enlace corto no puede llamarse como
   una pantalla: ganaría la pantalla y el enlace no funcionaría nunca, así que
   vale más decirlo al crearlo que descubrirlo en una campaña. */
export const RESERVADOS = new Set([
  'api', 'assets', 'admin', 'img', 'fonts', 'favicon', 'robots', 'sitemap',
  'analisis', 'analizar', 'contacto', 'cuenta', 'entrar', 'gemas', 'gracias',
  'metodologia', 'nosotros', 'noticias', 'piezas', 'precios', 'privacidad',
  'recuperar', 'registro', 'restablecer', 'seguimiento', 'sistema', 'terminos',
  'votacion', 'watchlist',
])

/** La URL final, con su origen colgado. El destino es una ruta del propio sitio. */
export function destinoDe(e: Pick<EnlaceCorto, 'destino' | 'utm_source' | 'utm_medium' | 'utm_campaign'>): string {
  const base = ENV.URL_PUBLICA.replace(/\/+$/, '')
  const ruta = (e.destino || '/').startsWith('/') ? (e.destino || '/') : `/${e.destino}`
  const u = new URL(base + ruta)
  if (e.utm_source) u.searchParams.set('utm_source', e.utm_source)
  if (e.utm_medium) u.searchParams.set('utm_medium', e.utm_medium)
  if (e.utm_campaign) u.searchParams.set('utm_campaign', e.utm_campaign)
  return u.toString()
}

export async function buscar(slug: string): Promise<EnlaceCorto | undefined> {
  return bd.uno<EnlaceCorto>('SELECT * FROM enlace_corto WHERE slug = ?', [normalizar(slug)])
}

/** Los tres de salida. Se siembran una vez; después se gobiernan desde admin. */
export async function sembrarEnlaces() {
  const semillas = [
    { slug: 'ig', utm_source: 'instagram', utm_medium: 'bio', notas: 'Bio de Instagram' },
    { slug: 'tiktok', utm_source: 'tiktok', utm_medium: 'bio', notas: 'Bio de TikTok' },
    { slug: 'x', utm_source: 'x', utm_medium: 'bio', notas: 'Bio de X' },
  ]
  for (const s of semillas) {
    await bd.ejecutar(
      `INSERT INTO enlace_corto (slug, destino, utm_source, utm_medium, utm_campaign, activo, notas, visitas, ultima_visita, creado, actualizado)
       VALUES (?, '/', ?, ?, NULL, 1, ?, 0, NULL, ?, ?) ON CONFLICT(slug) DO NOTHING`,
      [s.slug, s.utm_source, s.utm_medium, s.notas, ahora(), ahora()])
  }
}

/* ---------- la redirección pública ---------- */
export const enlacesApp = new Hono()

enlacesApp.get('/:slug', async (c) => {
  const slug = normalizar(c.req.param('slug'))
  const e = slug ? await buscar(slug) : undefined
  if (!e || !e.activo) {
    console.warn(`[ir] slug sin destino: ${slug.slice(0, 24) || '(vacío)'}`)
    return c.redirect(ENV.URL_PUBLICA.replace(/\/+$/, '') + '/', 302)
  }
  // Contar no puede retrasar la redirección ni tumbarla si la base tarda.
  void bd.ejecutar('UPDATE enlace_corto SET visitas = visitas + 1, ultima_visita = ? WHERE slug = ?', [ahora(), e.slug])
    .catch((err) => console.warn('[ir] no se pudo contar:', (err as Error).message))
  return c.redirect(destinoDe(e), 302)
})

/* ---------- gestión desde admin ---------- */
type Vars = { sesion: Sesion | null; rol: Rol }
export const enlacesAdmin = new Hono<{ Variables: Vars }>()

enlacesAdmin.use('*', async (c, next) => {
  if (c.get('rol') !== 'admin') return c.json({ error: 'sin_acceso' }, 403)
  await next()
})

enlacesAdmin.get('/', async (c) => {
  const filas = await bd.todos<EnlaceCorto>('SELECT * FROM enlace_corto ORDER BY slug')
  const base = ENV.URL_PUBLICA.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '')
  return c.json({ enlaces: filas.map((e) => ({ ...e, url: `${base}/${e.slug}`, destino_final: destinoDe(e) })), reservados: [...RESERVADOS] })
})

enlacesAdmin.post('/', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Partial<EnlaceCorto>
  const slug = normalizar(String(b.slug ?? ''))
  if (!SLUG_OK.test(slug)) return c.json({ error: 'slug_invalido', detalle: 'Letras, números, guion y guion bajo; hasta 24 caracteres.' }, 400)
  if (RESERVADOS.has(slug)) return c.json({ error: 'slug_reservado', detalle: `"${slug}" es una pantalla del sitio: el enlace no llegaría a funcionar.` }, 400)
  const destino = String(b.destino ?? '/').trim() || '/'
  if (!destino.startsWith('/')) return c.json({ error: 'destino_invalido', detalle: 'El destino es una ruta del propio sitio, empieza por "/".' }, 400)
  const s = c.get('sesion')!
  const limpio = (v: unknown) => { const t = String(v ?? '').trim(); return t ? t.slice(0, 60) : null }
  await bd.ejecutar(
    `INSERT INTO enlace_corto (slug, destino, utm_source, utm_medium, utm_campaign, activo, notas, visitas, ultima_visita, creado, actualizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET destino = excluded.destino, utm_source = excluded.utm_source,
       utm_medium = excluded.utm_medium, utm_campaign = excluded.utm_campaign, activo = excluded.activo,
       notas = excluded.notas, actualizado = excluded.actualizado`,
    [slug, destino, limpio(b.utm_source), limpio(b.utm_medium), limpio(b.utm_campaign),
     (b as { activo?: unknown }).activo === 0 || (b as { activo?: unknown }).activo === false ? 0 : 1, limpio(b.notas), ahora(), ahora()])
  await registrarAccion({ admin_id: s.user.id, admin_email: s.user.email, accion: 'enlace.guardar', objetivo_tipo: 'enlace', objetivo_id: slug, detalle: { destino, utm_source: b.utm_source, utm_medium: b.utm_medium } })
  const e = await buscar(slug)
  return c.json({ ok: true, enlace: e ? { ...e, destino_final: destinoDe(e) } : null })
})

enlacesAdmin.post('/:slug/borrar', async (c) => {
  const slug = normalizar(c.req.param('slug'))
  const s = c.get('sesion')!
  const r = await bd.ejecutar('DELETE FROM enlace_corto WHERE slug = ?', [slug])
  if (!r.cambios) return c.json({ error: 'no_encontrado' }, 404)
  await registrarAccion({ admin_id: s.user.id, admin_email: s.user.email, accion: 'enlace.borrar', objetivo_tipo: 'enlace', objetivo_id: slug })
  return c.json({ ok: true })
})
