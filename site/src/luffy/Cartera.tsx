import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Seguro } from './Seguro'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { AccionExchange, Caja, Cartera as CarteraT, Comisiones, CurvaCapital, Fill, Ordenes, PosicionCartera } from './tipos6b'
import type { Propuesta } from './tipos'
import { TarjetaPropuesta } from './Chat'
import { fmt, fmtFecha, fmtHora, fmtPrecio, fmtUsd, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'
import { echarts, BASE_ECHARTS } from './charts/echarts'
import { C, rgba } from './charts/tema'
import { Plegable } from './Plegable'

/* ============================================================================
   Cartera (CONTRATO-PANEL.md §8.2 y §8.4): la de Pablo y la caja. Posiciones
   con mandato, PnL, stop y distancia, peso; curva de capital con aportes,
   retiros y drawdown; movimientos de capital declarados; exposición. Exchange
   de la cartera de Pablo: órdenes abiertas (las externas, marcadas), historial,
   fills y comisiones; cerrar, mover stop, cancelar, modificar, cambio de
   mandato y orden nueva generan propuestas (`POST /exchange/propuestas`) que
   se confirman como las del chat. Declarar una posición previa (STONK). La caja
   se mira, no se opera: misión, decisiones por ciclo, pausar, cancelar, pánico.
   Lo simulado y lo declarado siempre etiquetados.
   ========================================================================== */
const pct1 = (v: number) => `${v.toFixed(1).replace('.', ',')}\u00a0%`
const signo = (v: number | null | undefined, unidad = '') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmt(v, unidad)}`)
const tono = (v: number | null | undefined) => (v === null || v === undefined ? '' : v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '')
const COLORES = [C.esmLuz, C.oroLuz, C.hueso, C.ceniza, C.esm, C.oro]
const hoy = () => new Date().toISOString().slice(0, 10)
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export function Cartera() {
  const [pestana, setPestana] = useState<'pablo' | 'caja'>('pablo')
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">Cartera <em>y exchange</em></h1>
        <div className="lf-tabs" role="tablist"><button type="button" role="tab" className={pestana === 'pablo' ? 'is-on' : ''} onClick={() => setPestana('pablo')} data-prueba="pestana-pablo">Pablo</button><button type="button" role="tab" className={pestana === 'caja' ? 'is-on' : ''} onClick={() => setPestana('caja')} data-prueba="pestana-caja">La caja</button></div>
      </div>
      {pestana === 'pablo' ? <CarteraPablo /> : <CarteraCaja />}
    </div>
  )
}

function Curva({ curva }: { curva: CurvaCapital }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el || !curva.puntos.length) return
    const ch = echarts.init(el)
    ch.setOption({ ...BASE_ECHARTS, grid: { left: 8, right: 56, top: 14, bottom: 8, containLabel: true },
      tooltip: { ...BASE_ECHARTS.tooltip, trigger: 'axis', formatter: (ps: { axisValue: number; seriesName: string; value: [number, number] }[]) => `${fmtFecha(ps[0].axisValue / 1000)}<br/>${ps.map((p) => `${p.seriesName}: <b>${p.seriesName === 'Drawdown' ? `${p.value[1].toFixed(2).replace('.', ',')} %` : fmt(p.value[1], 'USDT')}</b>`).join('<br/>')}` },
      xAxis: { type: 'time', minInterval: 86_400_000, axisLabel: { formatter: (v: number) => fmtFecha(v / 1000).replace(/ \d\d$/, ''), hideOverlap: true }, axisLine: { lineStyle: { color: C.hairline } }, splitLine: { show: false } },
      yAxis: [{ type: 'value', scale: true, axisLabel: { formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: C.grid } } }, { type: 'value', max: 0, min: (v: { min: number }) => Math.min(-2, Math.floor(v.min)), axisLabel: { formatter: (v: number) => `${v} %` }, splitLine: { show: false } }],
      series: [
        { name: 'Valor', type: 'line', showSymbol: false, data: curva.puntos.map((p) => [p.t * 1000, p.valor_total_usdt]), lineStyle: { color: C.esmLuz, width: 2 }, areaStyle: { color: rgba(C.esm, 0.16) } },
        { name: 'Aportes netos', type: 'line', step: 'end', showSymbol: false, data: curva.puntos.map((p) => [p.t * 1000, p.aportes_acum_usdt]), lineStyle: { color: C.ceniza2, width: 1, type: 'dashed' } },
        { name: 'Drawdown', type: 'line', yAxisIndex: 1, showSymbol: false, data: curva.puntos.map((p) => [p.t * 1000, p.drawdown_pct]), lineStyle: { color: C.rojoLuz, width: 1 }, areaStyle: { color: rgba(C.rojo, 0.15) } },
      ] })
    const ro = new ResizeObserver(() => ch.resize()); ro.observe(el)
    return () => { ro.disconnect(); ch.dispose() }
  }, [curva])
  if (!curva.puntos.length) return <p className="lf-ctrl__nota mono">Sin datos: {curva.no_disponibles?.map((n) => n.motivo).join(' · ') ?? 'sin snapshots en el rango'}</p>
  return <div ref={ref} className="lf-cart__curva" />
}

function TarjetaCurva({ origen }: { origen: 'pablo' | 'caja' }) {
  const [rango, setRango] = useState('90d'); const [curva, setCurva] = useState<CurvaCapital | null>(null); const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(false); const [m, setM] = useState({ fecha: hoy(), usdt: '', tipo: 'aporte' as 'aporte' | 'retiro', nota: '' })
  const cargar = useCallback(() => luffy6b.curva(origen, rango).then((c) => { setCurva(c); setError(null) }, (e) => setError(e instanceof Error ? e.message : String(e))), [origen, rango])
  useEffect(() => { void cargar() }, [cargar])
  const guardar = async (e: FormEvent) => { e.preventDefault(); const usdt = Number(m.usdt.replace(',', '.')); if (!(usdt > 0)) return; try { await luffy6b.nuevoMovimiento({ fecha: m.fecha, usdt, tipo: m.tipo, nota: m.nota || null, origen }); setForm(false); setM({ ...m, usdt: '', nota: '' }); await cargar() } catch (x) { setError(x instanceof Error ? x.message : String(x)) } }
  const r = curva?.resumen
  return (
    <section className="lf-tarj">
      <h3 className="mono">Curva de capital<em><span className="lf-g__rangos">{['30d', '90d', '6m', '1y'].map((x) => <button key={x} type="button" className={`lf-chip ${rango === x ? 'is-on' : ''}`} onClick={() => setRango(x)}>{x}</button>)}</span></em></h3>
      {error && <p className="lf-m__error">{error}</p>}
      {curva ? <Curva curva={curva} /> : <div className="lf-cart__curva" />}
      {r && <p className="lf-ctrl__nota mono">rendimiento {signo(r.rendimiento_usdt, 'USDT')} ({signo(r.rendimiento_pct, '%')}) · drawdown máximo {fmt(r.max_drawdown_pct)} % · aportes {fmt(r.aportes_usdt, 'USDT')}{r.retiros_usdt ? ` · retiros ${fmt(r.retiros_usdt, 'USDT')}` : ''} · desde {fmtFecha(r.desde)}</p>}
      {curva && curva.movimientos.length > 0 && <p className="lf-ctrl__nota mono">Movimientos: {curva.movimientos.map((x, i) => <span key={x.id}>{i > 0 && ' · '}{fmtFecha(x.fecha)} {x.tipo} {fmt(x.usdt, 'USDT')}{x.nota ? ` (${x.nota})` : ''} <button type="button" className="lf-panel__x" style={{ display: 'inline-block', width: 16, height: 16, fontSize: '0.6rem' }} aria-label="Borrar movimiento" onClick={async () => { await luffy6b.borrarMovimiento(x.id); await cargar() }}>×</button></span>)}</p>}
      {origen === 'pablo' && (form ? (
        <form className="lf-form" onSubmit={guardar}>
          <label><span className="mono">Fecha</span><input type="date" value={m.fecha} onChange={(e) => setM({ ...m, fecha: e.target.value })} /></label>
          <label><span className="mono">Tipo</span><select value={m.tipo} onChange={(e) => setM({ ...m, tipo: e.target.value as 'aporte' | 'retiro' })}><option value="aporte">aporte</option><option value="retiro">retiro</option></select></label>
          <label><span className="mono">USDT</span><input value={m.usdt} onChange={(e) => setM({ ...m, usdt: e.target.value })} inputMode="decimal" required /></label>
          <label><span className="mono">Nota</span><input value={m.nota} onChange={(e) => setM({ ...m, nota: e.target.value })} /></label>
          <button type="submit" className="btn btn--esmeralda">Anotar</button>
        </form>
      ) : <div className="lf-acc-fila"><button type="button" className="lf-chip" onClick={() => setForm(true)}>Anotar un aporte o retiro</button></div>)}
    </section>
  )
}

function TablaPosiciones({ posiciones, acciones }: { posiciones: PosicionCartera[]; acciones?: (p: PosicionCartera) => ReactNode }) {
  if (!posiciones.length) return <p className="lf-ctrl__nota mono">Sin posiciones abiertas.</p>
  return (
    <div className="lf-tabla__scroll"><table className="lf-tabla">
      <thead><tr><th>Activo</th><th>Mandato</th><th className="num">Cantidad</th><th className="num">Precio medio · actual</th><th className="num">Valor</th><th className="num">No realizado</th><th className="num">Realizado</th><th>Stop · distancia</th><th className="num">Peso</th>{acciones && <th />}</tr></thead>
      <tbody>{posiciones.map((p) => (
        <tr key={`${p.activo}-${p.abierta_en}`} data-prueba="posicion" data-activo={p.activo}>
          <td><Link to={`/luffy/terminal/${p.activo}`}><b>{p.activo}</b></Link><small>{p.declarada ? <span className="lf-sim">declarada · </span> : ''}{p.simulado ? <span className="lf-sim">simulada · </span> : ''}desde {fmtFecha(p.abierta_en)}</small></td>
          <td>{p.mandato}</td>
          <td className="num">{fmt(p.cantidad)}</td>
          <td className="num">{fmtPrecio(p.precio_medio)}<small>{fmtPrecio(p.precio_actual)}</small></td>
          <td className="num">{p.valor_usdt !== null ? fmt(p.valor_usdt, 'USDT') : '—'}</td>
          <td className={`num ${tono(p.pnl_no_realizado_usdt)}`}>{signo(p.pnl_no_realizado_usdt, 'USDT')}<small>{p.pnl_no_realizado_pct !== null ? signo(p.pnl_no_realizado_pct, '%') : ''}</small></td>
          <td className={`num ${tono(p.pnl_realizado_usdt)}`}>{signo(p.pnl_realizado_usdt, 'USDT')}</td>
          <td>{p.stop ? <>{fmtPrecio(p.stop.precio)}<small>{p.stop.distancia_pct !== null ? `${fmt(p.stop.distancia_pct)} % del precio` : ''}</small></> : p.sin_stop ? <small className="is-neg">sin stop vivo</small> : <small>sin stop{p.mandato === 'hold' ? ' (hold: sale por invalidación)' : ''}</small>}</td>
          <td className="num">{p.peso_pct !== null ? `${fmt(p.peso_pct)} %` : '—'}</td>
          {acciones && <td>{acciones(p)}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function Exposicion({ c }: { c: CarteraT }) {
  const total = c.capital.valor_total_usdt || 1
  const partes = c.posiciones.filter((p) => p.valor_usdt).map((p) => ({ activo: p.activo, pct: ((p.valor_usdt ?? 0) / total) * 100 }))
  const efectivo = Math.max(0, 100 - partes.reduce((a, e) => a + e.pct, 0))
  return (
    <section className="lf-tarj"><h3 className="mono">Exposición<em>{fmt(c.capital.exposicion_pct)} % en posiciones</em></h3>
      <div className="lf-expo">{partes.map((e, i) => <span key={e.activo} style={{ width: `${e.pct}%`, background: COLORES[i % COLORES.length] }} title={`${e.activo} ${pct1(e.pct)}`} />)}</div>
      <div className="lf-expo__ley">{partes.map((e, i) => <span key={e.activo}><i style={{ background: COLORES[i % COLORES.length] }} />{e.activo} {pct1(e.pct)}</span>)}<span><i style={{ background: 'var(--roca-0)', border: '1px solid var(--hairline)' }} />efectivo {pct1(efectivo)}</span></div>
    </section>
  )
}

function Kpis({ c }: { c: CarteraT }) {
  return (
    <div className="lf-kpis">
      <div className="lf-kpi"><span className="mono">Valor total</span><b>{fmt(c.capital.valor_total_usdt, 'USDT')}</b><small>{c.simulado ? <span className="lf-sim">simulado</span> : 'real · BingX'}{c.capital.declarado_usdt ? ` · capital declarado ${fmt(c.capital.declarado_usdt, 'USDT')}` : c.capital.capital_asignado_usdt ? ` · asignado ${fmt(c.capital.capital_asignado_usdt, 'USDT')}` : ''}</small></div>
      <div className="lf-kpi"><span className="mono">Efectivo</span><b>{fmt(c.capital.efectivo_usdt, 'USDT')}</b><small>en posiciones {fmt(c.capital.valor_posiciones_usdt, 'USDT')}</small></div>
      <div className="lf-kpi"><span className="mono">No realizado</span><b className={tono(c.pnl.no_realizado_total_usdt)}>{signo(c.pnl.no_realizado_total_usdt, 'USDT')}</b><small>{c.posiciones.length} posición{c.posiciones.length === 1 ? '' : 'es'} abierta{c.posiciones.length === 1 ? '' : 's'}</small></div>
      <div className="lf-kpi"><span className="mono">Realizado</span><b className={tono(c.pnl.realizado_total_usdt)}>{signo(c.pnl.realizado_total_usdt, 'USDT')}</b><small>comisiones {fmt(c.pnl.comisiones_total_usdt, 'USDT')}{c.pnl.desde ? ` · desde ${fmtFecha(c.pnl.desde)}` : ''}</small></div>
    </div>
  )
}

function Cerradas({ c }: { c: CarteraT }) {
  if (!c.cerradas_recientes.length) return null
  return (
    <section className="lf-tarj"><h3 className="mono">Cerradas recientes</h3>
      <div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Activo</th><th>Mandato</th><th>Abierta · cerrada</th><th className="num">Costo</th><th className="num">Realizado</th><th className="num">Comisiones</th><th>Motivo</th></tr></thead>
        <tbody>{c.cerradas_recientes.map((x) => <tr key={`${x.activo}-${x.abierta_en}`}><td><Link to={`/luffy/terminal/${x.activo}`}><b>{x.activo}</b></Link></td><td>{x.mandato}</td><td><small>{fmtFecha(x.abierta_en, true)}</small><small>{x.cerrada_en ? fmtFecha(x.cerrada_en, true) : '—'}</small></td><td className="num">{fmt(x.costo_usdt, 'USDT')}</td><td className={`num ${tono(x.pnl_realizado_usdt)}`}>{signo(x.pnl_realizado_usdt, 'USDT')}</td><td className="num">{fmt(x.comisiones_usdt, 'USDT')}</td><td><small>{x.motivo_cierre ?? ''}</small></td></tr>)}</tbody></table></div>
    </section>
  )
}

function CarteraPablo() {
  const [c, setC] = useState<CarteraT | null>(null)
  const [ordenes, setOrdenes] = useState<Ordenes | null>(null)
  const [fills, setFills] = useState<Fill[] | null>(null)
  const [avisoFills, setAvisoFills] = useState<string | null>(null)
  const [comis, setComis] = useState<Comisiones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [formulario, setFormulario] = useState<'declarar' | 'orden' | null>(null)
  const cargar = useCallback(async () => {
    let cart: CarteraT | null = null, ords: Ordenes | null = null
    try { cart = await luffy6b.cartera('pablo'); setC(cart); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }
    try { ords = await luffy6b.ordenes('abiertas'); setOrdenes(ords) } catch { setOrdenes(null) }
    const pares = [...(cart?.posiciones ?? []).map((p) => `${p.activo}-USDT`), ...(cart?.cerradas_recientes ?? []).map((p) => `${p.activo}-USDT`), ...(ords?.ordenes ?? []).map((o) => o.par)]
    luffy6b.fillsTodos(pares).then((r) => { setFills(r.fills); setAvisoFills(r.avisos.length ? r.avisos.map((m) => (/100410|frequency limit/i.test(m) ? 'BingX limitó las consultas por un rato; vuelven solas en unos minutos.' : m)).filter((m, i, a) => a.indexOf(m) === i).join(' · ') : null) }, (e) => { setFills(null); setAvisoFills(e instanceof Error ? e.message : String(e)) })
    luffy6b.comisiones(haceDias(30), hoy(), 'pablo').then(setComis, () => setComis(null))
  }, [])
  useEffect(() => { void cargar() }, [cargar])
  const proponer = async (a: AccionExchange) => { try { const r = await luffy6b.proponer(a); setPropuestas(r.propuestas); setError(null); window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  if (error && !c) return <EmptyState kind="error" title="No se pudo cargar la cartera." detail={error} />
  if (!c) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  return (
    <>
      {error && <p className="lf-m__error">{error}</p>}
      <Seguro t="Resumen">{() => (<Kpis c={c} />)}</Seguro>
      {propuestas.length > 0 && <div className="lf-props">{propuestas.length > 1 && <p className="lf-ctrl__nota mono">Se confirman en este orden: primero la 1, después la 2.</p>}{propuestas.map((p) => <TarjetaPropuesta key={p.id_corto} p={p} alCambiar={cargar} cambiar={() => {}} />)}</div>}
      <Seguro t="Posiciones abiertas">{() => (<section className="lf-tarj">
        <h3 className="mono">Posiciones abiertas<em>consultado {fmtHora(c.consultado_en)}</em></h3>
        <TablaPosiciones posiciones={c.posiciones} acciones={(p) => <AccionesPosicion p={p} onProponer={proponer} />} />
        <div className="lf-acc-fila">
          <button type="button" className="lf-chip lf-chip--oro" onClick={() => setFormulario(formulario === 'declarar' ? null : 'declarar')} data-prueba="declarar">{formulario === 'declarar' ? 'Cerrar' : 'Declarar una posición previa'}</button>
          <button type="button" className="lf-chip" onClick={() => setFormulario(formulario === 'orden' ? null : 'orden')}>{formulario === 'orden' ? 'Cerrar' : 'Orden nueva'}</button>
        </div>
        {formulario === 'declarar' && <Declarar onPropuesta={(p) => { setPropuestas([p]); setFormulario(null) }} />}
        {formulario === 'orden' && <OrdenNueva onProponer={async (a) => { await proponer(a); setFormulario(null) }} />}
      </section>)}</Seguro>
      <Seguro t="Curva y exposición">{() => (<div className="lf-dos"><TarjetaCurva origen="pablo" /><Exposicion c={c} /></div>)}</Seguro>
      <Seguro t="Órdenes abiertas">{() => (<section className="lf-tarj">
        <h3 className="mono">Órdenes abiertas en BingX<em>{ordenes ? `${ordenes.ordenes.length} · ${fmtHora(ordenes.consultado_en)}` : ''}</em></h3>
        {ordenes?.ordenes.length ? (
          <div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Par</th><th>Tipo</th><th className="num">Precio · stop</th><th className="num">Cantidad</th><th>Origen</th><th>Hora</th><th /></tr></thead>
            <tbody>{ordenes.ordenes.map((o) => <tr key={o.id} data-prueba="orden"><td><b>{o.par}</b><small>{o.lado}</small></td><td>{o.tipo.toLowerCase().replace(/_/g, ' ')}<small>{o.estado.toLowerCase()}</small></td><td className="num">{o.precio !== null ? fmtPrecio(o.precio) : '—'}<small>{o.precio_stop !== null ? `stop ${fmtPrecio(o.precio_stop)}` : ''}</small></td><td className="num">{fmt(o.cantidad)}<small>ejecutada {fmt(o.ejecutada)}</small></td>
              <td>{o.propuesta ? <small>#{o.propuesta.id_corto} · {o.propuesta.origen} · {o.propuesta.rol}</small> : <small className="lf-sim">externa (puesta a mano en BingX)</small>}</td><td><small>{hace(o.hora)}</small></td>
              <td><div className="lf-acc-fila"><button type="button" className="lf-chip" onClick={() => proponer({ accion: 'cancelar', orden_id: o.id, razon: 'cancelada desde el panel' })}>Cancelar</button>{o.propuesta?.rol !== 'stop' && <ModificarOrden id={o.id} onProponer={proponer} />}</div></td></tr>)}</tbody></table></div>
        ) : <p className="lf-ctrl__nota mono">{ordenes ? 'Sin órdenes abiertas.' : 'Las órdenes de BingX no respondieron.'}</p>}
      </section>)}</Seguro>
      <div className="lf-dos">
        <Seguro t="Ejecuciones recientes">{() => (<section className="lf-tarj">
          <h3 className="mono">Ejecuciones recientes<em>{fills ? `${fills.length} · bingx` : ''}</em></h3>
          {fills?.length ? (
            <div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Hora</th><th>Par</th><th>Lado</th><th className="num">Precio</th><th className="num">Total</th><th className="num">Comisión</th></tr></thead>
              <tbody>{fills.map((f) => <tr key={f.id}><td><small>{fmtFecha(f.hora, true)}</small></td><td><b>{f.par ?? '—'}</b><small>{f.propuesta ? `#${f.propuesta.id_corto} · ${f.propuesta.origen}` : 'externa'}</small></td><td className={f.lado === 'compra' ? 'is-pos' : 'is-neg'}>{f.lado}<small>{f.maker ? 'maker' : 'taker'}</small></td><td className="num">{fmtPrecio(f.precio)}</td><td className="num">{fmt(f.total_usdt, 'USDT')}</td><td className="num">{fmt(Math.abs(f.comision))} {f.comision_activo ?? 'USDT'}</td></tr>)}</tbody></table></div>
          ) : <p className="lf-ctrl__nota mono">{avisoFills ?? 'Sin ejecuciones.'}</p>}
        </section>)}</Seguro>
        <Seguro t="Comisiones">{() => (<section className="lf-tarj">
          <h3 className="mono">Comisiones · 30 días<em>{comis ? `${fmt(comis.total_usdt, 'USDT')} en ${comis.n_fills} ejecuciones` : ''}</em></h3>
          {comis?.por_activo.length ? <div className="lf-tabla__scroll"><table className="lf-tabla"><tbody>{comis.por_activo.map((x) => <tr key={x.activo}><td><b>{x.activo}</b><small>{x.n_fills} ejecuciones · volumen {fmt(x.volumen_usdt, 'USDT')}</small></td><td className="num">{fmt(x.comision_usdt, 'USDT')}</td></tr>)}</tbody></table></div> : <p className="lf-ctrl__nota mono">Sin comisiones en el periodo.</p>}
          {comis?.tasas.length ? <p className="lf-ctrl__nota mono">Tasas: {comis.tasas.map((t) => `${t.par} maker ${fmt(t.maker_pct)} % · taker ${fmt(t.taker_pct)} %`).join(' · ')}</p> : null}
        </section>)}</Seguro>
      </div>
      <Seguro t="Cerradas recientes">{() => (<Cerradas c={c} />)}</Seguro>
    </>
  )
}

function AccionesPosicion({ p, onProponer }: { p: PosicionCartera; onProponer: (a: AccionExchange) => Promise<void> }) {
  const [abierto, setAbierto] = useState<'stop' | 'cerrar' | 'mandato' | null>(null)
  const [v, setV] = useState('')
  const par = `${p.activo}-USDT`
  if (abierto === 'stop') return <form className="lf-acc-fila" onSubmit={(e) => { e.preventDefault(); const n = Number(v.replace(',', '.')); if (n > 0) { void onProponer({ accion: 'mover_stop', par, stop: n, afloja: p.stop !== null && n < p.stop.precio, razon: 'movido desde la cartera' }); setAbierto(null) } }}><input className="lf-ctrl__mini" value={v} onChange={(e) => setV(e.target.value)} placeholder={p.stop ? fmtPrecio(p.stop.precio) : 'stop'} aria-label="Stop nuevo" style={{ width: 84 }} autoFocus /><button type="submit" className="lf-chip lf-chip--oro">Proponer</button><button type="button" className="lf-chip" onClick={() => setAbierto(null)}>×</button></form>
  if (abierto === 'cerrar') return <form className="lf-acc-fila" onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(v)); if (n >= 1 && n <= 100) { void onProponer({ accion: 'cerrar', par, pct_posicion: n, tipo: 'market', razon: 'cierre desde la cartera' }); setAbierto(null) } }}><input className="lf-ctrl__mini" value={v} onChange={(e) => setV(e.target.value)} placeholder="%" inputMode="numeric" aria-label="Porcentaje a cerrar" style={{ width: 60 }} autoFocus /><button type="submit" className="lf-chip lf-chip--oro">Proponer</button><button type="button" className="lf-chip" onClick={() => setAbierto(null)}>×</button></form>
  if (abierto === 'mandato') return <form className="lf-acc-fila" onSubmit={(e) => { e.preventDefault(); if (v === 'hold' || v === 'swing' || v === 'trade') { void onProponer({ accion: 'cambio_mandato', par, mandato: v, razon: 'cambio desde la cartera' }); setAbierto(null) } }}><select className="lf-ctrl__mini" value={v} onChange={(e) => setV(e.target.value)} aria-label="Mandato"><option value="">mandato…</option>{['hold', 'swing', 'trade'].filter((x) => x !== p.mandato).map((x) => <option key={x} value={x}>{x}</option>)}</select><button type="submit" className="lf-chip lf-chip--oro">Proponer</button><button type="button" className="lf-chip" onClick={() => setAbierto(null)}>×</button></form>
  return <div className="lf-acc-fila"><button type="button" className="lf-chip" onClick={() => { setV(''); setAbierto('cerrar') }}>Cerrar</button><button type="button" className="lf-chip" onClick={() => { setV(''); setAbierto('stop') }} data-prueba="mover-stop">{p.stop ? 'Mover stop' : 'Poner stop'}</button><button type="button" className="lf-chip" onClick={() => { setV(''); setAbierto('mandato') }}>Mandato</button></div>
}
function ModificarOrden({ id, onProponer }: { id: string; onProponer: (a: AccionExchange) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false); const [precio, setPrecio] = useState(''); const [cantidad, setCantidad] = useState('')
  if (!abierto) return <button type="button" className="lf-chip" onClick={() => setAbierto(true)}>Modificar</button>
  return <form className="lf-acc-fila" onSubmit={(e) => { e.preventDefault(); void onProponer({ accion: 'modificar', orden_id: id, precio: Number(precio.replace(',', '.')) || undefined, cantidad: Number(cantidad.replace(',', '.')) || undefined, razon: 'modificada desde el panel' }); setAbierto(false) }}><input className="lf-ctrl__mini" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="precio" aria-label="Precio" style={{ width: 80 }} /><input className="lf-ctrl__mini" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="cantidad" aria-label="Cantidad" style={{ width: 80 }} /><button type="submit" className="lf-chip lf-chip--oro">Proponer</button><button type="button" className="lf-chip" onClick={() => setAbierto(false)}>×</button></form>
}
function Declarar({ onPropuesta }: { onPropuesta: (p: Propuesta) => void }) {
  const [f, setF] = useState({ activo: 'STONK', cantidad: '', precio_medio: '', fecha: hoy(), mandato: 'hold', tesis: '', invalidacion: '' })
  const [error, setError] = useState<string | null>(null); const [enviando, setEnviando] = useState(false)
  const enviar = async (e: FormEvent) => { e.preventDefault(); setEnviando(true); setError(null); try { onPropuesta(await luffy6b.declarar({ activo: f.activo.trim().toUpperCase(), cantidad: Number(f.cantidad.replace(',', '.')), precio_medio: Number(f.precio_medio.replace(',', '.')), fecha: f.fecha, mandato: f.mandato, tesis: f.tesis || undefined, invalidacion: f.invalidacion || undefined })) } catch (x) { setError(x instanceof Error ? x.message : String(x)) } finally { setEnviando(false) } }
  return (
    <form className="lf-form" onSubmit={enviar} data-prueba="form-declarar">
      <label><span className="mono">Activo</span><input value={f.activo} onChange={(e) => setF({ ...f, activo: e.target.value })} required /></label>
      <label><span className="mono">Cantidad</span><input value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} inputMode="decimal" required /></label>
      <label><span className="mono">Precio medio (USDT)</span><input value={f.precio_medio} onChange={(e) => setF({ ...f, precio_medio: e.target.value })} inputMode="decimal" required /></label>
      <label><span className="mono">Desde</span><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
      <label><span className="mono">Mandato</span><select value={f.mandato} onChange={(e) => setF({ ...f, mandato: e.target.value })}><option value="hold">hold</option><option value="swing">swing</option><option value="trade">trade</option></select></label>
      <label style={{ gridColumn: 'span 2' }}><span className="mono">Tesis</span><input value={f.tesis} onChange={(e) => setF({ ...f, tesis: e.target.value })} /></label>
      <label style={{ gridColumn: 'span 2' }}><span className="mono">Invalidación</span><input value={f.invalidacion} onChange={(e) => setF({ ...f, invalidacion: e.target.value })} /></label>
      <button type="submit" className="btn btn--esmeralda" disabled={enviando}>{enviando ? 'Creando…' : 'Crear la propuesta'}</button>
      {error && <p className="lf-m__error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
      <p className="lf-ctrl__nota mono" style={{ gridColumn: '1 / -1' }}>No envía nada al exchange: registra una tenencia previa como posición, y se confirma en dos pasos.</p>
    </form>
  )
}
function OrdenNueva({ onProponer }: { onProponer: (a: AccionExchange) => Promise<void> }) {
  const [f, setF] = useState({ par: '', tipo: 'limit', precio: '', cantidad_usdt: '', stop: '', mandato: 'swing', tesis: '' })
  const n = (x: string) => Number(x.replace(',', '.')) || undefined
  return (
    <form className="lf-form" onSubmit={(e) => { e.preventDefault(); void onProponer({ accion: 'entrada', par: `${f.par.trim().toUpperCase().replace(/-USDT$/, '')}-USDT`, mandato: f.mandato as 'hold' | 'swing' | 'trade', tipo: f.tipo as 'limit' | 'market', cantidad_usdt: n(f.cantidad_usdt) ?? 0, precio: n(f.precio), stop: n(f.stop), tesis: f.tesis }) }}>
      <label><span className="mono">Par</span><input value={f.par} onChange={(e) => setF({ ...f, par: e.target.value })} placeholder="SOL" required /></label>
      <label><span className="mono">Tipo</span><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="limit">limit</option><option value="market">market</option></select></label>
      <label><span className="mono">Precio</span><input value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} inputMode="decimal" disabled={f.tipo === 'market'} /></label>
      <label><span className="mono">USDT</span><input value={f.cantidad_usdt} onChange={(e) => setF({ ...f, cantidad_usdt: e.target.value })} inputMode="decimal" required /></label>
      <label><span className="mono">Mandato</span><select value={f.mandato} onChange={(e) => setF({ ...f, mandato: e.target.value })}><option value="trade">trade</option><option value="swing">swing</option><option value="hold">hold</option></select></label>
      <label><span className="mono">Stop{f.mandato !== 'hold' ? ' (obligatorio)' : ''}</span><input value={f.stop} onChange={(e) => setF({ ...f, stop: e.target.value })} inputMode="decimal" required={f.mandato !== 'hold'} /></label>
      <label style={{ gridColumn: 'span 2' }}><span className="mono">Tesis</span><input value={f.tesis} onChange={(e) => setF({ ...f, tesis: e.target.value })} required /></label>
      <button type="submit" className="btn btn--esmeralda">Crear la propuesta</button>
    </form>
  )
}

function CarteraCaja() {
  const [caja, setCaja] = useState<Caja | null>(null)
  const [cartera, setCartera] = useState<CarteraT | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'cancelar' | 'panico' | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const [a, b] = await Promise.allSettled([luffy6b.caja(30), luffy6b.cartera('caja')])
    if (a.status === 'fulfilled') setCaja(a.value)
    if (b.status === 'fulfilled') setCartera(b.value)
    const f = [a, b].find((x) => x.status === 'rejected') as PromiseRejectedResult | undefined
    setError(f ? (f.reason instanceof Error ? f.reason.message : String(f.reason)) : null)
  }, [])
  useEffect(() => { void cargar() }, [cargar])
  const accionMision = async (a: 'pausar' | 'reanudar' | 'cancelar') => { if (!caja?.mision) return; try { await luffy6b.mision(caja.mision.id, a); setResultado(`Misión: ${a === 'pausar' ? 'pausada' : a === 'reanudar' ? 'reanudada' : 'cancelada'}.`); setConfirmar(null); await cargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const panico = async () => { try { const r = await luffy6b.panico(caja?.mision?.hilo_id ?? undefined); setResultado(String((r as { texto?: string }).texto ?? 'Pánico ejecutado.')); setConfirmar(null); await cargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  if (error && !caja) return <EmptyState kind="error" title="No se pudo cargar la caja." detail={error} />
  if (!caja) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const m = caja.mision, e = caja.estado
  return (
    <>
      {error && <p className="lf-m__error">{error}</p>}
      {resultado && <p className="lf-lab__msg mono">{resultado}</p>}
      <Seguro t="Resumen de la caja">{() => (<div className="lf-kpis">
        <div className="lf-kpi"><span className="mono">Valor de la caja</span><b>{fmt(e.valor_total_usdt, 'USDT')}</b><small>{e.simulado ? <span className="lf-sim">simulada</span> : `real · ${e.exchange}`} · asignado {fmt(e.capital_asignado_usdt, 'USDT')}</small></div>
        <div className="lf-kpi"><span className="mono">Resultado</span><b className={tono(e.pnl_total_pct)}>{signo(e.pnl_total_pct, '%')}</b><small>realizado {signo(e.pnl_realizado_usdt, 'USDT')} · no realizado {signo(e.pnl_no_realizado_usdt, 'USDT')}</small></div>
        {m && <div className="lf-kpi"><span className="mono">Misión · {m.estado}</span><b>{m.avance_pct !== null ? `${fmt(m.avance_pct)} %` : '—'}<small style={{ fontSize: '0.7rem' }}> de {fmt(m.objetivo_pct)} %</small></b><small>{m.tiempo_restante ? (m.tiempo_restante.vencida ? 'vencida' : `quedan ${fmt(m.tiempo_restante.dias)} días`) : ''}{m.horizonte ? ` · hasta ${m.horizonte}` : ''}</small></div>}
        {m && <div className="lf-kpi"><span className="mono">Presupuesto de API</span><b>{fmtUsd(m.gasto_api_usd)}</b><small>de {fmtUsd(m.presupuesto_api_usd, 0)} · {e.ordenes_hoy} de {m.max_ordenes_dia ?? '—'} órdenes hoy</small></div>}
      </div>)}</Seguro>
      <Seguro t="La misión">{() => (m ? (
        <section className="lf-tarj"><h3 className="mono">La misión<em>#{m.id} · activada {m.activada_en ?? ''}{m.simulado ? ' · simulada' : ''}</em></h3>
          <p className="lf-nota">{m.objetivo}</p>
          {m.plan && <p className="lf-ctrl__nota mono">Plan: {m.plan}</p>}
          <div className="lf-expo__ley">
            <span><small className="mono">pérdida máxima</small> {fmt(m.perdida_max_pct)} % ({fmt(m.perdida_max_usdt, 'USDT')}) · actual {fmt(m.perdida_actual_usdt, 'USDT')}</span>
            {m.riesgo_por_operacion_pct !== null && m.riesgo_por_operacion_pct !== undefined && <span><small className="mono">riesgo por operación</small> {fmt(m.riesgo_por_operacion_pct)} %</span>}
            <span><small className="mono">sin stop</small> {m.permite_sin_stop ? 'permitido' : 'nunca'}</span>
            {m.cerrar_al_perder && <span><small className="mono">al tocar la pérdida máxima</small> cierra todo</span>}
            {m.universo_vetado.length > 0 && <span><small className="mono">vetado</small> {m.universo_vetado.join(', ')}</span>}
          </div>
          {m.motivo_pausa && <p className="lf-m__aviso">Pausada: {m.motivo_pausa}</p>}
          <div className="lf-acc-fila">
            {m.estado === 'activa' ? <button type="button" className="lf-chip" onClick={() => accionMision('pausar')}>Pausar la misión</button> : m.estado === 'pausada' ? <button type="button" className="lf-chip lf-chip--oro" onClick={() => accionMision('reanudar')}>Reanudar</button> : null}
            {confirmar === 'cancelar' ? <><span className="lf-prop__pregunta">La caja deja de operar y cierra la misión.</span><button type="button" className="lf-chip lf-chip--rojo" onClick={() => accionMision('cancelar')}>Sí, cancelar la misión</button><button type="button" className="lf-chip" onClick={() => setConfirmar(null)}>No</button></> : <button type="button" className="lf-chip" onClick={() => setConfirmar('cancelar')}>Cancelar la misión</button>}
            {confirmar === 'panico' ? <><span className="lf-prop__pregunta">Cierra todas las posiciones de la caja a market.</span><button type="button" className="btn lf-panico" onClick={panico}>Sí, pánico</button><button type="button" className="lf-chip" onClick={() => setConfirmar(null)}>No</button></> : <button type="button" className="btn lf-panico" onClick={() => setConfirmar('panico')} style={{ padding: '7px 12px' }}>Pánico</button>}
            {m.hilo_id && <Link to={`/luffy/h/${m.hilo_id}`} className="lf-chip">Hilo de la caja</Link>}
          </div>
        </section>
      ) : <section className="lf-tarj"><h3 className="mono">La misión</h3><p className="lf-ctrl__nota mono">Sin misión vigente. Se le encarga a Luffy conversando.</p></section>)}</Seguro>
      <Seguro t="Posiciones de la caja">{() => (cartera && <section className="lf-tarj"><h3 className="mono">Posiciones de la caja<em>se miran, no se operan: las lleva Luffy</em></h3><TablaPosiciones posiciones={cartera.posiciones} /></section>)}</Seguro>
      <Seguro t="Curva y exposición">{() => (<div className="lf-dos"><TarjetaCurva origen="caja" />{cartera && <Exposicion c={cartera} />}</div>)}</Seguro>
      <Seguro t="Decisiones de cada ciclo">{() => (<section className="lf-tarj"><h3 className="mono">Decisiones de cada ciclo<em>{caja.ciclos ? `cada ${fmt(caja.ciclos.cada_h)} h · último ${hace(caja.ciclos.ultimo)}${caja.ciclos.proximo ? ` · próximo ${fmtHora(caja.ciclos.proximo)}` : ''}` : ''}</em></h3>
        <div className="lf-decis"><Plegable items={caja.decisiones} tope={10} texto="Ver todas las decisiones" pintar={(d, i) => <div key={i} className="lf-decis__d"><span className="mono">{fmtHora(d.fecha)}</span><span className="lf-decis__a"><b className={d.accion === 'salir' || d.accion === 'fin_mision' || d.accion === 'quitar_stop' ? 'is-salir' : d.accion === 'mover_stop' ? 'is-mover' : d.accion === 'esperar' || d.accion === 'pausa' ? 'is-esperar' : ''}>{d.accion.replace(/_/g, ' ')}{d.activo && d.activo !== 'CAJA' ? ` ${d.activo}` : ''}</b> · {d.tesis}{d.orden ? <em className="mono"> · #{d.orden.id_corto} {d.orden.estado}</em> : null}{d.modo ? <em className="mono"> · modo {d.modo} v{d.modo_version}</em> : null}</span></div>} /></div>
      </section>)}</Seguro>
      <Seguro t="Cerradas recientes">{() => (cartera && <Cerradas c={cartera} />)}</Seguro>
    </>
  )
}
