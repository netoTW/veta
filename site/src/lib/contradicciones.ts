/* ============================================================================
   Prosa del Redactor contra los campos del motor.

   Cuando el motor recalcula (por ejemplo, el tier bajó a MEDIO con las
   etiquetas de Arkham) y la prosa no se regenera, el informe se contradice.
   Este módulo no arregla la prosa (eso es tarea del Redactor): la DETECTA,
   para que el código la desautorice visiblemente en vez de mostrarla como
   válida. Compara sólo lo que se puede comparar sin calcular: el tier
   nombrado, el número de incumplimientos, la concentración del top-10.

   Sin React: lo usan el cliente (ficha, informe) y el servidor (bandeja).
   ========================================================================== */

export interface Contradiccion {
  /** Campo del registro donde vive la prosa. */
  campo: string
  /** Lo que dice la prosa. */
  dice: string
  /** Lo que dice el motor. */
  motor: string
  /** Sobre qué: tier · incumplimientos · top10 */
  sobre: 'tier' | 'incumplimientos' | 'top10' | 'proceso'
}

/** Frases cuyo sujeto es el sistema y no la moneda: versiones anteriores, correcciones del
    motor, vocabulario del triage, nombres de piezas internas. Al cliente no le llegan. */
const PROCESO = /fueron corregid\w*|corregid\w+ con fuente|mal denominad\w+|versi[oó]n anterior|recalcul\w+|lo llevaba\w* a (?:ALTO|MEDIO|BAJO)|\bel motor\b|\bel redactor\b|\bel verificador\b|\btriage\b|\bpaquete\b|\bpipeline\b|control de coherencia|§\s?\d|incumplimientos? de BAJO|spot-driven|perp-driven|\bF\/S\b|OI\/mcap/gi

const PALABRA_NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 }
const aNumero = (s: string) => (PALABRA_NUM[s.toLowerCase()] ?? Number(s))

type Registro = {
  tier?: string; factores_del_tier?: string[]
  onchain?: { concentracion_top10_neta?: number | null }
  ficha_esencial?: { tesis_una_linea?: string; riesgo_resumen?: string }
  tesis?: string | null; motivo_sin_tesis?: string
  niveles?: object
}

/** Revisa un texto contra el registro. */
export function contradiccionesDe(campo: string, texto: string | null | undefined, r: Registro): Contradiccion[] {
  const out: Contradiccion[] = []
  if (!texto) return out
  const tier = (r.tier || '').toUpperCase()
  // 1. "Tier ALTO" cuando el motor dice otro tier
  for (const m of texto.matchAll(/\btier\s+(ALTO|MEDIO|BAJO)\b/gi)) {
    const dicho = m[1].toUpperCase()
    // "lo llevaban a ALTO" / "de ALTO a MEDIO" son narrativa del cambio: sólo cuenta el tier afirmado con "Tier X"
    if (tier && dicho !== tier) out.push({ campo, sobre: 'tier', dice: m[0], motor: `tier ${tier}` })
  }
  // 2. "seis incumplimientos" cuando factores_del_tier tiene otro número
  const n = r.factores_del_tier?.length
  if (typeof n === 'number') {
    for (const m of texto.matchAll(/\b(un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+)\s+incumplimientos?\b/gi)) {
      // "los tres incumplimientos que lo llevaban a ALTO fueron corregidos" narra el pasado: no es una afirmación del estado actual
      const despues = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 60)
      if (/llevaba|fueron corregid|corregidos|anteriores|antes/i.test(despues)) continue
      const dicho = aNumero(m[1])
      if (Number.isFinite(dicho) && dicho !== n) out.push({ campo, sobre: 'incumplimientos', dice: m[0], motor: `${n} ${n === 1 ? 'condición' : 'condiciones'} en contra según el motor` })
    }
  }
  // 3. "top-10 = 85.3%" cuando el motor tiene otra concentración
  const top = r.onchain?.concentracion_top10_neta
  if (typeof top === 'number') {
    for (const m of texto.matchAll(/top-?10[^\d%]{0,24}(\d+(?:[.,]\d+)?)\s*%/gi)) {
      const dicho = Number(m[1].replace(',', '.'))
      const real = top * 100
      if (Number.isFinite(dicho) && Math.abs(dicho - real) > 1) out.push({ campo, sobre: 'top10', dice: m[0], motor: `top-10 = ${real.toFixed(1)} % según el motor` })
    }
  }
  // 4. Habla del proceso, no de la moneda
  for (const m of texto.matchAll(PROCESO)) out.push({ campo, sobre: 'proceso', dice: m[0], motor: 'habla del proceso, no de la moneda' })
  return out
}

/** Todas las contradicciones del registro, campo por campo. */
export function contradiccionesDelRegistro(r: Registro): Contradiccion[] {
  const out: Contradiccion[] = []
  out.push(...contradiccionesDe('ficha_esencial.tesis_una_linea', r.ficha_esencial?.tesis_una_linea, r))
  if (r.tesis && r.tesis !== r.ficha_esencial?.tesis_una_linea) out.push(...contradiccionesDe('tesis', r.tesis, r))
  out.push(...contradiccionesDe('ficha_esencial.riesgo_resumen', r.ficha_esencial?.riesgo_resumen, r))
  out.push(...contradiccionesDe('motivo_sin_tesis', r.motivo_sin_tesis, r))
  for (const [k, n] of Object.entries((r.niveles ?? {}) as Record<string, { esencial?: { texto?: string } }>)) out.push(...contradiccionesDe(`niveles.${k}.esencial.texto`, n.esencial?.texto, r))
  return out
}

/** Una frase que resume por qué se desautoriza un texto. */
export function motivoDesautorizacion(cs: Contradiccion[]): string {
  const hechos = [...new Set(cs.filter((c) => c.sobre !== 'proceso').map((c) => c.motor))]
  const proceso = cs.filter((c) => c.sobre === 'proceso').length
  const partes: string[] = []
  if (hechos.length) partes.push(`contradice al motor: ${hechos.join(' · ')}`)
  if (proceso) partes.push(`${proceso} ${proceso === 1 ? 'frase' : 'frases'} sobre el proceso, no sobre la moneda`)
  return partes.join(' · ')
}
