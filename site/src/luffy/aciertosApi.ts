/* ============================================================================
   La forma de `GET /radar/aciertos` (CONTRATO-PANEL §8.9, v2.6) y su adaptador
   tolerante: lo que falta queda vacío, nunca un cero inventado. La vista está en
   Aciertos.tsx.
   ========================================================================== */
import { pedir } from './api6b'

export type Plazo = '7d' | '14d' | '30d' | 'a_hoy'
export const PLAZOS: Plazo[] = ['7d', '14d', '30d', 'a_hoy']
export const NOMBRE_PLAZO: Record<Plazo, string> = { '7d': '7 días', '14d': '14 días', '30d': '30 días', a_hoy: 'Hasta hoy' }

export interface Agregado { n: number; pendientes: number; acierto_pct: number | null; ret_mediano_pct: number | null; ret_medio_pct: number | null; exceso_medio_pct: number | null; peor: { activo: string; ret_pct: number } | null; mejor: { activo: string; ret_pct: number } | null }
export interface Medida { pendiente: boolean; fecha: string | null; dias: number | null; ret_pct: number | null; btc_pct: number | null; exceso_pct: number | null }
export interface SenalAciertos { id: string; fecha: string; activo: string; modo: string | null; version: string | null; precio: number | null; estado: string | null; medida: Record<Plazo, Medida | null> }
/** `primera`: la fecha en que se cumple el primer plazo todavía pendiente, por plazo (de las señales de la fila). */
export interface FilaAciertos { clave: string; etiqueta: string; senales: number; desde: string | null; hasta: string | null; plazos: Record<Plazo, Agregado | null>; primera: Record<Plazo, string | null>; texto: string | null; items: SenalAciertos[]; tipo: 'modo' | 'total' | 'luffy' }
export interface Aciertos { filas: FilaAciertos[]; no_disponibles: { seccion: string; motivo: string }[]; consultado_en: string | null; calculado_en: string | null; fuente: string | null }

type Crudo = Record<string, unknown>
const obj = (v: unknown): Crudo => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Crudo) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const extremo = (v: unknown) => { const o = obj(v), a = str(o.activo), r = num(o.ret_pct); return a && r !== null ? { activo: a, ret_pct: r } : null }
const agregado = (v: unknown): Agregado | null => {
  const o = obj(v); const n = num(o.n)
  if (n === null) return null
  return { n, pendientes: num(o.pendientes) ?? 0, acierto_pct: num(o.acierto_pct), ret_mediano_pct: num(o.ret_mediano_pct), ret_medio_pct: num(o.ret_medio_pct), exceso_medio_pct: num(o.exceso_medio_pct), peor: extremo(o.peor), mejor: extremo(o.mejor) }
}
const medida = (v: unknown): Medida | null => {
  const o = obj(v)
  if (!Object.keys(o).length) return null
  return { pendiente: o.pendiente === true, fecha: str(o.fecha), dias: num(o.dias), ret_pct: num(o.ret_pct), btc_pct: num(o.btc_pct), exceso_pct: num(o.exceso_pct) }
}
const plazos = (o: Crudo) => Object.fromEntries(PLAZOS.map((p) => [p, agregado(o[p])])) as Record<Plazo, Agregado | null>
// los ejemplos del contrato cierran la lista con «… 83 más»: lo que no es objeto se descarta
const senales = (v: unknown, precio: 'precio_senal' | 'precio_propuesta'): SenalAciertos[] => arr(v).flatMap((x) => {
  const o = obj(x), activo = str(o.activo), fecha = str(o.fecha)
  if (!activo || !fecha) return []
  const m = obj(o.medida)
  return [{ id: String(o.id ?? `${activo}-${fecha}`), fecha, activo, modo: str(o.modo), version: o.version === undefined || o.version === null ? null : String(o.version), precio: num(o[precio]), estado: str(o.estado), medida: Object.fromEntries(PLAZOS.map((p) => [p, medida(m[p])])) as Record<Plazo, Medida | null> }]
})

const primeras = (xs: SenalAciertos[]) => Object.fromEntries(PLAZOS.map((p) => [p, xs.map((s) => s.medida[p]).filter((m) => m?.pendiente && m.fecha).map((m) => m!.fecha!).sort()[0] ?? null])) as Record<Plazo, string | null>

export function adaptarAciertos(v: unknown): Aciertos {
  const o = obj(v), radar = obj(o.radar), luffy = obj(o.luffy), items = senales(radar.items, 'precio_senal')
  const filas: FilaAciertos[] = arr(radar.por_modo).flatMap((x) => {
    const m = obj(x), modo = str(m.modo)
    if (!modo) return []
    const version = str(m.version)
    const suyas = items.filter((s) => s.modo === modo && (version === null || s.version === null || s.version === version))
    return [{ clave: `${modo}-${version ?? ''}`, etiqueta: str(m.etiqueta) ?? modo.replace(/_/g, ' '), senales: num(m.senales) ?? 0, desde: str(m.desde), hasta: str(m.hasta), plazos: plazos(m), primera: primeras(suyas), texto: str(m.texto), tipo: 'modo' as const, items: suyas }]
  })
  const total = obj(radar.total)
  if (filas.length > 1 && num(total.senales) !== null) filas.push({ clave: 'total', etiqueta: 'Todo el radar', senales: num(total.senales) ?? 0, desde: null, hasta: null, plazos: plazos(total), primera: primeras(items), texto: str(total.texto), tipo: 'total', items: [] })
  if (num(luffy.propuestas) !== null) { const xs = senales(luffy.items, 'precio_propuesta'); filas.push({ clave: 'luffy', etiqueta: 'Propuestas de entrada de Luffy', senales: num(luffy.propuestas) ?? 0, desde: null, hasta: null, plazos: plazos(luffy), primera: primeras(xs), texto: str(luffy.texto), tipo: 'luffy', items: xs }) }
  const vit = obj(o.vitrina)
  return {
    filas,
    no_disponibles: arr(o.no_disponibles).flatMap((x) => { const n = obj(x), m = str(n.motivo); return m ? [{ seccion: str(n.seccion) ?? '', motivo: m }] : [] }),
    consultado_en: str(o.consultado_en), calculado_en: str(vit.calculado_en), fuente: str(o.fuente),
  }
}
export const aciertosApi = { traer: (signal?: AbortSignal) => pedir<unknown>('/radar/aciertos', { signal }).then(adaptarAciertos) }
