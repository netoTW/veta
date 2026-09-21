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
  if ((m = t.match(/^VaR95 1d = ([\d.]+) \((>=|<=|>|<) ([\d.]+)\)/))) return `En un día malo de cada veinte cae ${pct(+m[1])}; el límite es ${pct(+m[3])}`
  if ((m = t.match(/^CVaR95 7d = ([\d.]+) \((>=|<=|>|<) ([\d.]+)\)/))) return `En una mala semana de cada veinte cae ${pct(+m[1])}; el límite es ${pct(+m[3])}`
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
    case 'NEGOCIO_SIN_CAPTURA': return 'El protocolo factura, pero el token no participa de esa caja'
    case 'REFLEXIVE': return 'El precio se sostiene sobre su propia dinámica, no sobre una caja'
    case 'PRE_REVENUE': return 'El protocolo todavía no factura'
    case 'NARRATIVE': return 'El precio vive de la narrativa, no de una caja'
    case 'GOVERNANCE': return 'El token es sólo gobernanza: no participa de la caja'
    // Un código que no conocemos no se traduce a la ligera: afirmar lo contrario de lo que
    // dice el informe es peor que no decir nada. Quien llama omite la línea si vuelve vacía.
    default: return ''
  }
}

/** Lectura de microestructura en una frase. */
export function microLlano(lectura?: string | null): string {
  switch ((lectura || '').toLowerCase().replace(/a$/, 'o')) {
    case 'spot_driven': case 'spot-driven': return 'El precio lo mueve la compra al contado, no el apalancamiento'
    case 'perp_driven': case 'perp-driven': return 'El precio lo mueve el apalancamiento en perpetuos'
    // Indeterminado es un hueco, y los huecos no se enseñan: cadena vacía y la línea se omite.
    case 'indeterminado': return ''
    default: return lectura ? sinReferencias(lectura) : ''
  }
}

/** "1/11" → "a 1/11 de su máximo histórico". */
export const fraccionLlana = (f: string) => (f ? `a ${f} de su máximo histórico` : '')

/** Frases de control interno que no pueden llegar al cliente: criterios, mínimos, conteos
    de comparables. Si un texto del informe las trae, no se muestra. */
/** Cada familia de patrones, con su nombre. Enumerable a propósito: de aquí sale la
    lista que se le pasa al motor para que el Narrador deje de escribirlos
    (ver PATRONES-PROSA-MOTOR.md). Añadir uno aquí lo añade al filtro y al informe. */
export const FAMILIAS_INTERNAS: { clave: string; que: string; patrones: string[] }[] = [
  { clave: 'criterio', que: 'Criterios y mínimos del método', patrones: [
    'pasan el criterio', 'el m\u00ednimo', 'm\u00ednimo \\d', 'comparables cumplen', 'criterio de corte',
    'no se usa para el tier'] },
  { clave: 'taller', que: 'Nombres de los agentes y del sistema', patrones: [
    'esc\u00e9ptico', 'verificador', 'redactor', 'el motor', 'umbral', 'observable'] },
  { clave: 'descarte', que: 'Listas de descarte: trabajo interno, no lectura', patrones: [
    'quedaron fuera', 'banda de tama\u00f1o', 'una esquina de lo que factura', 'top-\\d+ bruto',
    'se descontaron \\d+ posiciones', 'supply total', 'sin comparables v\u00e1lidos'] },
  { clave: 'ausente', que: 'Decir que un dato falta', patrones: [
    'no se pudo medir', 'no se pudo calcular', 'no se pudieron reconstruir', 'no se pudo reconstruir',
    'la serie cubre \\d+ semanas', 'dato ausente', 'cuenta como ausente', 'no cuenta a favor',
    'sin dato ', 'no hay dato', 'no es calculable', 'no calculable', 'sin medici\u00f3n', 'no est\u00e1 calibrada'] },
  { clave: 'puntaje', que: 'Puntajes internos y rutas técnicas', patrones: [
    'puntaje de', 'sobre 40', 'fuente: [a-z0-9/._-]+$', 'campo del paquete'] },
  { clave: 'proceso', que: 'Hablar de nuestro propio proceso editorial', patrones: [
    'no se publica', 'no se muestra', 'no entra en el informe', 'sin respaldo'] },
  { clave: 'metodo', que: 'Notas de método estadístico o de fuente', patrones: [
    'student-?t', 'bootstrap', '\\bskew\\b', '\\badapter\\b', '\\bEWMA\\b', '\\bMLE\\b',
    'colas gruesas', 'var\u2089\u2085', 'cvar\u2089\u2085', '\\bVaR\\b', '\\bCVaR\\b',
    'ventana observada', 'observaciones\\)', 'de bloques sobre',
    'peor semana observada', 'reescalado por ra[ií]z', 'la comparaci\u00f3n contra', 'la mediana depende',
    'd\u00edas de historia, y la mediana'] },
  { clave: 'no_aplica', que: 'Marcadores de dato que no aplica', patrones: [
    '\\bn/d\\b', '\\bN/D\\b', '\\bnd\\b(?= )', 'sin valor', 'calidad parcial',
    'no se pudo evaluar', 'no se pudo determinar', 'no est\u00e1 comprobado', 'no alcanzan los datos'] },
  { clave: 'sin_comparar', que: 'No hay con qué comparar: es un hueco', patrones: [
    'no se puede comparar', 'no hay comparables', 'con los? que construir', 'con los? que medir',
    'no tiene revenue', 'ni tenedores'] },
]

const CRITERIO_INTERNO = new RegExp(FAMILIAS_INTERNAS.flatMap((f) => f.patrones).join('|'), 'i')
export const tieneCriterioInterno = (t?: string | null) => !!t && CRITERIO_INTERNO.test(t)

/** Quita de un texto del informe las frases escritas para control interno: criterios, mínimos,
    listas de descartes, conteos de comparables. Corta por punto y por " · ", que es como el
    informe separa ideas. Si no queda nada legible, devuelve cadena vacía y no se muestra. */
export function limpiarProsa(t?: string | null): string {
  if (!t) return ''
  const trozos = t.split(/(?<=\.)\s+|\s+·\s+/)
  const buenos = trozos.filter((x) => x.trim() && !tieneCriterioInterno(x))
  const out = buenos.join(' ').replace(/\s{2,}/g, ' ').trim()
  return /[a-záéíóúñ]/i.test(out) ? sinMarcaRepetida(out) : ''
}

/* El motor cuelga "(sin fecha)" al final de cada catalizador sin datar, también
   cuando la frase ya lo decía: "…(confirmado como plan, sin fecha). (sin fecha)".
   Leerlo dos veces parece un error de quien escribe, así que se quita el de
   fuera y se deja el que está dentro de la frase. El arreglo de verdad es del
   motor y está anotado en el contrato. */
function sinMarcaRepetida(t: string): string {
  const sobra = /\s*\(sin fecha\)\s*\.?\s*$/i
  if (!sobra.test(t)) return t
  const sinLaDeFuera = t.replace(sobra, '').trim()
  return /sin fecha/i.test(sinLaDeFuera) ? (sinLaDeFuera.endsWith('.') ? sinLaDeFuera : `${sinLaDeFuera}.`) : t
}

/* ---------- las fuentes, en palabras ----------

   El motor identifica sus fuentes con la cadena que usa para pedirlas:
   `binance:spot/klines`, `defillama:/summary/fees/pumpswap?dataType=…`,
   `equal-weight sobre 69 de 100 monedas`. Eso es una dirección de llamada, no
   una explicación, y en una pantalla de cliente se lee como un descuido.

   Aquí se traduce a lo que la persona necesita saber: de dónde sale el número
   y cómo está construido. La cadena original no se tira —vale para auditar—,
   se guarda para el desplegable de avanzado. */
const FUENTES: { re: RegExp; di: (m: RegExpMatchArray) => string }[] = [
  { re: /equal-weight sobre (\d+) de (\d+) monedas/i, di: (m) => `Canasta de ${m[1]} monedas, mismo peso cada una` },
  { re: /medias\s*(\d+)\s*\/\s*(\d+)\s*long-only/i, di: (m) => `Regla de medias de ${m[1]} y ${m[2]} días, sólo comprado` },
  { re: /expuesto (\d+) de (\d+) d[ií]as desde la publicaci[oó]n/i, di: (m) => `Comprado ${m[1]} de los ${m[2]} días desde que se publicó` },
  { re: /^binance:[\w/]+/i, di: () => 'Precios de Binance' },
  { re: /^defillama/i, di: () => 'Datos de DefiLlama' },
  { re: /^coingecko/i, di: () => 'Datos de CoinGecko' },
]

/** La fuente del motor contada en una línea. '' si no hay nada que decir. */
export function fuenteDeCliente(bruto?: string | null): string {
  const t = (bruto ?? '').trim()
  if (!t) return ''
  const partes: string[] = []
  for (const { re, di } of FUENTES) {
    const m = t.match(re)
    if (m && !partes.includes(di(m))) partes.push(di(m))
  }
  return partes.join(' · ')
}

/** ¿Queda algo sin traducir? Entonces es texto de máquina y no se enseña. */
export const esFuenteCruda = (bruto?: string | null) => {
  const t = (bruto ?? '').trim()
  return !!t && /[a-z]+:[\w/]|https?:\/\/|dataType=|\?|equal-weight|long-only/i.test(t)
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
const IDENTIFICADORES = /\b(?:dl_[a-z_]+|[a-z]+_sobre_[a-z]+|[a-z]+_usd|ANCHORED|PRE_REVENUE|NARRATIVE|GOVERNANCE|fapi\/[a-z0-9/]+|api\/v\d)\b/g

/** Quita los identificadores y el paréntesis que los envolvía si queda vacío. */
export const sinIdentificadores = (t: string) =>
  t.replace(IDENTIFICADORES, '')
    .replace(/\(\s*[,;·\s]*\)/g, '')
    .replace(/\(\s*,\s*/g, '(')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()


/* ---------- el texto que llega de afuera no siempre viene en nuestro idioma ----------
   Lo que el sistema de análisis escribe puede venir en voseo y en minúscula.
   Se corrige acá, al mostrarlo: es la última frontera antes del lector. */
export const VOSEO: Record<string, string> = {
  sos: 'eres', tenés: 'tienes', podés: 'puedes', querés: 'quieres', sabés: 'sabes', valés: 'vales',
  venís: 'vienes', decís: 'dices', pedí: 'pide', mirá: 'mira', fijate: 'fíjate', tené: 'ten',
  poné: 'pon', hacé: 'haz', elegí: 'elige', probá: 'prueba', escribí: 'escribe', buscá: 'busca',
  esperá: 'espera', revisá: 'revisa', usá: 'usa', dejá: 'deja', andá: 've', avisá: 'avisa', mandá: 'manda',
  arriesgás: 'arriesgas', ganás: 'ganas', perdés: 'pierdes', entrás: 'entras', salís: 'sales',
  comprás: 'compras', vendés: 'vendes', esperás: 'esperas', mirás: 'miras', necesitás: 'necesitas',
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

/** Palabra del taller → palabra de todos los días. Enumerable: de aquí sale la
    lista que se le pasa al motor (ver PATRONES-PROSA-MOTOR.md). El orden importa:
    lo más específico primero. */
export const TRADUCCIONES: { de: RegExp; a: string; nota: string }[] = [
  { de: /\s*·\s*motor\s*§[\d.]+/g, a: '', nota: 'firma del sistema al final de una frase' },
  { de: /\s*§\s*[\d.]+(\s*S\d+)?/g, a: '', nota: 'referencia a un apartado del método' },
  { de: /\bumbrales\b/gi, a: 'límites', nota: 'término del taller' },
  { de: /\bumbral\b/gi, a: 'límite', nota: 'término del taller' },
  { de: /\bobservables\b/gi, a: 'señales', nota: 'término del taller' },
  { de: /\bobservable\b/gi, a: 'señal', nota: 'término del taller' },
  { de: /\bcorrida\b/gi, a: 'pasada', nota: 'término del taller' },
  { de: /\bscanner\b/gi, a: 'rastreo', nota: 'término del taller' },
  /* Jerga de índices que el motor mete en los nombres de sus varas. */
  { de: /\bequal-weight\b/gi, a: 'de peso igual', nota: 'jerga de índices' },
  { de: /\blong-only\b/gi, a: 'sólo comprado', nota: 'jerga de índices' },
  { de: /\brevenue anualizado\b/gi, a: 'ingresos anualizados', nota: 'inglés sin traducir' },
  { de: /\b(el|El)\s+revenue\b/g, a: '$1 ingreso', nota: 'singular masculino: conserva verbo y adjetivo' },
  { de: /\bdel\s+revenue\b/gi, a: 'del ingreso', nota: 'contracción en singular' },
  { de: /\brevenue\b/gi, a: 'ingresos', nota: 'inglés sin traducir' },
  { de: /\b(el|El)\s+TVL\b/g, a: 'los fondos bloqueados', nota: 'sigla con artículo: cambia el número' },
  { de: /\bTVL\b/g, a: 'fondos bloqueados', nota: 'sigla sin explicar' },
  { de: /\bsupply\b/gi, a: 'circulante', nota: 'inglés sin traducir' },
  { de: /,?\s*y la lectura de [^.]*?es '?sin lectura'?/gi, a: '', nota: 'coletilla que dice que falta el dato' },
  // p. ej. "(Los lanzamientos recientes necesitan otro criterio, pendiente.)"
  { de: /\s*\([^)]*\b(criterio|umbral|observable|pendiente|por definir|hueco)\b[^)]*\)/gi, a: '', nota: 'paréntesis con una nota de taller dentro' },
]

export function llano(t?: string | null): string {
  if (!t) return ''
  let crudo = sinIdentificadores(sinReferencias(t))
  for (const r of TRADUCCIONES) crudo = crudo.replace(r.de, r.a)
  crudo = crudo.replace(/\s{2,}/g, ' ').trim()
  return mayusculaInicial(tuteo(crudo))
}

/* ============================================================================
   Revisión antes de publicar fuera.

   Lo que se copia de la plataforma a otro sitio ya no pasa por ninguna
   pantalla nuestra: es la última oportunidad de ver qué se cuela. No corrige,
   señala. Corregir a ciegas un texto que se va a publicar es peor que avisar.
   ========================================================================== */

/** Identificadores del taller que a veces viajan dentro de un paréntesis. */
export interface Reparo { que: string; donde: string }

/** Lo que nunca puede salir publicado, con el nombre del problema en claro. */
export const REPAROS: { que: string; re: RegExp }[] = [
  { que: 'vocabulario interno', re: /\b(motor|esc[eé]ptico|verificador|redactor|criterio|umbral|observable|corrida|paquete|scanner)\b/i },
  { que: 'identificador técnico', re: IDENTIFICADORES },
  { que: 'referencia a un apartado', re: /§\s*[\d.]+/ },
  { que: 'puntaje interno', re: /puntaje|sobre 40\b/i },
  { que: 'habla de un dato que falta', re: /dato ausente|no se pudo (medir|calcular|determinar|reconstruir)|sin lectura|sin dato\b|no hay dato|no hay comparables|no se puede comparar|no tiene (revenue|ingresos|fondos bloqueados)/i },
  { que: 'habla de nuestro proceso', re: /no se publica|no se muestra|queda fuera del|no entra en el informe|sin respaldo/i },
  // "compra al contado" es un hecho del mercado, no un consejo: el patrón busca la recomendación
  { que: 'consejo de compra o venta', re: /\b(recomend\w+|deber[ií]as?|convien\w+|es momento de|hay que)\s+(comprar|vender)\b|\b(compra|vende|comprar|vender)\s+(ya|ahora|antes de que|mientras)\b/i },
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

/** Cada lectura del bloque determinista, con su palabra y su color. */
export const LECTURA_LABEL: Record<string, { t: string; tono: 'esm' | 'oro' | 'rojo' | 'mudo' | 'hueso' }> = {
  demanda_real: { t: 'Demanda real', tono: 'esm' }, apalancamiento: { t: 'Castillo de apalancamiento', tono: 'rojo' }, mixta: { t: 'Mixta', tono: 'oro' },
  contenida: { t: 'Cola contenida', tono: 'esm' }, alta: { t: 'Cola alta', tono: 'oro' }, extrema: { t: 'Cola extrema', tono: 'rojo' },
  dispersa: { t: 'Dispersa', tono: 'esm' }, concentrada: { t: 'Concentrada', tono: 'oro' }, muy_concentrada: { t: 'Muy concentrada', tono: 'rojo' },
  captura_verificada: { t: 'El token cobra, verificado', tono: 'esm' }, captura_declarada: { t: 'Cobra, sin verificar', tono: 'oro' }, sin_captura: { t: 'No cobra', tono: 'rojo' },
  profunda: { t: 'Profunda', tono: 'esm' }, suficiente: { t: 'Suficiente', tono: 'oro' }, fina: { t: 'Fina', tono: 'rojo' },
  sin_dato: { t: 'Sin dato', tono: 'mudo' },
}

/* ============================================================================
   Catálogo de los códigos del motor.

   Todo código que llega del motor se traduce aquí o no se muestra. Antes
   había traducciones sueltas y un caso por defecto que inventaba: para
   `NEGOCIO_SIN_CAPTURA` llegó a decir "captura de valor verificada", que es
   lo contrario de lo que decía el informe.

   `interno: true` significa que el campo no puede aparecer en vista de
   cliente en ninguna forma. Está para que se vea, no para traducirlo.
   ========================================================================== */
export interface CampoCatalogo { que: string; interno?: boolean; valores: Record<string, string> }

export const CATALOGO_MOTOR: Record<string, CampoCatalogo> = {
  tier: { que: 'Nivel de riesgo del informe', valores: TIER_LLANO },
  estado_economico: {
    que: 'De dónde sale el valor del token',
    valores: {
      ANCHORED: 'El protocolo factura y el token participa de esa caja',
      NEGOCIO_SIN_CAPTURA: 'El protocolo factura, pero el token no participa de esa caja',
      REFLEXIVE: 'El precio se sostiene sobre su propia dinámica, no sobre una caja',
      PRE_REVENUE: 'El protocolo todavía no factura',
      NARRATIVE: 'El precio vive de la narrativa, no de una caja',
      GOVERNANCE: 'El token es sólo gobernanza: no participa de la caja',
    },
  },
  'lectura.direccion': {
    que: 'Hacia dónde apunta la lectura',
    valores: { alcista: 'Alcista', neutral: 'Neutral', bajista: 'Bajista' },
  },
  'escenarios[].tipo': {
    que: 'Qué escenario es',
    valores: {
      bull: 'Al alza', bull_reflexivo: 'Al alza, si vuelve a máximos',
      base: 'Escenario base', bear: 'A la baja',
    },
  },
  estado_seguimiento: {
    que: 'Si lo seguimos día a día',
    valores: { en_seguimiento: 'En seguimiento diario', sin_seguimiento: '' },
  },
  'advertencias[].severidad': {
    que: 'Cuánto pesa una advertencia',
    // Sólo la primera llega al cliente, y sin decir su nombre: es "Lo que podría salir mal".
    valores: { COMPROMETE_TESIS: 'Lo que podría salir mal', LIMITA_LECTURA: '', CONTEXTO: '' },
  },
  'microestructura.lectura': {
    que: 'Qué mueve el precio',
    valores: {
      spot_driven: 'El precio lo mueve la compra al contado, no el apalancamiento',
      perp_driven: 'El precio lo mueve el apalancamiento en perpetuos',
      indeterminado: '', indeterminada: '',
    },
  },
  calidad_por_seccion: { que: 'Cuán completa quedó cada sección', interno: true, valores: {} },
  'fuentes[].calidad': { que: 'Si la fuente respondió', interno: true, valores: {} },
  'verificador.estado': { que: 'Resultado del control de calidad', interno: true, valores: {} },
  'faltantes[].codigo': { que: 'Por qué no se puede analizar', interno: true, valores: {} },
}

/** Traduce un código con el catálogo. Cadena vacía = no se muestra. Nunca inventa. */
export function delCatalogo(campo: string, codigo?: string | null): string {
  const c = CATALOGO_MOTOR[campo]
  if (!c || c.interno || !codigo) return ''
  return c.valores[codigo] ?? c.valores[codigo.toUpperCase()] ?? c.valores[codigo.toLowerCase()] ?? ''
}

/** El único filtro para la prosa que llega del motor y se muestra a un cliente.
    Traduce, quita identificadores, pasa a tuteo y descarta las frases de taller.
    Antes esto estaba repartido en cinco archivos y cada uno se dejaba algo. */
export const prosaDeCliente = (t?: string | null): string => limpiarProsa(llano(t ?? ''))
