import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Time } from 'lightweight-charts'
import type { Sincronia } from '../charts/sincronia'
import { fmt, fmtFecha } from '../formato'
import { valorEn, type SerieV, type Vivo2 } from './graficos'

/* La cruz de un gráfico mueve las de los otros (Sincronia), pero la librería no avisa de esas cruces
   puestas por código: la fecha se reparte aquí, a todas las leyendas de la misma ficha. */
const LEYENDAS = new WeakMap<Sincronia, Set<(t: number | null, conCruz?: boolean) => void>>()

/* Un gráfico del terminal v2: la leyenda va arriba, fuera de los datos, y con la cruz
   (o el dedo, en el teléfono) muestra la fecha y el valor de todas las series a la vez.
   Se registra en la Sincronia de la ficha (eje de tiempo, cruz y zoom compartidos). */
export function Grafico2({ construir, alto, sincronia, deps, prueba, leyendaExtra, horas = false, sinLeyenda = false, alVivo }: {
  construir: (el: HTMLElement) => Vivo2 | null; alto: number; sincronia: Sincronia; deps: unknown[]; prueba: string
  leyendaExtra?: ReactNode; horas?: boolean; sinLeyenda?: boolean
  /** para quien necesita el gráfico vivo (las capas del de precio, que se prenden sin rehacerlo) */
  alVivo?: (v: Vivo2 | null) => void
}) {
  const caja = useRef<HTMLDivElement>(null)
  const vivo = useRef<Vivo2 | null>(null)
  const [series, setSeries] = useState<SerieV[]>([])
  const [cruz, setCruz] = useState<number | null>(null)
  const [fallo, setFallo] = useState<string | null>(null)
  useEffect(() => {
    if (!caja.current) return
    let v: Vivo2 | null = null
    try { v = construir(caja.current) } catch (e) { setFallo(e instanceof Error ? e.message : String(e)); return }
    if (!v) return
    vivo.current = v; setSeries(v.series); setFallo(null); alVivo?.(v)
    const soltar = sincronia.registrar(v.chart, v.ancla)
    const oyentes = LEYENDAS.get(sincronia) ?? new Set(); LEYENDAS.set(sincronia, oyentes)
    const vv = v
    const anclaV = vv.series.find((x) => x.api === vv.ancla) ?? vv.series[0]
    // cada gráfico escucha la fecha que mueve cualquiera de la ficha: su leyenda y, si la pide el dedo, su cruz
    const oir = (t: number | null, conCruz = false) => {
      setCruz(t)
      if (!conCruz) return
      try { if (t === null) vv.chart.clearCrosshairPosition(); else { const y = anclaV ? valorEn(anclaV, t) : null; if (y !== null) vv.chart.setCrosshairPosition(y, t as Time, vv.ancla) } } catch { /* fuera de sus datos */ }
    }
    oyentes.add(oir)
    // sólo la cruz que mueve una persona (con su evento) se reparte; las puestas por la Sincronia no
    const alCruz = (p: { time?: Time; sourceEvent?: unknown }) => { if (!p.sourceEvent) return; const t = typeof p.time === 'number' ? p.time : null; for (const f of oyentes) f(t) }
    vv.chart.subscribeCrosshairMove(alCruz)
    /* En el teléfono la librería sólo muestra la cruz con un toque largo: aquí un toque o un arrastre
       horizontal la ponen en todos los gráficos de la ficha (con todas las series en la leyenda); el
       arrastre vertical sigue bajando la página. */
    const el = caja.current
    let x0 = 0, y0 = 0, horizontal: boolean | null = null
    const tiempoEn = (cx: number) => { const r = el.getBoundingClientRect(); let izq = 0; try { izq = vv.chart.priceScale('left').width() } catch { /* sin eje izquierdo */ } const t = vv.chart.timeScale().coordinateToTime(cx - r.left - izq); return typeof t === 'number' ? t : null }
    const poner = (cx: number) => { const t = tiempoEn(cx); for (const f of oyentes) f(t, true) }
    const inicio = (e: TouchEvent) => { if (e.touches.length !== 1) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; horizontal = null; poner(x0) }
    const mover = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0
      if (horizontal === null && Math.hypot(dx, dy) > 6) horizontal = Math.abs(dx) > Math.abs(dy)
      if (horizontal) { e.preventDefault(); poner(e.touches[0].clientX) }
    }
    el.addEventListener('touchstart', inicio, { passive: true })
    el.addEventListener('touchmove', mover, { passive: false })
    return () => { soltar(); oyentes.delete(oir); el.removeEventListener('touchstart', inicio); el.removeEventListener('touchmove', mover); try { vv.chart.unsubscribeCrosshairMove(alCruz) } catch { /* ya destruido */ } alVivo?.(null); vv.destruir(); vivo.current = null }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  if (fallo) return <div className="t2-g t2-g--falla" style={{ minHeight: alto }} data-prueba={prueba}><p>No se pudo dibujar este gráfico: {fallo}</p></div>
  return (
    <div className="t2-g" data-prueba={prueba}>
      {!sinLeyenda && (
        <div className="t2-g__ley t2m" aria-live="off">
          <span className="t2-g__fecha">{cruz !== null ? fmtFecha(cruz, horas) : 'último'}</span>
          {series.map((s) => { const v = valorEn(s, cruz); return <span key={s.id} className="t2-g__s"><i style={{ background: s.forma === 'linea' ? 'transparent' : s.color, borderColor: s.color }} className={`t2-g__m t2-g__m--${s.forma}`} />{s.etiqueta}<b>{v === null ? '—' : `${fmt(v)}${s.unidad === '%' ? ' %' : ''}`}</b></span> })}
          {leyendaExtra}
        </div>
      )}
      <div ref={caja} className="t2-g__lienzo" style={{ height: alto }} />
    </div>
  )
}

/** Monta su contenido cuando está por entrar en pantalla: los gráficos de abajo no piden ni dibujan hasta acercarse. */
export function AlVerse({ alto, ya = false, children }: { alto: number; ya?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visto, setVisto] = useState(ya)
  useEffect(() => {
    if (visto || !ref.current) return
    if (typeof IntersectionObserver === 'undefined') { setVisto(true); return }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisto(true); io.disconnect() } }, { rootMargin: '600px 0px' })
    io.observe(ref.current); return () => io.disconnect()
  }, [visto])
  return visto ? <>{children}</> : <div ref={ref} className="t2-g t2-g--espera" style={{ minHeight: alto }} aria-hidden="true" />
}
