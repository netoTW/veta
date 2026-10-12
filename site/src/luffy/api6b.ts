/* Cliente de la fase 6b sobre el mismo puente /api/luffy/*. Formas en tipos6b.ts (supuestas hasta el contrato v2). */
import type { Propuesta } from './tipos'
import type { AccionExchange, Alertas, Caja, Candidatas, Cartera, CostoAmpliado, CurvaCapital, Declaracion, EventoOficina, FichaTerminal, Filtro, Gatillo, Historial, Informe, Informes, Manual, Modos, Oficina, Ordenes, PreguntarRespuesta, Universo } from './tipos6b'

const BASE = '/api/luffy'
class ErrorLuffy6b extends Error { status: number; codigo: string; constructor(s: number, c: string, t: string) { super(t); this.status = s; this.codigo = c } }
async function pedir<T>(ruta: string, init: { metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; cuerpo?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, { method: init.metodo ?? (init.cuerpo !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', signal: init.signal, headers: init.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}, body: init.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined })
  if (!r.ok) {
    let codigo = String(r.status), texto = `HTTP ${r.status}`
    try { const j = await r.json() as { detail?: string | { codigo?: string; texto?: string }; error?: string; texto?: string }; if (typeof j.detail === 'string') texto = j.detail; else if (j.detail) { codigo = j.detail.codigo ?? codigo; texto = j.detail.texto ?? texto } else if (j.error) { codigo = j.error; texto = j.texto ?? j.error } } catch { /* sin cuerpo */ }
    if (r.status === 404 && codigo === '404') { codigo = 'no_encontrado'; texto = 'Esta parte de Luffy todavía no está en el servidor.' }
    throw new ErrorLuffy6b(r.status, codigo, texto)
  }
  return r.json() as Promise<T>
}
const FICHAS = new Map<string, { hasta: number; p: Promise<FichaTerminal> }>()

export const luffy6b = {
  universo: (filtro: Filtro = 'todo', q = '') => pedir<Universo>(`/terminal/universo?filtro=${filtro}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  /** La ficha se recuerda 45 s: cambiar de moneda y volver es instantáneo, y la siguiente de la lista se precarga. */
  ficha(activo: string, signal?: AbortSignal): Promise<FichaTerminal> {
    const k = activo.toUpperCase(); const m = FICHAS.get(k)
    if (m && m.hasta > Date.now()) return m.p
    const p = pedir<FichaTerminal>(`/terminal/${encodeURIComponent(k)}`, { signal }); p.catch(() => FICHAS.delete(k))
    if (FICHAS.size > 40) FICHAS.clear(); FICHAS.set(k, { hasta: Date.now() + 45_000, p }); return p
  },
  precargar(activo: string) { void luffy6b.ficha(activo).catch(() => {}) },
  preguntar: (activo: string) => pedir<PreguntarRespuesta>(`/terminal/${encodeURIComponent(activo)}/preguntar`, { cuerpo: {} }),

  cartera: (origen: 'pablo' | 'caja' = 'pablo') => pedir<Cartera>(`/cartera?origen=${origen}`),
  curva: (origen: 'pablo' | 'caja', rango = '90d') => pedir<CurvaCapital>(`/cartera/curva?origen=${origen}&rango=${rango}`),
  declarar: (d: Declaracion) => pedir<Propuesta>('/posiciones/declarar', { cuerpo: d }),
  ordenes: () => pedir<Ordenes>('/exchange/ordenes'),
  historial: (dias = 30) => pedir<Historial>(`/exchange/historial?dias=${dias}`),
  proponer: (a: AccionExchange) => pedir<Propuesta>('/exchange/proponer', { cuerpo: a }),

  caja: () => pedir<Caja>('/caja'),
  mision: (id: string, accion: 'pausar' | 'reanudar' | 'cancelar') => pedir<{ ok: boolean; estado: string }>(`/caja/mision/${encodeURIComponent(id)}/${accion}`, { cuerpo: {} }),
  panico: (hilo_id?: string) => pedir<Record<string, unknown>>(`/panico${hilo_id ? `?hilo_id=${hilo_id}` : ''}`, { cuerpo: {} }),

  candidatas: (modo = 'todos', dias = 30) => pedir<Candidatas>(`/radar/candidatas?modo=${modo}&dias=${dias}`),
  modos: () => pedir<Modos>('/radar/modos'),
  decidirModo: (id: string, version: string, decision: 'aprobar' | 'rechazar') => pedir<{ ok: boolean; estado: string }>(`/modos/${encodeURIComponent(id)}/${encodeURIComponent(version)}/decidir`, { cuerpo: { decision } }),

  gatillos: () => pedir<Gatillo[]>('/gatillos'),
  gatillo: (id: number, estado: 'activo' | 'pausado') => pedir<Gatillo>(`/gatillos/${id}`, { metodo: 'PATCH', cuerpo: { estado } }),
  borrarGatillo: (id: number) => pedir<{ ok: boolean }>(`/gatillos/${id}`, { metodo: 'DELETE' }),
  manual: () => pedir<Manual>('/manual'),
  diffManual: (de: string, a: string) => pedir<{ diff: string }>(`/manual/diff?de=${encodeURIComponent(de)}&a=${encodeURIComponent(a)}`),
  decidirManual: (id: string, decision: 'aprobar' | 'rechazar') => pedir<{ ok: boolean; estado: string }>(`/manual/propuestas/${encodeURIComponent(id)}/decidir`, { cuerpo: { decision } }),
  costo: () => pedir<CostoAmpliado>('/costo'),
  alertas: (pagina = 1, severidad = '', tipo = '', porPagina = 25) => pedir<Alertas>(`/alertas?pagina=${pagina}&por_pagina=${porPagina}${severidad ? `&severidad=${severidad}` : ''}${tipo ? `&tipo=${encodeURIComponent(tipo)}` : ''}`),

  oficina: () => pedir<Oficina>('/oficina/estado'),
  /** El SSE global de la oficina. Devuelve cómo cerrarlo. */
  eventos(onEvento: (e: EventoOficina) => void, onEstado?: (abierto: boolean) => void): () => void {
    const es = new EventSource(`${BASE}/eventos`, { withCredentials: true })
    es.onmessage = (m) => { try { onEvento(JSON.parse(m.data) as EventoOficina) } catch { /* línea rota */ } }
    es.onopen = () => onEstado?.(true); es.onerror = () => onEstado?.(false)
    return () => es.close()
  },

  informes: () => pedir<Informes>('/informes'),
  informe: (fecha: string) => pedir<Informe>(`/informes/${encodeURIComponent(fecha)}`),
}
export { ErrorLuffy6b }
