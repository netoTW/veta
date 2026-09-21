/* ============================================================================
   Cobro con Whop.

   Dos rutas y nada más:

     GET  /api/pagos/checkout/:plan   devuelve el enlace de pago del plan, con
                                      el correo de la sesión precargado.
     POST /api/pagos/whop             el aviso firmado de Whop. Sube o baja el
                                      plan de la cuenta.

   Tres reglas que gobiernan el archivo:

   - **Firmado o nada.** Un aviso sin firma válida no se mira siquiera. Quien
     puede cambiar planes escribiendo a una URL pública es quien tenga el
     secreto, nadie más.
   - **Idempotente por el id del mensaje.** Cada aviso se inserta en
     `pago_evento` con su id como llave primaria. Si Whop reintenta —y
     reintenta—, el INSERT choca, no se aplica nada y se contesta 200.
   - **El orden de llegada no manda.** Los avisos pueden llegar desordenados.
     Se compara la fecha del evento con la del último aplicado a esa membresía
     y uno viejo no pisa a uno nuevo: si no, una baja rezagada apagaría un
     plan que ya se había vuelto a pagar.

   Whop firma según Standard Webhooks: HMAC-SHA256 sobre
   `{webhook-id}.{webhook-timestamp}.{cuerpo crudo}`, en base64.
   ========================================================================== */
import { Hono } from 'hono'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { auth, type Sesion } from './auth.ts'
import { bd, ahora, asignarPlanExterno, olvidarPlan, registrarAccion } from './db.ts'
import { ENV } from './entorno.ts'
import type { Rol } from '../src/lib/matriz.ts'

type Vars = { sesion: Sesion | null; rol: Rol }
export const pagosApp = new Hono<{ Variables: Vars }>()

/** Tolerancia de reloj para la fecha del aviso. Más allá, se rechaza por repetición. */
const VENTANA_MS = 5 * 60 * 1000

/* ---------- catálogo ---------- */

/** ¿Está el cobro automático encendido? Sólo si hay con qué cobrar y con qué verificar. */
export const cobroAutomatico = () => !!(ENV.WHOP.PLAN_BASE && ENV.WHOP.PLAN_PRO)

/** El identificador de plan de Whop que corresponde a cada plan de VETA. */
export function planWhopDe(plan: string): string | null {
  if (plan === 'base') return ENV.WHOP.PLAN_BASE || null
  if (plan === 'pro') return ENV.WHOP.PLAN_PRO || null
  return null
}

/** Al revés: qué plan de VETA es un identificador de Whop. */
export function planDeWhop(idWhop?: string | null): 'base' | 'pro' | null {
  if (!idWhop) return null
  if (ENV.WHOP.PLAN_BASE && idWhop === ENV.WHOP.PLAN_BASE) return 'base'
  if (ENV.WHOP.PLAN_PRO && idWhop === ENV.WHOP.PLAN_PRO) return 'pro'
  return null
}

/** Enlace de pago de un plan. El correo llega precargado si hay sesión. */
export function enlaceCheckout(plan: string, correo?: string | null): string | null {
  const id = planWhopDe(plan)
  if (!id) return null
  const u = new URL(`https://whop.com/checkout/${id}`)
  if (correo) u.searchParams.set('email', correo)
  // El plan viaja en la vuelta para que /gracias sepa qué está esperando: sin eso
  // no distingue una subida de Base a Pro de un plan que ya estaba puesto.
  if (ENV.WHOP.RETORNO) u.searchParams.set('redirect_url', `${ENV.WHOP.RETORNO}?plan=${plan}`)
  return u.toString()
}

/** Los enlaces de los tres planes, para el catálogo público. */
export function enlacesCheckout(correo?: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of ['base', 'pro']) {
    const e = enlaceCheckout(p, correo)
    if (e) out[p] = e
  }
  return out
}

/* ---------- firma ---------- */

/* El secreto de Whop llega como `ws_…`. La especificación de Standard Webhooks
   usa la clave en base64 tras el prefijo, pero no todos los emisores lo hacen
   así. Se prueban las tres formas: las tres exigen conocer el secreto, y la que
   acierta queda en el registro para dejar de adivinar en cuanto llegue el
   primer aviso real. */
function clavesCandidatas(secreto: string): { nombre: string; clave: Buffer }[] {
  const sin = secreto.replace(/^(ws_|whsec_)/, '')
  const out = [{ nombre: 'texto', clave: Buffer.from(secreto, 'utf8') }, { nombre: 'sin_prefijo', clave: Buffer.from(sin, 'utf8') }]
  try {
    const b = Buffer.from(sin, 'base64')
    if (b.length >= 16) out.push({ nombre: 'base64', clave: b })
  } catch { /* no era base64 */ }
  return out
}

const igual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** true si la firma corresponde al cuerpo crudo. Devuelve además qué forma de clave acertó. */
export function verificarFirma(crudo: string, id: string, ts: string, firma: string): { ok: boolean; forma?: string } {
  if (!ENV.WHOP.SECRETO || !id || !ts || !firma) return { ok: false }
  const base = `${id}.${ts}.${crudo}`
  // la cabecera puede traer varias firmas separadas por espacio: "v1,AAA v1,BBB"
  const dadas = firma.split(/\s+/).map((p) => (p.includes(',') ? p.slice(p.indexOf(',') + 1) : p)).filter(Boolean)
  for (const { nombre, clave } of clavesCandidatas(ENV.WHOP.SECRETO)) {
    const esperada = createHmac('sha256', clave).update(base).digest('base64')
    for (const d of dadas) if (igual(esperada, d)) return { ok: true, forma: nombre }
  }
  return { ok: false }
}

/** La fecha del aviso tiene que ser reciente: si no, es una repetición guardada. */
function fechaAceptable(ts: string): boolean {
  const n = Number(ts)
  const ms = Number.isFinite(n) ? (n > 1e12 ? n : n * 1000) : Date.parse(ts)
  if (!Number.isFinite(ms)) return false
  return Math.abs(Date.now() - ms) <= VENTANA_MS
}

/* ---------- lectura del aviso ---------- */

type Json = Record<string, unknown>
const obj = (v: unknown): Json | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null)
const txt = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** El correo del comprador, mirando los sitios donde Whop lo pone. */
function correoDe(d: Json): string | null {
  const u = obj(d.user)
  const meta = obj(d.metadata) ?? obj(obj(d.checkout_session)?.metadata)
  const c = txt(u?.email) ?? txt(d.user_email) ?? txt(d.email) ?? txt(meta?.veta_correo) ?? txt(obj(d.member)?.email)
  return c ? c.toLowerCase() : null
}

/** El id de la membresía, venga el aviso de un pago o de la membresía misma. */
function membresiaDe(tipo: string, d: Json): string | null {
  if (tipo.startsWith('membership.')) return txt(d.id) ?? txt(d.membership_id)
  return txt(d.membership_id) ?? txt(obj(d.membership)?.id) ?? txt(d.membership)
}

/** El plan de Whop al que corresponde el aviso. */
function planWhopDelAviso(d: Json): string | null {
  return txt(d.plan_id) ?? txt(obj(d.plan)?.id) ?? txt(obj(d.membership)?.plan_id)
}

/** Cuándo vuelve a cobrar Whop. Es la fecha con la que se reinicia el cupo. */
function renovacionDe(d: Json): string | null {
  const bruto = d.renewal_period_end ?? d.expires_at ?? obj(d.membership)?.renewal_period_end
  if (typeof bruto === 'number') return new Date(bruto > 1e12 ? bruto : bruto * 1000).toISOString()
  const s = txt(bruto)
  if (!s) return null
  const ms = Date.parse(s)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/* ---------- consulta a Whop (sólo cuando el aviso no alcanza) ---------- */

async function consultarWhop<T = Json>(ruta: string): Promise<T | null> {
  if (!ENV.WHOP.API_KEY) return null
  try {
    const r = await fetch(`https://api.whop.com${ruta}`, {
      headers: { Authorization: `Bearer ${ENV.WHOP.API_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!r.ok) { console.warn(`[pagos] whop ${ruta}: ${r.status}`); return null }
    return await r.json() as T
  } catch (e) {
    console.warn(`[pagos] whop ${ruta}:`, (e as Error).message)
    return null
  }
}

/** La membresía completa, para cuando el aviso llega sin correo ni plan. */
const traerMembresia = (id: string) => consultarWhop(`/v5/company/memberships/${encodeURIComponent(id)}`)

/* ---------- a quién corresponde ---------- */

interface Cuenta { id: string; email: string; creada: boolean }

async function porCorreo(correo: string): Promise<Cuenta | null> {
  const u = await bd.uno<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE LOWER(email) = ?', [correo.toLowerCase()])
  return u ? { id: u.id, email: u.email, creada: false } : null
}

/**
 * Crea la cuenta de quien pagó sin tenerla y le manda el enlace para elegir
 * contraseña. La contraseña inicial es azar que nadie ve ni recibe: la suya la
 * elige con el enlace, que vale una hora y un solo uso.
 */
async function crearCuenta(correo: string): Promise<Cuenta | null> {
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
  try {
    await auth.api.signUpEmail({ body: { email: correo, password: azar, name: correo.split('@')[0] } })
  } catch (e) {
    console.error('[pagos] no se pudo crear la cuenta de', correo, (e as Error).message)
    return await porCorreo(correo)
  }
  const u = await porCorreo(correo)
  if (!u) return null
  try {
    await auth.api.requestPasswordReset({ body: { email: correo, redirectTo: '/restablecer' } })
  } catch (e) {
    console.warn('[pagos] cuenta creada pero sin correo de contraseña:', (e as Error).message)
  }
  return { ...u, creada: true }
}

/** Quién es el dueño de este aviso: por metadato, por membresía conocida o por correo. */
async function resolverCuenta(d: Json, membresia: string | null, correo: string | null, crearSiFalta: boolean): Promise<Cuenta | null> {
  const meta = obj(d.metadata) ?? obj(obj(d.checkout_session)?.metadata)
  const idMeta = txt(meta?.veta_usuario_id)
  if (idMeta) {
    const u = await bd.uno<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE id = ?', [idMeta])
    if (u) return { id: u.id, email: u.email, creada: false }
  }
  if (membresia) {
    const m = await bd.uno<{ usuario_id: string }>('SELECT usuario_id FROM pago_membresia WHERE membresia_id = ?', [membresia])
    if (m) {
      const u = await bd.uno<{ id: string; email: string }>('SELECT id, email FROM "user" WHERE id = ?', [m.usuario_id])
      if (u) return { id: u.id, email: u.email, creada: false }
    }
  }
  if (correo) {
    const u = await porCorreo(correo)
    if (u) return u
    if (crearSiFalta) return await crearCuenta(correo)
  }
  return null
}

/* ---------- qué hace cada aviso ---------- */

type Accion = 'subir' | 'bajar'
/* El usuario lo pidió así: pago exitoso o membresía activa suben; cancelación,
   pago fallido o vencimiento bajan a Gratis. Un fallo de cobro que Whop después
   recupera se arregla solo: el `payment.succeeded` posterior vuelve a subir. */
const ACCIONES: Record<string, Accion> = {
  'payment.succeeded': 'subir',
  'membership.activated': 'subir',
  'membership.went_valid': 'subir',
  'membership.resumed': 'subir',
  'payment.failed': 'bajar',
  'membership.deactivated': 'bajar',
  'membership.went_invalid': 'bajar',
  'membership.cancelled': 'bajar',
  'membership.canceled': 'bajar',
  'membership.expired': 'bajar',
}

interface Resultado { resultado: string; detalle?: unknown; usuario_id?: string | null; plan?: string | null }

async function aplicar(tipo: string, d: Json, emitido: string | null): Promise<Resultado> {
  const accion = ACCIONES[tipo]
  if (!accion) return { resultado: 'ignorado', detalle: { motivo: 'tipo no manejado' } }

  const membresia = membresiaDe(tipo, d)
  let correo = correoDe(d)
  let planWhop = planWhopDelAviso(d)
  let renovacion = renovacionDe(d)

  // Si el aviso no trae lo necesario, se le pregunta a Whop por la membresía.
  if (membresia && (!correo || (accion === 'subir' && !planWhop))) {
    const m = obj(await traerMembresia(membresia))
    if (m) {
      correo = correo ?? correoDe(m)
      planWhop = planWhop ?? planWhopDelAviso(m)
      renovacion = renovacion ?? renovacionDe(m)
    }
  }

  // Sólo se crea cuenta cuando alguien paga: una baja nunca inventa un usuario.
  const cuenta = await resolverCuenta(d, membresia, correo, accion === 'subir')
  if (!cuenta) return { resultado: 'sin_cuenta', detalle: { membresia, correo, motivo: 'no se pudo identificar al usuario' } }

  // Un aviso viejo no pisa a uno nuevo.
  if (membresia && emitido) {
    const prev = await bd.uno<{ ultimo_evento: string | null }>('SELECT ultimo_evento FROM pago_membresia WHERE membresia_id = ?', [membresia])
    if (prev?.ultimo_evento && prev.ultimo_evento > emitido) {
      return { resultado: 'fuera_de_orden', usuario_id: cuenta.id, detalle: { membresia, emitido, ya_aplicado: prev.ultimo_evento } }
    }
  }

  const planPrevio = (await bd.uno<{ plan: string | null }>('SELECT plan FROM "user" WHERE id = ?', [cuenta.id]))?.plan ?? 'gratis'
  let plan: 'gratis' | 'base' | 'pro'
  if (accion === 'bajar') {
    plan = 'gratis'
  } else {
    const p = planDeWhop(planWhop)
    if (!p) return { resultado: 'plan_desconocido', usuario_id: cuenta.id, detalle: { plan_whop: planWhop, membresia, motivo: 'el identificador de plan no es ni Base ni Pro' } }
    plan = p
  }

  await bd.ejecutar('UPDATE "user" SET plan = ?, "updatedAt" = ? WHERE id = ?', [plan, ahora(), cuenta.id])
  olvidarPlan(cuenta.id)  // que la próxima petición de esa cuenta lea el plan nuevo, no el de hace un momento
  await asignarPlanExterno(cuenta.id, plan, {
    proveedor: 'whop',
    id_externo: membresia,
    renovacion: accion === 'subir' ? renovacion : null,
    estado: accion === 'subir' ? 'activa' : (tipo === 'membership.expired' || tipo === 'payment.failed' ? 'vencida' : 'cancelada'),
  })

  if (membresia) {
    await bd.ejecutar(`INSERT INTO pago_membresia (membresia_id, usuario_id, plan, estado, plan_whop, renovacion, ultimo_evento, actualizada)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(membresia_id) DO UPDATE SET usuario_id = excluded.usuario_id, plan = excluded.plan,
                  estado = excluded.estado, plan_whop = excluded.plan_whop, renovacion = excluded.renovacion,
                  ultimo_evento = excluded.ultimo_evento, actualizada = excluded.actualizada`,
      [membresia, cuenta.id, plan, accion === 'subir' ? 'activa' : 'baja', planWhop, renovacion, emitido, ahora()])
  }

  // Todo cambio de plan queda en el registro de acciones con el identificador de Whop.
  await registrarAccion({
    admin_id: 'whop', admin_email: 'whop@pagos',
    accion: accion === 'subir' ? 'usuario.plan.alta' : 'usuario.plan.baja',
    objetivo_tipo: 'usuario', objetivo_id: cuenta.id,
    detalle: { de: planPrevio, a: plan, evento: tipo, membresia, plan_whop: planWhop, renovacion, correo: cuenta.email, cuenta_creada: cuenta.creada },
  })

  console.log(`[pagos] ${tipo} · ${cuenta.email} · ${planPrevio} → ${plan}${cuenta.creada ? ' (cuenta nueva)' : ''}`)
  return { resultado: accion === 'subir' ? 'plan_subido' : 'plan_bajado', usuario_id: cuenta.id, plan, detalle: { de: planPrevio, a: plan, membresia, cuenta_creada: cuenta.creada } }
}

/* ---------- rutas ---------- */

/** El enlace de pago del plan, con el correo de la sesión si la hay. */
pagosApp.get('/checkout/:plan', (c) => {
  const plan = c.req.param('plan')
  if (plan !== 'base' && plan !== 'pro') return c.json({ error: 'plan_invalido' }, 400)
  const s = c.get('sesion')
  const url = enlaceCheckout(plan, s?.user.email ?? null)
  if (!url) return c.json({ error: 'cobro_no_configurado' }, 503)
  if (c.req.query('ir') === '1') return c.redirect(url, 302)
  return c.json({ url })
})

/**
 * El aviso de Whop. Contesta 200 a todo lo que esté bien firmado —incluso a lo
 * que no aplica— porque un código de error hace que Whop reintente, y reintentar
 * no arregla un aviso que no nos toca. Lo que no se pudo atender queda anotado
 * en `pago_evento` para mirarlo después.
 */
pagosApp.post('/whop', async (c) => {
  const crudo = await c.req.text()
  const id = c.req.header('webhook-id') ?? ''
  const ts = c.req.header('webhook-timestamp') ?? ''
  const firma = c.req.header('webhook-signature') ?? ''

  if (!ENV.WHOP.SECRETO) {
    console.error('[pagos] llegó un aviso y no hay VETA_WHOP_WEBHOOK_SECRETO: se descarta')
    return c.json({ error: 'sin_secreto' }, 503)
  }
  const v = verificarFirma(crudo, id, ts, firma)
  if (!v.ok) {
    console.warn(`[pagos] firma inválida · id ${id || '(sin id)'}`)
    return c.json({ error: 'firma_invalida' }, 401)
  }
  if (!fechaAceptable(ts)) {
    console.warn(`[pagos] aviso fuera de ventana · id ${id} · ts ${ts}`)
    return c.json({ error: 'fuera_de_ventana' }, 401)
  }

  let cuerpo: Json
  try { cuerpo = JSON.parse(crudo) as Json } catch { return c.json({ error: 'cuerpo_ilegible' }, 400) }

  const tipo = txt(cuerpo.type) ?? txt(cuerpo.action) ?? txt(cuerpo.event) ?? 'desconocido'
  const idEvento = txt(cuerpo.id) ?? id
  const emitido = txt(cuerpo.timestamp)
  const d = obj(cuerpo.data) ?? {}
  const membresia = membresiaDe(tipo, d)

  // Idempotencia: la llave primaria es el id del mensaje. Si ya estaba, no se repite.
  const puesto = await bd.ejecutar(
    `INSERT INTO pago_evento (id, tipo, membresia_id, usuario_id, plan, emitido, recibido, resultado, detalle)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, 'en_curso', NULL) ON CONFLICT(id) DO NOTHING`,
    [idEvento, tipo, membresia, emitido, ahora()])
  if (puesto.cambios === 0) {
    console.log(`[pagos] repetido · ${tipo} · ${idEvento}`)
    return c.json({ ok: true, repetido: true })
  }

  let r: Resultado
  try {
    r = await aplicar(tipo, d, emitido)
  } catch (e) {
    console.error('[pagos] fallo aplicando', tipo, idEvento, e)
    r = { resultado: 'error', detalle: { mensaje: (e as Error).message } }
  }

  await bd.ejecutar('UPDATE pago_evento SET usuario_id = ?, plan = ?, resultado = ?, detalle = ? WHERE id = ?',
    [r.usuario_id ?? null, r.plan ?? null, r.resultado, JSON.stringify({ firma: v.forma, ...(r.detalle as Json ?? {}) }), idEvento])

  // Un fallo nuestro sí merece reintento: Whop lo vuelve a mandar y la llave ya
  // no estorba porque la fila queda marcada como error y se puede reprocesar.
  if (r.resultado === 'error') {
    await bd.ejecutar('DELETE FROM pago_evento WHERE id = ? AND resultado = ?', [idEvento, 'error'])
    return c.json({ error: 'error_interno' }, 500)
  }
  return c.json({ ok: true, resultado: r.resultado })
})
