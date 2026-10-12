import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { AccionExchange, Caja, Cartera as CarteraT, CurvaCapital, Historial, Ordenes, PosicionCartera } from './tipos6b'
import type { Propuesta } from './tipos'
import { TarjetaPropuesta } from './Chat'
import { fmt, fmtFecha, fmtHora, fmtPrecio, fmtUsd, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'
import { echarts, BASE_ECHARTS } from './charts/echarts'
import { C, rgba } from './charts/tema'

/* ============================================================================
   Cartera (fase 6b §3): la de Pablo y la caja, en dos pestañas. Posiciones con
   mandato, PnL, stop y distancia, peso; curva de capital con drawdown;
   exposición; lo real y lo simulado siempre separados. En la de Pablo, el
   exchange: órdenes abiertas, historial y comisiones; cancelar, modificar,
   mover stop y orden nueva generan una propuesta que se confirma en dos pasos.
   Declarar una posición previa (STONK) crea la propuesta y pide confirmación.
   La caja se mira, no se opera: misión, decisiones, pausar o cancelar, pánico.
   ========================================================================== */
const signo = (v: number | null | undefined, dec = 2, unidad = '') => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmt(v, unidad)}${dec ? '' : ''}`)
const tono = (v: number | null | undefined) => (v === null || v === undefined ? '' : v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '')
const COLORES = [C.esmLuz, C.oroLuz, C.hueso, C.ceniza, C.esm, C.oro]

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
    const el = ref.current; if (!el) return
    const ch = echarts.init(el)
    ch.setOption({ ...BASE_ECHARTS, grid: { left: 8, right: 56, top: 14, bottom: 8, containLabel: true },
      tooltip: { ...BASE_ECHARTS.tooltip, trigger: 'axis', formatter: (ps: { axisValue: number; seriesName: string; value: number }[]) => `${fmtFecha(ps[0].axisValue / 1000)}<br/>${ps.map((p) => `${p.seriesName}: <b>${p.seriesName === 'Drawdown' ? `${p.value.toFixed(1).replace('.', ',')} %` : fmt(p.value, 'USDT')}</b>`).join('<br/>')}` },
      xAxis: { type: 'time', axisLabel: { formatter: (v: number) => fmtFecha(v / 1000).replace(/ \d\d$/, ''), hideOverlap: true }, axisLine: { lineStyle: { color: C.hairline } }, splitLine: { show: false } },
      yAxis: [{ type: 'value', scale: true, axisLabel: { formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: C.grid } } }, { type: 'value', max: 0, min: (v: { min: number }) => Math.min(-5, v.min), axisLabel: { formatter: (v: number) => `${v} %` }, splitLine: { show: false } }],
      series: [
        { name: 'Capital', type: 'line', showSymbol: false, data: curva.puntos.map((p) => [p.t * 1000, p.capital]), lineStyle: { color: C.esmLuz, width: 2 }, areaStyle: { color: rgba(C.esm, 0.18) } },
        { name: 'Aportes', type: 'line', showSymbol: false, data: curva.puntos.map((p) => [p.t * 1000, p.aportes]), lineStyle: { color: C.ceniza2, width: 1, type: 'dashed' } },
        { name: 'Drawdown', type: 'line', yAxisIndex: 1, showSymbol: false, data: curva.puntos.map((p) => [p.t * 1000, p.drawdown_pct]), lineStyle: { color: C.rojoLuz, width: 1 }, areaStyle: { color: rgba(C.rojo, 0.15) } },
      ] })
    const ro = new ResizeObserver(() => ch.resize()); ro.observe(el)
    return () => { ro.disconnect(); ch.dispose() }
  }, [curva])
  return <div ref={ref} className="lf-cart__curva" />
}

function TablaPosiciones({ posiciones, acciones }: { posiciones: PosicionCartera[]; acciones?: (p: PosicionCartera) => React.ReactNode }) {
  if (!posiciones.length) return <p className="lf-ctrl__nota mono">Sin posiciones.</p>
  return (
    <div className="lf-tabla__scroll"><table className="lf-tabla">
      <thead><tr><th>Activo</th><th>Mandato</th><th className="num">Cantidad</th><th className="num">Precio medio · actual</th><th className="num">Valor</th><th className="num">No realizado</th><th className="num">Realizado</th><th>Stop · distancia</th><th className="num">Peso</th>{acciones && <th />}</tr></thead>
      <tbody>{posiciones.map((p) => (
        <tr key={`${p.activo}-${p.abierta_en}`} data-prueba="posicion" data-activo={p.activo}>
          <td><Link to={`/luffy/terminal/${p.activo}`}><b>{p.activo}</b></Link><small>{p.estado}{p.declarada ? ' · declarada' : ''}{p.simulado ? <span className="lf-sim"> · simulada</span> : ''} · {fmtFecha(p.abierta_en)}</small></td>
          <td>{p.mandato}</td>
          <td className="num">{fmt(p.cantidad)}</td>
          <td className="num">{fmtPrecio(p.precio_medio)}<small>{fmtPrecio(p.precio_actual)}</small></td>
          <td className="num">{p.valor_usdt !== null ? fmt(p.valor_usdt, 'USDT') : '—'}</td>
          <td className={`num ${tono(p.pnl_no_realizado_usdt)}`}>{signo(p.pnl_no_realizado_usdt, 2, 'USDT')}<small>{p.pnl_no_realizado_pct !== null ? `${p.pnl_no_realizado_pct > 0 ? '+' : ''}${fmt(p.pnl_no_realizado_pct)} %` : ''}</small></td>
          <td className={`num ${tono(p.pnl_realizado_usdt)}`}>{signo(p.pnl_realizado_usdt, 2, 'USDT')}</td>
          <td>{p.stop_precio ? <>{fmtPrecio(p.stop_precio)}<small>{p.stop_distancia_pct !== null ? `${fmt(p.stop_distancia_pct)} % del precio` : ''}</small></> : <small>sin stop{p.mandato === 'hold' ? ' (hold: sale por invalidación)' : ''}</small>}</td>
          <td className="num">{p.peso_pct !== null ? `${fmt(p.peso_pct)} %` : '—'}</td>
          {acciones && <td>{acciones(p)}</td>}
        </tr>
      ))}</tbody>
    </table></div>
  )
}

function Exposicion({ c }: { c: CarteraT }) {
  const total = c.exposicion.reduce((a, e) => a + e.pct, 0)
  return (
    <section className="lf-tarj"><h3 className="mono">Exposición<em>{fmt(c.exposicion_pct)} % en posiciones · {fmt(100 - c.exposicion_pct)} % en efectivo</em></h3>
      <div className="lf-expo">{c.exposicion.map((e, i) => <span key={e.activo} style={{ width: `${e.pct}%`, background: COLORES[i % COLORES.length] }} title={`${e.activo} ${fmt(e.pct)} %`} />)}<span style={{ width: `${Math.max(0, 100 - total)}%`, background: 'transparent' }} /></div>
      <div className="lf-expo__ley">{c.exposicion.map((e, i) => <span key={e.activo}><i style={{ background: COLORES[i % COLORES.length] }} />{e.activo} {fmt(e.pct)} %</span>)}<span><i style={{ background: 'var(--roca-0)', border: '1px solid var(--hairline)' }} />efectivo {fmt(100 - total)} %</span></div>
    </section>
  )
}

function CarteraPablo() {
  const [c, setC] = useState<CarteraT | null>(null)
  const [curva, setCurva] = useState<CurvaCapital | null>(null)
  const [ordenes, setOrdenes] = useState<Ordenes | null>(null)
  const [hist, setHist] = useState<Historial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const [rango, setRango] = useState('90d')
  const [formulario, setFormulario] = useState<'declarar' | 'orden' | null>(null)
  const cargar = useCallback(async () => { try { const [a, b, d] = await Promise.all([luffy6b.cartera('pablo'), luffy6b.ordenes(), luffy6b.historial(30)]); setC(a); setOrdenes(b); setHist(d); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { luffy6b.curva('pablo', rango).then(setCurva, () => setCurva(null)) }, [rango])
  const proponer = async (a: AccionExchange) => { try { setPropuesta(await luffy6b.proponer(a)) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  if (error && !c) return <EmptyState kind="error" title="No se pudo cargar la cartera." detail={error} />
  if (!c) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const abiertas = c.posiciones.filter((p) => p.estado === 'abierta'), cerradas = c.posiciones.filter((p) => p.estado !== 'abierta')
  return (
    <>
      {error && <p className="lf-m__error">{error}</p>}
      <div className="lf-kpis">
        <div className="lf-kpi"><span className="mono">Valor total</span><b>{fmt(c.valor_total_usdt, 'USDT')}</b><small>{c.simulado ? <span className="lf-sim">simulado</span> : 'real · BingX'}</small></div>
        <div className="lf-kpi"><span className="mono">Efectivo</span><b>{fmt(c.efectivo_usdt, 'USDT')}</b><small>{fmt(100 - c.exposicion_pct)} % de la cartera</small></div>
        <div className="lf-kpi"><span className="mono">No realizado</span><b className={tono(abiertas.reduce((a, p) => a + (p.pnl_no_realizado_usdt ?? 0), 0))}>{signo(abiertas.reduce((a, p) => a + (p.pnl_no_realizado_usdt ?? 0), 0), 2, 'USDT')}</b><small>{abiertas.length} posición{abiertas.length === 1 ? '' : 'es'} abierta{abiertas.length === 1 ? '' : 's'}</small></div>
        <div className="lf-kpi"><span className="mono">Realizado</span><b className={tono(c.pnl_realizado_total_usdt)}>{signo(c.pnl_realizado_total_usdt, 2, 'USDT')}</b><small>desde que hay registro</small></div>
        {curva && <div className="lf-kpi"><span className="mono">Drawdown máximo · {rango}</span><b className="is-neg">{fmt(curva.max_drawdown_pct)} %</b><small>rendimiento {signo(curva.rendimiento_pct)} %</small></div>}
      </div>
      {propuesta && <TarjetaPropuesta p={propuesta} alCambiar={cargar} cambiar={() => {}} />}
      <section className="lf-tarj">
        <h3 className="mono">Posiciones abiertas<em>{c.consultado_en ? `consultado ${fmtHora(c.consultado_en)}` : ''}</em></h3>
        <TablaPosiciones posiciones={abiertas} acciones={(p) => <div className="lf-acc-fila"><button type="button" className="lf-chip" onClick={() => setFormulario('orden')}>Orden</button>{p.stop_precio ? <MoverStop p={p} onProponer={proponer} /> : null}</div>} />
        <div className="lf-acc-fila">
          <button type="button" className="lf-chip lf-chip--oro" onClick={() => setFormulario(formulario === 'declarar' ? null : 'declarar')} data-prueba="declarar">{formulario === 'declarar' ? 'Cerrar' : 'Declarar una posición previa'}</button>
          <button type="button" className="lf-chip" onClick={() => setFormulario(formulario === 'orden' ? null : 'orden')}>{formulario === 'orden' ? 'Cerrar' : 'Orden nueva'}</button>
        </div>
        {formulario === 'declarar' && <Declarar onPropuesta={(p) => { setPropuesta(p); setFormulario(null) }} />}
        {formulario === 'orden' && <OrdenNueva onProponer={async (a) => { await proponer(a); setFormulario(null) }} />}
      </section>
      <div className="lf-dos">
        <section className="lf-tarj">
          <h3 className="mono">Curva de capital<em><span className="lf-g__rangos">{['30d', '90d', '6m', '1y'].map((r) => <button key={r} type="button" className={`lf-chip ${rango === r ? 'is-on' : ''}`} onClick={() => setRango(r)}>{r}</button>)}</span></em></h3>
          {curva ? <Curva curva={curva} /> : <p className="lf-ctrl__nota mono">Sin curva.</p>}
        </section>
        <Exposicion c={c} />
      </div>
      <section className="lf-tarj">
        <h3 className="mono">Órdenes abiertas en BingX<em>{ordenes ? `${ordenes.abiertas.length} · ${fmtHora(ordenes.consultado_en)}` : ''}</em></h3>
        {ordenes?.abiertas.length ? (
          <div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Par</th><th>Tipo</th><th className="num">Precio</th><th className="num">Cantidad</th><th>Creada</th><th /></tr></thead>
            <tbody>{ordenes.abiertas.map((o) => <tr key={o.id} data-prueba="orden"><td><b>{o.par}</b><small>{o.lado}</small></td><td>{o.es_stop ? `stop ${fmtPrecio(o.stop_precio)}` : o.tipo}</td><td className="num">{o.precio !== null ? fmtPrecio(o.precio) : '—'}</td><td className="num">{fmt(o.cantidad)}<small>llena {fmt(o.llena)}</small></td><td><small>{hace(o.creada)}</small></td>
              <td><div className="lf-acc-fila"><button type="button" className="lf-chip" onClick={() => proponer({ accion: 'cancelar', orden_id: o.id })}>Cancelar</button>{!o.es_stop && <ModificarOrden id={o.id} onProponer={proponer} />}</div></td></tr>)}</tbody></table></div>
        ) : <p className="lf-ctrl__nota mono">Sin órdenes abiertas.</p>}
      </section>
      <section className="lf-tarj">
        <h3 className="mono">Historial y comisiones · 30 días<em>{hist ? `comisiones ${fmt(hist.comisiones.total_usdt, 'USDT')}` : ''}</em></h3>
        {hist?.fills.length ? (
          <div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Hora</th><th>Par</th><th>Lado</th><th className="num">Precio</th><th className="num">Cantidad</th><th className="num">Comisión</th></tr></thead>
            <tbody>{hist.fills.map((f) => <tr key={f.id}><td><small>{fmtFecha(f.hora, true)}</small></td><td><b>{f.par}</b></td><td className={f.lado === 'compra' ? 'is-pos' : 'is-neg'}>{f.lado}</td><td className="num">{fmtPrecio(f.precio)}</td><td className="num">{fmt(f.cantidad)}</td><td className="num">{fmt(f.comision_usdt, 'USDT')}</td></tr>)}</tbody></table></div>
        ) : <p className="lf-ctrl__nota mono">Sin ejecuciones en el periodo.</p>}
        {hist?.comisiones.por_par.length ? <p className="lf-ctrl__nota mono">Por par: {hist.comisiones.por_par.map((p) => `${p.par} ${fmt(p.usdt, 'USDT')}`).join(' · ')}</p> : null}
      </section>
      {cerradas.length > 0 && <section className="lf-tarj"><h3 className="mono">Cerradas</h3><TablaPosiciones posiciones={cerradas} /></section>}
    </>
  )
}

function MoverStop({ p, onProponer }: { p: PosicionCartera; onProponer: (a: AccionExchange) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false); const [v, setV] = useState(String(p.stop_precio ?? ''))
  if (!abierto) return <button type="button" className="lf-chip" onClick={() => setAbierto(true)} data-prueba="mover-stop">Mover stop</button>
  return <form className="lf-acc-fila" onSubmit={(e) => { e.preventDefault(); const n = Number(v.replace(',', '.')); if (n > 0) { void onProponer({ accion: 'mover_stop', activo: p.activo, stop: n }); setAbierto(false) } }}><input className="lf-ctrl__mini" value={v} onChange={(e) => setV(e.target.value)} aria-label="Stop nuevo" style={{ width: 90 }} /><button type="submit" className="lf-chip lf-chip--oro">Proponer</button><button type="button" className="lf-chip" onClick={() => setAbierto(false)}>×</button></form>
}
function ModificarOrden({ id, onProponer }: { id: string; onProponer: (a: AccionExchange) => Promise<void> }) {
  const [abierto, setAbierto] = useState(false); const [precio, setPrecio] = useState(''); const [cantidad, setCantidad] = useState('')
  if (!abierto) return <button type="button" className="lf-chip" onClick={() => setAbierto(true)}>Modificar</button>
  return <form className="lf-acc-fila" onSubmit={(e) => { e.preventDefault(); void onProponer({ accion: 'modificar', orden_id: id, precio: Number(precio.replace(',', '.')) || undefined, cantidad: Number(cantidad.replace(',', '.')) || undefined }); setAbierto(false) }}><input className="lf-ctrl__mini" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="precio" aria-label="Precio" style={{ width: 80 }} /><input className="lf-ctrl__mini" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="cantidad" aria-label="Cantidad" style={{ width: 80 }} /><button type="submit" className="lf-chip lf-chip--oro">Proponer</button><button type="button" className="lf-chip" onClick={() => setAbierto(false)}>×</button></form>
}
function Declarar({ onPropuesta }: { onPropuesta: (p: Propuesta) => void }) {
  const [f, setF] = useState({ activo: 'STONK', cantidad: '', precio_medio: '', fecha: new Date().toISOString().slice(0, 10), mandato: 'hold' })
  const [error, setError] = useState<string | null>(null); const [enviando, setEnviando] = useState(false)
  const enviar = async (e: FormEvent) => { e.preventDefault(); setEnviando(true); setError(null); try { onPropuesta(await luffy6b.declarar({ activo: f.activo.trim().toUpperCase(), cantidad: Number(f.cantidad.replace(',', '.')), precio_medio: Number(f.precio_medio.replace(',', '.')), fecha: f.fecha, mandato: f.mandato })) } catch (x) { setError(x instanceof Error ? x.message : String(x)) } finally { setEnviando(false) } }
  return (
    <form className="lf-form" onSubmit={enviar} data-prueba="form-declarar">
      <label><span className="mono">Activo</span><input value={f.activo} onChange={(e) => setF({ ...f, activo: e.target.value })} required /></label>
      <label><span className="mono">Cantidad</span><input value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} inputMode="decimal" required /></label>
      <label><span className="mono">Precio medio (USDT)</span><input value={f.precio_medio} onChange={(e) => setF({ ...f, precio_medio: e.target.value })} inputMode="decimal" required /></label>
      <label><span className="mono">Fecha</span><input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} /></label>
      <label><span className="mono">Mandato</span><select value={f.mandato} onChange={(e) => setF({ ...f, mandato: e.target.value })}><option value="hold">hold</option><option value="swing">swing</option><option value="trade">trade</option></select></label>
      <button type="submit" className="btn btn--esmeralda" disabled={enviando}>{enviando ? 'Creando…' : 'Crear la propuesta'}</button>
      {error && <p className="lf-m__error" style={{ gridColumn: '1 / -1' }}>{error}</p>}
      <p className="lf-ctrl__nota mono" style={{ gridColumn: '1 / -1' }}>No envía nada al exchange: registra una tenencia previa como posición, y se confirma en dos pasos.</p>
    </form>
  )
}
function OrdenNueva({ onProponer }: { onProponer: (a: AccionExchange) => Promise<void> }) {
  const [f, setF] = useState({ par: '', lado: 'compra', tipo: 'limit', precio: '', cantidad_usdt: '', stop: '', mandato: 'swing' })
  return (
    <form className="lf-form" onSubmit={(e) => { e.preventDefault(); void onProponer({ accion: 'orden', par: f.par.trim().toUpperCase().replace(/-USDT$/, '') + '-USDT', lado: f.lado as 'compra' | 'venta', tipo: f.tipo as 'limit' | 'market', precio: Number(f.precio.replace(',', '.')) || undefined, cantidad_usdt: Number(f.cantidad_usdt.replace(',', '.')) || undefined, stop: Number(f.stop.replace(',', '.')) || undefined, mandato: f.mandato }) }}>
      <label><span className="mono">Par</span><input value={f.par} onChange={(e) => setF({ ...f, par: e.target.value })} placeholder="SOL" required /></label>
      <label><span className="mono">Lado</span><select value={f.lado} onChange={(e) => setF({ ...f, lado: e.target.value })}><option value="compra">compra</option><option value="venta">venta</option></select></label>
      <label><span className="mono">Tipo</span><select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}><option value="limit">limit</option><option value="market">market</option></select></label>
      <label><span className="mono">Precio</span><input value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} inputMode="decimal" /></label>
      <label><span className="mono">USDT</span><input value={f.cantidad_usdt} onChange={(e) => setF({ ...f, cantidad_usdt: e.target.value })} inputMode="decimal" required /></label>
      <label><span className="mono">Stop</span><input value={f.stop} onChange={(e) => setF({ ...f, stop: e.target.value })} inputMode="decimal" /></label>
      <label><span className="mono">Mandato</span><select value={f.mandato} onChange={(e) => setF({ ...f, mandato: e.target.value })}><option value="trade">trade</option><option value="swing">swing</option><option value="hold">hold</option></select></label>
      <button type="submit" className="btn btn--esmeralda">Crear la propuesta</button>
    </form>
  )
}

function CarteraCaja() {
  const [caja, setCaja] = useState<Caja | null>(null)
  const [curva, setCurva] = useState<CurvaCapital | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<'cancelar' | 'panico' | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const cargar = useCallback(async () => { try { setCaja(await luffy6b.caja()); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar(); luffy6b.curva('caja', '30d').then(setCurva, () => setCurva(null)) }, [cargar])
  const mision = async (a: 'pausar' | 'reanudar' | 'cancelar') => { if (!caja?.mision) return; try { const r = await luffy6b.mision(caja.mision.id_corto, a); setResultado(`Misión ${r.estado}.`); setConfirmar(null); await cargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const panico = async () => { try { const r = await luffy6b.panico(); setResultado(`Pánico ejecutado: ${JSON.stringify(r).slice(0, 160)}`); setConfirmar(null); await cargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  if (error && !caja) return <EmptyState kind="error" title="No se pudo cargar la caja." detail={error} />
  if (!caja) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const abiertas = caja.posiciones.filter((p) => p.estado === 'abierta')
  const c: CarteraT = { origen: 'caja', simulado: caja.simulado, efectivo_usdt: caja.efectivo_usdt, valor_total_usdt: caja.valor_total_usdt, exposicion_pct: caja.valor_total_usdt ? Math.round(((caja.valor_total_usdt - caja.efectivo_usdt) / caja.valor_total_usdt) * 1000) / 10 : 0, posiciones: caja.posiciones, exposicion: abiertas.map((p) => ({ activo: p.activo, pct: p.peso_pct ?? 0 })), pnl_realizado_total_usdt: caja.posiciones.reduce((a, p) => a + p.pnl_realizado_usdt, 0), consultado_en: caja.consultado_en, fuente: '' }
  return (
    <>
      {error && <p className="lf-m__error">{error}</p>}
      {resultado && <p className="lf-lab__msg mono">{resultado}</p>}
      <div className="lf-kpis">
        <div className="lf-kpi"><span className="mono">Valor de la caja</span><b>{fmt(caja.valor_total_usdt, 'USDT')}</b><small>{caja.simulado ? <span className="lf-sim">simulada</span> : 'real · BingX'} · efectivo {fmt(caja.efectivo_usdt, 'USDT')}</small></div>
        <div className="lf-kpi"><span className="mono">Misión</span><b style={{ fontSize: '0.9rem' }}>{caja.mision ? caja.mision.estado : 'sin misión'}</b><small>{caja.mision?.plazo_hasta ? `hasta ${fmtFecha(caja.mision.plazo_hasta)}` : ''}</small></div>
        <div className="lf-kpi"><span className="mono">Presupuesto de API</span><b>{fmtUsd(caja.presupuesto_api.usado_usd)}</b><small>de {fmtUsd(caja.presupuesto_api.tope_usd, 0)}</small></div>
        <div className="lf-kpi"><span className="mono">Realizado</span><b className={tono(c.pnl_realizado_total_usdt)}>{signo(c.pnl_realizado_total_usdt, 2, 'USDT')}</b><small>{caja.posiciones.filter((p) => p.estado !== 'abierta').length} cerradas</small></div>
      </div>
      {caja.mision && (
        <section className="lf-tarj"><h3 className="mono">La misión<em>#{caja.mision.id_corto} · desde {fmtFecha(caja.mision.creada)}</em></h3>
          <p className="lf-nota">{caja.mision.texto}{caja.mision.objetivo ? <> · <b>{caja.mision.objetivo}</b></> : null}</p>
          <div className="lf-expo__ley">{caja.limites.map((l) => <span key={l.k}><small className="mono">{l.k}</small> {l.v}</span>)}</div>
          <div className="lf-acc-fila">
            {caja.mision.estado === 'activa' ? <button type="button" className="lf-chip" onClick={() => mision('pausar')}>Pausar la misión</button> : caja.mision.estado === 'pausada' ? <button type="button" className="lf-chip lf-chip--oro" onClick={() => mision('reanudar')}>Reanudar</button> : null}
            {caja.mision.estado !== 'cancelada' && (confirmar === 'cancelar' ? <><span className="lf-prop__pregunta">La caja deja de operar y cierra la misión.</span><button type="button" className="lf-chip lf-chip--rojo" onClick={() => mision('cancelar')}>Sí, cancelar la misión</button><button type="button" className="lf-chip" onClick={() => setConfirmar(null)}>No</button></> : <button type="button" className="lf-chip" onClick={() => setConfirmar('cancelar')}>Cancelar la misión</button>)}
            {confirmar === 'panico' ? <><span className="lf-prop__pregunta">Cierra todas las posiciones de la caja a mercado.</span><button type="button" className="btn lf-panico" onClick={panico}>Sí, pánico</button><button type="button" className="lf-chip" onClick={() => setConfirmar(null)}>No</button></> : <button type="button" className="btn lf-panico" onClick={() => setConfirmar('panico')} style={{ padding: '7px 12px' }}>Pánico</button>}
          </div>
        </section>
      )}
      <section className="lf-tarj"><h3 className="mono">Posiciones de la caja<em>se miran, no se operan: las lleva Luffy</em></h3><TablaPosiciones posiciones={abiertas} /></section>
      <div className="lf-dos">
        <section className="lf-tarj"><h3 className="mono">Curva de capital · 30 d</h3>{curva ? <Curva curva={curva} /> : <p className="lf-ctrl__nota mono">Sin curva.</p>}</section>
        <Exposicion c={c} />
      </div>
      <section className="lf-tarj"><h3 className="mono">Decisiones de cada ciclo</h3>
        <div className="lf-decis">{caja.decisiones.map((d) => <div key={d.ciclo} className="lf-decis__d"><span className="mono">ciclo {d.ciclo}<br />{fmtHora(d.hora)}</span><span className="lf-decis__a"><b className={d.accion === 'salir' ? 'is-salir' : d.accion === 'mover_stop' ? 'is-mover' : ''}>{d.accion === 'mover_stop' ? 'mover stop' : d.accion}{d.activo ? ` ${d.activo}` : ''}</b> · {d.porque}</span></div>)}</div>
      </section>
      {caja.posiciones.filter((p) => p.estado !== 'abierta').length > 0 && <section className="lf-tarj"><h3 className="mono">Cerradas</h3><TablaPosiciones posiciones={caja.posiciones.filter((p) => p.estado !== 'abierta')} /></section>}
    </>
  )
}
