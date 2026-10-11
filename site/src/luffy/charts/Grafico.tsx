import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Datos, Spec } from '../tipos'
import { ErrorLuffy, luffy } from '../api'
import { dibujar, type Vivo } from './lwc'
import { fmt, fmtFecha, RANGO_LABEL } from '../formato'

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
}
const RANGOS = ['30d', '60d', '90d', '6m', '1y', 'max']

export function Grafico({ spec, specId, onSpec, onDatos, alto, compacto = false, interactivo = true, rangos = true, acciones, png, className = '' }: Props) {
  const [specResuelto, setSpecResuelto] = useState<Spec | null>(null)
  const [rangoLocal, setRangoLocal] = useState<string | null>(null)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [valores, setValores] = useState<Map<string, number | null>>(new Map())
  const [tCruz, setTCruz] = useState<number | null>(null)
  const [alturas, setAlturas] = useState<number[]>([])
  const lienzo = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!clave) return
    const ctl = new AbortController(); let v = true
    setCargando(true)
    const id = setTimeout(() => {
      luffy.datos(JSON.parse(clave) as Spec, ctl.signal).then((d) => { if (!v) return; setDatos(d); setError(null); setCargando(false); onDatos?.(d) }, (e) => { if (!v || ctl.signal.aborted) return; setError(e instanceof ErrorLuffy ? e.message : String(e)); setCargando(false) })
    }, spec ? 220 : 0)
    return () => { v = false; clearTimeout(id); ctl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDatos cambia en cada render del padre; sólo el spec decide
  }, [clave])

  const medir = useCallback(() => { if (vivo.current) setAlturas(vivo.current.alturas()) }, [])
  useEffect(() => {
    const el = lienzo.current
    if (!el || !datos) return
    const v = dibujar(el, datos, { interactivo, compacto, intervalo: datos.rango.intervalo, onCruz: (vals, t) => { setValores(vals); setTCruz(t) } })
    vivo.current = v
    const ini = new Map<string, number | null>(); for (const s of v.series) ini.set(s.id, s.ultimo); setValores(ini); setTCruz(null)
    const t = setTimeout(medir, 60)
    const ro = new ResizeObserver(() => medir()); ro.observe(el)
    return () => { clearTimeout(t); ro.disconnect(); v.destruir(); vivo.current = null }
  }, [datos, interactivo, compacto, medir])

  const cambiarRango = (r: string) => { if (!specEfectivo) return; if (onSpec) onSpec({ ...specEfectivo, rango: r }); else setRangoLocal(r) }
  const nPaneles = datos?.paneles.length ?? 2
  const altoPx = alto ?? (compacto ? 280 + (nPaneles - 1) * 72 : 420 + (nPaneles - 1) * 110)
  const rangoActual = specEfectivo?.rango ?? '90d'
  const series = vivo.current?.series ?? []
  const fuentes = useMemo(() => [...new Set((datos?.fuentes ?? []).map((f) => f.fuente.split(/[\s(:]/)[0]))].filter(Boolean), [datos])
  const noDisp = datos?.no_disponibles ?? []
  const nivelesInfo = (datos?.niveles ?? []).filter((n) => n.tipo !== 'precio_actual')
  const tops = useMemo(() => { const out: number[] = []; let acc = 0; alturas.forEach((h, i) => { out.push(acc); acc += h + (i < alturas.length - 1 ? 1 : 0) }); return out }, [alturas])

  if (error && !datos) {
    return (
      <div className={`lf-g lf-g--error ${className}`}>
        <div className="lf-g__cab"><span className="lf-g__titulo">{specEfectivo?.titulo ?? 'Gráfico'}</span>{acciones}</div>
        {png ? <img className="lf-g__png" src={png} alt="" loading="lazy" /> : null}
        <p className="lf-g__nota">{png ? 'Se muestra la imagen de respaldo: ' : ''}{error}</p>
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
        <div className="lf-g__capa" aria-hidden="true">
          {datos?.paneles.map((p, i) => (
            <div key={p.id} className="lf-g__ley" style={{ top: (tops[i] ?? i * (altoPx / nPaneles)) + 6 }}>
              <span className="lf-g__ley-t">{p.titulo}{p.unidad ? <em> · {p.unidad}</em> : null}</span>
              {series.filter((s) => s.panel === p.id).map((s) => (
                <span key={s.id} className="lf-g__ley-s"><i style={{ background: s.color }} />{s.etiqueta}<b className="num">{fmt(valores.get(s.id) ?? null, s.unidad === 'USDT' || s.unidad === 'USD' ? '' : s.unidad)}</b></span>
              ))}
            </div>
          ))}
          {tCruz !== null && <span className="lf-g__fecha mono">{fmtFecha(tCruz, datos?.rango.intervalo === '1h' || datos?.rango.intervalo === '4h')}</span>}
        </div>
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
      {noDisp.length > 0 && <p className="lf-g__nota">Sin datos: {noDisp.map((n) => `${n.serie} (${n.motivo})`).join(' · ')}</p>}
      {!compacto && datos && (
        <p className="lf-g__pie mono">
          {fuentes.length ? <>Fuentes: {fuentes.join(' · ')} · {fmtFecha(datos.consultado_en, true)}</> : null}
          <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" title="Gráficos con TradingView Lightweight Charts™">TradingView Lightweight Charts™</a>
        </p>
      )}
    </div>
  )
}
