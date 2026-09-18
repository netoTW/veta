/* Formato de números y fechas. Formatear no es calcular: acá sólo se decide
   cuántos decimales y qué separadores se muestran. */

const NBSP = ' ' // espacio fino: separador de miles

export function num(v: number | null | undefined, dec = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = Math.abs(v).toFixed(dec)
  const [ent, fr] = s.split('.')
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  return (v < 0 ? '−' : '') + miles + (fr ? '.' + fr : '')
}

/** Porcentaje a partir de una fracción (0.061 → 6.1 %). */
export function pct(v: number | null | undefined, dec = 1, signo = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const s = num(v * 100, dec) + NBSP + '%'
  return signo && v > 0 ? '+' + s : s
}

export function usd(v: number | null | undefined, dec = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return num(v, dec) + NBSP + 'USD'
}

/** Precio: decimales según magnitud. */
export function precio(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const dec = v >= 100 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6
  return num(v, dec) + NBSP + 'USD'
}

export const mult = (v: number | null | undefined, dec = 2) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : num(v, dec) + '×'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** "2026-09-12" o ISO → "12 sep 2026". */
export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`
}

/** ISO con hora → "12 sep 2026 · 17:58 UTC". */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return fecha(iso)
  return `${fecha(iso)} · ${m[4]}:${m[5]} UTC`
}

export const dias = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${num(n)} ${n === 1 ? 'día' : 'días'}`

/** Etiquetas legibles para claves del motor. */
export const TIPO_ESCENARIO: Record<string, string> = {
  bull: 'Alcista por fundamentales',
  bull_reflexivo: 'Alcista por historial propio',
  base: 'Base',
  bear: 'Bajista',
}
export const ESTADO_TESIS_LABEL: Record<string, string> = {
  INTACTA: 'Intacta', DEBILITANDOSE: 'Debilitándose', ROTA: 'Rota', CERRADA: 'Cerrada',
}
export const TIER_LABEL: Record<string, string> = { BAJO: 'Riesgo bajo', MEDIO: 'Riesgo medio', ALTO: 'Riesgo alto' }
export const CALIDAD_LABEL: Record<string, string> = { ok: 'ok', parcial: 'parcial', ausente: 'ausente' }

/** Las notas del motor vienen con " · " como separador de frases. */
export const frases = (s: string | null | undefined) =>
  (s ?? '').split(' · ').map((x) => x.trim()).filter(Boolean)

/* ---------- Sprint 6: etiquetas de los campos estructurados ---------- */
export const SEVERIDAD_LABEL: Record<string, string> = {
  COMPROMETE_TESIS: 'Compromete la tesis', LIMITA_LECTURA: 'Limita la lectura', CONTEXTO: 'Contexto',
}
export const SEVERIDAD_CORTA: Record<string, string> = { COMPROMETE_TESIS: 'compromete', LIMITA_LECTURA: 'limita', CONTEXTO: 'contexto' }
export const TIPO_ADV_LABEL: Record<string, string> = {
  dato_ausente: 'dato ausente', dato_inconsistente: 'dato inconsistente', objecion_esceptico: 'objeción del Escéptico',
  limite_de_modelo: 'límite del modelo', metrica_no_calculable: 'métrica no calculable',
  catalizador_sin_fecha: 'catalizador sin fecha', calidad_parcial: 'calidad parcial',
  regla_de_metodologia: 'regla de metodología', tesis_contradicha: 'tesis contradicha', sin_clasificar: 'sin clasificar',
}
export const DIRECCION_LABEL: Record<string, string> = { menor_que: 'por debajo de', mayor_que: 'por encima de' }
export const DIRECCION_SIGNO: Record<string, string> = { menor_que: '<', mayor_que: '>' }
export const MOTIVO_BENCHMARK_LABEL: Record<string, string> = {
  sin_universo_guardado: 'sin universo guardado', sin_dias_transcurridos: 'sin días transcurridos',
  serie_incompleta: 'serie incompleta', medicion_desactivada: 'medición desactivada', otro: 'otro motivo',
}
export const CAMPO_LABEL: Record<string, string> = {
  tvl_usd: 'TVL', revenue_protocolo_30d: 'revenue del protocolo (30 d)', revenue_sobre_mcap: 'revenue sobre mcap',
  mcap_usd: 'capitalización', precio_usd: 'precio', volumen_24h_usd: 'volumen 24 h',
}

/** Valor con su unidad, decidida por la unidad del contrato: formatear no es calcular. */
export function conUnidad(v: number | null | undefined, unidad: string): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  const u = (unidad || '').toLowerCase()
  if (u === 'usd') return v >= 1000 ? usd(v) : precio(v)
  if (u === 'ratio' || u === 'fraccion' || u === 'fracción') return num(v, Math.abs(v) < 0.1 ? 4 : 3)
  if (u === '%' || u === 'pct' || u === 'porcentaje') return num(v, 2) + NBSP + '%'
  if (u === 'dias' || u === 'días') return dias(v)
  const dec = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 1 ? 2 : 4
  return num(v, dec) + (unidad ? NBSP + unidad : '')
}
