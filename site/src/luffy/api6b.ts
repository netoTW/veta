/* Cliente de la fase 6b sobre el puente /api/luffy/* (CONTRATO-PANEL.md v2.1, §8). */
import type { Propuesta } from './tipos'
import type { AccionExchange, Bitacora, Caja, Candidatas, Cartera, Comisiones, CostoAmpliado, CurvaCapital, Declaracion, DiffManual, EventoOficina, FeedAlertas, FichaTerminal, Fills, Filtro, Gatillo, HiloTerminal, Informe, InformeItem, Manual, Modo, Modos, Movimiento, Oficina, Ordenes, Pagina, RespuestaPropuestas, Revision, Teoria, Universo } from './tipos6b'

const BASE = '/api/luffy'
export class ErrorLuffy6b extends Error {
  status: number; codigo: string; cuerpo: unknown
  constructor(s: number, c: string, t: string, cuerpo?: unknown) { super(t); this.status = s; this.codigo = c; this.cuerpo = cuerpo }
}
async function pedir<T>(ruta: string, init: { metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; cuerpo?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, { method: init.metodo ?? (init.cuerpo !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', signal: init.signal, headers: init.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}, body: init.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined })
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
const FICHAS = new Map<string, { hasta: number; p: Promise<FichaTerminal> }>()

export const luffy6b = {
  /* 8.1 */
  universo: (filtro: Filtro = 'todo', q = '', limite = 300) => pedir<Universo>(`/terminal/universo${qs({ filtro, q, limite })}`),
  /** La ficha se recuerda 45 s por activo y rango: volver a una moneda es instantáneo, y la siguiente de la lista se precarga. */
  ficha(activo: string, rango = '90d'): Promise<FichaTerminal> {
    const k = `${activo.toUpperCase()}|${rango}`; const m = FICHAS.get(k)
    if (m && m.hasta > Date.now()) return m.p
    const p = pedir<FichaTerminal>(`/terminal/${encodeURIComponent(activo.toUpperCase())}${qs({ rango })}`); p.catch(() => FICHAS.delete(k))
    if (FICHAS.size > 40) FICHAS.clear(); FICHAS.set(k, { hasta: Date.now() + 45_000, p }); return p
  },
  precargar(activo: string, rango = '90d') { void luffy6b.ficha(activo, rango).catch(() => {}) },
  hiloTerminal: (activo: string) => pedir<HiloTerminal>(`/terminal/${encodeURIComponent(activo.toUpperCase())}/hilo`, { cuerpo: {} }),

  /* 8.2 */
  cartera: (origen: 'pablo' | 'caja' = 'pablo') => pedir<Cartera>(`/cartera${qs({ origen })}`),
  curva: (origen: 'pablo' | 'caja', rango = '90d') => pedir<CurvaCapital>(`/cartera/curva${qs({ origen, rango })}`),
  movimientos: (origen: 'pablo' | 'caja' = 'pablo') => pedir<{ movimientos: Movimiento[] } | Movimiento[]>(`/cartera/movimientos${qs({ origen })}`),
  nuevoMovimiento: (m: Omit<Movimiento, 'id'>) => pedir<Movimiento>('/cartera/movimientos', { cuerpo: m }),
  borrarMovimiento: (id: number) => pedir<{ ok: boolean }>(`/cartera/movimientos/${id}`, { metodo: 'DELETE' }),
  declarar: (d: Declaracion) => pedir<Propuesta>('/posiciones/declarar', { cuerpo: { origen: 'pablo', ...d } }),
  ordenes: (estado: 'abiertas' | 'historial' = 'abiertas', limite = 100) => pedir<Ordenes>(`/exchange/ordenes${qs({ estado, limite: estado === 'historial' ? limite : undefined })}`),
  fills: (limite = 100, par?: string) => pedir<Fills>(`/exchange/fills${qs({ par, limite })}`),
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
