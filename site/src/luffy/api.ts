/* ============================================================================
   Cliente del puente /api/luffy/* (CONTRATO-PANEL.md). Todo JSON con la cookie
   de sesión; el chat llega por SSE y se lee del cuerpo en streaming.
   ========================================================================== */
import type { Catalogo, Confirmacion, Costo, Datos, EventoChat, HiloDetalle, HiloResumen, HistorialPosiciones, ImagenAdjunta, Propuesta, Spec, SpecGuardado, Tablero } from './tipos'

const BASE = '/api/luffy'

export class ErrorLuffy extends Error {
  status: number; codigo: string
  constructor(status: number, codigo: string, texto: string) { super(texto); this.status = status; this.codigo = codigo }
}

/** Lee el error del contrato: `detail` es un texto o `{codigo, texto, errores}`; el puente usa `{error, texto}`. */
async function errorDe(r: Response): Promise<ErrorLuffy> {
  let codigo = String(r.status), texto = `HTTP ${r.status}`
  try {
    const j = await r.json() as { detail?: string | { codigo?: string; texto?: string; errores?: unknown[] }; error?: string; texto?: string }
    if (typeof j.detail === 'string') texto = j.detail
    else if (j.detail && typeof j.detail === 'object') { codigo = j.detail.codigo ?? codigo; texto = j.detail.texto ?? texto; if (j.detail.errores?.length) texto += ` · ${JSON.stringify(j.detail.errores).slice(0, 200)}` }
    else if (j.error) { codigo = j.error; texto = j.texto ?? j.error }
  } catch { /* sin cuerpo */ }
  if (r.status === 404 && codigo === '404') codigo = 'no_encontrado'
  if (r.status === 503 && codigo === 'sin_token') texto = 'La web no tiene configurado el acceso a Luffy.'
  if (r.status === 502) texto = texto || 'Luffy no responde.'
  return new ErrorLuffy(r.status, codigo, texto)
}

async function pedir<T>(ruta: string, init: { metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; cuerpo?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const r = await fetch(`${BASE}${ruta}`, {
    method: init.metodo ?? (init.cuerpo !== undefined ? 'POST' : 'GET'), credentials: 'same-origin', signal: init.signal,
    headers: init.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}, body: init.cuerpo !== undefined ? JSON.stringify(init.cuerpo) : undefined,
  })
  if (!r.ok) throw await errorDe(r)
  return r.json() as Promise<T>
}

/* Caché corta de datos de gráficos por spec (el contrato ya cachea 60 s del otro lado; esto
   evita pedir dos veces el mismo spec al abrir y reabrir un mensaje). */
const DATOS = new Map<string, { hasta: number; p: Promise<Datos> }>()
/** Lo último que llegó por spec, sin vencimiento: se muestra al instante mientras se pide lo nuevo. */
const ULTIMOS = new Map<string, Datos>()
/** Un pedido que no contesta en este tiempo se corta y se ofrece reintentar: nada se queda pegado. */
export const TOPE_MS = 30_000
export function conTope(signal?: AbortSignal, ms = TOPE_MS): AbortSignal { const t = AbortSignal.timeout(ms); return signal ? AbortSignal.any([signal, t]) : t }
export const esTope = (e: unknown) => e instanceof DOMException && e.name === 'TimeoutError'
const CAT: { p: Promise<Catalogo> | null; hasta: number } = { p: null, hasta: 0 }

export const luffy = {
  hilos: (limite = 40) => pedir<HiloResumen[]>(`/hilos?limite=${limite}`),
  hilo: (id: string, n = 80, signal?: AbortSignal) => pedir<HiloDetalle>(`/hilos/${encodeURIComponent(id)}?n=${n}`, { signal }),
  crearHilo: (titulo: string) => pedir<HiloResumen>('/hilos', { cuerpo: { titulo } }),
  cambiarHilo: (id: string, cambio: { titulo?: string; telegram_activo?: boolean }) => pedir<HiloResumen>(`/hilos/${encodeURIComponent(id)}`, { metodo: 'PATCH', cuerpo: cambio }),

  /** Un turno de Luffy. Cada evento llega al momento; resuelve cuando llega `fin` o se corta el stream. */
  async chat(cuerpo: { hilo_id: string; texto: string; modo?: 'auto' | 'decision'; imagenes?: ImagenAdjunta[]; contexto?: { tipo: 'terminal'; activo: string } }, onEvento: (e: EventoChat) => void, signal?: AbortSignal): Promise<void> {
    const r = await fetch(`${BASE}/chat`, { method: 'POST', credentials: 'same-origin', signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(cuerpo) })
    if (!r.ok) throw await errorDe(r)
    if (!r.body) throw new ErrorLuffy(0, 'sin_cuerpo', 'La respuesta llegó sin cuerpo.')
    const lector = r.body.getReader(); const dec = new TextDecoder(); let buf = ''
    for (;;) {
      const { done, value } = await lector.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let i: number
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloque = buf.slice(0, i); buf = buf.slice(i + 2)
        for (const linea of bloque.split('\n')) {
          if (!linea.startsWith('data:')) continue
          try { onEvento(JSON.parse(linea.slice(5).trim()) as EventoChat) } catch { /* una línea rota no tumba el turno */ }
        }
      }
    }
  },

  propuesta: (id: string) => pedir<Propuesta>(`/propuestas/${encodeURIComponent(id)}`),
  confirmar: (id: string) => pedir<Confirmacion>(`/propuestas/${encodeURIComponent(id)}/confirmar`, { cuerpo: {} }),
  rechazar: (id: string) => pedir<{ ok: boolean; estado?: string }>(`/propuestas/${encodeURIComponent(id)}/rechazar`, { cuerpo: {} }),
  activarMision: (id: string) => pedir<{ ok: boolean }>(`/misiones/${encodeURIComponent(id)}/activar`, { cuerpo: {} }),
  cancelarMision: (id: string) => pedir<{ ok: boolean }>(`/misiones/${encodeURIComponent(id)}/cancelar`, { cuerpo: {} }),

  datos(spec: Spec, signal?: AbortSignal): Promise<Datos> {
    const clave = JSON.stringify(spec)
    const m = DATOS.get(clave)
    if (m && m.hasta > Date.now()) return m.p
    const p = pedir<Datos>('/graficos/datos', { cuerpo: { spec }, signal: conTope(signal) })
    p.then((d) => { ULTIMOS.delete(clave); ULTIMOS.set(clave, d); if (ULTIMOS.size > 80) ULTIMOS.delete(ULTIMOS.keys().next().value!) }, () => DATOS.delete(clave))
    if (DATOS.size > 60) DATOS.clear()
    DATOS.set(clave, { hasta: Date.now() + 45_000, p })
    return p
  },
  olvidarDatos: () => DATOS.clear(),
  /** Lo último que llegó para este spec (o null): para pintar al instante mientras llega lo nuevo. */
  datosGuardados: (spec: Spec): Datos | null => ULTIMOS.get(JSON.stringify(spec)) ?? null,
  spec: (id: string) => pedir<SpecGuardado>(`/graficos/spec/${encodeURIComponent(id)}`),
  guardarSpec: (spec: Spec, titulo?: string, hilo_id?: string | null) => pedir<SpecGuardado>('/graficos/spec', { cuerpo: { spec, titulo, hilo_id: hilo_id ?? undefined } }),
  catalogo(): Promise<Catalogo> {
    if (CAT.p && CAT.hasta > Date.now()) return CAT.p
    CAT.p = pedir<Catalogo>('/graficos/catalogo'); CAT.hasta = Date.now() + 10 * 60_000
    CAT.p.catch(() => { CAT.p = null })
    return CAT.p
  },

  tableros: () => pedir<Tablero[]>('/tableros'),
  crearTablero: (t: { nombre: string; spec: Spec; grupo?: string | null; orden?: number }) => pedir<Tablero>('/tableros', { cuerpo: t }),
  cambiarTablero: (id: number, cambio: Partial<Pick<Tablero, 'nombre' | 'spec' | 'grupo' | 'orden'>>) => pedir<Tablero>(`/tableros/${id}`, { metodo: 'PATCH', cuerpo: cambio }),
  borrarTablero: (id: number) => pedir<{ ok: boolean }>(`/tableros/${id}`, { metodo: 'DELETE' }),
  ordenarTableros: (ids: number[]) => pedir<{ ok: boolean }>('/tableros/orden', { metodo: 'PUT', cuerpo: { ids } }),

  historial: (origen = 'pablo', activo?: string) => pedir<HistorialPosiciones>(`/posiciones/historial?origen=${origen}${activo ? `&activo=${encodeURIComponent(activo)}` : ''}`),
  costo: () => pedir<Costo>('/costo'),
}

/** La URL pública del PNG de respaldo de un gráfico (pasa por el puente). */
export const urlPng = (url: string | null | undefined) => (url ? `${BASE}${url.startsWith('/') ? '' : '/'}${url}` : '')

/** Un fichero a la forma que pide /chat. */
export function leerImagen(f: File): Promise<ImagenAdjunta> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onerror = () => rej(new Error('no se pudo leer la imagen'))
    r.onload = () => { const s = String(r.result); res({ base64: s.slice(s.indexOf(',') + 1), tipo: f.type || 'image/jpeg', nombre: f.name }) }
    r.readAsDataURL(f)
  })
}
