import { luffy6b, pedir } from '../api6b'
import type { EventoOficina } from '../tipos6b'
import type { IdAgente } from './Escena'

/* ============================================================================
   Lo que pasó en la oficina las últimas 24 h, armado con los eventos de
   `GET /eventos/recientes` (CONTRATO-PANEL §8.5). De aquí salen la línea de tiempo
   de cada agente, la salud de cada fuente, los turnos de Luffy que se pueden
   repetir en la sala y cuánta actividad tuvo cada moneda (el grosor de su hilo).

   La API sólo pagina hacia adelante (`desde_id`), así que se pide de atrás hacia
   adelante en tandas de 1000 desde el último id, hasta pasar las 24 h o llegar al
   tope de tandas. En vivo, cada evento del SSE se suma con `anotar`.
   ========================================================================== */
/** Una llamada al modelo dentro de un turno (sólo en la línea de `/oficina/turnos/{mensaje_id}`, v2.3): cuánto costó cada vuelta. */
export interface PasoModelo { tipo: 'modelo'; id: number; hora: string; proceso: string; quien: string; modelo: string | null; iteracion: number | null; costo_usd: number | null }
export type Ev = (EventoOficina | PasoModelo) & { activos?: unknown; hilo_id?: string | null; paso?: string | null; grupo?: string }
const TANDA = 1000, TANDAS = 12, HORAS = 24

let eventos: Ev[] = []
let cargando: Promise<Ev[]> | null = null
let desde: string | null = null // la hora más vieja que alcanzó a traer (si no cubre las 24 h)
const oyentes = new Set<() => void>()

export function historia(ultimoId: number | null): Promise<Ev[]> {
  if (cargando) return cargando
  cargando = (async () => {
    if (!ultimoId) return eventos
    const limite = Date.now() - HORAS * 3600_000
    // de a tres tandas en paralelo, de la más nueva a la más vieja, hasta pasar las 24 h
    const tandas: Ev[][] = []
    let fin = false
    for (let k = 1; k <= TANDAS && !fin; k += 3) {
      const ks = [k, k + 1, k + 2].filter((x) => x <= TANDAS && ultimoId - (x - 1) * TANDA > 0)
      const rs = await Promise.all(ks.map((x) => luffy6b.eventosRecientes(Math.max(0, ultimoId - x * TANDA), TANDA).then((r) => (r.items as Ev[]).filter((e) => e.id <= ultimoId - (x - 1) * TANDA), () => null)))
      for (const items of rs) {
        if (!items) { fin = true; break }
        tandas.unshift(items)
        if (!items.length || Date.parse(items[0].hora) < limite || items[0].id <= 1) { fin = true; break }
      }
      if (!ks.length) fin = true
    }
    const viejos = tandas.flat().filter((e) => Date.parse(e.hora) >= limite)
    const vistos = new Set(eventos.map((e) => e.id))
    eventos = [...viejos.filter((e) => !vistos.has(e.id)), ...eventos].sort((a, b) => a.id - b.id)
    const primero = tandas.flat()[0]
    desde = primero && Date.parse(primero.hora) > limite + 30 * 60_000 ? primero.hora : null
    avisar()
    return eventos
  })()
  return cargando
}
/** Un evento que llegó en vivo. */
export function anotar(e: Ev) {
  if (e.tipo === 'latido' || typeof e.id !== 'number') return
  if (eventos.length && eventos[eventos.length - 1].id >= e.id) return
  eventos.push(e)
  const limite = Date.now() - HORAS * 3600_000
  if (eventos.length > 12_000 || Date.parse(eventos[0].hora) < limite - 3600_000) eventos = eventos.filter((x) => Date.parse(x.hora) >= limite)
  avisar()
}
let pendiente = 0
function avisar() { if (pendiente) return; pendiente = window.setTimeout(() => { pendiente = 0; oyentes.forEach((f) => f()) }, 400) }
export function alCambiar(f: () => void) { oyentes.add(f); return () => { oyentes.delete(f) } }
export const todos = () => eventos
/** Si la historia no alcanzó las 24 h, desde qué hora cubre. */
export const cubreDesde = () => desde

/* ---------- las monedas que nombra un evento ---------- */
const sinPar = (s: string) => s.toUpperCase().replace(/[-_/]?(USDT|USDC|USD|PERP)$/, '')
export function monedasDe(e: Ev): string[] {
  const out = new Set<string>()
  if (Array.isArray(e.activos)) for (const a of e.activos) if (typeof a === 'string' && a) out.add(sinPar(a))
  if (e.tipo === 'alerta' && e.activo) out.add(sinPar(e.activo))
  if ((e.tipo === 'propuesta' || e.tipo === 'orden') && typeof (e as { par?: unknown }).par === 'string') out.add(sinPar((e as { par: string }).par))
  return [...out]
}
/** La actividad de cada moneda: cuántos eventos la nombran, pesados por lo recientes (media vida de 2 h), y el último. */
export function actividad(ev: Ev[] = eventos): Map<string, { peso: number; ultima: number; n: number }> {
  const m = new Map<string, { peso: number; ultima: number; n: number }>(), ahora = Date.now()
  for (const e of ev) {
    const ms = monedasDe(e); if (!ms.length) continue
    const t = Date.parse(e.hora), w = Math.pow(0.5, (ahora - t) / 7_200_000)
    for (const s of ms) { const x = m.get(s) ?? { peso: 0, ultima: 0, n: 0 }; x.peso += w; x.ultima = Math.max(x.ultima, t); x.n++; m.set(s, x) }
  }
  return m
}

/* ---------- los pasos en llano (los mismos del chat y de Telegram: mugiwara/bot/progreso.py) ---------- */
const PASOS: [string, string][] = [
  ['evaluar_entrada', 'evaluando la entrada: riesgo, libro y niveles'], ['cuant_riesgo', 'midiendo el riesgo y los stops posibles'],
  ['cuant_microestructura', 'mirando el libro y la liquidez'], ['cuant_tecnico', 'revisando niveles técnicos'], ['convocar', 'convocando al equipo'],
  ['graficar', 'armando el gráfico'], ['motor_ficha', 'leyendo la ficha del motor'], ['motor_', 'consultando el motor'],
  ['exchange_', 'leyendo la cuenta y el precio'], ['derivados', 'revisando derivados y apalancamiento'], ['defillama', 'revisando ingresos y dinero depositado'],
  ['social_', 'leyendo el pulso en redes'], ['x_buscar', 'buscando en X'], ['web_search', 'buscando en internet'], ['web_buscar', 'buscando en internet'],
  ['web_fetch', 'leyendo una página'], ['leer_web', 'leyendo una página'], ['radar_', 'consultando el radar'], ['onchain', 'mirando la cadena'],
  ['memoria_', 'buscando en la memoria'], ['python_libre', 'calculando'], ['teoria_', 'anotando una teoría'], ['bitacora_', 'registrando en la bitácora'],
  ['proponer_', 'armando la propuesta'], ['gatillo', 'revisando los gatillos'], ['escalar_a_decision', 'pasando al modelo de decisión'],
  ['caja_', 'revisando la caja'], ['vigilancia_', 'revisando la lista de vigilancia'], ['universo', 'repasando las monedas'], ['cifras_', 'repasando las cifras recientes'],
]
export function pasoLlano(nombre: string): string {
  const n = (nombre ?? '').trim()
  for (const [p, f] of PASOS) if (n.startsWith(p)) return f
  return n ? `usando ${n.replace(/_/g, ' ')}` : 'trabajando'
}
const deMonedas = (e: Ev) => { const m = monedasDe(e); return m.length ? ` de ${m.slice(0, 2).join(' y ')}` : '' }
/** El paso de una herramienta: la frase que manda Mugiwara si viene (`paso`), o la nuestra, con la moneda si el evento la nombra. */
export const pasoDe = (e: Ev & { nombre?: string }) => (typeof e.paso === 'string' && e.paso ? e.paso : `${pasoLlano(e.nombre ?? '')}${deMonedas(e)}`)

export const NOMBRE_FUENTE: Record<string, string> = {
  x: 'X', telegram_fuente: 'Telegram', telegram: 'Telegram', binance: 'Binance', upbit: 'Upbit', bithumb: 'Bithumb', coinbase: 'Coinbase', snapshot: 'Snapshot',
  tally: 'Tally', binance_futures: 'Binance Futures', coinalyze: 'Coinalyze', defillama: 'DefiLlama', bingx: 'BingX', motor_veta: 'Motor VETA', web: 'la web', helius: 'Helius', blockscout: 'Blockscout',
}
export const fuenteLlana = (f: string) => NOMBRE_FUENTE[f] ?? f.replace(/_/g, ' ')
/** «en pausa 60 min tras un 429» se lee tal cual; «ok» o vacío no dicen nada. */
const detalleLlano = (d?: string | null) => (d && d !== 'ok' && d !== 'activo' ? d : '')
/** «sin TG_API_ID/TG_API_HASH», «sin TALLY_API_KEY»: la fuente está apagada a propósito, no falló. */
export const esApagada = (d?: string | null) => /^sin [A-Z_ /]+(\s*\(apagado\))?$/.test((d ?? '').trim())

/** El rótulo corto de lo que leyó la araña (o la fuente), para mostrar junto a la moneda o al puerto. */
export function rotuloDe(e: Ev): string | null {
  switch (e.tipo) {
    case 'fuente_leida': {
      const d = detalleLlano(e.detalle), m = monedasDe(e)
      if (!e.ok) return esApagada(e.detalle) ? `${fuenteLlana(e.fuente)}: apagada a propósito` : `${fuenteLlana(e.fuente)}: ${d || 'no respondió'}`
      if (e.fuente === 'x') return `X: ${d || `${e.n ?? 0} posts nuevos`}${m.length ? ` · ${m.slice(0, 3).join(', ')}` : ''}`
      return `${fuenteLlana(e.fuente)}: ${d || (e.n ? `${e.n} leídos` : 'al día')}`
    }
    case 'jev': {
      const c = (e as { clases?: Record<string, number> }).clases, m = monedasDe(e)
      const clases = c ? ` · ${Object.entries(c).filter(([, v]) => v).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(', ')}` : ''
      return `Jev: ${e.n ?? 0} publicacion${e.n === 1 ? '' : 'es'}${m.length ? ` de ${m[0]}` : ''}${clases}`
    }
    case 'radar_ciclo': return `radar ${e.modo}: ${e.n_candidatas} de ${e.n_evaluados}${monedasDe(e).length ? ` · ${monedasDe(e).slice(0, 3).join(', ')}` : ''}`
    case 'alerta': return `alerta ${e.severidad}${e.activo ? `: ${e.activo}` : ''}${e.tipo_alerta ? ` · ${e.tipo_alerta.replace(/_/g, ' ')}` : ''}`
    case 'propuesta': return `propuesta ${e.accion} ${e.par}`
    case 'orden': return `orden ${e.accion} · ${e.estado}`
    default: return null
  }
}

/* ---------- los turnos de Luffy ---------- */
export interface Turno {
  clave: string; hilo_id: string; desde: string; hasta: string | null; modo: string; canal: string; origen: string
  tipo_turno: string | null; costo_usd: number | null; duracion_s: number | null; herramientas: number | null; mensaje_id: number | null
  pasos: Ev[] // en orden: turno_abierto, herramientas, agentes, turno_cerrado
}
export function turnos(ev: Ev[] = eventos): Turno[] {
  const abiertos = new Map<string, Turno>(), out: Turno[] = []
  const agenteAbierto = new Map<string, Turno>()
  for (const e of ev) {
    if (e.tipo === 'turno_abierto') {
      const t: Turno = { clave: `t${e.id}`, hilo_id: e.hilo_id, desde: e.hora, hasta: null, modo: e.modo, canal: e.canal, origen: e.origen, tipo_turno: null, costo_usd: null, duracion_s: null, herramientas: null, mensaje_id: null, pasos: [e] }
      abiertos.set(e.hilo_id, t); out.push(t); continue
    }
    if (e.tipo === 'turno_cerrado') {
      const t = abiertos.get(e.hilo_id)
      if (t) { Object.assign(t, { hasta: e.hora, tipo_turno: e.tipo_turno, costo_usd: e.costo_usd, duracion_s: e.duracion_s, herramientas: e.herramientas, mensaje_id: e.mensaje_id }); t.pasos.push(e); abiertos.delete(e.hilo_id) }
      continue
    }
    const h = e.hilo_id
    if (e.tipo === 'agente_terminado') { const t = agenteAbierto.get(e.agente.toLowerCase()); if (t) { t.pasos.push(e); agenteAbierto.delete(e.agente.toLowerCase()) } continue }
    if (h && abiertos.has(h) && (e.tipo === 'herramienta' || e.tipo === 'agente_convocado' || e.tipo === 'propuesta')) {
      const t = abiertos.get(h)!; t.pasos.push(e)
      if (e.tipo === 'agente_convocado') agenteAbierto.set(e.agente.toLowerCase(), t)
    }
  }
  return out.reverse()
}
export const MODO_LLANO: Record<string, string> = { auto: 'conversación', chat: 'conversación', decision: 'decisión', caja: 'ciclo de la caja', gatillo: 'gatillo', terminal: 'desde la terminal' }
export const CANAL_LLANO: Record<string, string> = { telegram: 'Telegram', panel: 'el panel', cli: 'el sistema', sistema: 'el sistema' }

/* ---------- la línea de tiempo de cada agente ---------- */
export interface Linea { clave: string; hora: string; texto: string; herramienta?: string; costo?: number; duracion?: number; hilo?: string | null; mal?: boolean; turno?: Turno; n?: number }
const hora = (iso: string) => { const d = new Date(iso); d.setMinutes(0, 0, 0); return d.toISOString() }
export function lineaDe(a: IdAgente, ev: Ev[] = eventos): Linea[] {
  if (a === 'luffy') return turnos(ev).map((t) => ({ clave: t.clave, hora: t.desde, texto: `${MODO_LLANO[t.modo] ?? t.modo}${t.canal ? ` · por ${CANAL_LLANO[t.canal] ?? t.canal}` : ''}${t.hasta ? '' : ' · en curso'}`, costo: t.costo_usd ?? undefined, duracion: t.duracion_s ?? undefined, hilo: t.hilo_id, turno: t, n: t.pasos.filter((p) => p.tipo === 'herramienta').length }))
  if (a === 'jev') {
    // miles al día: una línea por hora
    const m = new Map<string, Linea>()
    for (const e of ev) if (e.tipo === 'jev') { const k = hora(e.hora); const l = m.get(k) ?? { clave: `j${k}`, hora: k, texto: '', costo: 0, n: 0, herramienta: e.proposito }; l.n = (l.n ?? 0) + (e.n ?? 0); l.costo = (l.costo ?? 0) + (e.costo_usd ?? 0); (l as Linea & { tandas?: number }).tandas = ((l as Linea & { tandas?: number }).tandas ?? 0) + 1; m.set(k, l) }
    return [...m.values()].map((l) => ({ ...l, texto: `${(l.n ?? 0).toLocaleString('es-ES')} publicaciones clasificadas en ${(l as Linea & { tandas?: number }).tandas} tandas` })).reverse()
  }
  if (a === 'crawler') {
    // las lecturas de cada fuente, juntas por hora; los ciclos del radar, uno por uno
    const out: Linea[] = [], m = new Map<string, Linea & { ok: number; mal_n: number; ultimo?: string; apagada?: boolean }>()
    for (const e of ev) {
      if (e.tipo === 'radar_ciclo') out.push({ clave: `r${e.id}`, hora: e.hora, texto: `radar ${e.modo}: ${e.n_candidatas} candidata${e.n_candidatas === 1 ? '' : 's'} de ${e.n_evaluados}`, duracion: e.duracion_s ?? undefined, costo: (e as { costo_usd?: number }).costo_usd ?? undefined, herramienta: e.modo === 'escaner' ? 'radar.correr' : 'radar.correr_squeeze' })
      if (e.tipo === 'fuente_leida') {
        const g = e.grupo ?? e.fuente, k = `${hora(e.hora)}|${g}`
        const l: Linea & { ok: number; mal_n: number; ultimo?: string; apagada?: boolean } = m.get(k) ?? { clave: `f${e.id}`, hora: e.hora, texto: '', herramienta: g, ok: 0, mal_n: 0, n: 0 }
        if (e.ok) l.ok++; else if (esApagada(e.detalle)) l.apagada = true; else { l.mal_n++; l.ultimo = `${g === e.fuente ? '' : `${fuenteLlana(e.fuente)}: `}${detalleLlano(e.detalle) || 'no respondió'}` }
        l.n = (l.n ?? 0) + (e.n ?? 0); l.hora = e.hora; m.set(k, l)
      }
    }
    for (const l of m.values()) out.push({ ...l, texto: `${l.herramienta === 'listados' ? 'listados' : l.herramienta === 'gobernanza' ? 'votaciones' : fuenteLlana(l.herramienta ?? '')}: ${l.apagada && !l.ok && !l.mal_n ? 'apagada a propósito, sin credenciales' : `${l.ok + l.mal_n} lectura${l.ok + l.mal_n === 1 ? '' : 's'}${l.n ? ` · ${l.n.toLocaleString('es-ES')} datos` : ''}${l.ultimo ? ` · ${l.ultimo}` : ''}`}`, mal: l.mal_n > 0 && l.ok === 0 })
    return out.sort((x, y) => Date.parse(y.hora) - Date.parse(x.hora))
  }
  // Cuant, Investigador y Estratega: cada encargo, con sus herramientas
  const out: Linea[] = []
  let actual: (Linea & { pasos: string[] }) | null = null
  for (const e of ev) {
    if (e.tipo === 'agente_convocado' && e.agente.toLowerCase() === a) { actual = { clave: `a${e.id}`, hora: e.hora, texto: 'encargo de Luffy', hilo: e.hilo_id, pasos: [] }; out.push(actual) }
    else if (e.tipo === 'herramienta' && e.quien.toLowerCase() === a) { if (actual) actual.pasos.push(e.nombre); else out.push({ clave: `h${e.id}`, hora: e.hora, texto: pasoDe(e), herramienta: e.nombre, duracion: e.duracion_s, hilo: e.hilo_id ?? null, mal: !e.ok }) }
    else if (e.tipo === 'agente_terminado' && e.agente.toLowerCase() === a && actual) { actual.costo = e.costo_usd; actual.duracion = e.duracion_s; actual.mal = !e.ok; actual.texto = `encargo de Luffy${e.ok ? '' : ' · terminó con error'}`; actual = null }
  }
  return out.map((l) => ('pasos' in l && (l as { pasos: string[] }).pasos.length ? { ...l, herramienta: [...new Set((l as { pasos: string[] }).pasos)].join(', ') } : l)).reverse()
}

/* ---------- la salud de una fuente ---------- */
export interface Lectura { hora: string; ok: boolean; n: number | null; detalle: string }
export function lecturas(nombre: string, ev: Ev[] = eventos): Lectura[] {
  return ev.filter((e) => (e.tipo === 'fuente_leida' && (e.fuente === nombre || e.grupo === nombre)) || (e.tipo === 'herramienta' && e.fuente === nombre))
    .filter((e) => !(e.tipo === 'fuente_leida' && !e.ok && esApagada(e.detalle)))
    .map((e) => e.tipo === 'fuente_leida' ? { hora: e.hora, ok: e.ok, n: e.n ?? null, detalle: detalleLlano(e.detalle) } : { hora: e.hora, ok: (e as { ok: boolean }).ok, n: null, detalle: `consulta (${(e as { nombre: string }).nombre})` })
}
/** Las últimas `horas`, en tramos de media hora: sin lecturas, todas bien, alguna mal, todas mal. */
export function franjas(ls: Lectura[], horas = 24): ('vacio' | 'ok' | 'mixto' | 'mal')[] {
  const n = horas * 2, fin = Date.now(), out: ('vacio' | 'ok' | 'mixto' | 'mal')[] = Array(n).fill('vacio')
  const c = Array.from({ length: n }, () => ({ ok: 0, mal: 0 }))
  for (const l of ls) { const i = n - 1 - Math.floor((fin - Date.parse(l.hora)) / 1_800_000); if (i >= 0 && i < n) c[i][l.ok ? 'ok' : 'mal']++ }
  c.forEach((x, i) => { out[i] = !x.ok && !x.mal ? 'vacio' : !x.mal ? 'ok' : !x.ok ? 'mal' : 'mixto' })
  return out
}

/* ---------- la línea de un turno (v2.3: `GET /oficina/turnos/{mensaje_id}`) ----------
   Con ella la repetición va a ritmo real (`t_s`) y con el costo de cada llamada al modelo. Si no llega
   (un turno viejo, la ruta caída), la repetición se arma con los eventos, como antes. */
export interface LineaTurno { pasos: Ev[]; ts: number[]; costos: number[]; total: number | null; completo: boolean; nota: string | null }
export async function lineaTurno(t: Turno, signal?: AbortSignal): Promise<LineaTurno | null> {
  if (!t.mensaje_id) return null
  const r = await pedir<Record<string, unknown>>(`/oficina/turnos/${t.mensaje_id}`, { signal, tope: 8000 }).catch(() => null)
  const crudos = Array.isArray(r?.pasos) ? (r!.pasos as Record<string, unknown>[]) : []
  if (!r || !crudos.length) return null
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const pasos: Ev[] = [], ts: number[] = [], costos: number[] = []
  let id = -1
  const poner = (e: Ev, t_s: number, costo = 0) => { pasos.push(e); ts.push(t_s); costos.push(costo) }
  const abre = t.pasos.find((p) => p.tipo === 'turno_abierto'), cierra = t.pasos.find((p) => p.tipo === 'turno_cerrado')
  if (abre) poner(abre, 0)
  for (const p of crudos) {
    const base = { id: id--, hora: s(p.hora) ?? t.desde, proceso: 'api' }, t_s = Math.max(0, n(p.t_s) ?? 0), quien = s(p.quien) ?? 'luffy'
    if (p.tipo === 'modelo') poner({ ...base, tipo: 'modelo', quien, modelo: s(p.modelo), iteracion: n(p.iteracion), costo_usd: n(p.costo_usd) } as Ev, t_s, n(p.costo_usd) ?? 0)
    else if (p.tipo === 'herramienta') poner({ ...base, tipo: 'herramienta', nombre: s(p.nombre) ?? '', quien, ok: p.ok !== false, duracion_s: n(p.duracion_s) ?? 0, fuente: s(p.fuente), hilo_id: t.hilo_id, ...(Array.isArray(p.activos) ? { activos: p.activos } : {}) } as Ev, t_s)
    else if (p.tipo === 'agente_convocado') poner({ ...base, tipo: 'agente_convocado', agente: quien, hilo_id: t.hilo_id } as Ev, t_s)
    else if (p.tipo === 'agente_terminado') poner({ ...base, tipo: 'agente_terminado', agente: quien, costo_usd: n(p.costo_usd) ?? 0, duracion_s: n(p.duracion_s) ?? 0, ok: p.ok !== false } as Ev, t_s)
  }
  const dur = n(r.duracion_s) ?? Math.max(...ts, 0) + 1
  if (cierra) poner(cierra, Math.max(dur, ts[ts.length - 1] ?? 0))
  return { pasos, ts, costos, total: n(r.costo_usd), completo: r.completo !== false, nota: s(r.nota) }
}
