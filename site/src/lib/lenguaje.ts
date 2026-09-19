/* ============================================================================
   Lenguaje llano para la vista ESENCIAL.

   El motor habla en su vocabulario (spot-driven, ANCHORED, F/S, §8.3). En la
   vista esencial el lector es un trader retail: se traduce, sin cambiar el
   dato. En la vista avanzada queda el término técnico con su valor, umbral y
   fuente. Traducir no es calcular: sólo se reescribe la frase con los mismos
   números.
   ========================================================================== */

const pct = (x: number) => `${(x * 100).toFixed(x * 100 >= 10 ? 0 : 1).replace('.', ',')} %`
const vez = (x: number) => `${Number(x).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}×`

/** Quita referencias internas del tipo (§8.3) y flechas de motor. */
export const sinReferencias = (t: string) => t.replace(/\s*\(§[\d.]+\)/g, '').replace(/\s*→\s*cuenta como incumplimiento/g, ': cuenta en contra').trim()

/** Un factor del tier (texto del motor) en lenguaje llano. Si no se reconoce, se limpia. */
export function traducirFactor(t: string): string {
  let m: RegExpMatchArray | null
  if ((m = t.match(/^(?:FDV\/mcap|F\/S) = ([\d.]+) \(requiere <= ([\d.]+)\)/))) return `Con todos los tokens emitidos, la valuación sería ${vez(+m[1])} la actual; el límite es ${vez(+m[2])}`
  if ((m = t.match(/^top-10 = ([\d.]+) \((>=|<=|>|<) ([\d.]+)\)/))) return `Los diez mayores tenedores concentran el ${pct(+m[1])} del supply; el límite es ${pct(+m[3])}`
  if ((m = t.match(/^ADV = (.+?) \(requiere >= (.+?)\)/))) return `Se opera ${m[1]} por día en promedio; se requiere al menos ${m[2]}`
  if (/^unlock 60d: dato ausente/.test(t)) return 'No hay dato de desbloqueos de tokens en los próximos 60 días: cuenta en contra'
  if (/^OI\/mcap: dato ausente/.test(t)) return 'No hay dato de apalancamiento en perpetuos: cuenta en contra'
  if (/^spot-driven: dato ausente/.test(t)) return 'No hay dato para saber si el precio lo mueve el contado o el apalancamiento: cuenta en contra'
  if (/perp-driven indeterminado/.test(t)) return 'No se pudo determinar si el precio lo mueve el apalancamiento'
  if ((m = t.match(/^incumple (\d+) condiciones? de BAJO/))) return `${m[1]} condiciones de riesgo bajo sin cumplir`
  return sinReferencias(t)
}

export const TIER_LLANO: Record<string, string> = {
  BAJO: 'cumple las condiciones de riesgo bajo',
  MEDIO: 'incumple alguna condición, sin extremos',
  ALTO: 'incumple varias condiciones o hay datos que cuentan en contra',
}

/** Estado económico del motor en una frase. */
export function estadoEconomicoLlano(estado: string, captura: boolean): string {
  switch ((estado || '').toUpperCase()) {
    case 'ANCHORED': return captura ? 'El protocolo factura y el token participa de esa caja' : 'El protocolo factura, pero no se pudo verificar que el token participe'
    case 'PRE_REVENUE': return 'El protocolo todavía no factura'
    case 'NARRATIVE': return 'El precio vive de la narrativa, no de una caja'
    case 'GOVERNANCE': return 'El token es sólo gobernanza: no participa de la caja'
    default: return captura ? 'Captura de valor verificada' : 'Captura de valor no verificada'
  }
}

/** Lectura de microestructura en una frase. */
export function microLlano(lectura?: string | null): string {
  switch ((lectura || '').toLowerCase()) {
    case 'spot_driven': case 'spot-driven': return 'El precio lo mueve la compra al contado, no el apalancamiento'
    case 'perp_driven': case 'perp-driven': return 'El precio lo mueve el apalancamiento en perpetuos'
    case 'indeterminado': return 'No se pudo determinar qué mueve el precio'
    default: return lectura ? sinReferencias(lectura) : 'Sin lectura de microestructura'
  }
}

/** "1/11" → "a 1/11 de su máximo histórico". */
export const fraccionLlana = (f: string) => (f ? `a ${f} de su máximo histórico` : '')

/** Frases de control interno que no pueden llegar al cliente: criterios, mínimos, conteos
    de comparables. Si un texto del informe las trae, no se muestra. */
const CRITERIO_INTERNO = new RegExp([
  // criterios y mínimos del método
  'pasan el criterio', 'el m\u00ednimo', 'm\u00ednimo \\d', 'comparables cumplen', 'criterio de corte',
  // nombres del taller
  'esc\u00e9ptico', 'verificador', 'redactor', 'el motor',
  'sin comparables v\u00e1lidos', 'umbral', 'observable', 'no se usa para el tier',
  // listas de descarte: trabajo interno, no lectura
  'quedaron fuera', 'banda de tama\u00f1o', 'una esquina de lo que factura', 'top-\\d+ bruto',
  'se descontaron \\d+ posiciones', 'supply total',
  // lo que no hay no se muestra
  'no se pudo medir', 'no se pudo calcular', 'no se pudieron reconstruir', 'no se pudo reconstruir', 'la serie cubre \\d+ semanas',
  'dato ausente', 'cuenta como ausente', 'no cuenta a favor', 'sin dato ', 'no hay dato', 'no es calculable',
  'no calculable', 'sin medici\u00f3n', 'no est\u00e1 calibrada',
].join('|'), 'i')
export const tieneCriterioInterno = (t?: string | null) => !!t && CRITERIO_INTERNO.test(t)

/** Quita de un texto del informe las frases escritas para control interno: criterios, mínimos,
    listas de descartes, conteos de comparables. Corta por punto y por " · ", que es como el
    informe separa ideas. Si no queda nada legible, devuelve cadena vacía y no se muestra. */
export function limpiarProsa(t?: string | null): string {
  if (!t) return ''
  const trozos = t.split(/(?<=\.)\s+|\s+·\s+/)
  const buenos = trozos.filter((x) => x.trim() && !tieneCriterioInterno(x))
  const out = buenos.join(' ').replace(/\s{2,}/g, ' ').trim()
  return /[a-záéíóúñ]/i.test(out) ? out : ''
}

/** Mientras el motor no exporte su propio chequeo, una moneda es analizable si hay algo que
    medir: ingresos del protocolo o capital depositado. Sin ninguno de los dos, el informe no
    puede decir nada cuantitativo y no se publica en Análisis. (Hueco 39 del contrato.) */
export function esAnalizable(r: { fundamentales?: { revenue_protocolo?: number | null; tvl?: number | null } | null }): boolean {
  const f = r.fundamentales
  if (!f) return false
  return (typeof f.revenue_protocolo === 'number' && f.revenue_protocolo > 0)
      || (typeof f.tvl === 'number' && f.tvl > 0)
}

/** Palabras del taller que no van a vista de cliente, cambiadas por las de todos los días.
    Se aplica sobre texto que viene del informe, después de quitar las referencias. */
export function llano(t?: string | null): string {
  if (!t) return ''
  return sinReferencias(t)
    .replace(/\bumbrales\b/gi, 'límites').replace(/\bumbral\b/gi, 'límite')
    .replace(/\bobservables\b/gi, 'señales').replace(/\bobservable\b/gi, 'señal')
    .replace(/\bcorrida\b/gi, 'pasada').replace(/\bscanner\b/gi, 'rastreo')
    .replace(/\s*§\s*[\d.]+/g, '')
    .replace(/\s{2,}/g, ' ').trim()
}