/* ============================================================================
   Analiza tu moneda (spec §2.1 y §5).

   Determinista: instantáneo, gratis para todos, no consume cupo. Profundo:
   consume cupo (base 2, pro 6), pasa por el motor y el resultado es del
   usuario de inmediato; además cae en la bandeja por si vale publicarlo.
   El sistema NUNCA dice "es gema": eso es de la bandeja.

   La web no habla con el motor directamente: habla con `motor` (motor.ts),
   espeja el progreso en la tabla `solicitud` y desde ahí sirve al cliente.
   Un pedido que falla o queda bloqueado devuelve el cupo.
   ========================================================================== */
import { Hono } from 'hono'
import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { bd, ahora, registrarAccion } from './db.ts'
import { ENV } from './entorno.ts'
import { sesionDe, type Sesion } from './auth.ts'
import { rolDe, puede, planMinimo, type Rol } from '../src/lib/matriz.ts'
import { motor, type Solicitud, type Progreso, type EstadoSolicitud } from './motor.ts'
import { cupoDe, reservar, devolver, hayMargen, gastoMes, fijarTope, type Cupo } from './cupo.ts'
import { esContrato } from './resolver.ts'

type Vars = { sesion: Sesion | null; rol: Rol }
export const analizarApp = new Hono<{ Variables: Vars }>()

interface FilaSolicitud {
  id: string; usuario_id: string | null; usuario_email: string | null; simbolo: string; nombre: string | null; nivel: 'determinista' | 'profundo'; origen: string
  estado: EstadoSolicitud; etapa: string | null; avance: number | null; detalle: string | null; etapas_hechas: string; resultado: string | null; fallo: string | null; verificador: string | null
  consume_cupo: number; cupo_periodo: string | null; costo_real_usd: number; motor: string; creada: string; iniciada: string | null; terminada: string | null; actualizada: string; vista: number; enviada: number
}
const nuevoId = () => `sol-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(3).toString('hex')}`
const TERMINAL: EstadoSolicitud[] = ['listo', 'fallido', 'bloqueado']

async function cupoDeSesion(s: Sesion | null, rol: Rol): Promise<Cupo | null> {
  if (!s) return null
  return cupoDe(s.user.id, rol === 'admin' ? 'pro' : (s.user.plan ?? 'gratis'), rol === 'admin')
}
const cupoSerializable = (c: Cupo | null) => (c ? { ...c, restantes: c.ilimitado ? null : c.restantes } : null)

/** Lo que el cliente ve de una solicitud: sin ids internos de más, con el resultado si terminó. */
async function vistaSolicitud(f: FilaSolicitud, conResultado = true) {
  return {
    id: f.id, simbolo: f.simbolo, nombre: f.nombre, nivel: f.nivel, origen: f.origen, estado: f.estado, etapa: f.etapa, avance: f.avance, detalle: f.detalle,
    etapas_hechas: JSON.parse(f.etapas_hechas) as string[], consume_cupo: !!f.consume_cupo, motor: f.motor,
    creada: f.creada, iniciada: f.iniciada, terminada: f.terminada, actualizada: f.actualizada, vista: !!f.vista,
    fallo: f.fallo ? JSON.parse(f.fallo) : null, verificador: f.verificador ? JSON.parse(f.verificador) : null,
    resultado: conResultado && f.resultado ? JSON.parse(f.resultado) : null,
    tier: f.resultado ? (JSON.parse(f.resultado) as { tier?: string }).tier ?? null : null,
    enviada: !!f.enviada,
    posicion_cola: f.estado === 'en_cola' ? (await bd.uno("SELECT COUNT(*) AS n FROM solicitud WHERE nivel = 'profundo' AND estado = 'en_cola' AND creada <= ?", [f.creada]) as { n: number }).n : null,
  }
}

/* ---------- espejo del progreso: el motor manda, la tabla copia ---------- */
async function aplicarProgreso(f: FilaSolicitud, p: Progreso) {
  const terminaba = TERMINAL.includes(f.estado); const termina = TERMINAL.includes(p.estado)
  await bd.ejecutar(`UPDATE solicitud SET estado = ?, etapa = ?, avance = ?, detalle = ?, etapas_hechas = ?, resultado = ?, fallo = ?, verificador = ?, costo_real_usd = ?, iniciada = COALESCE(iniciada, ?), terminada = ?, actualizada = ? WHERE id = ?`, [p.estado, p.etapa, p.avance, p.detalle, JSON.stringify(p.etapas_hechas), p.resultado ? JSON.stringify(p.resultado) : null, p.fallo ? JSON.stringify(p.fallo) : null, p.verificador ? JSON.stringify(p.verificador) : null, p.costo_real_usd ?? 0, p.iniciado, p.terminado, ahora(), f.id])
  if (termina && !terminaba) {
    // consumo real y cupo: sólo el que termina bien lo consume (spec §5.6)
    const consumio = p.estado === 'listo' && !!f.consume_cupo
    if (!consumio && f.consume_cupo && f.usuario_id && f.cupo_periodo) await devolver(f.usuario_id, f.cupo_periodo)
    await bd.ejecutar('UPDATE uso_analisis SET consumio_cupo = ?, costo_real_usd = ?, resultado = ? WHERE usuario_id = ? AND simbolo = ? AND tipo = ? AND resultado = ?', [consumio ? 1 : 0, p.costo_real_usd ?? 0, p.estado, f.usuario_id ?? 'visitante', f.simbolo, f.nivel, `pendiente:${f.id}`])
    if (f.usuario_id) {
      const detalle = JSON.stringify({ simbolo: f.simbolo, estado: p.estado, solicitud_id: f.id, tier: (p.resultado as { tier?: string } | null)?.tier ?? null })
      await bd.ejecutar("INSERT INTO alerta (usuario_id, tipo, gema_id, fecha, leida, detalle) VALUES (?, 'analisis_listo', ?, ?, 0, ?) ON CONFLICT DO NOTHING", [f.usuario_id, f.id, ahora(), detalle])
    }
  }
}

const SIN_REGISTRO_MS = 60_000
async function sincronizarUna(f: FilaSolicitud): Promise<FilaSolicitud> {
  if (TERMINAL.includes(f.estado)) return f
  if (f.estado === 'en_cola' && !f.enviada) { await intentarArrancar(f); return await bd.uno('SELECT * FROM solicitud WHERE id = ?', [f.id]) as FilaSolicitud }
  try {
    const p = await motor.progreso(f.id)
    if (p) await aplicarProgreso(f, p)
    else if (Date.now() - Date.parse(f.iniciada ?? f.creada) > SIN_REGISTRO_MS) {
      // el motor no tiene registro del pedido (se reinició, o nunca lo tomó): no se deja al usuario esperando
      await aplicarProgreso(f, { solicitud_id: f.id, estado: 'fallido', etapa: f.etapa as Progreso['etapa'], avance: null, detalle: 'El pedido se perdió.', etapas_hechas: JSON.parse(f.etapas_hechas), iniciado: f.iniciada, actualizado: ahora(), terminado: ahora(), costo_real_usd: 0, resultado: null, fallo: { codigo: 'motor_no_disponible', texto: 'El sistema de análisis perdió el registro de este pedido. No se descontó: podés pedirlo de nuevo.' }, verificador: null })
    }
  } catch (e) { console.warn('[analizar] progreso', f.id, (e as Error).message) }
  return await bd.uno('SELECT * FROM solicitud WHERE id = ?', [f.id]) as FilaSolicitud
}

/** Los pedidos en cola arrancan cuando hay margen bajo el tope (spec §5.7). */
async function intentarArrancar(f: FilaSolicitud) {
  if (!(await hayMargen())) return
  const sol: Solicitud = { id: f.id, nivel: 'profundo', simbolo: f.simbolo, usuario: f.usuario_id ? { id: f.usuario_id, email: f.usuario_email ?? '', plan: '' } : null, origen: f.origen, fecha: f.creada, consume_cupo: !!f.consume_cupo }
  try {
    await motor.solicitarProfundo(sol)
    // el motor ya lo tiene; lo que diga su progreso manda (puede dejarlo en cola: el lanzamiento es manual)
    await bd.ejecutar("UPDATE solicitud SET enviada = 1, iniciada = ?, actualizada = ? WHERE id = ?", [ahora(), ahora(), f.id])
    const p = await motor.progreso(f.id).catch(() => null)
    if (p) await aplicarProgreso({ ...f, enviada: 1 }, p)
    else await bd.ejecutar("UPDATE solicitud SET estado = 'en_curso', etapa = 'recolectando', detalle = 'Arrancando.' WHERE id = ?", [f.id])
  } catch (e) {
    await aplicarProgreso(f, { solicitud_id: f.id, estado: 'fallido', etapa: null, avance: null, detalle: 'No se pudo pedir el análisis.', etapas_hechas: [], iniciado: null, actualizado: ahora(), terminado: ahora(), costo_real_usd: 0, resultado: null, fallo: { codigo: 'motor_no_disponible', texto: (e as Error).message === 'no_encontrada' ? 'Esa moneda no está entre las que cubrimos.' : 'El sistema de análisis no respondió al pedido.' }, verificador: null })
  }
}

/** Cada 3 s se espejan los pedidos vivos: el cupo se devuelve y la alerta se crea aunque el usuario se haya ido. */
export async function sincronizarVivas() {
  const vivas = await bd.todos("SELECT * FROM solicitud WHERE estado IN ('en_cola', 'en_curso')") as FilaSolicitud[]
  for (const f of vivas) await sincronizarUna(f)
}
setInterval(() => { sincronizarVivas().catch((e) => console.warn('[analizar] sync', e.message)) }, 3000)

/* ---------- la cola hacia el motor (archivo): lo mismo que se manda por HTTP, para el que la prefiera ---------- */
function encolar(sol: Solicitud) {
  try { mkdirSync(ENV.BASE_CONTENIDO, { recursive: true }); appendFileSync(resolve(ENV.BASE_CONTENIDO, 'cola-web.jsonl'), JSON.stringify({ tipo: 'analisis_solicitado', ...sol }) + '\n') } catch (e) { console.warn('[analizar] cola-web:', (e as Error).message) }
}

/* ======================= rutas ======================= */
analizarApp.get('/universo', async (c) => c.json({ monedas: await motor.universo(), motor: motor.nombre }))

/** §9.1: qué monedas pueden ser lo que el usuario escribió. Una, varias o ninguna. */
analizarApp.post('/resolver', async (c) => {
  const { consulta } = await c.req.json().catch(() => ({})) as { consulta?: string }
  const q = (consulta ?? '').trim()
  if (!q) return c.json({ error: 'consulta_requerida' }, 400)
  if (q.length > 80) return c.json({ error: 'consulta_larga' }, 400)
  try {
    const r = await motor.resolver(q)
    return c.json({ ...r, es_contrato: esContrato(q), puede_profundo: puede(c.get('rol'), 'analiza.profundo'), plan_minimo: planMinimo('analiza.profundo') })
  } catch (e) {
    console.warn('[analizar] resolver', (e as Error).message)
    return c.json({ error: 'motor_no_disponible', detalle: 'El sistema de análisis no respondió. Prueba en un momento.' }, 503)
  }
})

analizarApp.get('/cupo', async (c) => c.json({ cupo: cupoSerializable(await cupoDeSesion(c.get('sesion'), c.get('rol'))), plan_minimo: planMinimo('analiza.profundo'), puede_profundo: puede(c.get('rol'), 'analiza.profundo') }))

analizarApp.post('/determinista', async (c) => {
  const { simbolo } = await c.req.json().catch(() => ({})) as { simbolo?: string }
  const sym = (simbolo ?? '').trim().toUpperCase()
  if (!sym) return c.json({ error: 'simbolo_requerido' }, 400)
  const moneda = (await motor.universo()).find((m) => m.simbolo === sym) ?? null
  const r = await motor.determinista(sym).catch((e) => { console.warn('[analizar] determinista', e.message); return null })
  const s = c.get('sesion')
  if (!r || 'sin_datos' in r) {
    // tres casos distintos: no la cubrimos · la cubrimos pero no tiene datos todavía · el motor no respondió
    if (!moneda) return c.json({ error: 'no_encontrada', detalle: `${sym} no está entre las ${(await motor.universo()).length} monedas que cubrimos hoy (las de CoinGecko con volumen real).` }, 404)
    if (!r) return c.json({ error: 'motor_no_disponible', detalle: 'El sistema de análisis no respondió. Probá en un momento.' }, 503)
    return c.json({ id: null, lectura: null, sin_datos: { codigo: r.codigo, texto: r.texto }, moneda, cupo: cupoSerializable(await cupoDeSesion(s, c.get('rol'))), puede_profundo: puede(c.get('rol'), 'analiza.profundo'), plan_minimo: planMinimo('analiza.profundo') })
  }
  const lectura = r
  const id = nuevoId(); const t = ahora()
  await bd.ejecutar(`INSERT INTO solicitud (id, usuario_id, usuario_email, simbolo, nombre, nivel, origen, estado, etapa, avance, detalle, etapas_hechas, resultado, consume_cupo, costo_real_usd, motor, creada, iniciada, terminada, actualizada, vista)
              VALUES (?, ?, ?, ?, ?, 'determinista', 'analiza_tu_moneda', 'listo', NULL, 1, 'Listo.', '[]', ?, 0, 0, ?, ?, ?, ?, ?, 1)`, [id, s?.user.id ?? null, s?.user.email ?? null, sym, lectura.nombre, JSON.stringify(lectura), motor.nombre, t, t, t, t])
  await bd.ejecutar("INSERT INTO uso_analisis (usuario_id, simbolo, fecha, tipo, consumio_cupo, costo_real_usd, resultado) VALUES (?, ?, ?, 'determinista', 0, 0, 'listo')", [s?.user.id ?? 'visitante', sym, t])
  return c.json({ id, lectura, sin_datos: null, moneda, cupo: cupoSerializable(await cupoDeSesion(s, c.get('rol'))), puede_profundo: puede(c.get('rol'), 'analiza.profundo'), plan_minimo: planMinimo('analiza.profundo') })
})

analizarApp.post('/profundo', async (c) => {
  const s = c.get('sesion'); const rol = c.get('rol')
  if (!s) return c.json({ error: 'sin_sesion' }, 401)
  if (!puede(rol, 'analiza.profundo')) return c.json({ error: 'sin_acceso', seccion: 'analiza.profundo', plan_minimo: planMinimo('analiza.profundo') }, 403)
  const { simbolo } = await c.req.json().catch(() => ({})) as { simbolo?: string }
  const sym = (simbolo ?? '').trim().toUpperCase()
  if (!sym) return c.json({ error: 'simbolo_requerido' }, 400)
  const moneda = (await motor.universo()).find((m) => m.simbolo === sym)
  if (!moneda) return c.json({ error: 'no_encontrada', detalle: `${sym} no está entre las monedas que cubrimos.` }, 404)
  // §9.2: si el motor dice que no es analizable, no se pide y no se toca el cupo.
  if (moneda.analizable === false) {
    return c.json({ error: 'no_analizable', detalle: moneda.motivo_no_analizable || `${sym} no tiene datos suficientes para un análisis que valga la pena. No se descontó nada.` }, 422)
  }
  const viva = await bd.uno("SELECT id FROM solicitud WHERE usuario_id = ? AND simbolo = ? AND nivel = 'profundo' AND estado IN ('en_cola','en_curso')", [s.user.id, sym]) as { id: string } | undefined
  if (viva) return c.json({ error: 'ya_en_curso', detalle: 'Ya hay un análisis de esa moneda en marcha.', id: viva.id }, 409)
  const cupo = (await cupoDeSesion(s, rol))!
  const consume = !cupo.ilimitado
  if (consume && cupo.restantes <= 0) return c.json({ error: 'sin_cupo', detalle: `Usaste los ${cupo.incluidos} análisis del ciclo.`, cupo: cupoSerializable(cupo) }, 402)
  const id = nuevoId(); const t = ahora()
  const enCola = !(await hayMargen())
  await bd.ejecutar(`INSERT INTO solicitud (id, usuario_id, usuario_email, simbolo, nombre, nivel, origen, estado, etapa, avance, detalle, etapas_hechas, consume_cupo, cupo_periodo, costo_real_usd, motor, creada, actualizada, vista, enviada)
              VALUES (?, ?, ?, ?, ?, 'profundo', 'analiza_tu_moneda', 'en_cola', NULL, NULL, ?, '[]', ?, ?, 0, ?, ?, ?, 0, 0)`, [id, s.user.id, s.user.email, sym, moneda.nombre, enCola ? 'La plataforma llegó a su tope mensual de gasto: tu pedido queda en cola y arranca en cuanto se libere.' : 'En cola.', consume ? 1 : 0, cupo.periodo, motor.nombre, t, t])
  if (consume) await reservar(s.user.id, cupo.periodo)
  await bd.ejecutar("INSERT INTO uso_analisis (usuario_id, simbolo, fecha, tipo, consumio_cupo, costo_real_usd, resultado) VALUES (?, ?, ?, 'profundo', ?, 0, ?)", [s.user.id, sym, t, consume ? 1 : 0, `pendiente:${id}`])
  const sol: Solicitud = { id, nivel: 'profundo', simbolo: sym, id_coingecko: moneda.id_coingecko, usuario: { id: s.user.id, email: s.user.email, plan: s.user.plan ?? 'gratis' }, origen: 'analiza_tu_moneda', fecha: t, consume_cupo: consume }
  encolar(sol)
  const f = await bd.uno('SELECT * FROM solicitud WHERE id = ?', [id]) as FilaSolicitud
  if (!enCola) await intentarArrancar(f)
  const f2 = await bd.uno('SELECT * FROM solicitud WHERE id = ?', [id]) as FilaSolicitud
  return c.json({ id, solicitud: await vistaSolicitud(f2, false), cupo: cupoSerializable(await cupoDeSesion(s, rol)), en_cola: enCola })
})

/** Mis pedidos (los profundos y los deterministas recientes). */
analizarApp.get('/solicitudes', async (c) => {
  const s = c.get('sesion'); if (!s) return c.json({ solicitudes: [] })
  const filas = await bd.todos('SELECT * FROM solicitud WHERE usuario_id = ? ORDER BY creada DESC LIMIT 60', [s.user.id]) as FilaSolicitud[]
  return c.json({ solicitudes: await Promise.all(filas.map((f) => vistaSolicitud(f, false))) })
})

/** Vivas y terminadas sin ver: para el aviso en la barra. */
analizarApp.get('/activas', async (c) => {
  const s = c.get('sesion'); if (!s) return c.json({ activas: [], sin_ver: [] })
  const vivas = await bd.todos("SELECT * FROM solicitud WHERE usuario_id = ? AND nivel = 'profundo' AND estado IN ('en_cola','en_curso') ORDER BY creada", [s.user.id]) as FilaSolicitud[]
  const activas = []; for (const f of vivas) activas.push(await vistaSolicitud(await sincronizarUna(f), false))
  const sinVer = await bd.todos("SELECT * FROM solicitud WHERE usuario_id = ? AND nivel = 'profundo' AND estado IN ('listo','fallido','bloqueado') AND vista = 0 ORDER BY terminada DESC LIMIT 5", [s.user.id]) as FilaSolicitud[]
  return c.json({ activas: activas.filter((a) => !TERMINAL.includes(a.estado)), sin_ver: await Promise.all(sinVer.map((f) => vistaSolicitud(f, false))) })
})

analizarApp.get('/solicitudes/:id', async (c) => {
  const s = c.get('sesion'); const rol = c.get('rol')
  let f = await bd.uno('SELECT * FROM solicitud WHERE id = ?', [c.req.param('id')]) as FilaSolicitud | undefined
  if (!f) return c.json({ error: 'no_encontrado' }, 404)
  const mia = !!s && f.usuario_id === s.user.id
  if (!mia && rol !== 'admin' && f.nivel === 'profundo') return c.json({ error: 'sin_acceso' }, 403)
  f = await sincronizarUna(f)
  return c.json({ solicitud: await vistaSolicitud(f, true), cupo: cupoSerializable(await cupoDeSesion(s, rol)) })
})

analizarApp.post('/solicitudes/:id/vista', async (c) => {
  const s = c.get('sesion'); if (!s) return c.json({ error: 'sin_sesion' }, 401)
  await bd.ejecutar('UPDATE solicitud SET vista = 1 WHERE id = ? AND usuario_id = ?', [c.req.param('id'), s.user.id])
  await bd.ejecutar("UPDATE alerta SET leida = 1 WHERE usuario_id = ? AND tipo = 'analisis_listo' AND gema_id = ?", [s.user.id, c.req.param('id')])
  return c.json({ ok: true })
})

/* ======================= admin: consumo ======================= */
type VarsAdmin = { sesion: Sesion; admin: { id: string; email: string } }
export const consumoAdmin = new Hono<{ Variables: VarsAdmin }>()
consumoAdmin.use('*', async (c, next) => {
  const s = await sesionDe(c.req.raw.headers)
  if (!s || s.session.impersonatedBy || rolDe(s.user) !== 'admin') return c.json({ error: 'sin_acceso' }, 403)
  c.set('sesion', s); c.set('admin', { id: s.user.id, email: s.user.email }); await next()
})
consumoAdmin.get('/', async (c) => {
  await sincronizarVivas()
  const mes = await gastoMes()
  const porUsuario = await bd.todos(`SELECT s.usuario_id, s.usuario_email, u.plan,
      SUM(CASE WHEN s.nivel = 'profundo' THEN 1 ELSE 0 END) AS profundos,
      SUM(CASE WHEN s.nivel = 'determinista' THEN 1 ELSE 0 END) AS deterministas,
      SUM(CASE WHEN s.nivel = 'profundo' AND s.estado = 'listo' THEN 1 ELSE 0 END) AS listos,
      SUM(CASE WHEN s.estado IN ('fallido','bloqueado') THEN 1 ELSE 0 END) AS sin_terminar,
      COALESCE(SUM(s.costo_real_usd), 0) AS costo_real_usd, MAX(s.creada) AS ultimo
    FROM solicitud s LEFT JOIN "user" u ON u.id = s.usuario_id WHERE s.usuario_id IS NOT NULL GROUP BY s.usuario_id, s.usuario_email, u.plan ORDER BY costo_real_usd DESC, profundos DESC`) as Record<string, unknown>[]
  const conCupo = await Promise.all(porUsuario.map(async (u) => ({ ...u, cupo: u.usuario_id ? cupoSerializable(await cupoDe(String(u.usuario_id), String(u.plan ?? 'gratis'))) : null })))
  const solicitudes = await Promise.all((await bd.todos<FilaSolicitud>("SELECT * FROM solicitud WHERE nivel = 'profundo' ORDER BY creada DESC LIMIT 80")).map(async (f) => ({ ...(await vistaSolicitud(f, false)), usuario_email: f.usuario_email, costo_real_usd: f.costo_real_usd })))
  const visitantes = (await bd.uno("SELECT COUNT(*) AS n FROM solicitud WHERE usuario_id IS NULL") as { n: number }).n
  const porMes = await bd.todos("SELECT substr(creada, 1, 7) AS mes, COUNT(*) AS n, COALESCE(SUM(costo_real_usd), 0) AS costo FROM solicitud WHERE nivel = 'profundo' GROUP BY mes ORDER BY mes DESC LIMIT 6")
  const cola = await Promise.all((await bd.todos<FilaSolicitud>("SELECT * FROM solicitud WHERE nivel = 'profundo' AND estado = 'en_cola' ORDER BY creada")).map(async (f) => ({ ...(await vistaSolicitud(f, false)), usuario_email: f.usuario_email })))
  return c.json({ mes, por_usuario: conCupo, solicitudes, cola, visitantes_determinista: visitantes, por_mes: porMes, motor: motor.nombre, motor_url: ENV.MOTOR === 'http' ? ENV.MOTOR_URL : null, costo_estimado: ENV.COSTO_ESTIMADO_USD })
})
consumoAdmin.patch('/tope', async (c) => {
  const { tope } = await c.req.json().catch(() => ({})) as { tope?: number }
  const n = Number(tope)
  if (!Number.isFinite(n) || n < 0 || n > 100000) return c.json({ error: 'tope_invalido' }, 400)
  const antes = (await gastoMes()).tope
  await fijarTope(n)
  await registrarAccion({ admin_id: c.get('admin').id, admin_email: c.get('admin').email, accion: 'consumo.tope', objetivo_tipo: 'plataforma', objetivo_id: null, detalle: { de: antes, a: n } })
  await sincronizarVivas()
  return c.json({ ok: true, tope: n })
})
