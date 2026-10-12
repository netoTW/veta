/* Números y fechas del panel, en español: coma decimal, punto de miles, sin inventar decimales. */
const ES = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const ES0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 })

/** Un número para un eje, una leyenda o una cifra suelta, según su magnitud. */
export function fmt(v: number | null | undefined, unidad = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  let s: string
  if (a >= 1e9) s = `${ES.format(v / 1e9)} B`
  else if (a >= 1e6) s = `${ES.format(v / 1e6)} M`
  else if (a >= 1e4) s = `${ES0.format(v)}`
  else if (a >= 100) s = ES.format(v)
  else if (a >= 1) s = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(v)
  else if (a === 0) s = '0'
  else { const dec = Math.min(8, Math.max(2, 2 - Math.floor(Math.log10(a)))); s = new Intl.NumberFormat('es-ES', { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(v) }
  if (!unidad) return s
  if (unidad === '%') return `${s} %`
  if (unidad === 'base 100' || unidad === 'ratio' || unidad === '×' || unidad === '−1…1') return s
  return `${s} ${unidad}`
}
/** Para el eje de precios: sin unidad, con la precisión de un precio. */
export const fmtEje = (v: number) => fmt(v)
export const fmtUsd = (v: number | null | undefined, dec = 2) => (v === null || v === undefined ? '—' : `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v)} US$`)
export const fmtPrecio = (v: number | null | undefined) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: Math.abs(v) >= 100 ? 2 : Math.abs(v) >= 1 ? 4 : 6 }).format(v))

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function fmtFecha(t: number | string | null | undefined, conHora = false): string {
  if (t === null || t === undefined) return '—'
  const d = typeof t === 'number' ? new Date(t * 1000) : new Date(t)
  if (Number.isNaN(d.getTime())) return '—'
  const f = `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
  return conHora ? `${f} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC` : f
}
export function fmtHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''
  const hoy = new Date(); const mismoDia = d.toDateString() === hoy.toDateString()
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return mismoDia ? hhmm : `${d.getDate()} ${MESES[d.getMonth()]} · ${hhmm}`
}
export function hace(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (!Number.isFinite(m)) return ''
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`
}
/** Lo que queda hasta una fecha, en minutos y segundos; null si ya pasó. */
export function quedan(iso: string | null | undefined): string | null {
  if (!iso) return null
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000)
  if (!Number.isFinite(s) || s <= 0) return null
  return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const RANGO_LABEL: Record<string, string> = { '30d': '30 d', '60d': '60 d', '90d': '90 d', '3m': '3 m', '6m': '6 m', '1y': '1 a', max: 'máx' }
export const INTERVALO_LABEL: Record<string, string> = { '1h': '1 h', '4h': '4 h', '1d': '1 d', '1w': '1 sem' }

/** Un motivo de «sin datos» en llano: sin el nombre de la excepción de Python delante. */
export const motivoLlano = (m: string | null | undefined) => (m ?? '').replace(/\b[A-Z][A-Za-z]*(Error|Exception)\s*:\s*/g, '').trim()
/** Una capa vacía (no hay gatillos con nivel de precio) no es un dato que falte: no se avisa. */
export const esCapaVacia = (m: string | null | undefined) => /no hay gatillos activos/i.test(m ?? '')
