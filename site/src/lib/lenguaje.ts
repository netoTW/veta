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
