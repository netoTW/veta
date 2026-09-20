import type { ReactNode } from 'react'
import type { Informe } from '../lib/contrato'
import { dias, fecha, mult, pct, precio, usd } from '../lib/formato'
import { estadoEconomicoLlano, traducirFactor, TIER_LLANO, prosaDeCliente } from '../lib/lenguaje'
import { contradiccionesDelRegistro } from '../lib/contradicciones'

/* ============================================================================
   Los números que venden, y la tesis que se muestra.

   Nada de esto se calcula: cada cifra es un campo formateado. Sólo se
   muestran cifras CON valor: un dato ausente va abajo, entre las
   limitaciones, nunca en la zona que vende. Si la prosa del Redactor
   contradice los campos o habla del proceso, se usa la lectura compuesta
   desde el contrato y el lector no se entera: el origen es invisible. Lo que
   se desautorizó queda visible sólo en admin (bandeja).
   ========================================================================== */

export interface Cifra { k: string; v: ReactNode; sub?: ReactNode; tono: 'esm' | 'oro' | 'rojo' | 'mudo' }


/** Las cifras de una gema (o análisis), en el orden en que venden. */
export function cifrasDe(inf: Informe): Cifra[] {
  const out: Cifra[] = []
  const a = inf.asimetria
  const bull = inf.escenarios.find((e) => e.tipo === 'bull') ?? inf.escenarios.find((e) => e.tipo === 'bull_reflexivo')
  const bear = inf.escenarios.find((e) => e.tipo === 'bear')
  const rf = inf.varas.reflexiva
  const fu = inf.fundamentales

  if (typeof a.ratio === 'number' && typeof a.riesgo === 'number' && typeof a.recompensa === 'number') {
    out.push({ k: 'asimetría · premio por unidad de riesgo', v: <>{mult(a.ratio)}</>, sub: <>arriesgas {pct(a.riesgo, 0)} para ganar {pct(a.recompensa, 0)}{a.horizonte ? <> en {dias(a.horizonte)}</> : null}</>, tono: 'esm' })
  }
  if (bull) {
    out.push({
      k: bull.tipo === 'bull_reflexivo' ? 'escenario alcista · por historial propio' : 'escenario alcista · por fundamentales',
      v: <>{mult(bull.rango_min)} <small>–</small> {mult(bull.rango_max)}</>,
      sub: <>en {dias(bull.horizonte_dias)}{bear ? <> · si se invalida: {mult(bear.rango_min)} – {mult(bear.rango_max)}</> : null}</>,
      tono: 'oro',
    })
  }
  if (rf?.fraccion_del_maximo) {
    out.push({ k: 'de su máximo histórico', v: <>{rf.fraccion_del_maximo}</>, sub: <>máximo {precio(rf.maximo_valor)} el {fecha(rf.maximo_fecha)}</>, tono: 'esm' })
  }
  if (fu && typeof fu.revenue_protocolo_30d === 'number') {
    out.push({
      k: `ingresos del protocolo · 30 días${inf.captura_verificada ? ' · verificado' : ''}`,
      v: <>{usd(fu.revenue_protocolo_30d)}</>,
      sub: <>{typeof fu.revenue_a_holders === 'number' ? <>{usd(fu.revenue_a_holders)} llegan al token · </> : null}{typeof fu.revenue_sobre_mcap === 'number' ? <>{pct(fu.revenue_sobre_mcap, 1)} sobre capitalización</> : null}</>,
      tono: 'oro',
    })
  }
  if (fu?.mecanismo_captura?.tipo && inf.captura_verificada) {
    out.push({ k: 'captura de valor · verificada', v: <small style={{ fontSize: '0.95rem', color: 'var(--hueso)', fontFamily: 'var(--font-body)' }}>{fu.mecanismo_captura.tipo}</small>, sub: estadoEconomicoLlano(inf.estado_economico, inf.captura_verificada), tono: 'esm' })
  }
  return out
}

export function Cifras({ inf, card = false, max }: { inf: Informe; card?: boolean; max?: number }) {
  const lista = cifrasDe(inf).slice(0, max ?? 99)
  if (!lista.length) return null
  return (
    <div className={`p-cifras ${card ? 'p-cifras--card' : ''}`} aria-label="Cifras de la tesis">
      {lista.map((c) => (
        <div key={c.k} className={`p-cifra p-cifra--${c.tono}`}>
          <span className="p-cifra__k mono">{c.k}</span>
          <span className="p-cifra__v">{c.v}</span>
          {c.sub && <span className="p-cifra__sub">{c.sub}</span>}
        </div>
      ))}
    </div>
  )
}

/** El riesgo en llano: el tier y sus factores, traducidos. Para la vista esencial. */
export function RiesgoLlano({ inf, compacto = false }: { inf: Informe; compacto?: boolean }) {
  return (
    <div className="p-det__riesgo-llano">
      <span className="mono">Riesgo {inf.tier.toLowerCase()} · {TIER_LLANO[inf.tier] ?? ''}</span>
      {inf.factores_del_tier.length > 0 && (
        <ul>{inf.factores_del_tier.slice(0, compacto ? 3 : 99).map((x, i) => <li key={i}>{traducirFactor(x)}</li>)}</ul>
      )}
    </div>
  )
}

/** La tesis compuesta sólo con frases del contrato (nivel esencial). Se usa cuando la prosa del Redactor no sirve. */
export function tesisCompuesta(inf: Informe): string {
  const n = inf.niveles
  const fund = (n.fundamentales?.esencial?.texto || '').split(/(?<=\.)\s/)[0]
  const varas = n.varas?.esencial?.texto || ''
  const esc = (n.escenarios?.esencial?.texto || '').split(';')[0]
  const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '')
  return [fund, cap(varas), cap(esc)].map((t) => prosaDeCliente(t)).filter(Boolean).map((t) => (t.endsWith('.') ? t : t + '.')).join(' ')
}

/** ¿La prosa escrita sirve para el cliente? No, si contradice a los números o habla del proceso. */
export const prosaSirve = (inf: Informe, campo: string) => contradiccionesDelRegistro(inf).every((c) => c.campo !== campo)

/** La tesis (o el motivo), siempre con la misma tipografía, venga de donde venga. */
export function Prosa({ inf, campo, texto, className }: { inf: Informe; campo: string; texto: string; className?: string }) {
  const t = prosaSirve(inf, campo) ? prosaDeCliente(texto) : ''
  return <p className={className}>{t || tesisCompuesta(inf)}</p>
}
