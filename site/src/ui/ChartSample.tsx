import { useState } from 'react'

/* ============================================================================
   Muestra de charts — una serie, tres escenarios, una tabla.

   Es un ejemplo de sistema, no un componente de producto: el motor todavía no
   define su contrato de datos. Fija lo que sí se puede fijar ya:
     · una sola escala Y por chart
     · marcas finas, grilla recesiva, ejes en ceniza-2
     · esmeralda = positivo, oro = destacado, rojo apagado = negativo
     · números en mono tabular; el texto nunca lleva el color de la serie
     · hover con crosshair + tooltip; vista tabla siempre disponible
   ========================================================================== */

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D', 'L', 'M', 'X', 'J', 'V', 'S', 'D']
const PRECIO = [100, 103, 101, 106, 112, 110, 118, 121, 116, 124, 131, 128, 135, 139]
const ESCENARIOS = [
  { k: 'Bajista', p: 0.23, v: -31.0, tone: 'neg' },
  { k: 'Base',    p: 0.52, v: 18.4,  tone: 'pos' },
  { k: 'Alcista', p: 0.25, v: 64.0,  tone: 'pos' },
] as const

const W = 640, H = 220, PADL = 44, PADR = 16, PADT = 14, PADB = 28

export function ChartSample() {
  const [hover, setHover] = useState<number | null>(null)
  const [tabla, setTabla] = useState(false)

  const min = 90, max = 145
  const x = (i: number) => PADL + (i / (PRECIO.length - 1)) * (W - PADL - PADR)
  const y = (v: number) => PADT + (1 - (v - min) / (max - min)) * (H - PADT - PADB)
  const path = PRECIO.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${path} L ${x(PRECIO.length - 1).toFixed(1)} ${y(min)} L ${x(0)} ${y(min)} Z`
  const ticks = [100, 120, 140]
  const last = PRECIO[PRECIO.length - 1]
  const delta = ((last / PRECIO[0]) - 1) * 100

  return (
    <div className="chart">
      <div className="chart__head">
        <div>
          <p className="mono chart__title">Índice · 14 días · base 100</p>
          <p className="num chart__hero">
            {last.toFixed(1)}
            <span className={`chart__delta ${delta >= 0 ? 'is-pos' : 'is-neg'}`}>
              {delta >= 0 ? '+' : ''}{delta.toFixed(1)} %
            </span>
          </p>
        </div>
        <button type="button" className="btn btn--ghost chart__toggle" onClick={() => setTabla((v) => !v)} aria-pressed={tabla}>
          {tabla ? 'Ver gráfico' : 'Ver tabla'}
        </button>
      </div>

      {tabla ? (
        <table className="chart__table num">
          <thead><tr><th className="mono">Día</th><th className="mono">Índice</th></tr></thead>
          <tbody>
            {PRECIO.map((v, i) => <tr key={i}><td>{DIAS[i]}</td><td>{v.toFixed(1)}</td></tr>)}
          </tbody>
        </table>
      ) : (
        <div className="chart__plot">
          <svg
            viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Índice de precio, 14 días, base 100"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              const px = ((e.clientX - r.left) / r.width) * W
              const i = Math.round(((px - PADL) / (W - PADL - PADR)) * (PRECIO.length - 1))
              setHover(Math.max(0, Math.min(PRECIO.length - 1, i)))
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line className="chart__grid" x1={PADL} x2={W - PADR} y1={y(t)} y2={y(t)} />
                <text className="chart__axis num" x={PADL - 8} y={y(t) + 3.5} textAnchor="end">{t}</text>
              </g>
            ))}
            {DIAS.map((d, i) => (i % 2 === 0 ? (
              <text key={i} className="chart__axis mono" x={x(i)} y={H - 8} textAnchor="middle">{d}</text>
            ) : null))}
            <path className="chart__area" d={area} />
            <path className="chart__line" d={path} />
            {/* punto final: el único directamente etiquetado */}
            <circle className="chart__end" cx={x(PRECIO.length - 1)} cy={y(last)} r={4} />
            {hover !== null && (
              <g>
                <line className="chart__cross" x1={x(hover)} x2={x(hover)} y1={PADT} y2={H - PADB} />
                <circle className="chart__hover" cx={x(hover)} cy={y(PRECIO[hover])} r={5} />
              </g>
            )}
          </svg>
          {hover !== null && (
            <div className="chart__tip num" style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(PRECIO[hover]) / H) * 100}%` }}>
              <span className="mono">{DIAS[hover]}</span> {PRECIO[hover].toFixed(1)}
            </div>
          )}
        </div>
      )}

      <div className="chart__scen">
        <p className="mono chart__title">Escenarios · 12 meses · probabilidad y retorno</p>
        <ul>
          {ESCENARIOS.map((s) => (
            <li key={s.k} className={`scen scen--${s.tone} ${s.k === 'Base' ? 'is-hi' : ''}`}>
              <span className="scen__k">{s.k}</span>
              <span className="scen__bar"><span style={{ width: `${s.p * 100}%` }} /></span>
              <span className="scen__p num">{s.p.toFixed(2)}</span>
              <span className="scen__v num">{s.v > 0 ? '+' : ''}{s.v.toFixed(1)} %</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
