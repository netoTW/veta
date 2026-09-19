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
  // puntajes y rutas técnicas: nunca fueron para el cliente
  'puntaje de', 'sobre 40', 'fuente: [a-z0-9/._-]+$', 'campo del paquete',
  // hablar de nuestro propio proceso no es una lectura
  'no se publica', 'no se muestra', 'no entra en el informe', 'sin respaldo',
  // no hay con qué comparar: es un hueco, y los huecos no se enseñan
  'no se puede comparar', 'no hay comparables', 'con los? que construir', 'con los? que medir',
  'no tiene revenue', 'ni tenedores',
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
/* ---------- el texto que llega de afuera no siempre viene en nuestro idioma ----------
   Lo que el sistema de análisis escribe puede venir en voseo y en minúscula.
   Se corrige acá, al mostrarlo: es la última frontera antes del lector. */
const VOSEO: Record<string, string> = {
  sos: 'eres', tenés: 'tienes', podés: 'puedes', querés: 'quieres', sabés: 'sabes', valés: 'vales',
  venís: 'vienes', decís: 'dices', pedí: 'pide', mirá: 'mira', fijate: 'fíjate', tené: 'ten',
  poné: 'pon', hacé: 'haz', elegí: 'elige', probá: 'prueba', escribí: 'escribe', buscá: 'busca',
  esperá: 'espera', revisá: 'revisa', usá: 'usa', dejá: 'deja', andá: 've', avisá: 'avisa', mandá: 'manda',
}
/* Nada de \b: las palabras terminan en vocal acentuada y \b no la reconoce como letra. */
const RE_VOSEO = new RegExp(`(?<!\\p{L})(${Object.keys(VOSEO).join('|')})(?!\\p{L})`, 'giu')
/** Cambia el voseo por tuteo y respeta si la palabra venía en mayúscula. */
export function tuteo(t: string): string {
  return t.replace(RE_VOSEO, (m) => {
    const con = VOSEO[m.toLowerCase()]
    if (!con) return m
    return m[0] === m[0].toUpperCase() ? con.charAt(0).toUpperCase() + con.slice(1) : con
  })
}
/** Una frase que se muestra empieza en mayúscula, venga como venga. */
const mayusculaInicial = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t)

export function llano(t?: string | null): string {
  if (!t) return ''
  const crudo = sinReferencias(t)
    .replace(/\s*·\s*motor\s*§[\d.]+/g, '').replace(/\s*§[\d.]+(\s*S\d+)?/g, '')
    .replace(/\bumbrales\b/gi, 'límites').replace(/\bumbral\b/gi, 'límite')
    .replace(/\bobservables\b/gi, 'señales').replace(/\bobservable\b/gi, 'señal')
    .replace(/\bcorrida\b/gi, 'pasada').replace(/\bscanner\b/gi, 'rastreo')
    .replace(/\brevenue anualizado\b/gi, 'ingresos anualizados').replace(/\brevenue\b/gi, 'ingresos').replace(/\bTVL\b/g, 'fondos bloqueados')
    .replace(/\bsupply\b/gi, 'circulante')
    // coletilla recurrente: la frase buena termina antes de decir que falta el dato
    .replace(/,?\s*y la lectura de [^.]*?es '?sin lectura'?/gi, '')
    .replace(/\s*§\s*[\d.]+/g, '')
    .replace(/\s{2,}/g, ' ').trim()
  const limpio = mayusculaInicial(tuteo(crudo))
  return limpio
}

/* ============================================================================
   Revisión antes de publicar fuera.

   Lo que se copia de la plataforma a otro sitio ya no pasa por ninguna
   pantalla nuestra: es la última oportunidad de ver qué se cuela. No corrige,
   señala. Corregir a ciegas un texto que se va a publicar es peor que avisar.
   ========================================================================== */

/** Identificadores del taller que a veces viajan dentro de un paréntesis. */
const IDENTIFICADORES = /\b(?:dl_[a-z_]+|[a-z]+_sobre_[a-z]+|[a-z]+_usd|ANCHORED|PRE_REVENUE|NARRATIVE|GOVERNANCE|fapi\/[a-z0-9/]+|api\/v\d)\b/g

/** Quita los identificadores y el paréntesis que los envolvía si queda vacío. */
export const sinIdentificadores = (t: string) =>
  t.replace(IDENTIFICADORES, '')
    .replace(/\(\s*[,;·\s]*\)/g, '')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()

export interface Reparo { que: string; donde: string }

/** Lo que nunca puede salir publicado, con el nombre del problema en claro. */
const REPAROS: { que: string; re: RegExp }[] = [
  { que: 'vocabulario interno', re: /\b(motor|esc[eé]ptico|verificador|redactor|criterio|umbral|observable|corrida|paquete|scanner)\b/i },
  { que: 'identificador técnico', re: IDENTIFICADORES },
  { que: 'referencia a un apartado', re: /§\s*[\d.]+/ },
  { que: 'puntaje interno', re: /puntaje|sobre 40\b/i },
  { que: 'habla de un dato que falta', re: /dato ausente|no se pudo (medir|calcular|determinar|reconstruir)|sin lectura|sin dato\b|no hay dato|no hay comparables|no se puede comparar|no tiene (revenue|ingresos|fondos bloqueados)/i },
  { que: 'habla de nuestro proceso', re: /no se publica|no se muestra|queda fuera del|no entra en el informe|sin respaldo/i },
  { que: 'consejo de compra o venta', re: /\b(compra|compr[aá]|vende|vend[eé]|comprar|vender)\b/i },
  { que: 'promesa de retorno', re: /\b(garantizad[oa]|seguro que|rentabilidad asegurada|precio objetivo|va a subir|va a bajar)\b/i },
  { que: 'voseo', re: /(?<!\p{L})(sos|ten[eé]s|pod[eé]s|quer[eé]s|sab[eé]s|ped[ií]|mir[aá]|fijate|pon[eé]|hac[eé]|eleg[ií]|prob[aá]|escrib[ií])(?!\p{L})/iu },
]

/** Revisa un texto ya compuesto. Devuelve un reparo por cada cosa encontrada. */
export function revisarParaPublicar(texto: string): Reparo[] {
  const out: Reparo[] = []
  for (const r of REPAROS) {
    const m = texto.match(r.re)
    if (m) out.push({ que: r.que, donde: m[0] })
  }
  return out
}
