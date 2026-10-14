/* ============================================================================
   La forma de `GET /radar/aciertos` (CONTRATO-PANEL §8.9, v2.6 y v2.7) y su
   adaptador tolerante: lo que falta queda vacío, nunca un cero inventado. La vista
   está en Aciertos.tsx.
   v2.7: cada plazo trae además la mediana del universo que el radar no marcó en el
   mismo período (`universo_pct`), para comparar lo marcado contra lo no marcado.
   ========================================================================== */
import { pedir } from './api6b'

export type Plazo = '7d' | '14d' | '30d' | 'a_hoy'
export const PLAZOS: Plazo[] = ['7d', '14d', '30d', 'a_hoy']
export const NOMBRE_PLAZO: Record<Plazo, string> = { '7d': '7 días', '14d': '14 días', '30d': '30 días', a_hoy: 'Hasta hoy' }

export type EstadoPlazo = 'cumplido' | 'parcial' | 'pendiente' | 'sin_datos'
export interface Agregado {
  n: number; pendientes: number; plazo: EstadoPlazo | null
  acierto_pct: number | null; ret_mediano_pct: number | null; ret_medio_pct: number | null; exceso_medio_pct: number | null
  acierto_vs_universo_pct: number | null; exceso_universo_mediano_pct: number | null; universo_n_mediano: number | null
  peor: { activo: string; ret_pct: number } | null; mejor: { activo: string; ret_pct: number } | null
}
export interface Medida { pendiente: boolean; sin_precio: boolean; fecha: string | null; dias: number | null; ret_pct: number | null; btc_pct: number | null; exceso_pct: number | null; universo_pct: number | null; universo_n: number | null }
export interface SenalAciertos { id: string; fecha: string; activo: string; modo: string | null; version: string | null; precio: number | null; estado: string | null; medida: Record<Plazo, Medida | null> }
/** `primera`: la fecha en que se cumple el primer plazo todavía pendiente, por plazo (de las señales de la fila). */
export interface FilaAciertos { clave: string; etiqueta: string; senales: number; desde: string | null; hasta: string | null; plazos: Record<Plazo, Agregado | null>; primera: Record<Plazo, string | null>; texto: string | null; items: SenalAciertos[]; tipo: 'modo' | 'total' | 'luffy' }

/* la caja contra mantener: cada compra, lo que hizo la caja y lo que habría dado quedarse con la moneda */
export interface Mantener { pendiente: boolean; sin_precio: boolean; fecha: string | null; ret_pct: number | null; salio_por_stop: string | null }
export interface OperacionCaja {
  id: string; activo: string; mision: string | null; simulado: boolean; fecha: string
  precio_entrada: number | null; usdt: number | null; stop_caja: number | null; tesis: string | null
  real: { abierta: boolean; fecha: string | null; precio_salida: number | null; ret_pct: number | null; pnl_usdt: number | null; dias: number | null; ventas: number | null }
  atr_pct: number | null; stop_volatilidad: number | null
  sin_stop: Record<Plazo, Mantener | null>; con_stop: Record<Plazo, Mantener | null>
}
/** Sólo las operaciones reales (las de misiones simuladas no cuentan). */
export interface ResumenCaja { operaciones: number; real_medio_pct: number | null; sin_stop: Record<Plazo, number | null>; con_stop: Record<Plazo, number | null> }
export interface Caja { operaciones: OperacionCaja[]; resumen: ResumenCaja | null; metodo_stop: string | null }

export interface Aciertos {
  filas: FilaAciertos[]; caja: Caja | null
  universo: { monedas: number | null; que_es: string | null } | null
  no_disponibles: { seccion: string; motivo: string }[]; consultado_en: string | null; calculado_en: string | null; fuente: string | null
}

type Crudo = Record<string, unknown>
const obj = (v: unknown): Crudo => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Crudo) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const porPlazo = <T,>(f: (k: Plazo) => T) => Object.fromEntries(PLAZOS.map((p) => [p, f(p)])) as Record<Plazo, T>
const ESTADOS: EstadoPlazo[] = ['cumplido', 'parcial', 'pendiente', 'sin_datos']
const extremo = (v: unknown) => { const o = obj(v), a = str(o.activo), r = num(o.ret_pct); return a && r !== null ? { activo: a, ret_pct: r } : null }
const agregado = (v: unknown): Agregado | null => {
  const o = obj(v); const n = num(o.n)
  if (n === null) return null
  const e = str(o.plazo) as EstadoPlazo | null
  return {
    n, pendientes: num(o.pendientes) ?? 0, plazo: e && ESTADOS.includes(e) ? e : null,
    acierto_pct: num(o.acierto_pct), ret_mediano_pct: num(o.ret_mediano_pct), ret_medio_pct: num(o.ret_medio_pct), exceso_medio_pct: num(o.exceso_medio_pct),
    acierto_vs_universo_pct: num(o.acierto_vs_universo_pct), exceso_universo_mediano_pct: num(o.exceso_universo_mediano_pct), universo_n_mediano: num(o.universo_n_mediano),
    peor: extremo(o.peor), mejor: extremo(o.mejor),
  }
}
const medida = (v: unknown): Medida | null => {
  const o = obj(v)
  if (!Object.keys(o).length) return null
  return { pendiente: o.pendiente === true, sin_precio: o.sin_precio === true, fecha: str(o.fecha), dias: num(o.dias), ret_pct: num(o.ret_pct), btc_pct: num(o.btc_pct), exceso_pct: num(o.exceso_pct), universo_pct: num(o.universo_pct), universo_n: num(o.universo_n) }
}
const plazos = (o: Crudo) => porPlazo((p) => agregado(o[p]))
// los ejemplos del contrato cierran la lista con «… 83 más»: lo que no es objeto se descarta
const senales = (v: unknown, precio: 'precio_senal' | 'precio_propuesta'): SenalAciertos[] => arr(v).flatMap((x) => {
  const o = obj(x), activo = str(o.activo), fecha = str(o.fecha)
  if (!activo || !fecha) return []
  const m = obj(o.medida)
  return [{ id: String(o.id ?? `${activo}-${fecha}`), fecha, activo, modo: str(o.modo), version: o.version === undefined || o.version === null ? null : String(o.version), precio: num(o[precio]), estado: str(o.estado), medida: porPlazo((p) => medida(m[p])) }]
})

const primeras = (xs: SenalAciertos[]) => porPlazo((p) => xs.map((s) => s.medida[p]).filter((m) => m?.pendiente && m.fecha).map((m) => m!.fecha!).sort()[0] ?? null)

const mantener = (v: unknown): Mantener | null => {
  const o = obj(v)
  if (!Object.keys(o).length) return null
  return { pendiente: o.pendiente === true, sin_precio: o.sin_precio === true, fecha: str(o.fecha), ret_pct: num(o.ret_pct), salio_por_stop: str(o.salio_por_stop) }
}
function adaptarCaja(v: unknown): Caja | null {
  const c = obj(v)
  if (!Object.keys(c).length) return null
  const operaciones: OperacionCaja[] = arr(c.operaciones).flatMap((x) => {
    const o = obj(x), activo = str(o.activo), fecha = str(o.fecha)
    if (!activo || !fecha) return []
    const r = obj(o.real), sin = obj(o.mantener_sin_stop), con = obj(o.mantener_stop_volatilidad)
    return [{
      id: String(o.id ?? `${activo}-${fecha}`), activo, mision: str(o.mision), simulado: o.simulado === true, fecha,
      precio_entrada: num(o.precio_entrada), usdt: num(o.usdt), stop_caja: num(o.stop_caja), tesis: str(o.tesis),
      real: { abierta: r.abierta === true, fecha: str(r.fecha), precio_salida: num(r.precio_salida), ret_pct: num(r.ret_pct), pnl_usdt: num(r.pnl_usdt), dias: num(r.dias), ventas: num(r.ventas) },
      atr_pct: num(o.atr_pct), stop_volatilidad: num(o.stop_volatilidad),
      sin_stop: porPlazo((p) => mantener(sin[p])), con_stop: porPlazo((p) => mantener(con[p])),
    }]
  })
  const r = obj(c.resumen_real), n = num(r.operaciones)
  const resumen = n === null ? null : { operaciones: n, real_medio_pct: num(r.real_medio_pct), sin_stop: porPlazo((p) => num(r[`sin_stop_${p}_medio_pct`])), con_stop: porPlazo((p) => num(r[`stop_vol_${p}_medio_pct`])) }
  return { operaciones, resumen, metodo_stop: str(c.metodo_stop) }
}

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
  const vit = obj(o.vitrina), uni = obj(o.universo)
  return {
    filas,
    caja: adaptarCaja(o.caja),
    universo: Object.keys(uni).length ? { monedas: num(uni.monedas_con_velas), que_es: str(uni.que_es) } : null,
    no_disponibles: arr(o.no_disponibles).flatMap((x) => { const n = obj(x), m = str(n.motivo); return m ? [{ seccion: str(n.seccion) ?? '', motivo: m }] : [] }),
    consultado_en: str(o.consultado_en), calculado_en: str(vit.calculado_en), fuente: str(o.fuente),
  }
}
export const aciertosApi = { traer: (signal?: AbortSignal) => pedir<unknown>('/radar/aciertos', { signal }).then(adaptarAciertos) }
