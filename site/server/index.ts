/* ============================================================================
   Servidor de VETA — Hono sobre Node.

     /api/auth/*       better-auth (registro, login, logout, recuperación, admin)
     /api/contenido/*  contenido del motor filtrado por la matriz de acceso
     /api/admin/*      bandeja de aprobación, cuentas, registro de acciones
     /api/yo           sesión + rol efectivo (lo que el cliente necesita)

   En desarrollo Vite proxya /api acá. Con VETA_SERVIR_DIST=1 sirve además
   la build (dist/) con fallback SPA: es el modo de las capturas.
   ========================================================================== */
import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { accessSync, constants, existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENV, RAIZ_SITE } from './entorno.ts'
import { auth, migrar, sesionDe, olvidarSesiones, type Sesion } from './auth.ts'
import { bd, planVigente } from './db.ts'
import { rolDe, puede, type Rol, type Seccion } from '../src/lib/matriz.ts'
import * as contenido from './contenido.ts'
import { adminApp, sincronizarAlertas } from './admin.ts'
import { votacionApp, votacionAdmin } from './votacion.ts'
import { cupoDe } from './cupo.ts'
import { analizarApp, consumoAdmin } from './analizar.ts'
import { operacionAdmin, vigilarPublicados } from './operacion.ts'
import { pagosApp, cobroAutomatico, enlacesCheckout } from './pagos.ts'
import { noticiasPara, noticiasAdmin } from './noticias.ts'
import { enlacesApp, enlacesAdmin, sembrarEnlaces } from './enlaces.ts'
import { sembrar } from './semilla.ts'
import { sinTenencia } from './tenencia.ts'

type Vars = { sesion: Sesion | null; rol: Rol; rolReal: Rol; verComo: Rol | null }
const app = new Hono<{ Variables: Vars }>()

/* ---------- auth ---------- */
app.on(['GET', 'POST'], '/api/auth/*', (c) => {
  // Cerrar sesión o cambiar la contraseña invalida sesiones: la memoria de sesionDe no las resucita.
  if (/\/(sign-out|reset-password|change-password|revoke-sessions?|revoke-other-sessions)$/.test(c.req.path)) olvidarSesiones()
  return auth.handler(c.req.raw)
})

/* ---------- sesión y rol efectivo en cada petición ---------- */
app.onError((e, c) => {
  console.error('[veta] error', c.req.method, c.req.path, e)
  return c.json({ error: 'interno', detalle: e.message }, 500)
})

app.use('/api/*', async (c, next) => {
  const sesion = await sesionDe(c.req.raw.headers).catch((e) => { console.error('[sesion]', e); return null })
  /* El plan manda desde la base, no desde la copia que guarda la cookie: quien
     acaba de pagar no puede esperar cinco minutos —ni cerrar sesión— para entrar
     a lo que pagó. `planVigente` recuerda diez segundos y el cobro lo invalida. */
  if (sesion) {
    const v = await planVigente(sesion.user.id)
    if (v) { sesion.user.plan = v.plan; sesion.user.banned = v.suspendido }
  }
  const rolReal = rolDe(sesion?.user)
  // "Ver como" existe SÓLO en desarrollo y SÓLO para admin: la cabecera la manda el selector de dev.
  let verComo: Rol | null = null
  const h = c.req.header('x-veta-ver-como')
  if (!ENV.PRODUCCION && rolReal === 'admin' && h && (['visitante', 'base', 'pro', 'admin'] as string[]).includes(h)) verComo = h as Rol
  c.set('sesion', sesion); c.set('rolReal', rolReal); c.set('verComo', verComo); c.set('rol', verComo ?? rolReal)
  await next()
})

const exige = (seccion: Seccion) => async (c: { get: (k: 'rol') => Rol; json: (o: unknown, s?: 401 | 403) => Response }, next: () => Promise<void>) => {
  const rol = c.get('rol')
  if (!puede(rol, seccion)) return c.json({ error: 'sin_acceso', seccion, rol, plan_minimo: seccion }, rol === 'visitante' ? 401 : 403)
  await next()
}

/* Las respuestas de la API dependen de quién pregunta. Ninguna caché intermedia debe
   guardarlas, aunque hoy ninguna lo haga: vale más decirlo que confiar en que no pase. */
app.use('/api/*', async (c, next) => {
  await next()
  c.header('Cache-Control', 'private, no-store')
  c.header('Vary', 'Cookie')
})

/* Tenencia declarada: ninguna moneda con posición del operador sale de la API hacia
   un cliente, venga de la ruta que venga. Un solo punto de salida (server/tenencia.ts). */
app.use('/api/*', sinTenencia)

app.get('/api/yo', (c) => {
  const s = c.get('sesion')
  return c.json({
    usuario: s ? { id: s.user.id, email: s.user.email, nombre: s.user.name, plan: s.user.plan ?? 'gratis', rol: s.user.role ?? 'usuario', estado: s.user.estado ?? 'activo', suspendido: !!s.user.banned, fecha_alta: s.user.createdAt, ultimo_acceso: s.user.ultimo_acceso ?? null } : null,
    rol: c.get('rol'), rol_real: c.get('rolReal'), ver_como: c.get('verComo'),
    impersonando: !!s?.session.impersonatedBy,
    desarrollo: !ENV.PRODUCCION,
    horas_anticipo: ENV.HORAS_ANTICIPO,
  })
})

/* Una pantalla que revienta en el navegador de alguien no deja rastro aquí si
   nadie lo cuenta. El límite de error del cliente manda el fallo a esta ruta.
   No exige sesión —un visitante también merece que su pantalla rota se vea— y
   recorta todo lo que entra: es una entrada pública. */
app.post('/api/fallo', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const corto = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '')
  const s = c.get('sesion')
  console.error('[pantalla-rota]', JSON.stringify({
    donde: corto(b.donde, 40) || null,
    ruta: corto(b.ruta, 200),
    mensaje: corto(b.mensaje, 500),
    rol: c.get('rol'),
    usuario: s ? s.user.id : null,
    pila: corto(b.pila, 2000),
    componente: corto(b.componente, 1500),
    cuando: new Date().toISOString(),
  }))
  return c.json({ ok: true })
})

app.get('/api/cuenta', async (c) => {
  const s = c.get('sesion')
  if (!s) return c.json({ error: 'sin_sesion' }, 401)
  const suscripcion = await bd.uno('SELECT plan, estado, fecha_renovacion FROM suscripcion WHERE usuario_id = ?', [s.user.id]) ?? null
  const c0 = await cupoDe(s.user.id, c.get('rol') === 'admin' ? 'pro' : (s.user.plan ?? 'gratis'), c.get('rol') === 'admin')
  const cupo = { periodo: c0.periodo, analisis_incluidos: c0.incluidos, analisis_usados: c0.usados, fecha_reinicio: c0.fecha_reinicio, ilimitado: c0.ilimitado }
  const sesiones = (await bd.uno<{ n: number }>('SELECT COUNT(*) AS n FROM session WHERE "userId" = ?', [s.user.id]))!.n
  return c.json({ suscripcion, cupo, sesiones })
})

/* ---------- contenido ---------- */
/* Catálogo público de planes. Precios y cupos salen del entorno, nunca del código
   del cliente: cuando cambien, cambia una variable y no hay que volver a construir. */
app.get('/api/planes', (c) => c.json({
  contacto: ENV.CONTACTO || null,
  cobro_automatico: cobroAutomatico(),
  /* Los enlaces de pago llevan el correo de la sesión: quien ya tiene cuenta no
     lo vuelve a escribir, y el aviso de Whop vuelve con el correo correcto. */
  checkout: enlacesCheckout(c.get('sesion')?.user.email ?? null),
  planes: [
    { clave: 'gratis', nombre: 'Gratis', precio_usd: ENV.PRECIO.gratis, analisis_mes: ENV.CUPO.gratis },
    { clave: 'base', nombre: 'Base', precio_usd: ENV.PRECIO.base, analisis_mes: ENV.CUPO.base },
    { clave: 'pro', nombre: 'Pro', precio_usd: ENV.PRECIO.pro, analisis_mes: ENV.CUPO.pro },
  ],
}))

app.get('/api/contenido/meta', (c) => c.json(contenido.metaPara(c.get('rol'))))
app.get('/api/contenido/gemas', async (c) => c.json({ gemas: await contenido.gemasPara(c.get('rol')), anticipadas: await contenido.anticipadasPara(c.get('rol')) }))
app.get('/api/contenido/gemas/:id', async (c) => {
  const g = await contenido.gemaPara(c.req.param('id'), c.get('rol')) as (Record<string, unknown> & { recorte?: string }) | null
  if (g?.recorte === 'anticipada') return c.json({ error: 'anticipada', ...g }, 403)
  return g ? c.json(g) : c.json({ error: 'no_encontrado' }, 404)
})
app.get('/api/contenido/analisis', async (c) => c.json((await contenido.analisisPara(c.get('rol'))).map(contenido.resumenDeLista)))
app.get('/api/contenido/analisis/:id', async (c) => {
  const a = await contenido.analisisUnoPara(c.req.param('id'), c.get('rol'))
  return a ? c.json(a) : c.json({ error: 'no_encontrado' }, 404)
})
app.get('/api/contenido/marcador', async (c) => {
  const m = await contenido.marcadorAgregado()
  // el visitante ve el agregado (evidencia de método); el detalle por gema, sólo quien puede ver el informe
  const rol = c.get('rol')
  return c.json(puede(rol, 'seguimiento') ? m : { ...m, gemas: m.gemas.map((g) => ({ gema_id: g.gema_id, simbolo: g.simbolo, b1: { lado: g.b1.lado }, b2: { lado: g.b2.lado }, cerrada: g.cerrada, dias_al_cierre: g.dias_al_cierre, ...(g.retirada ? { retirada: g.retirada } : {}) })) })
  // §17.1: que una tesis se retiró es parte del historial que ve todo el mundo; nada se esconde.
})

/* ---------- predicción del usuario: una vez, con fecha, sin cambios ---------- */
app.get('/api/prediccion', async (c) => {
  const s = c.get('sesion'); if (!s) return c.json({ error: 'sin_sesion' }, 401)
  const mias = await bd.todos('SELECT gema_id, prediccion, fecha, retorno_gema_al_marcar, b1_al_marcar, dias_al_cierre_al_marcar FROM prediccion WHERE usuario_id = ? ORDER BY fecha DESC', [s.user.id]) as { gema_id: string; prediccion: 'gana' | 'no_gana'; fecha: string }[]
  const m = await contenido.marcadorAgregado()
  const filas = mias.map((p) => {
    const g = m.gemas.find((x) => x.gema_id === p.gema_id)
    const vivo = g ? g.b1.lado : 'sin_medir'
    const acierto_por_ahora = vivo === 'sin_medir' ? null : (vivo === 'gana') === (p.prediccion === 'gana')
    return { ...p, simbolo: g?.simbolo ?? p.gema_id, va: vivo, cerrada: g?.cerrada ?? false, acierto_por_ahora }
  })
  const veta = m.gemas.filter((g) => g.b1.lado !== 'sin_medir')
  return c.json({
    predicciones: filas,
    marcador: {
      total: filas.length, acertando: filas.filter((f) => f.acierto_por_ahora === true).length, fallando: filas.filter((f) => f.acierto_por_ahora === false).length, sin_medir: filas.filter((f) => f.acierto_por_ahora === null).length,
      // VETA "predice" que cada gema le gana a la canasta: su acierto vivo es cuántas van ganando
      veta: { total: veta.length, acertando: veta.filter((g) => g.b1.lado === 'gana').length },
    },
  })
})
app.post('/api/prediccion/:gemaId', async (c) => {
  const s = c.get('sesion'); if (!s) return c.json({ error: 'sin_sesion' }, 401)
  if (!puede(c.get('rol'), 'gemas.informe')) return c.json({ error: 'sin_acceso', seccion: 'gemas.informe' }, 403)
  const gemaId = c.req.param('gemaId')
  const g = await contenido.gemaPara(gemaId, c.get('rol')) as { recorte?: string } | null
  if (!g || g.recorte) return c.json({ error: 'no_encontrado' }, 404)
  const { prediccion } = await c.req.json().catch(() => ({})) as { prediccion?: string }
  if (prediccion !== 'gana' && prediccion !== 'no_gana') return c.json({ error: 'prediccion_invalida' }, 400)
  const ya = await bd.uno('SELECT prediccion, fecha FROM prediccion WHERE usuario_id = ? AND gema_id = ?', [s.user.id, gemaId])
  if (ya) return c.json({ error: 'ya_marcada', detalle: 'La predicción es una sola y no se cambia.' }, 409)
  const m = (await contenido.marcadorAgregado()).gemas.find((x) => x.gema_id === gemaId)
  if (m?.cerrada) return c.json({ error: 'gema_cerrada', detalle: 'El horizonte ya cerró: no se predice sobre un resultado.' }, 409)
  await bd.ejecutar('INSERT INTO prediccion (usuario_id, gema_id, prediccion, fecha, retorno_gema_al_marcar, b1_al_marcar, dias_al_cierre_al_marcar) VALUES (?, ?, ?, ?, ?, ?, ?)', [s.user.id, gemaId, prediccion, new Date().toISOString(), m?.retorno_gema ?? null, m?.b1.valor ?? null, m?.dias_al_cierre ?? null])
  return c.json({ ok: true })
})

app.get('/api/contenido/visuales/:id', async (c) => {
  const v = await contenido.visualesPara(c.req.param('id'), c.get('rol'))
  return v === undefined ? c.json({ error: 'no_encontrado' }, 404) : c.json(v)
})
/* Noticias: el recorte lo decide el servidor, no el cliente. */
app.get('/api/contenido/noticias', async (c) => c.json(await noticiasPara(c.get('rol'))))
app.get('/api/contenido/seguimiento', exige('seguimiento'), async (c) => c.json(await contenido.seguimientoPara(c.get('rol'))))
app.get('/api/contenido/benchmark', exige('seguimiento'), (c) => c.json(contenido.benchmark()))
app.get('/api/contenido/watchlist', exige('watchlist'), (c) => c.json(contenido.watchlistToda()))
app.get('/api/contenido/alertas', exige('alertas'), async (c) => c.json(await alertasDe(c.get('sesion')!.user.id)))
app.get('/api/contenido/exportar/:que', exige('exportar'), async (c) => {
  const que = c.req.param('que'); const rol = c.get('rol')
  const cuerpo = que === 'gemas' ? await contenido.gemasPara(rol) : que === 'seguimiento' ? await contenido.seguimientoPara(rol) : que === 'watchlist' ? contenido.watchlistToda() : que === 'analisis' ? await contenido.analisisPara(rol) : null
  if (!cuerpo) return c.json({ error: 'no_exportable' }, 404)
  c.header('Content-Disposition', `attachment; filename="veta-${que}-${new Date().toISOString().slice(0, 10)}.json"`)
  return c.json(cuerpo)
})

async function alertasDe(usuarioId: string) {
  return bd.todos('SELECT id, tipo, gema_id, fecha, leida, detalle FROM alerta WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 100', [usuarioId])
}

app.route('/api/admin/noticias', noticiasAdmin)
app.route('/api/admin/enlaces', enlacesAdmin)

/* Enlaces cortos de redes. El alojamiento reescribe /ig hacia aquí; el destino
   y sus UTM salen de la base, así que se cambian sin desplegar. */
app.route('/api/ir', enlacesApp)

/* ---------- cobro (Whop) ---------- */
app.route('/api/pagos', pagosApp)

/* ---------- analiza tu moneda ---------- */
app.route('/api/analizar', analizarApp)
app.route('/api/admin/consumo', consumoAdmin)
app.route('/api/admin/operacion', operacionAdmin)

/* ---------- votación semanal ---------- */
app.route('/api/votacion', votacionApp)
app.route('/api/admin/votacion', votacionAdmin)

/* ---------- admin ---------- */
app.route('/api/admin', adminApp)

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'no_encontrado' }, 404) : spa(c)))

/* ---------- build estática (modo capturas / preview) ---------- */
const DIST = resolve(RAIZ_SITE, 'dist')
function spa(c: Context) {
  const f = resolve(DIST, 'index.html')
  return existsSync(f) ? c.html(readFileSync(f, 'utf8')) : c.text('Sin build: corre `npm run build`', 404)
}
if (ENV.SERVIR_DIST) {
  app.use('/*', serveStatic({ root: './dist' }))
}

/* Al arrancar: ¿puede el servicio reescribir sus propios datos? El 21-sep un
   script de mantenimiento corrió como root y los dejó suyos; `veta` podía leerlos
   pero no escribirlos, la sincronización fallaba cada diez minutos y tumbaba el
   proceso. Se tardó horas en verlo. Preguntarlo al arrancar cuesta siete accesos
   y lo pone en la primera línea del log. */
function comprobarDatosEscribibles() {
  try {
    if (!existsSync(ENV.DATOS)) return
    const malos = readdirSync(ENV.DATOS).filter((f) => {
      try { accessSync(resolve(ENV.DATOS, f), constants.W_OK); return false } catch { return true }
    })
    if (malos.length) {
      console.error(`[datos] NO SE PUEDEN REESCRIBIR ${malos.length} ficheros de ${ENV.DATOS}: ${malos.join(', ')}`)
      console.error(`[datos] la sincronización va a fallar. Arréglalo con: sudo chown -R veta:veta ${ENV.DATOS}`)
    }
  } catch (e) {
    console.warn('[datos] no se pudo comprobar el dueño:', (e as Error).message)
  }
}
comprobarDatosEscribibles()

/* Red de seguridad: ninguna tarea de fondo puede tumbar la API. Node 22 mata el
   proceso ante una promesa rechazada sin manejar, y una sincronización fallida
   no es motivo para dejar de servir a nadie. Se registra y se sigue. */
process.on('unhandledRejection', (razon) => { console.error('[veta] promesa sin manejar:', razon) })
process.on('uncaughtException', (e) => { console.error('[veta] excepción no capturada:', e) })

await migrar()
await sembrar()
await sembrarEnlaces()
console.log(`[alertas] ${await sincronizarAlertas()} nuevas`)
/* Un despliegue es un arranque: se cuenta lo publicado y se compara con lo de
   antes. Si bajó, queda el aviso en Operación en vez de un sitio vacío callado. */
{ const p = await vigilarPublicados().catch(() => null); if (p) console.log(`[publicados] ${p.total} (gemas ${p.gemas}, analisis ${p.analisis})`) }
serve({ fetch: app.fetch, port: ENV.PUERTO, ...(ENV.HOST ? { hostname: ENV.HOST } : {}) }, (info) => {
  console.log(`[veta] servidor en http://localhost:${info.port} · datos ${ENV.DATOS} · base ${ENV.DATABASE_URL ? 'postgres' : ENV.DB}${ENV.SERVIR_DIST ? ' · sirviendo dist/' : ''}`)
})
