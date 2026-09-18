/* ============================================================================
   Votación semanal — exclusiva del plan PRO.

   El scanner baja mil monedas, descarta cientos por naturaleza, filtra por
   elegibilidad y se queda con las que dispararon una señal. Ese trabajo caro
   de descartar es el valor: la LISTA es lo exclusivo. Los PRO la ven con sus
   disparadores y métricas, votan una vez (sin cambio, con fecha) y la
   ganadora entra a la cola de análisis. Nada se dispara solo: cuesta dinero
   real, lo lanza el admin. El análisis resultante se publica para todos.

   La lista sale del ranking del scanner (base_contenido/scanner/candidatas-*.jsonl,
   una corrida). No se aceptan propuestas libres.
   ========================================================================== */
import { Hono } from 'hono'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { bd, ahora, registrarAccion } from './db.ts'
import { ENV } from './entorno.ts'
import { sesionDe, type Sesion } from './auth.ts'
import { rolDe, puede, type Rol } from '../src/lib/matriz.ts'
import * as contenido from './contenido.ts'

await bd.exec(`
CREATE TABLE IF NOT EXISTS votacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  semana TEXT NOT NULL UNIQUE,
  estado TEXT NOT NULL CHECK (estado IN ('abierta','cerrada')),
  abre TEXT NOT NULL,
  cierra TEXT NOT NULL,
  candidatas TEXT NOT NULL,
  corrida_scanner TEXT,
  ganadora TEXT,
  cerrada_en TEXT,
  cola_estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (cola_estado IN ('pendiente','lanzado')),
  lanzado_en TEXT,
  creada_por TEXT NOT NULL,
  creada_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS voto (
  votacion_id INTEGER NOT NULL,
  usuario_id TEXT NOT NULL,
  simbolo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  PRIMARY KEY (votacion_id, usuario_id)
);
`)

/* ---------- el ranking del scanner ---------- */
export interface Disparador { disparador: string; detalle: string; valor: number | null; fuente: string }
export interface Candidata {
  simbolo: string; nombre: string; id_coingecko?: string; carril: string; puntaje: number
  disparadores: Disparador[]; flags_riesgo: string[]; metricas: Record<string, unknown>; razon: string
}
interface Corrida { generado: string; embudo: Record<string, unknown> }

export function rankingScanner(): { archivo: string | null; corrida: Corrida | null; candidatas: Candidata[] } {
  const dir = resolve(ENV.BASE_CONTENIDO, 'scanner')
  if (!existsSync(dir)) return { archivo: null, corrida: null, candidatas: [] }
  const archivos = readdirSync(dir).filter((f) => /^candidatas-.*\.jsonl$/.test(f)).sort()
  const ultimo = archivos.at(-1)
  if (!ultimo) return { archivo: null, corrida: null, candidatas: [] }
  const filas = readFileSync(resolve(dir, ultimo), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const corrida = (filas.find((r) => r.tipo === 'corrida') ?? null) as Corrida | null
  const candidatas = filas.filter((r) => r.tipo !== 'corrida' && r.simbolo).map((r) => ({
    simbolo: r.simbolo, nombre: r.nombre, id_coingecko: r.id_coingecko, carril: r.carril, puntaje: Number(r.puntaje ?? 0),
    disparadores: r.disparadores ?? [], flags_riesgo: r.flags_riesgo ?? [], metricas: r.metricas ?? {}, razon: r.razon ?? '',
  })) as Candidata[]
  candidatas.sort((a, b) => b.puntaje - a.puntaje)
  return { archivo: ultimo, corrida, candidatas }
}

/** Los números del embudo, para contar sin humo cuánto se descartó. */
export function embudoDe(c: Corrida | null) {
  const e = (c?.embudo ?? {}) as Record<string, number>
  return {
    bajadas: e['1_bajadas_de_coingecko'] ?? null,
    excluidas: e['2_excluidas_por_naturaleza'] ?? null,
    elegibles: (e['3_elegibles_carril_a'] ?? 0) + (e['3_elegibles_carril_b'] ?? 0) || null,
    con_disparador: (e['5_con_disparador_carril_a'] ?? 0) + (e['5_con_disparador_carril_b'] ?? 0) || null,
    generado: c?.generado ?? null,
  }
}

/* ---------- lectura de una votación ---------- */
interface FilaVotacion { id: number; semana: string; estado: 'abierta' | 'cerrada'; abre: string; cierra: string; candidatas: string; corrida_scanner: string | null; ganadora: string | null; cerrada_en: string | null; cola_estado: 'pendiente' | 'lanzado'; lanzado_en: string | null; creada_por: string; creada_en: string }

async function conteo(id: number) {
  const filas = await bd.todos('SELECT simbolo, COUNT(*) AS n FROM voto WHERE votacion_id = ? GROUP BY simbolo', [id]) as { simbolo: string; n: number }[]
  return Object.fromEntries(filas.map((f) => [f.simbolo, f.n])) as Record<string, number>
}

/** El análisis o gema publicados de la ganadora, si salió después del cierre de la votación. */
async function informeDe(simbolo: string | null, desde: string | null) {
  if (!simbolo) return null
  const cands = [...contenido.gemasTodas(), ...(await contenido.analisisTodos())].filter((r) => r.simbolo === simbolo)
  const estados = await Promise.all(cands.map((r) => contenido.estadoPublicacion(r)))
  const todos = cands.filter((_, i) => estados[i].estado === 'aprobado')
  const r = todos.sort((a, b) => String(b.fecha_publicacion).localeCompare(String(a.fecha_publicacion)))[0]
  if (!r) return null
  if (desde && String(r.fecha_publicacion) < desde.slice(0, 10)) return null
  return { id: r.id, tipo: r.tipo, fecha_publicacion: r.fecha_publicacion, tier: r.tier }
}

async function vista(v: FilaVotacion, rol: Rol, usuarioId: string | null) {
  const candidatas = JSON.parse(v.candidatas) as Candidata[]
  const votos = await conteo(v.id)
  const total = Object.values(votos).reduce((s, n) => s + n, 0)
  const veLista = puede(rol, 'scanner.solicitar') // pro y admin
  const miVoto = usuarioId ? (await bd.uno('SELECT simbolo, fecha FROM voto WHERE votacion_id = ? AND usuario_id = ?', [v.id, usuarioId]) as { simbolo: string; fecha: string } | undefined) ?? null : null
  const base = {
    id: v.id, semana: v.semana, estado: v.estado, abre: v.abre, cierra: v.cierra, cerrada_en: v.cerrada_en,
    n_candidatas: candidatas.length, total_votos: total,
    ganadora: v.estado === 'cerrada' ? v.ganadora : null,
    cola_estado: v.cola_estado, lanzado_en: v.lanzado_en,
    informe: v.estado === 'cerrada' ? await informeDe(v.ganadora, v.cierra) : null,
    ganadora_nombre: v.estado === 'cerrada' ? (candidatas.find((c) => c.simbolo === v.ganadora)?.nombre ?? null) : null,
  }
  if (!veLista) {
    // base y gratis: perciben que hay algo, no lo alcanzan. Sin símbolos.
    return { ...base, veladas: candidatas.map((c) => ({ n_disparadores: c.disparadores.length, carril: c.carril, n_flags: c.flags_riesgo.length })) }
  }
  return { ...base, candidatas: candidatas.map((c) => ({ ...c, votos: votos[c.simbolo] ?? 0 })), mi_voto: miVoto }
}

/* ---------- rutas ---------- */
type Vars = { sesion: Sesion | null; rol: Rol }
export const votacionApp = new Hono<{ Variables: Vars }>()

votacionApp.get('/', async (c) => {
  const rol = c.get('rol'); const uid = c.get('sesion')?.user.id ?? null
  const activa = await bd.uno("SELECT * FROM votacion WHERE estado = 'abierta' ORDER BY cierra DESC LIMIT 1") as FilaVotacion | undefined
  const historico = await bd.todos("SELECT * FROM votacion WHERE estado = 'cerrada' ORDER BY cierra DESC LIMIT 20") as FilaVotacion[]
  const { corrida } = rankingScanner()
  return c.json({ activa: activa ? await vista(activa, rol, uid) : null, historico: await Promise.all(historico.map((h) => vista(h, rol, uid))), embudo: embudoDe(corrida), puede_votar: puede(rol, 'scanner.solicitar') })
})

votacionApp.post('/:id/voto', async (c) => {
  const s = c.get('sesion'); if (!s) return c.json({ error: 'sin_sesion' }, 401)
  if (!puede(c.get('rol'), 'scanner.solicitar')) return c.json({ error: 'sin_acceso', seccion: 'scanner.solicitar' }, 403)
  const v = await bd.uno('SELECT * FROM votacion WHERE id = ?', [Number(c.req.param('id'))]) as FilaVotacion | undefined
  if (!v) return c.json({ error: 'no_encontrado' }, 404)
  if (v.estado !== 'abierta' || v.cierra <= ahora()) return c.json({ error: 'cerrada', detalle: 'La votación ya cerró.' }, 409)
  const { simbolo } = await c.req.json().catch(() => ({})) as { simbolo?: string }
  const candidatas = JSON.parse(v.candidatas) as Candidata[]
  if (!simbolo || !candidatas.some((x) => x.simbolo === simbolo)) return c.json({ error: 'candidata_invalida', detalle: 'Sólo se vota entre las candidatas del scanner.' }, 400)
  const ya = await bd.uno('SELECT simbolo FROM voto WHERE votacion_id = ? AND usuario_id = ?', [v.id, s.user.id])
  if (ya) return c.json({ error: 'ya_voto', detalle: 'El voto es uno y no se cambia.' }, 409)
  await bd.ejecutar('INSERT INTO voto (votacion_id, usuario_id, simbolo, fecha) VALUES (?, ?, ?, ?)', [v.id, s.user.id, simbolo, ahora()])
  return c.json({ ok: true })
})

/* ---------- admin ---------- */
type VarsAdmin = { sesion: Sesion; admin: { id: string; email: string } }
export const votacionAdmin = new Hono<{ Variables: VarsAdmin }>()
votacionAdmin.use('*', async (c, next) => {
  const s = await sesionDe(c.req.raw.headers)
  if (!s || s.session.impersonatedBy || rolDe(s.user) !== 'admin') return c.json({ error: 'sin_acceso' }, 403)
  c.set('sesion', s); c.set('admin', { id: s.user.id, email: s.user.email }); await next()
})
const log = (c: { get: (k: 'admin') => { id: string; email: string } }, accion: string, id: string | null, detalle?: unknown) =>
  registrarAccion({ admin_id: c.get('admin').id, admin_email: c.get('admin').email, accion, objetivo_tipo: 'votacion', objetivo_id: id, detalle })

votacionAdmin.get('/ranking', (c) => { const r = rankingScanner(); return c.json({ archivo: r.archivo, embudo: embudoDe(r.corrida), candidatas: r.candidatas }) })

votacionAdmin.get('/', async (c) => {
  const todas = await bd.todos('SELECT * FROM votacion ORDER BY cierra DESC') as FilaVotacion[]
  return c.json({ votaciones: await Promise.all(todas.map(async (v) => ({ ...(await vista(v, 'admin', null)), votos_por_usuario: await bd.todos('SELECT v.simbolo, v.fecha, u.email FROM voto v JOIN "user" u ON u.id = v.usuario_id WHERE v.votacion_id = ? ORDER BY v.fecha', [v.id]) }))) })
})

votacionAdmin.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { semana?: string; abre?: string; cierra?: string; simbolos?: string[] }
  const semana = (body.semana ?? '').trim(); const simbolos = body.simbolos ?? []
  if (!/^\d{4}-W\d{2}$/.test(semana)) return c.json({ error: 'semana_invalida', detalle: 'Formato 2026-W38.' }, 400)
  if (simbolos.length < 2 || simbolos.length > 6) return c.json({ error: 'candidatas', detalle: 'Entre 2 y 6 candidatas.' }, 400)
  if (!body.cierra || Number.isNaN(Date.parse(body.cierra))) return c.json({ error: 'cierre_invalido' }, 400)
  const r = rankingScanner()
  const cands = simbolos.map((s) => r.candidatas.find((x) => x.simbolo === s)).filter(Boolean) as Candidata[]
  if (cands.length !== simbolos.length) return c.json({ error: 'fuera_del_ranking', detalle: 'Sólo se eligen candidatas del ranking del scanner: no se aceptan propuestas libres.' }, 400)
  if (await bd.uno("SELECT 1 FROM votacion WHERE estado = 'abierta'")) return c.json({ error: 'ya_hay_abierta', detalle: 'Cerrá la votación activa antes de abrir otra.' }, 409)
  try {
    const info = await bd.ejecutar('INSERT INTO votacion (semana, estado, abre, cierra, candidatas, corrida_scanner, creada_por, creada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', [semana, 'abierta', body.abre ?? ahora(), new Date(body.cierra).toISOString(), JSON.stringify(cands), r.archivo, c.get('admin').id, ahora()])
    const id = (info.filas[0] as { id: number }).id
    await log(c, 'votacion.crear', String(id), { semana, simbolos, cierra: body.cierra })
    return c.json({ ok: true, id })
  } catch (e) { return c.json({ error: 'no_se_pudo_crear', detalle: (e as Error).message }, 400) }
})

votacionAdmin.post('/:id/cerrar', async (c) => {
  const v = await bd.uno('SELECT * FROM votacion WHERE id = ?', [Number(c.req.param('id'))]) as FilaVotacion | undefined
  if (!v) return c.json({ error: 'no_encontrado' }, 404)
  if (v.estado === 'cerrada') return c.json({ error: 'ya_cerrada' }, 409)
  const cands = JSON.parse(v.candidatas) as Candidata[]
  const votos = await conteo(v.id)
  // ganadora: más votos; empate → mayor puntaje del scanner (el ranking desempata, no el admin)
  const orden = [...cands].sort((a, b) => (votos[b.simbolo] ?? 0) - (votos[a.simbolo] ?? 0) || b.puntaje - a.puntaje)
  const ganadora = orden[0]?.simbolo ?? null
  await bd.ejecutar("UPDATE votacion SET estado = 'cerrada', ganadora = ?, cerrada_en = ? WHERE id = ?", [ganadora, ahora(), v.id])
  await log(c, 'votacion.cerrar', String(v.id), { ganadora, votos })
  return c.json({ ok: true, ganadora, votos })
})

/** Lanzar = pedirle al motor que analice la ganadora. Cuesta dinero real: sólo a mano y queda registrado. */
votacionAdmin.post('/:id/lanzar', async (c) => {
  const v = await bd.uno('SELECT * FROM votacion WHERE id = ?', [Number(c.req.param('id'))]) as FilaVotacion | undefined
  if (!v) return c.json({ error: 'no_encontrado' }, 404)
  if (v.estado !== 'cerrada' || !v.ganadora) return c.json({ error: 'sin_ganadora', detalle: 'Primero se cierra la votación.' }, 409)
  if (v.cola_estado === 'lanzado') return c.json({ error: 'ya_lanzado' }, 409)
  const pedido = { tipo: 'analisis_solicitado', id: `sol-${ahora().slice(0, 10).replace(/-/g, '')}-vot${v.id}`, nivel: 'profundo', simbolo: v.ganadora, usuario: null, origen: 'votacion_semanal', fecha: ahora(), consume_cupo: false, semana: v.semana, solicitado_por: c.get('admin').email, votacion_id: v.id }
  try { mkdirSync(ENV.BASE_CONTENIDO, { recursive: true }); appendFileSync(resolve(ENV.BASE_CONTENIDO, 'cola-web.jsonl'), JSON.stringify(pedido) + '\n') } catch (e) { return c.json({ error: 'no_se_pudo_encolar', detalle: (e as Error).message }, 500) }
  await bd.ejecutar("UPDATE votacion SET cola_estado = 'lanzado', lanzado_en = ? WHERE id = ?", [ahora(), v.id])
  await log(c, 'votacion.lanzar', String(v.id), pedido)
  return c.json({ ok: true, pedido })
})
