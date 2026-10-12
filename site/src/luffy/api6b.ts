/* Cliente de la fase 6b sobre el puente /api/luffy/* (CONTRATO-PANEL.md v2.1, §8). */
import type { Propuesta } from './tipos'
import { conTope, esTope } from './api'
import type { AccionExchange, Bitacora, Caja, Candidatas, Cartera, Comisiones, CostoAmpliado, CurvaCapital, Declaracion, DiffManual, EventoOficina, FeedAlertas, FichaTerminal, Fills, Filtro, Gatillo, HiloTerminal, Informe, InformeItem, Manual, Modo, Modos, Movimiento, Oficina, Ordenes, Pagina, RespuestaPropuestas, Revision, Teoria, Universo } from './tipos6b'

const BASE = '/api/luffy'
export class ErrorLuffy6b extends Error {
  status: number; codigo: string; cuerpo: unknown
  constructor(s: number, c: string, t: string, cuerpo?: unknown) { super(t); this.status = s; this.codigo = c; this.cuerpo = cuerpo }
}
/* Todo pedido lleva tope (30 s): si el servidor no contesta, se corta y la vista ofrece reintentar,
   en vez de quedarse pegada hasta refrescar. */
async function pedir<T>(ruta: string, init: { metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; cuerpo?: unknown; signal?: AbortSignal; tope?: number } = {}): Promise<T> {
  let r: Response
  try {
    r = await fetch(`${BASE}${ruta}`, { method: init.metodo ?? (init.cuerpo !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', signal: conTope(init.signal, init.tope), headers: init.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}, body: init.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined })
  } catch (e) {
    if (esTope(e)) throw new ErrorLuffy6b(0, 'tope', 'El servidor de Luffy tardó demasiado en contestar. Reintenta en un momento.')
    throw e
  }
  if (!r.ok) {
    let codigo = String(r.status), texto = `HTTP ${r.status}`, cuerpo: unknown = null
    try {
      const j = await r.json() as { detail?: string | { codigo?: string; texto?: string; propuesta?: unknown }; error?: string; texto?: string }
      cuerpo = j
      if (typeof j.detail === 'string') texto = j.detail
      else if (j.detail) { codigo = j.detail.codigo ?? codigo; texto = j.detail.texto ?? texto }
      else if (j.error) { codigo = j.error; texto = j.texto ?? j.error }
    } catch { /* sin cuerpo */ }
    if (r.status === 404 && codigo === '404' && /^HTTP|no existe|Not Found/i.test(texto)) { codigo = 'no_encontrado'; texto = 'Esta parte de Luffy todavía no está en el servidor.' }
    throw new ErrorLuffy6b(r.status, codigo, texto, cuerpo)
  }
  return r.json() as Promise<T>
}
const qs = (o: Record<string, string | number | boolean | null | undefined>) => { const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''); return p.length ? `?${p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '' }
const FICHAS = new Map<string, { hasta: number; p: Promise<FichaTerminal>; ctl: AbortController; listo: boolean }>()
/** La última ficha que llegó de cada moneda, sin vencer: se pinta al instante mientras llega la nueva. */
const ULTIMAS = new Map<string, FichaTerminal>()
const claveFicha = (activo: string, rango: string) => `${activo.toUpperCase()}|${rango}`

export const luffy6b = {
  /* 8.1 */
  universo: (filtro: Filtro = 'todo', q = '', limite = 300) => pedir<Universo>(`/terminal/universo${qs({ filtro, q, limite })}`),
  /** La ficha se recuerda 45 s por activo y rango y lo último queda guardado sin vencer. Una ficha
      parcial (`pendiente`, v2.2) no se recuerda: se vuelve a pedir con `fresca`. */
  ficha(activo: string, rango = '90d', o: { fresca?: boolean } = {}): Promise<FichaTerminal> {
    const k = claveFicha(activo, rango); const m = FICHAS.get(k)
    if (!o.fresca && m && m.hasta > Date.now()) return m.p
    const ctl = new AbortController()
    const p = pedir<FichaTerminal>(`/terminal/${encodeURIComponent(activo.toUpperCase())}${qs({ rango })}`, { signal: ctl.signal, tope: 25_000 })
    const e = { hasta: Date.now() + 45_000, p, ctl, listo: false }
    p.then((f) => { e.listo = true; if (f.pendiente) e.hasta = 0; ULTIMAS.delete(k); ULTIMAS.set(k, f); if (ULTIMAS.size > 40) ULTIMAS.delete(ULTIMAS.keys().next().value!) }, () => { if (FICHAS.get(k) === e) FICHAS.delete(k) })
    if (FICHAS.size > 40) FICHAS.clear(); FICHAS.set(k, e); return p
  },
  fichaGuardada: (activo: string, rango = '90d') => ULTIMAS.get(claveFicha(activo, rango)) ?? null,
  /** La última ficha de esta moneda en cualquier rango: al cambiar de rango se ve algo mientras llega el nuevo. */
  fichaDeLaMoneda: (activo: string) => { const p = `${activo.toUpperCase()}|`; let f: FichaTerminal | null = null; for (const [k, v] of ULTIMAS) if (k.startsWith(p)) f = v; return f },
  /** Al cambiar de moneda: corta las fichas que siguen en vuelo (la anterior y las precargas), salvo la de `salvo`. */
  soltarFichas(salvo?: string) { const s = salvo ? `${salvo.toUpperCase()}|` : null; for (const [k, e] of FICHAS) if (!e.listo && (!s || !k.startsWith(s))) { e.ctl.abort(); FICHAS.delete(k) } },
  precargar(activo: string, rango = '90d') { if (luffy6b.fichaGuardada(activo, rango) || FICHAS.has(claveFicha(activo, rango))) return; void luffy6b.ficha(activo, rango).catch(() => {}) },
  hiloTerminal: (activo: string) => pedir<HiloTerminal>(`/terminal/${encodeURIComponent(activo.toUpperCase())}/hilo`, { cuerpo: {} }),

  /* 8.2 */
  cartera: (origen: 'pablo' | 'caja' = 'pablo') => pedir<Cartera>(`/cartera${qs({ origen })}`),
  curva: (origen: 'pablo' | 'caja', rango = '90d') => pedir<CurvaCapital>(`/cartera/curva${qs({ origen, rango })}`),
  movimientos: (origen: 'pablo' | 'caja' = 'pablo') => pedir<{ movimientos: Movimiento[] } | Movimiento[]>(`/cartera/movimientos${qs({ origen })}`),
  nuevoMovimiento: (m: Omit<Movimiento, 'id'>) => pedir<Movimiento>('/cartera/movimientos', { cuerpo: m }),
  borrarMovimiento: (id: number) => pedir<{ ok: boolean }>(`/cartera/movimientos/${id}`, { metodo: 'DELETE' }),
  declarar: (d: Declaracion) => pedir<Propuesta>('/posiciones/declarar', { cuerpo: { origen: 'pablo', ...d } }),
  ordenes: (estado: 'abiertas' | 'historial' = 'abiertas', limite = 100) => pedir<Ordenes>(`/exchange/ordenes${qs({ estado, limite: estado === 'historial' ? limite : undefined })}`),
  /** v2.2: sin `par` trae todos los pares con posición u órdenes en 30 días. */
  fills: (par?: string, limite = 100) => pedir<Fills>(`/exchange/fills${qs({ par, limite })}`),
  /** Todas las ejecuciones recientes; si el servidor todavía exige `par` (v2.1 respondía 422), por par y juntas. */
  async fillsTodos(paresRespaldo: string[], limite = 50): Promise<{ fills: Fills['fills']; avisos: string[] }> {
    try { const r = await luffy6b.fills(undefined, limite); return { fills: r.fills, avisos: [...new Set((r.no_disponibles ?? []).map((n) => n.motivo))] } }
    catch (e) { if (e instanceof ErrorLuffy6b && e.status === 422) return { fills: await luffy6b.fillsDe(paresRespaldo), avisos: [] }; throw e }
  },
  async fillsDe(pares: string[], limite = 30): Promise<Fills['fills']> {
    const rs = await Promise.all([...new Set(pares)].map((p) => luffy6b.fills(p, limite).then((r) => r.fills.map((f) => ({ ...f, par: f.par ?? r.par ?? p })), () => [])))
    return rs.flat().sort((a, b) => b.hora.localeCompare(a.hora))
  },
  comisiones: (desde: string, hasta: string, origen = 'pablo') => pedir<Comisiones>(`/exchange/comisiones${qs({ desde, hasta, origen })}`),
  /** Una acción sobre el exchange: siempre vuelve como propuesta (o dos, en «modificar»), que se confirma como las del chat. */
  async proponer(a: AccionExchange): Promise<RespuestaPropuestas> {
    try { return await pedir<RespuestaPropuestas>('/exchange/propuestas', { cuerpo: a }) }
    catch (e) {
      // 409: ya hay una propuesta viva para ese par; el contrato la devuelve en detail.propuesta
      const viva = e instanceof ErrorLuffy6b && e.status === 409 ? ((e.cuerpo as { detail?: { propuesta?: Propuesta } })?.detail?.propuesta ?? null) : null
      if (viva) return { propuestas: [viva], propuesta: viva, hilo_id: viva.hilo_id }
      throw e
    }
  },

  /* 8.3 */
  candidatas: (o: { modo?: string; dias?: number; incluirDescartadas?: boolean; activo?: string } = {}) => pedir<Candidatas>(`/radar/candidatas${qs({ modo: o.modo, dias: o.dias ?? 30, incluir_descartadas: o.incluirDescartadas ? true : undefined, activo: o.activo })}`),
  modos: () => pedir<Modos>('/radar/modos'),
  decidirModo: (id: string, version: string, aprobar: boolean, motivo = '') => pedir<{ ok: boolean; modo: Modo }>(`/modos/${encodeURIComponent(id)}/${encodeURIComponent(version)}/decidir`, { cuerpo: { aprobar, motivo } }),

  /* 8.4 */
  caja: (decisiones = 30) => pedir<Caja>(`/caja${qs({ decisiones })}`),
  mision: (id: string, accion: 'pausar' | 'reanudar' | 'cancelar') => pedir<Record<string, unknown>>(`/misiones/${encodeURIComponent(id)}/${accion}`, { cuerpo: {} }),
  panico: (hilo_id?: string) => pedir<Record<string, unknown>>(`/panico${qs({ hilo_id })}`, { cuerpo: {} }),
  gatillos: () => pedir<Gatillo[]>('/gatillos'),
  gatillo: (id: number | string, estado: 'activo' | 'pausado') => pedir<Gatillo>(`/gatillos/${encodeURIComponent(String(id))}`, { metodo: 'PATCH', cuerpo: { estado } }),
  borrarGatillo: (id: number | string) => pedir<{ ok: boolean }>(`/gatillos/${encodeURIComponent(String(id))}`, { metodo: 'DELETE' }),
  manual: () => pedir<Manual>('/manual'),
  diffManual: (desde: string, hasta: string) => pedir<DiffManual>(`/manual/diff${qs({ desde, hasta })}`),
  decidirManual: (id: number, aprobar: boolean) => pedir<{ ok: boolean; estado: string; version?: string }>(`/manual/propuestas/${id}/decidir`, { cuerpo: { aprobar } }),
  costo: (dias = 30) => pedir<CostoAmpliado>(`/costo${qs({ dias })}`),
  alertas: (f: { limite?: number; antes_de?: number | null; tipo?: string; activo?: string; severidad?: string } = {}) => pedir<FeedAlertas>(`/alertas/feed${qs({ limite: f.limite ?? 50, antes_de: f.antes_de ?? undefined, tipo: f.tipo, activo: f.activo, severidad: f.severidad })}`),
  atender: (id: number) => pedir<Record<string, unknown>>(`/alertas/${id}`, { metodo: 'PATCH', cuerpo: { atendida: true } }),

  /* 8.5 */
  oficina: () => pedir<Oficina>('/oficina/estado'),
  /** El SSE global. Se reconecta solo con `desde_id` (el último id visto), y avisa si el latido deja de llegar. */
  eventos(onEvento: (e: EventoOficina) => void, onEstado?: (abierto: boolean) => void, desdeId?: number | null): () => void {
    let ultimo = desdeId ?? null, es: EventSource | null = null, cerrado = false, reintento: ReturnType<typeof setTimeout> | null = null, vigia: ReturnType<typeof setInterval> | null = null, visto = Date.now()
    const abrir = () => {
      if (cerrado) return
      es = new EventSource(`${BASE}/eventos${qs({ desde_id: ultimo })}`, { withCredentials: true })
      es.onopen = () => { visto = Date.now(); onEstado?.(true) }
      es.onmessage = (m) => { visto = Date.now(); try { const e = JSON.parse(m.data) as EventoOficina; if (typeof e.id === 'number') ultimo = e.id; onEvento(e) } catch { /* línea rota */ } }
      es.onerror = () => { onEstado?.(false); es?.close(); es = null; if (!cerrado) reintento = setTimeout(abrir, 3000) }
    }
    abrir()
    // sin latido en 60 s (llega cada 25), el stream se dio por caído: se reabre desde el último id
    vigia = setInterval(() => { if (es && Date.now() - visto > 60_000) { onEstado?.(false); es.close(); es = null; abrir() } }, 15_000)
    return () => { cerrado = true; es?.close(); if (reintento) clearTimeout(reintento); if (vigia) clearInterval(vigia) }
  },

  /* 8.6 */
  informes: (limite = 30, tipo = 'diario') => pedir<Pagina<InformeItem>>(`/informes${qs({ limite, tipo })}`),
  informe: (fecha: string, tipo = 'diario') => pedir<Informe>(`/informes/${encodeURIComponent(fecha)}${qs({ tipo })}`),
  revisiones: (limite = 10) => pedir<Pagina<Revision>>(`/revisiones${qs({ limite })}`),
  bitacora: (f: { activo?: string; tipo?: string; origen?: string; limite?: number; antes_de?: string | null } = {}) => pedir<Pagina<Bitacora>>(`/bitacora${qs({ activo: f.activo, tipo: f.tipo, origen: f.origen, limite: f.limite ?? 50, antes_de: f.antes_de ?? undefined })}`),
  teorias: (f: { estado?: string; activo?: string; limite?: number } = {}) => pedir<Pagina<Teoria>>(`/teorias${qs({ estado: f.estado, activo: f.activo, limite: f.limite ?? 50 })}`),
}
