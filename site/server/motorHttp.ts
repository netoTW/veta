/* ============================================================================
   Motor real por HTTP (CONTRATO-ANALISIS-A-PEDIDO.md §3).
   Se activa con VETA_MOTOR=http y VETA_MOTOR_URL. Ninguna ruta de la web
   cambia: sólo cambia quién responde detrás de `motor`.

   Dos decisiones del motor que acá se respetan:
   - 404 en /determinista sólo cuando no hay NINGÚN dato guardado de la
     moneda; si hay datos pero falta un campo, el bloque viene `sin_dato`.
     Por eso el 404 no es "no la cubrimos": es "todavía no tiene datos".
   - /profundo deja el pedido en_cola y no lo arranca: el lanzamiento es
     manual (pipeline/lanzar_pedidos.py). La web sólo espeja y explica.
   ========================================================================== */
import { ENV } from './entorno.ts'
import type { Motor, Moneda, LecturaDeterminista, SinDatos, Solicitud, Progreso, Resolucion, RefMoneda, Analizabilidad, Ficha } from './motorTipos.ts'
import { resolverEnUniverso } from './resolver.ts'

const TIMEOUT_MS = 8000
/** /analizable consulta fuentes en vivo: medido, tarda hasta medio minuto. */
const TIMEOUT_LARGO_MS = 60000
async function llamar<T>(ruta: string, init?: RequestInit, timeout = TIMEOUT_MS): Promise<{ status: number; cuerpo: T | null }> {
  const r = await fetch(`${ENV.MOTOR_URL}${ruta}`, { ...init, signal: AbortSignal.timeout(timeout), headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const texto = await r.text().catch(() => '')
  let cuerpo: T | null = null
  try { cuerpo = texto ? (JSON.parse(texto) as T) : null } catch { cuerpo = null }
  if (r.status >= 500) throw new Error(`motor ${ruta}: ${r.status} ${texto.slice(0, 200)}`)
  return { status: r.status, cuerpo }
}

let universoCache: { en: number; datos: Moneda[] } | null = null
let universoEnVuelo: Promise<Moneda[]> | null = null

export const motor: Motor = {
  nombre: 'motor',
  /** El universo se pide una vez por hora. La primera vez se espera; después se sirve la caché y se renueva por detrás. */
  async universo() {
    const fresco = universoCache && Date.now() - universoCache.en < 3600_000
    if (fresco) return universoCache!.datos
    if (!universoEnVuelo) {
      universoEnVuelo = llamar<Moneda[]>('/universo').then((r) => {
        const datos = Array.isArray(r.cuerpo) ? r.cuerpo : []
        universoCache = { en: Date.now(), datos }
        return datos
      }).catch((e) => { console.warn('[motor] universo:', (e as Error).message); return universoCache?.datos ?? [] }).finally(() => { universoEnVuelo = null })
    }
    return universoCache ? universoCache.datos : universoEnVuelo
  },
  /** Si el motor todavía no tiene /resolver, se resuelve contra el universo (§9.1). */
  async resolver(consulta: string): Promise<Resolucion> {
    const r = await llamar<Resolucion & { error?: string }>('/resolver', { method: 'POST', body: JSON.stringify({ consulta }) }).catch(() => ({ status: 0, cuerpo: null }))
    if (r.status === 200 && r.cuerpo && Array.isArray(r.cuerpo.candidatas)) return r.cuerpo
    if (r.status === 404 && r.cuerpo?.error === 'sin_cobertura') return { consulta, interpretada_como: 'ticker', candidatas: [] }
    const u = await this.universo()
    // Sin respuesta del motor y sin universo en memoria no se sabe nada de la moneda.
    // Devolver cero candidatas diría "no existe", que es mentira: el sistema no respondió.
    if (r.status === 0 && u.length === 0) throw new Error('motor no disponible: no hay con qué resolver')
    return resolverEnUniverso(consulta, u)
  },
  /** GET /analizable. Con contrato y cadena distingue homónimas; sin ellos, por símbolo. */
  async analizable(simbolo, ref?: RefMoneda): Promise<Analizabilidad | null> {
    const q = new URLSearchParams({ simbolo })
    if (ref?.cadena) q.set('cadena', ref.cadena)
    if (ref?.contrato) q.set('contrato', ref.contrato)
    if (ref?.id_coingecko) q.set('id', ref.id_coingecko)
    const r = await llamar<Analizabilidad>(`/analizable?${q}`, undefined, TIMEOUT_LARGO_MS).catch((e) => { console.warn('[motor] analizable:', (e as Error).message); return { status: 0, cuerpo: null } })
    if (r.status === 200 && r.cuerpo && typeof r.cuerpo.analizable === 'boolean') return r.cuerpo
    return null
  },
  async determinista(simbolo, ref?: RefMoneda): Promise<LecturaDeterminista | SinDatos | null> {
    const r = await llamar<LecturaDeterminista | { error?: string; texto?: string }>('/determinista', { method: 'POST', body: JSON.stringify({ simbolo, contrato: ref?.contrato ?? undefined, cadena: ref?.cadena ?? undefined }) })
    if (r.status === 200 && r.cuerpo && (r.cuerpo as LecturaDeterminista).nivel === 'determinista') return r.cuerpo as LecturaDeterminista
    if (r.status === 404) { const c = r.cuerpo as { error?: string; texto?: string } | null; return { sin_datos: true, codigo: c?.error ?? 'sin_cobertura', texto: c?.texto ?? 'Todavía no hay datos guardados de esta moneda.' } }
    return null
  },
  async solicitarProfundo(s: Solicitud) {
    const r = await llamar<{ ok?: boolean; error?: string; motivos?: string[] }>('/profundo', { method: 'POST', body: JSON.stringify({ tipo: 'analisis_solicitado', ...s }) })
    if (r.status !== 202 && r.status !== 200) throw new Error(`motor rechazó el pedido (${r.status}): ${(r.cuerpo?.motivos ?? [r.cuerpo?.error ?? '']).join('; ')}`)
  },
  /** §21: la ficha. Hasta 15 s: en frío el motor tarda ~5 s y corta sus fuentes a los 7 s. */
  async ficha(e) {
    const r = await llamar<Ficha & { error?: string; texto?: string }>('/ficha', { method: 'POST', body: JSON.stringify(e) }, 15_000).catch((err) => {
      console.warn('[motor] ficha:', (err as Error).message); return { status: 0, cuerpo: null }
    })
    if (r.status === 200 && r.cuerpo?.nivel === 'ficha') return { ficha: r.cuerpo }
    if (r.status === 404) return { error: 'sin_cobertura', texto: r.cuerpo?.texto }
    if (r.status === 400) return { error: 'falta_moneda' }
    if (r.status === 502) return { error: 'fuente_caida', texto: r.cuerpo?.texto }
    return null
  },
  async progreso(id) {
    const r = await llamar<Progreso>(`/progreso/${encodeURIComponent(id)}`)
    return r.status === 200 && r.cuerpo ? r.cuerpo : null
  },
}
