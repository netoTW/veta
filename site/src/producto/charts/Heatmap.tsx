import { useMemo, useState } from 'react'
import type { LiquidacionProyectada } from '../../lib/contrato'
import { fechaHora, num, precio, usd } from '../../lib/formato'

/* ============================================================================
   Liquidación proyectada — el gráfico.

   Es un MODELO con supuestos, no una medición: nadie publica las posiciones
   abiertas. Se llama "proyección" o "estimación", nunca "mapa de
   liquidaciones" a secas. El sello SIN CALIBRAR va arriba; supuestos y
   limitaciones, visibles al pie.

   Codificación (una sola): barras horizontales con eje de magnitud, desde
   una columna central de precio. Largos que se liquidarían si baja, a la
   izquierda; cortos si sube, a la derecha. Ámbar en los dos lados: el color
   no carga significado (esmeralda y rojo se reservan para donde sí lo
   tienen). "Hoy" es una fila propia, en su lugar exacto del eje de precio.
   El rango se recorta a donde hay volumen; lo que queda fuera se dice en
   cifras. Nada se calcula: sólo se escala para dibujar.
   ========================================================================== */

type Fila = { i: number; desde: number; hasta: number; largos: number; cortos: number; total: number; hoy?: boolean }

const compacto = (v: number) => (v >= 1e6 ? `${num(v / 1e6, v >= 1e7 ? 0 : 1)} M` : v >= 1e3 ? `${num(v / 1e3)} k` : num(v))
const pasoBonito = (max: number) => {
  const bruto = max / 3
  const p = Math.pow(10, Math.floor(Math.log10(bruto)))
  const m = bruto / p
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p
}

function preparar(liq: LiquidacionProyectada, movil: boolean) {
  const px = liq.precio_actual ?? 0
  let src: Fila[] = [...liq.cubetas].sort((a, b) => b.precio_desde - a.precio_desde)
    .map((c, i) => ({ i, desde: c.precio_desde, hasta: c.precio_hasta, largos: c.notional_largos_usd, cortos: c.notional_cortos_usd, total: c.total_usd }))
  if (movil) {
    // móvil: filas más altas, cada una junta dos cubetas
    const out: Fila[] = []
    for (let k = 0; k < src.length; k += 2) {
      const g = src.slice(k, k + 2)
      out.push({ i: out.length, desde: g[g.length - 1].desde, hasta: g[0].hasta, largos: g.reduce((s, c) => s + c.largos, 0), cortos: g.reduce((s, c) => s + c.cortos, 0), total: g.reduce((s, c) => s + c.total, 0) })
    }
    src = out
  }
  // recorte por cobertura: la ventana contigua de filas que reúne el 90 % del notional,
  // siempre incluyendo la fila del precio de hoy. Lo que queda fuera se dice en cifras.
  const total = src.reduce((s, f) => s + f.total, 0) || 1
  const orden = [...src].sort((x, y) => y.total - x.total)
  let acum = 0, a = src.length, b = -1
  for (const f of orden) { if (acum >= total * 0.9) break; acum += f.total; a = Math.min(a, f.i); b = Math.max(b, f.i) }
  if (b < 0) { a = 0; b = src.length - 1 }
  const iHoy = src.findIndex((f) => f.hasta < px)          // primera fila por debajo del precio
  const posHoy = iHoy < 0 ? src.length : iHoy
  a = Math.min(a, Math.max(0, posHoy - 1)); b = Math.max(b, Math.min(src.length - 1, posHoy))
  const arriba = src.slice(0, a), dentro = src.slice(a, b + 1), abajo = src.slice(b + 1)
  const restoArriba = { cortos: arriba.reduce((s, f) => s + f.cortos, 0), desde: arriba.length ? arriba[arriba.length - 1].desde : null }
  const restoAbajo = { largos: abajo.reduce((s, f) => s + f.largos, 0), hasta: abajo.length ? abajo[0].hasta : null }
  // "hoy" como fila propia, en su lugar del eje
  const filas: Fila[] = []
  let puesto = false
  for (const f of dentro) {
    if (!puesto && f.hasta < px) { filas.push({ i: 0, desde: px, hasta: px, largos: 0, cortos: 0, total: 0, hoy: true }); puesto = true }
    filas.push(f)
  }
  if (!puesto) filas.push({ i: 0, desde: px, hasta: px, largos: 0, cortos: 0, total: 0, hoy: true })
  filas.forEach((f, i) => { f.i = i })
  return { filas, restoArriba, restoAbajo, px }
}

export function Heatmap({ liq, movil = false }: { liq: LiquidacionProyectada; movil?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const { filas, restoArriba, restoAbajo, px } = useMemo(() => preparar(liq, movil), [liq, movil])
  if (!liq.disponible || !filas.length) return null

  // geometría
  const W = movil ? 400 : 920, AX = movil ? 78 : 96   // columna central de precio
  const CL = W / 2 - AX / 2, CR = W / 2 + AX / 2       // bordes interiores de las barras
  const ANCHO = CL - (movil ? 40 : 56)                 // largo máximo de una barra: deja sitio a la cifra
  const RH = movil ? 24 : 13, RHOY = movil ? 30 : 20
  const MT = 22, MB = 26
  const maxLado = Math.max(...filas.map((f) => Math.max(f.largos, f.cortos)), 1)
  const paso = pasoBonito(maxLado)
  const ticks: number[] = []; for (let k = paso; k <= maxLado * 1.02; k += paso) ticks.push(k)
  const ticksTexto = movil ? ticks.filter((_, i) => i % 2 === 1 || ticks.length <= 2) : ticks
  const tope = Math.max(maxLado, ticks[ticks.length - 1] ?? maxLado)
  const sx = (v: number) => (ANCHO * v) / tope
  const ys: number[] = []; let acc = MT
  for (const f of filas) { ys.push(acc); acc += f.hoy ? RHOY : RH }
  const H = acc + MB
  const densa = (f: Fila) => (!!liq.zona_densa_abajo && f.desde <= liq.zona_densa_abajo.precio_desde + 1e-9 && f.hasta >= liq.zona_densa_abajo.precio_hasta - 1e-9) ||
                            (!!liq.zona_densa_arriba && f.desde <= liq.zona_densa_arriba.precio_desde + 1e-9 && f.hasta >= liq.zona_densa_arriba.precio_hasta - 1e-9)
  const h = hover !== null ? filas[hover] : null
  const cada = movil ? 1 : 2
  const iHoyFila = filas.findIndex((f) => f.hoy)
  const vecinaDeHoy = (i: number) => Math.abs(i - iHoyFila) === 1

  return (
    <div className={`ch ch-heat ${movil ? 'ch-heat--movil' : ''}`}>
      <div className="ch-heat__cab">
        <div>
          <span className="ch__k mono">Liquidación proyectada · estimación, no medición</span>
          <p className="ch-heat__sesgo">{liq.sesgo}.</p>
        </div>
        <div className="ch-heat__totales">
          <span className="ch-heat__tot"><b className="num">{usd(liq.notional_largos_usd)}</b> largos expuestos</span>
          <span className="ch-heat__tot"><b className="num">{usd(liq.notional_cortos_usd)}</b> cortos expuestos</span>
          {!liq.calibrado && <span className="ch-sello ch-sello--rojo mono">sin calibrar</span>}
        </div>
      </div>

      <div className="ch-heat__grafico" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="ch-heat__svg" role="img" aria-label="Notional que se liquidaría por nivel de precio: largos a la izquierda si baja, cortos a la derecha si sube">
          <defs>
            <linearGradient id="hz" x1="1" x2="0"><stop offset="0" stopColor="#EAD189" /><stop offset="1" stopColor="#8A6A2A" /></linearGradient>
            <linearGradient id="hd" x1="0" x2="1"><stop offset="0" stopColor="#EAD189" /><stop offset="1" stopColor="#8A6A2A" /></linearGradient>
          </defs>
          <text x={CL - 6} y={13} textAnchor="end" className="ch-heat__lado">{movil ? '◀ largos, si baja' : '◀ largos que se liquidarían si baja'}</text>
          <text x={CR + 6} y={13} textAnchor="start" className="ch-heat__lado">{movil ? 'cortos, si sube ▶' : 'cortos que se liquidarían si sube ▶'}</text>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={CL - sx(t)} x2={CL - sx(t)} y1={MT} y2={H - MB} className="ch-heat__eje" />
              <line x1={CR + sx(t)} x2={CR + sx(t)} y1={MT} y2={H - MB} className="ch-heat__eje" />
              {ticksTexto.includes(t) && <text x={CL - sx(t)} y={H - 8} textAnchor="middle" className="ch-heat__ejet">{compacto(t)}</text>}
              {ticksTexto.includes(t) && <text x={CR + sx(t)} y={H - 8} textAnchor="middle" className="ch-heat__ejet">{compacto(t)}</text>}
            </g>
          ))}
          <text x={W / 2} y={H - 8} textAnchor="middle" className="ch-heat__ejet">USD</text>
          {filas.map((f) => {
            const y = ys[f.i]
            if (f.hoy) {
              return (
                <g key="hoy">
                  <line x1={8} x2={W - 8} y1={y + RHOY / 2} y2={y + RHOY / 2} className="ch-heat__hoy-linea" />
                  <rect x={W / 2 - (AX + (movil ? 34 : 12)) / 2} y={y + 2} width={AX + (movil ? 34 : 12)} height={RHOY - 4} className="ch-heat__hoy-caja" />
                  <text x={W / 2} y={y + RHOY / 2 + 4} textAnchor="middle" className="ch-heat__actual">hoy {precio(px)}</text>
                </g>
              )
            }
            const on = hover === f.i, d = densa(f)
            const wl = sx(f.largos), wc = sx(f.cortos)
            return (
              <g key={f.i} onMouseEnter={() => setHover(f.i)} onClick={() => setHover(f.i)} style={{ cursor: 'crosshair' }}>
                <rect x={0} y={y} width={W} height={RH} fill={on ? 'rgba(236,230,216,0.05)' : 'transparent'} />
                {wl > 0 && <rect x={CL - wl} y={y + 2} width={wl} height={RH - 4} fill="url(#hz)" opacity={d || on ? 1 : 0.8} />}
                {wc > 0 && <rect x={CR} y={y + 2} width={wc} height={RH - 4} fill="url(#hd)" opacity={d || on ? 1 : 0.8} />}
                {d && wl > 0 && <text x={CL - wl - 6} y={y + RH - 4} textAnchor="end" className="ch-heat__cifra">{compacto(f.largos)}</text>}
                {d && wc > 0 && <text x={CR + wc + 6} y={y + RH - 4} textAnchor="start" className="ch-heat__cifra">{compacto(f.cortos)}</text>}
                {((f.i % cada === 0 && !vecinaDeHoy(f.i)) || d) && <text x={W / 2} y={y + RH - 4} textAnchor="middle" className={`ch-heat__precio ${d ? 'is-densa' : ''}`}>{precio(f.desde).replace(' USD', '')}</text>}
              </g>
            )
          })}
        </svg>
        {h && !h.hoy && (
          <div className="ch-tip" style={{ top: `${(ys[h.i] / H) * 100}%` }} role="status">
            <span className="mono">{precio(h.desde)} – {precio(h.hasta)}</span>
            <span><b className="num">{usd(h.largos)}</b> largos si baja hasta aquí</span>
            <span><b className="num">{usd(h.cortos)}</b> cortos si sube hasta aquí</span>
            {densa(h) && <span className="ch-tip__densa mono">zona más densa de este lado</span>}
          </div>
        )}
      </div>

      <div className="ch-heat__zonas">
        {liq.zona_densa_abajo && <span><span className="ch__k mono">si baja, lo más denso</span><b className="num">{precio(liq.zona_densa_abajo.precio_desde)} – {precio(liq.zona_densa_abajo.precio_hasta)}</b> · {usd(liq.zona_densa_abajo.notional_largos_usd)} en largos</span>}
        {liq.zona_densa_arriba && <span><span className="ch__k mono">si sube, lo más denso</span><b className="num">{precio(liq.zona_densa_arriba.precio_desde)} – {precio(liq.zona_densa_arriba.precio_hasta)}</b> · {usd(liq.zona_densa_arriba.notional_cortos_usd)} en cortos</span>}
        {restoAbajo.hasta !== null && restoAbajo.largos > 0 && <span><span className="ch__k mono">fuera del gráfico, por debajo</span><b className="num">{usd(restoAbajo.largos)}</b> en largos por debajo de {precio(restoAbajo.hasta)}</span>}
        {restoArriba.desde !== null && restoArriba.cortos > 0 && <span><span className="ch__k mono">fuera del gráfico, por encima</span><b className="num">{usd(restoArriba.cortos)}</b> en cortos por encima de {precio(restoArriba.desde)}</span>}
        <span><span className="ch__k mono">interés abierto vivo</span><b className="num">{usd(liq.oi_usd)}</b> · {liq.venues.join(', ') || 'sin venue'} · {fechaHora(liq.timestamp)}</span>
      </div>
      <Supuestos liq={liq} />
    </div>
  )
}

function Supuestos({ liq }: { liq: LiquidacionProyectada }) {
  const s = liq.supuestos as Record<string, unknown>
  const apal = (s.apalancamiento_asumido ?? {}) as Record<string, number>
  return (
    <div className="ch-heat__supuestos">
      <div>
        <span className="ch__k mono">Cómo se proyecta · supuestos</span>
        <ul className="ch-heat__lista">
          <li><b>Apalancamiento asumido</b> {Object.entries(apal).map(([k, v]) => `${k}: ${num(v * 100)} %`).join(' · ')}. <em>Convención sin calibrar.</em></li>
          <li><b>Precio de entrada</b> {String(s.precio_de_entrada ?? '')}.</li>
          <li><b>Reparto largos/cortos</b> {String(s.reparto_largos_cortos ?? '')} (largos {num(Number(s.fraccion_largos ?? 0) * 100)} %).</li>
          <li><b>Ventana</b> {String(s.ventana_de_inferencia_dias ?? '')} días · <b>cubeta</b> {String(s.ancho_de_cubeta ?? '')} · <b>margen de mantenimiento</b> {num(Number(s.margen_mantenimiento ?? 0) * 100, 1)} %.</li>
          <li><b>Venues</b> {(s.venues as string[] | undefined)?.join(', ') || '—'}{liq.venues_caidos && Object.keys(liq.venues_caidos).length ? ` · sin respuesta: ${Object.keys(liq.venues_caidos).join(', ')}` : ''}.</li>
        </ul>
      </div>
      <div>
        <span className="ch__k mono">Qué no es · limitaciones</span>
        <ul className="ch-heat__lista ch-heat__lista--lim">{liq.limitaciones.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>
    </div>
  )
}

/** Cuando el motor no pudo proyectar: se dice, no se rellena. */
export function HeatmapAusente({ liq }: { liq: LiquidacionProyectada }) {
  return (
    <div className="ch ch-heat ch-heat--ausente">
      <span className="ch__k mono">Liquidación proyectada · estimación, no medición</span>
      <p className="ch-heat__sesgo">No se pudo proyectar: {liq.motivo || 'faltan ingredientes'}.</p>
      <p className="ch__nota">Consultados: {(liq.venues_consultados ?? []).join(', ') || '—'}.</p>
    </div>
  )
}
