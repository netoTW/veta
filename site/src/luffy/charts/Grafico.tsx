import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Datos, Spec } from '../tipos'
import { ErrorLuffy, esTope, luffy } from '../api'
import { dibujar, type Vivo } from './lwc'
import type { Sincronia } from './sincronia'
import { esCapaVacia, fmt, fmtFecha, motivoLlano, RANGO_LABEL } from '../formato'

/* ============================================================================
   Un gráfico del contrato, interactivo: por spec o por spec_id. Pide los datos,
   los dibuja con lightweight-charts (lwc.ts) y pone encima las leyendas vivas
   de cada panel, los chips de rango y lo que no entró. Si no puede dibujar y
   hay PNG de respaldo, enseña el PNG: es el mismo que recibe Telegram.
   ========================================================================== */

interface Props {
  spec?: Spec; specId?: string
  /** Cuando el padre edita el spec (laboratorio): los chips de rango le devuelven el spec cambiado. */
  onSpec?: (s: Spec) => void
  onDatos?: (d: Datos) => void
  alto?: number; compacto?: boolean; interactivo?: boolean; rangos?: boolean
  acciones?: ReactNode; png?: string; className?: string
  /** Varios gráficos que se mueven juntos (cruz, zoom y rango): la ficha del terminal. */
  sincronia?: Sincronia
  /** Si viene, la línea del stop vigente se puede arrastrar; al soltar, llega el precio nuevo (para proponer moverlo). */
  onMoverStop?: (activo: string, precio: number) => void
  /** Espera antes de pedir los datos de un spec que llega por prop (en el laboratorio, mientras se edita). La terminal no espera. */
  demora?: number
}
const RANGOS = ['30d', '60d', '90d', '6m', '1y', 'max']

export function Grafico({ spec, specId, onSpec, onDatos, alto, compacto = false, interactivo = true, rangos = true, acciones, png, className = '', sincronia, onMoverStop, demora }: Props) {
  const [specResuelto, setSpecResuelto] = useState<Spec | null>(null)
  const [rangoLocal, setRangoLocal] = useState<string | null>(null)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [valores, setValores] = useState<Map<string, number | null>>(new Map())
  const [tCruz, setTCruz] = useState<number | null>(null)
  const [alturas, setAlturas] = useState<number[]>([])
  const [anchosIzq, setAnchosIzq] = useState<number[]>([])
  const [panelesVivos, setPanelesVivos] = useState<{ id: string; indice: number }[]>([])
  const [asa, setAsa] = useState<{ top: number; precio: number; activo: boolean } | null>(null)
  const arrastre = useRef<{ y0: number; precio0: number } | null>(null)
  const lienzo = useRef<HTMLDivElement>(null)
  const capa = useRef<HTMLDivElement>(null)
  const vivo = useRef<Vivo | null>(null)

  useEffect(() => {
    if (!specId) return
    let v = true
    luffy.spec(specId).then((s) => { if (v) setSpecResuelto(s.spec) }, (e) => { if (v) { setError(e instanceof ErrorLuffy ? e.message : String(e)); setCargando(false) } })
    return () => { v = false }
  }, [specId])

  const specEfectivo = useMemo<Spec | null>(() => {
    const base = spec ?? specResuelto
    if (!base) return null
    return rangoLocal && !onSpec ? { ...base, rango: rangoLocal } : base
  }, [spec, specResuelto, rangoLocal, onSpec])
  const clave = useMemo(() => (specEfectivo ? JSON.stringify(specEfectivo) : ''), [specEfectivo])

  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!clave) return
    const ctl = new AbortController(); let v = true
    // lo último que llegó para este spec se pinta ya; lo nuevo lo reemplaza al llegar
    const guardado = luffy.datosGuardados(JSON.parse(clave) as Spec)
    if (guardado) { setDatos(guardado); setError(null) }
    setCargando(true)
    const id = setTimeout(() => {
      luffy.datos(JSON.parse(clave) as Spec, ctl.signal).then((d) => { if (!v) return; setDatos(d); setError(null); setCargando(false); onDatos?.(d) }, (e) => { if (!v || ctl.signal.aborted) return; setError(esTope(e) ? 'El servidor tardó demasiado en mandar este gráfico.' : e instanceof ErrorLuffy ? e.message : String(e)); setCargando(false) })
    }, guardado ? 0 : demora ?? (spec ? 220 : 0))
    return () => { v = false; clearTimeout(id); ctl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDatos cambia en cada render del padre; sólo el spec decide
  }, [clave, intento])

  /* Mide los paneles y las leyendas: las leyendas se colocan por pane y cada pane reserva
     arriba el alto de la suya, así los datos nunca quedan debajo (tampoco en vistas previas ni a 390 px). */
  const medir = useCallback(() => {
    const v = vivo.current; if (!v) return
    setAlturas(v.alturas()); setAnchosIzq(v.anchosIzq())
    const leyendas = [...(capa.current?.querySelectorAll<HTMLElement>('.lf-g__ley') ?? [])].map((e) => e.offsetHeight)
    v.fijarMargenes(leyendas)
    if (v.stop) { const i = v.paneles.findIndex((p) => p.id === v.stop!.panel); const y = v.stop.y(); const top0 = v.alturas().slice(0, Math.max(0, i)).reduce((a, h) => a + h + 1, 0); setAsa(y === null ? null : { top: top0 + y, precio: v.stop.precio, activo: false }) } else setAsa(null)
  }, [])
  // arrastrar el stop: pointer events sobre el asa; mientras dura, el chart no se desplaza
  const alBajar = (e: React.PointerEvent<HTMLDivElement>) => { const v = vivo.current; if (!v?.stop || !onMoverStop) return; e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId); arrastre.current = { y0: e.clientY, precio0: v.stop.precio }; v.chart.applyOptions({ handleScroll: false, handleScale: false }); setAsa((a) => (a ? { ...a, activo: true } : a)) }
  const alMover = (e: React.PointerEvent<HTMLDivElement>) => { const v = vivo.current, d = arrastre.current; if (!v?.stop || !d) return; const y0 = v.stop.y(); if (y0 === null) return; const p = v.stop.precioEn(y0 + (e.clientY - d.y0)); if (p === null || p <= 0) return; v.stop.mover(p); setAsa((a) => (a ? { ...a, top: a.top + (e.clientY - d.y0), precio: p } : a)); d.y0 = e.clientY }
  const alSoltar = () => { const v = vivo.current, d = arrastre.current; arrastre.current = null; if (!v?.stop || !d) return; v.chart.applyOptions({ handleScroll: interactivo, handleScale: interactivo }); const y = v.stop.y(); const p = y === null ? null : v.stop.precioEn(y); setAsa((a) => (a ? { ...a, activo: false } : a)); if (p !== null && Math.abs(p - d.precio0) / d.precio0 > 0.001) onMoverStop?.(v.stop.activo, Number(p.toPrecision(5))); else v.stop.mover(d.precio0) }
  useEffect(() => {
    const el = lienzo.current
    if (!el || !datos) return
    const v = dibujar(el, datos, { interactivo, compacto, intervalo: datos.rango.intervalo, onCruz: (vals, t) => { setValores(vals); setTCruz(t) } })
    vivo.current = v
    const ini = new Map<string, number | null>(); for (const s of v.series) ini.set(s.id, s.ultimo); setValores(ini); setTCruz(null)
    setPanelesVivos(v.paneles)
    const t1 = setTimeout(medir, 40), t2 = setTimeout(medir, 400)
    const ro = new ResizeObserver(() => medir()); ro.observe(el)
    const soltar = sincronia ? sincronia.registrar(v.chart, v.series.find((s) => s.api)?.api ?? null) : null
    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect(); soltar?.(); v.destruir(); vivo.current = null }
  }, [datos, interactivo, compacto, medir, sincronia])

  const cambiarRango = (r: string) => { if (!specEfectivo) return; if (onSpec) onSpec({ ...specEfectivo, rango: r }); else setRangoLocal(r) }
  const nPaneles = Math.max(1, panelesVivos.length || datos?.paneles.filter((p) => p.series.length).length || 2)
  const altoPx = alto ?? (compacto ? 280 + (nPaneles - 1) * 72 : 420 + (nPaneles - 1) * 110)
  const rangoActual = specEfectivo?.rango ?? '90d'
  const series = vivo.current?.series ?? []
  const fuentes = useMemo(() => [...new Set((datos?.fuentes ?? []).map((f) => f.fuente.split(/[\s(:]/)[0]))].filter(Boolean), [datos])
  const noDisp = (datos?.no_disponibles ?? []).filter((n) => !esCapaVacia(n.motivo))
  const nivelesInfo = (datos?.niveles ?? []).filter((n) => n.tipo !== 'precio_actual')
  const tops = useMemo(() => { const out: number[] = []; let acc = 0; alturas.forEach((h, i) => { out.push(acc); acc += h + (i < alturas.length - 1 ? 1 : 0) }); return out }, [alturas])

  if (error && !datos) {
    return (
      <div className={`lf-g lf-g--error ${className}`}>
        <div className="lf-g__cab"><span className="lf-g__titulo">{specEfectivo?.titulo ?? 'Gráfico'}</span>{acciones}</div>
        {png ? <img className="lf-g__png" src={png} alt="" loading="lazy" /> : null}
        <p className="lf-g__nota">{png ? 'Se muestra la imagen de respaldo: ' : ''}{error}</p>
        <button type="button" className="lf-mas mono" onClick={() => { setError(null); setIntento((n) => n + 1) }} data-prueba="reintentar-grafico">Reintentar</button>
      </div>
    )
  }
  return (
    <div className={`lf-g ${compacto ? 'lf-g--compacto' : ''} ${cargando ? 'is-cargando' : ''} ${className}`}>
      <div className="lf-g__cab">
        <span className="lf-g__titulo">{datos?.titulo ?? specEfectivo?.titulo ?? '…'}</span>
        <div className="lf-g__cab-der">
          {rangos && <div className="lf-g__rangos" role="group" aria-label="Rango">{RANGOS.map((r) => <button key={r} type="button" className={`lf-chip ${rangoActual === r ? 'is-on' : ''}`} onClick={() => cambiarRango(r)}>{RANGO_LABEL[r] ?? r}</button>)}</div>}
          {acciones}
        </div>
      </div>
      <div className="lf-g__marco" style={{ height: altoPx }}>
        <div ref={lienzo} className="lf-g__lienzo" />
        <div className="lf-g__capa" aria-hidden="true" ref={capa}>
          {panelesVivos.map((pv, i) => { const p = datos?.paneles.find((x) => x.id === pv.id); if (!p) return null; return (
            <div key={p.id} className={`lf-g__ley ${compacto ? 'lf-g__ley--fila' : ''}`} style={{ top: (tops[i] ?? i * (altoPx / nPaneles)) + 6, left: 8 + (anchosIzq[i] ?? 0) }}>
              <span className="lf-g__ley-t">{p.titulo}{p.unidad ? <em> · {p.unidad}</em> : null}</span>
              {series.filter((s) => s.panel === p.id).map((s) => (
                <span key={s.id} className="lf-g__ley-s"><i style={{ background: s.color }} />{s.etiqueta}<b className="num">{fmt(valores.get(s.id) ?? null, s.unidad === 'USDT' || s.unidad === 'USD' ? '' : s.unidad)}</b></span>
              ))}
            </div>
          ) })}
          {tCruz !== null && <span className="lf-g__fecha mono">{fmtFecha(tCruz, datos?.rango.intervalo === '1h' || datos?.rango.intervalo === '4h')}{(vivo.current?.marcasEn(tCruz) ?? []).map((m, i) => <b key={i} className="lf-g__fecha-marca">{m}</b>)}</span>}
        </div>
        {asa && onMoverStop && (
          <div className={`lf-g__arrastre ${asa.activo ? 'is-activo' : ''}`} style={{ top: asa.top }} onPointerDown={alBajar} onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} title="Arrastra para proponer mover el stop" data-prueba="asa-stop">
            {asa.activo && <span className="lf-g__arrastre-tip" style={{ top: 7 }}>stop {fmt(asa.precio)}</span>}
          </div>
        )}
        {cargando && <div className="lf-g__velo"><span className="lf-gema is-latiendo" /></div>}
      </div>
      {(nivelesInfo.length > 0 || (datos?.zonas.length ?? 0) > 0 || (datos?.marcadores.length ?? 0) > 0) && (
        <div className="lf-g__marcas mono">
          {datos!.marcadores.filter((m) => m.tipo === 'entrada').length > 0 && <span className="lf-g__marca lf-g__marca--esm">▲ {datos!.marcadores.filter((m) => m.tipo === 'entrada').length} compra{datos!.marcadores.filter((m) => m.tipo === 'entrada').length > 1 ? 's' : ''}</span>}
          {datos!.marcadores.filter((m) => m.tipo === 'salida').length > 0 && <span className="lf-g__marca lf-g__marca--hueso">▼ {datos!.marcadores.filter((m) => m.tipo === 'salida').length} venta{datos!.marcadores.filter((m) => m.tipo === 'salida').length > 1 ? 's' : ''}</span>}
          {datos!.marcadores.filter((m) => m.tipo === 'stop_historial').length > 0 && <span className="lf-g__marca lf-g__marca--rojo">● stops: {datos!.marcadores.filter((m) => m.tipo === 'stop_historial').map((m) => fmt(m.precio)).join(' → ')}</span>}
          {datos!.marcadores.filter((m) => m.tipo === 'candidata').map((m, i) => <span key={`c${i}`} className="lf-g__marca lf-g__marca--oro">● {m.etiqueta} · {fmtFecha(m.t)}</span>)}
          {nivelesInfo.map((n, i) => <span key={`n${i}`} className={`lf-g__marca ${n.tipo === 'stop' || n.tipo === 'invalidacion' ? 'lf-g__marca--rojo' : n.tipo === 'gatillo' || n.tipo === 'objetivo' ? 'lf-g__marca--oro' : n.tipo === 'entrada' ? 'lf-g__marca--esm' : ''}`}>— {n.etiqueta}</span>)}
          {datos!.zonas.map((z, i) => <span key={`z${i}`} className="lf-g__marca lf-g__marca--esm">▮ {z.etiqueta}: {fmt(z.desde)}–{fmt(z.hasta)}</span>)}
        </div>
      )}
      {noDisp.length > 0 && <p className="lf-g__nota">Sin datos: {noDisp.map((n) => `${n.serie} (${motivoLlano(n.motivo)})`).join(' · ')}</p>}
      {datos && (
        <p className="lf-g__pie mono">
          {fuentes.length ? <>Fuentes: {fuentes.join(' · ')} · {fmtFecha(datos.consultado_en, true)}</> : null}
          <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" title="Gráficos con TradingView Lightweight Charts™">TradingView Lightweight Charts™</a>
        </p>
      )}
    </div>
  )
}
