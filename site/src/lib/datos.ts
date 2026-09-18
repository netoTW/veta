/* Carga del contenido desde el servidor (/api/contenido/*), que aplica la
   matriz de acceso por sesión. Se cachea por URL + rol efectivo: cambiar de
   sesión (o "ver como" en desarrollo) vuelve a pedir. */
import { useEffect, useState } from 'react'
import type { Informe, Meta, SeguimientoDiario, Watch, BenchmarkDef, Visuales } from './contrato'
import { cabecerasApi, useSesion } from './sesion'

const cache = new Map<string, Promise<unknown>>()

export class ErrorApi extends Error {
  status: number
  codigo: string
  /** El cuerpo completo de la respuesta de error, para cuando trae más que el mensaje (p. ej. el id de un pedido ya en curso). */
  cuerpo: Record<string, unknown>
  constructor(status: number, codigo: string, mensaje?: string, cuerpo: Record<string, unknown> = {}) { super(mensaje ?? codigo); this.status = status; this.codigo = codigo; this.cuerpo = cuerpo }
}

async function pedir<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', headers: cabecerasApi() })
  if (!r.ok) {
    let codigo = String(r.status)
    try { codigo = (await r.json()).error ?? codigo } catch { /* sin cuerpo */ }
    throw new ErrorApi(r.status, codigo, codigo === 'sin_acceso' ? 'Esta sección no está en tu plan.' : `${r.status} ${url}`)
  }
  return r.json() as Promise<T>
}

function cargar<T>(url: string, clave: string): Promise<T> {
  let p = cache.get(clave) as Promise<T> | undefined
  if (!p) {
    p = pedir<T>(url)
    p.catch(() => cache.delete(clave))
    cache.set(clave, p)
  }
  return p
}

/** Vacía la caché: después de una decisión de la bandeja o un cambio de sesión. */
export const invalidarDatos = () => cache.clear()

export type Estado<T> = { estado: 'cargando' } | { estado: 'error'; error: string; status?: number } | { estado: 'ok'; datos: T }

export function useDatos<T>(url: string, activo = true): Estado<T> {
  const { rol, cargando } = useSesion()
  const [st, setSt] = useState<Estado<T>>({ estado: 'cargando' })
  useEffect(() => {
    if (cargando || !activo) return
    let vivo = true
    setSt({ estado: 'cargando' })
    cargar<T>(url, `${rol}:${url}`).then(
      (datos) => { if (vivo) setSt({ estado: 'ok', datos }) },
      (e: Error) => { if (vivo) setSt({ estado: 'error', error: e.message, status: e instanceof ErrorApi ? e.status : undefined }) },
    )
    return () => { vivo = false }
  }, [url, rol, cargando, activo])
  return st
}

export interface GemaAnticipada { id: string; simbolo: string; nombre: string; tier: string; disponible_desde: string }
export interface RespuestaGemas { gemas: Informe[]; anticipadas: GemaAnticipada[] }

export const useGemasTodo = () => useDatos<RespuestaGemas>('/api/contenido/gemas')
/** Sólo la lista, con la misma forma de antes. */
export function useGemas(): Estado<Informe[]> {
  const st = useGemasTodo()
  return st.estado === 'ok' ? { estado: 'ok', datos: st.datos.gemas } : st
}
export const useAnalisis = () => useDatos<Informe[]>('/api/contenido/analisis')
export const useWatchlist = (activo = true) => useDatos<Watch[]>('/api/contenido/watchlist', activo)
export const useSeguimiento = (activo = true) => useDatos<{ ultimo: SeguimientoDiario[]; historial: SeguimientoDiario[] }>('/api/contenido/seguimiento', activo)
export const useBenchmark = (activo = true) => useDatos<BenchmarkDef>('/api/contenido/benchmark', activo)
export const useMeta = () => useDatos<Meta>('/api/contenido/meta')
export const useVisuales = (id: string, activo = true) => useDatos<Visuales>(`/api/contenido/visuales/${id}`, activo)

/** Llamadas de escritura y de admin: JSON, con cookie. Devuelve el cuerpo o lanza ErrorApi con el detalle del servidor. */
export async function api<T = unknown>(url: string, opciones: { metodo?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; cuerpo?: unknown } = {}): Promise<T> {
  const r = await fetch(url, {
    method: opciones.metodo ?? (opciones.cuerpo !== undefined ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: { ...cabecerasApi(), ...(opciones.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opciones.cuerpo !== undefined ? JSON.stringify(opciones.cuerpo) : undefined,
  })
  const texto = await r.text()
  let json: { error?: string; detalle?: string } & Record<string, unknown> = {}
  try { json = texto ? JSON.parse(texto) : {} } catch { /* no json */ }
  if (!r.ok) throw new ErrorApi(r.status, json.error ?? String(r.status), json.detalle ?? json.error ?? `${r.status}`, json)
  return json as T
}
