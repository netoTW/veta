import { useMemo, useState } from 'react'
import type { Visuales } from '../../lib/contrato'
import { fecha, fechaHora, mult, num, pct, precio, usd } from '../../lib/formato'

/* ============================================================================
   Los charts que faltaban. Paleta: esmeralda positivo, oro destacado, rojo
   apagado negativo, números en mono. SVG a mano, sin librería. Nada se
   calcula: sólo se escala para dibujar.
   ========================================================================== */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const mesAno = (t: number) => { const d = new Date(t); return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` }
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

/* ------------------------------ PRECIO ------------------------------
   La vara reflexiva hecha visual: la serie en escala logarítmica, el máximo
   histórico y los máximos de ciclo marcados en oro, el precio de hoy en
   esmeralda. "Cotiza a 1/11 de su máximo" se ve, no sólo se lee. */
const tick = (k: number) => (k >= 1 ? String(k) : k.toString())

export function PrecioMaximos({ v, fraccion, movil = false }: { v: Visuales; fraccion?: string; movil?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const s = v.precio.serie
  const W = movil ? 420 : 920, H = movil ? 300 : 340, ML = movil ? 44 : 62, MR = movil ? 14 : 24, MT = 26, MB = 30
  const geo = useMemo(() => {
    if (s.length < 2) return null
    const t0 = s[0].t, t1 = s[s.length - 1].t
    const vals = s.map((p) => p.c).filter((c) => c > 0)
    const ath = v.precio.ath?.precio ?? 0
    const lo = Math.min(...vals), hi = Math.max(...vals, ath)
    const ly0 = Math.log10(lo * 0.85), ly1 = Math.log10(hi * 1.25)
    const x = (t: number) => ML + ((t - t0) / (t1 - t0)) * (W - ML - MR)
    const y = (c: number) => MT + (1 - (Math.log10(c) - ly0) / (ly1 - ly0)) * (H - MT - MB)
    const ticks = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50, 100].filter((k) => k >= lo * 0.85 && k <= hi * 1.25)
    const anos: number[] = []
    for (let a = new Date(t0).getUTCFullYear() + 1; a <= new Date(t1).getUTCFullYear(); a++) anos.push(Date.UTC(a, 0, 1))
    const path = s.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.c).toFixed(1)}`).join(' ')
    return { x, y, ticks, anos, path, t0, t1 }
  }, [s, v.precio.ath, W, H, ML, MR])
  const ath = v.precio.ath
  if (!geo) return null
  const { x, y, ticks, anos, path } = geo
  const anchor = (px: number) => (px > W - 150 ? 'end' : px < ML + 90 ? 'start' : 'middle')
  const athT = ath ? Date.parse(ath.fecha) : NaN
  const hoy = s[s.length - 1]
  const h = hover !== null ? s[hover] : null
  const ciclos = v.precio.maximos_de_ciclo.filter((m) => !m.es_ath)

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = 0, dist = Infinity
    s.forEach((p, i) => { const d = Math.abs(x(p.t) - px); if (d < dist) { dist = d; best = i } })
    setHover(best)
  }

  return (
    <div className="ch ch-precio">
      <div className="ch__cab">
        <span className="ch__k mono">Precio {v.precio.intervalo === '1w' ? 'semanal' : 'diario'} · escala logarítmica · máximos en oro</span>
        {fraccion && <span className="ch__titular"><b className="num">{fraccion}</b> de su máximo histórico</span>}
      </div>
      <div className="ch__grafico">
        <svg viewBox={`0 0 ${W} ${H}`} className="ch__svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Precio histórico con máximos marcados">
          <defs><linearGradient id="pa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1FA46F" stopOpacity="0.28" /><stop offset="1" stopColor="#1FA46F" stopOpacity="0" /></linearGradient></defs>
          {ticks.map((k) => <g key={k}><line x1={ML} x2={W - MR} y1={y(k)} y2={y(k)} className="ch__grid" /><text x={ML - 8} y={y(k) + 4} textAnchor="end" className="ch__tick">{tick(k)}</text></g>)}
          {anos.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={MT} y2={H - MB} className="ch__grid" /><text x={x(t)} y={H - 10} textAnchor="middle" className="ch__tick">{new Date(t).getUTCFullYear()}</text></g>)}
          <path d={`${path} L${x(s[s.length - 1].t).toFixed(1)},${H - MB} L${x(s[0].t).toFixed(1)},${H - MB} Z`} fill="url(#pa)" />
          <path d={path} className="ch__linea" />
          {/* máximo histórico */}
          {ath && (
            <g>
              <line x1={ML} x2={W - MR} y1={y(ath.precio)} y2={y(ath.precio)} className="ch__ath" />
              <text x={W - MR} y={y(ath.precio) - 6} textAnchor="end" className="ch__oro">{movil ? `máximo ${precio(ath.precio)} · ${mult(ath.multiplo_desde_actual ?? 0, 1)}` : `máximo histórico ${precio(ath.precio)} · ${fecha(ath.fecha)}${ath.multiplo_desde_actual ? ` · ${mult(ath.multiplo_desde_actual, 1)} el precio de hoy` : ''}`}</text>
              {!Number.isNaN(athT) && athT >= geo.t0 && athT <= geo.t1 && <rect x={x(athT) - 6} y={y(ath.precio) - 6} width={12} height={12} transform={`rotate(45 ${x(athT)} ${y(ath.precio)})`} className="ch__gema" />}
            </g>
          )}
          {ciclos.map((m, i) => {
            const t = Date.parse(m.fecha); if (Number.isNaN(t)) return null
            return <g key={i}><rect x={x(t) - 5} y={y(m.precio) - 5} width={10} height={10} transform={`rotate(45 ${x(t)} ${y(m.precio)})`} className="ch__gema" /><text x={x(t)} y={y(m.precio) - 12} textAnchor={anchor(x(t))} className="ch__oro">{movil ? mult(m.multiplo_desde_actual, 1) : `${precio(m.precio)} · ${mult(m.multiplo_desde_actual, 1)}`}</text></g>
          })}
          {/* hoy */}
          <circle cx={x(hoy.t)} cy={y(hoy.c)} r={5} className="ch__hoy" />
          <text x={x(hoy.t) - 10} y={y(hoy.c) + 20} textAnchor="end" className="ch__esm">hoy {precio(v.precio.precio_actual ?? hoy.c)}</text>
          {h && <g><line x1={x(h.t)} x2={x(h.t)} y1={MT} y2={H - MB} className="ch__cruz" /><circle cx={x(h.t)} cy={y(h.c)} r={4} className="ch__hoy" /></g>}
        </svg>
        {h && <div className="ch-tip ch-tip--flot" style={{ left: `${(x(h.t) / W) * 100}%` }}><span className="mono">{iso(h.t)}</span><b className="num">{precio(h.c)}</b></div>}
      </div>
      <p className="ch__nota">{v.precio.fuente} · {fechaHora(v.precio.timestamp)}</p>
    </div>
  )
}

/* ------------------------------ REVENUE ------------------------------ */
export function RevenueDiario({ v, total30d, movil = false }: { v: Visuales; total30d?: number; movil?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const s = v.revenue.serie
  if (s.length < 2) return null
  const W = movil ? 420 : 920, H = movil ? 200 : 220, ML = movil ? 52 : 70, MR = 16, MT = 18, MB = 28
  const max = Math.max(...s.map((p) => p.v), 1)
  const bw = (W - ML - MR) / s.length
  const y = (val: number) => MT + (1 - val / max) * (H - MT - MB)
  const meses = s.map((p, i) => ({ i, m: new Date(p.t).getUTCMonth() })).filter((p, i, arr) => i === 0 || p.m !== arr[i - 1].m)
  const h = hover !== null ? s[hover] : null
  return (
    <div className="ch ch-rev">
      <div className="ch__cab">
        <span className="ch__k mono">Revenue diario del protocolo · {s.length} días</span>
        {typeof total30d === 'number' && <span className="ch__titular"><b className="num">{usd(total30d)}</b> en 30 días</span>}
      </div>
      <div className="ch__grafico" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="ch__svg" role="img" aria-label="Revenue diario">
          {[0.5, 1].map((k) => <g key={k}><line x1={ML} x2={W - MR} y1={y(max * k)} y2={y(max * k)} className="ch__grid" /><text x={ML - 8} y={y(max * k) + 4} textAnchor="end" className="ch__tick">{usd(max * k).replace(' USD', '')}</text></g>)}
          {s.map((p, i) => <rect key={i} x={ML + i * bw + 0.5} y={y(p.v)} width={Math.max(bw - 1, 1)} height={H - MB - y(p.v)} className={`ch__barra ${hover === i ? 'is-on' : ''}`} onMouseEnter={() => setHover(i)} />)}
          {meses.filter((_, i) => !movil || i % 2 === 0).map((m) => <text key={m.i} x={ML + m.i * bw} y={H - 10} className="ch__tick">{movil ? MESES[new Date(s[m.i].t).getUTCMonth()] : mesAno(s[m.i].t)}</text>)}
        </svg>
        {h && <div className="ch-tip ch-tip--flot" style={{ left: `${((ML + (hover! + 0.5) * bw) / W) * 100}%` }}><span className="mono">{iso(h.t)}</span><b className="num">{usd(h.v)}</b></div>}
      </div>
      <p className="ch__nota">{v.revenue.fuente} · {fechaHora(v.revenue.timestamp)}</p>
    </div>
  )
}

/* ------------------------------ TVL ------------------------------ */
export function TvlComparado({ v }: { v: Visuales }) {
  const p = v.tvl.puntos
  if (!p.length) return null
  const max = Math.max(...p.map((x) => x.v), 1)
  const hoy = p.find((x) => x.t === 'hoy'), antes = p.find((x) => x.t === 'hace_30d')
  const sube = hoy && antes ? hoy.v >= antes.v : true
  return (
    <div className="ch ch-tvl">
      <div className="ch__cab">
        <span className="ch__k mono">TVL · hoy contra hace 30 días</span>
        {typeof v.tvl.cambio_30d === 'number' && <span className={`ch__titular ${sube ? '' : 'is-neg'}`}><b className="num">{pct(v.tvl.cambio_30d, 1, true)}</b> en 30 días</span>}
      </div>
      <div className="ch-tvl__barras">
        {p.map((x) => (
          <div key={x.t} className={`ch-tvl__fila ${x.t === 'hoy' ? 'is-hoy' : ''}`}>
            <span className="mono ch-tvl__k">{x.t === 'hoy' ? 'hoy' : 'hace 30 d'}</span>
            <span className="ch-tvl__barra"><span style={{ width: `${(x.v / max) * 100}%` }} /></span>
            <b className="num">{usd(x.v)}</b>
          </div>
        ))}
      </div>
      <p className="ch__nota">{p[0].fuente} · {fechaHora(v.tvl.timestamp)} · {v.tvl.motivo_sin_serie}</p>
    </div>
  )
}

/* ------------------------------ TENEDORES ------------------------------ */
export function Concentracion({ v, top10Neto }: { v: Visuales; top10Neto: number | null }) {
  const c = v.tenedores.concentracion
  const desc = v.tenedores.descontadas
  const neto = top10Neto ?? c.top10
  if (neto === null || neto === undefined) return null
  const resto = Math.max(0, 1 - neto)
  return (
    <div className="ch ch-conc">
      <div className="ch__cab">
        <span className="ch__k mono">Concentración de tenedores · sobre {c.base_supply || 'circulante'}</span>
        <span className="ch__titular"><b className="num">{pct(neto, 1)}</b> en las diez mayores posiciones</span>
      </div>
      <div className="ch-conc__barra" role="img" aria-label="Diez mayores posiciones frente al resto">
        <span className="ch-conc__top" style={{ width: `${Math.min(100, neto * 100)}%` }} title={`top-10 · ${pct(neto, 1)}`} />
        <span className="ch-conc__resto" style={{ width: `${resto * 100}%` }} title={`resto · ${pct(resto, 1)}`} />
      </div>
      <div className="ch-conc__leyenda mono"><span className="ch-conc__l1">top-10 {pct(neto, 1)}</span><span className="ch-conc__l2">resto {pct(resto, 1)}</span>{c.hhi_etiqueta && <span>{c.hhi_etiqueta}</span>}</div>
      {desc.length > 0 && (
        <div className="ch-conc__desc">
          <span className="ch__k mono">Posiciones descontadas antes de medir (no son tenedores privados)</span>
          <ul>{desc.map((d, i) => <li key={i}><span className={`ch-conc__tipo mono ch-conc__tipo--${d.tipo}`}>{d.tipo}</span>{d.entidad} · <b className="num">{pct(d.pct_supply, 1)}</b> del supply</li>)}</ul>
        </div>
      )}
      {v.tenedores.snapshots.length > 0 && (
        <p className="ch__nota">Fotos de tenedores: {v.tenedores.snapshots.map((s) => `${fecha(s.fecha)} (${s.n_holders} posiciones)`).join(' · ')}. La serie de participación por fecha llega cuando el motor guarde el porcentaje en cada foto.</p>
      )}
    </div>
  )
}

/* ------------------------------ ESCENARIOS ------------------------------
   El rango bull/base/bear sobre escala log ya existe (Escala en el informe);
   acá sólo se deja el titular con el número que vende. */
export const rangoTitular = (min: number, max: number) => `${mult(min)} – ${mult(max)}`
export { num }
