import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { Alertas, CostoAmpliado, Gatillo, Manual } from './tipos6b'
import { fmtFecha, fmtHora, fmtUsd, hace } from './formato'
import { echarts, BASE_ECHARTS } from './charts/echarts'
import { C, rgba } from './charts/tema'

/* Control de Luffy (fase 6b §5): gatillos (pausar, reanudar, borrar; cambiar es
   conversando), manual vivo (versiones, diff, propuestas), gasto por tipo de
   turno y por día contra el presupuesto, y el feed de alertas con filtros. */
export function Control() {
  const [pestana, setPestana] = useState<'gatillos' | 'manual' | 'gasto' | 'alertas'>('gatillos')
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">Control <em>de Luffy</em></h1>
        <div className="lf-tabs" role="tablist">{(['gatillos', 'manual', 'gasto', 'alertas'] as const).map((p) => <button key={p} type="button" className={pestana === p ? 'is-on' : ''} onClick={() => setPestana(p)}>{p === 'manual' ? 'Manual vivo' : p}</button>)}</div>
      </div>
      {pestana === 'gatillos' && <Gatillos />}
      {pestana === 'manual' && <ManualVivo />}
      {pestana === 'gasto' && <Gasto />}
      {pestana === 'alertas' && <Feed />}
    </div>
  )
}

function Gatillos() {
  const [g, setG] = useState<Gatillo[] | null>(null); const [error, setError] = useState<string | null>(null); const [borrar, setBorrar] = useState<number | null>(null)
  const cargar = useCallback(async () => { try { setG(await luffy6b.gatillos()); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar() }, [cargar])
  if (error && !g) return <p className="lf-m__error">{error}</p>
  if (!g) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const vivos = g.filter((x) => x.estado !== 'borrado')
  return (
    <section className="lf-tarj">
      <h3 className="mono">Gatillos<em>{vivos.filter((x) => x.estado === 'activo').length} activos · se crean y cambian conversando con Luffy</em></h3>
      {error && <p className="lf-m__error">{error}</p>}
      {vivos.map((x) => (
        <div key={x.id} className={`lf-gat is-${x.estado}`} data-prueba="gatillo">
          <div><p className="lf-gat__t">{x.texto}</p><p className="lf-gat__m mono">#{x.id} · {x.activo ?? 'sin activo'} · {x.estado}{x.cada_min ? ` · lee cada ${x.cada_min} min` : ''} · {x.ultimo_disparo ? `último disparo ${hace(x.ultimo_disparo)}` : 'sin disparos'} · desde {fmtFecha(x.creado)}</p></div>
          <div className="lf-acc-fila">
            {x.estado === 'activo' ? <button type="button" className="lf-chip" onClick={async () => { await luffy6b.gatillo(x.id, 'pausado'); await cargar() }}>Pausar</button> : x.estado === 'pausado' ? <button type="button" className="lf-chip lf-chip--oro" onClick={async () => { await luffy6b.gatillo(x.id, 'activo'); await cargar() }}>Reanudar</button> : null}
            <Link to={x.hilo_id ? `/luffy/h/${x.hilo_id}` : '/luffy'} className="lf-chip">Cambiar con Luffy</Link>
            {borrar === x.id ? <><button type="button" className="lf-chip lf-chip--rojo" onClick={async () => { await luffy6b.borrarGatillo(x.id); setBorrar(null); await cargar() }}>Sí, borrar</button><button type="button" className="lf-chip" onClick={() => setBorrar(null)}>No</button></> : <button type="button" className="lf-chip" onClick={() => setBorrar(x.id)}>Borrar</button>}
          </div>
        </div>
      ))}
      {!vivos.length && <p className="lf-ctrl__nota mono">Sin gatillos. Pídele uno a Luffy en el chat.</p>}
    </section>
  )
}

function Diff({ texto }: { texto: string }) {
  return <pre className="lf-diff">{texto.split('\n').map((l, i) => <span key={i} className={l.startsWith('+') ? 'mas' : l.startsWith('-') ? 'menos' : l.startsWith('@@') ? 'donde' : ''}>{l}{'\n'}</span>)}</pre>
}
function ManualVivo() {
  const [m, setM] = useState<Manual | null>(null); const [error, setError] = useState<string | null>(null); const [diff, setDiff] = useState<{ de: string; a: string; texto: string } | null>(null)
  const cargar = useCallback(async () => { try { setM(await luffy6b.manual()); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar() }, [cargar])
  if (error && !m) return <p className="lf-m__error">{error}</p>
  if (!m) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  return (
    <div className="lf-dos">
      <section className="lf-tarj">
        <h3 className="mono">Propuestas de cambio<em>{m.propuestas.filter((p) => p.estado === 'pendiente').length} pendientes</em></h3>
        {m.propuestas.map((p) => (
          <div key={p.id} className="lf-gat" style={{ gridTemplateColumns: '1fr' }} data-prueba="propuesta-manual">
            <div><p className="lf-gat__t">{p.resumen}</p><p className="lf-gat__m mono">{p.id} · {p.estado} · {fmtFecha(p.fecha, true)}{p.hilo_id && <> · <Link to={`/luffy/h/${p.hilo_id}`} className="lf-nota__ir">ver hilo</Link></>}</p></div>
            <Diff texto={p.diff} />
            {p.estado === 'pendiente' && <div className="lf-acc-fila"><button type="button" className="btn btn--esmeralda" style={{ padding: '8px 14px' }} onClick={async () => { await luffy6b.decidirManual(p.id, 'aprobar'); await cargar() }}>Aprobar</button><button type="button" className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={async () => { await luffy6b.decidirManual(p.id, 'rechazar'); await cargar() }}>Rechazar</button></div>}
          </div>
        ))}
      </section>
      <section className="lf-tarj">
        <h3 className="mono">Versiones<em>vigente v{m.version_vigente}</em></h3>
        {m.versiones.map((v, i) => (
          <div key={v.version} className="lf-gat">
            <div><p className="lf-gat__t"><b>v{v.version}</b> · {v.resumen}</p><p className="lf-gat__m mono">{fmtFecha(v.fecha, true)}</p></div>
            {m.versiones[i + 1] && <button type="button" className="lf-chip" onClick={async () => { const r = await luffy6b.diffManual(m.versiones[i + 1].version, v.version); setDiff({ de: m.versiones[i + 1].version, a: v.version, texto: r.diff }) }}>Diff con v{m.versiones[i + 1].version}</button>}
          </div>
        ))}
        {diff && <><p className="lf-gat__m mono">v{diff.de} → v{diff.a}</p><Diff texto={diff.texto} /></>}
      </section>
    </div>
  )
}

function Gasto() {
  const [c, setC] = useState<CostoAmpliado | null>(null); const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { luffy6b.costo().then(setC, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [])
  useEffect(() => {
    const el = ref.current; if (!el || !c?.por_dia?.length) return
    const ch = echarts.init(el)
    ch.setOption({ ...BASE_ECHARTS, grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true }, legend: { show: false },
      tooltip: { ...BASE_ECHARTS.tooltip, trigger: 'axis', valueFormatter: (v: number) => fmtUsd(v) },
      xAxis: { type: 'category', data: c.por_dia.map((d) => fmtFecha(d.fecha)), axisLine: { lineStyle: { color: C.hairline } }, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtUsd(v, 0) }, splitLine: { lineStyle: { color: C.grid } } },
      series: [{ name: 'Luffy', type: 'bar', stack: 'g', data: c.por_dia.map((d) => d.luffy_usd), itemStyle: { color: rgba(C.esm, 0.8) }, barMaxWidth: 22 }, { name: 'Jev, Haiku y Sonnet', type: 'bar', stack: 'g', data: c.por_dia.map((d) => d.jev_usd), itemStyle: { color: rgba(C.hueso, 0.45) } }] })
    const ro = new ResizeObserver(() => ch.resize()); ro.observe(el)
    return () => { ro.disconnect(); ch.dispose() }
  }, [c])
  if (error && !c) return <p className="lf-m__error">{error}</p>
  if (!c) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const total = c.total_usd ?? c.costo_usd
  return (
    <>
      <div className="lf-kpis">
        <div className="lf-kpi"><span className="mono">Gasto del mes</span><b>{fmtUsd(total)}</b><small>{c.presupuesto ? `de ${fmtUsd(c.presupuesto.presupuesto_api_usd, 0)} · aviso en ${fmtUsd(c.presupuesto.aviso_usd, 0)}` : `desde ${fmtFecha(c.desde)}`}</small></div>
        <div className="lf-kpi"><span className="mono">Luffy</span><b>{fmtUsd(c.luffy?.total_usd ?? c.costo_usd)}</b><small>{c.respuestas ? `${c.respuestas} respuestas` : ''}</small></div>
        <div className="lf-kpi"><span className="mono">Jev, Haiku y Sonnet</span><b>{fmtUsd(c.jev?.total_usd ?? 0)}</b><small>clasificación social y agentes</small></div>
        {c.presupuesto && <div className="lf-kpi"><span className="mono">Del presupuesto</span><b>{((total / c.presupuesto.presupuesto_api_usd) * 100).toFixed(1).replace('.', ',')} %</b><small>{total >= c.presupuesto.degradar_usd ? 'el chat baja a Sonnet' : total >= c.presupuesto.aviso_usd ? 'en zona de aviso' : 'en orden'}</small></div>}
      </div>
      <div className="lf-dos">
        <section className="lf-tarj"><h3 className="mono">Por día<em>Luffy en esmeralda · Jev, Haiku y Sonnet en hueso</em></h3>{c.por_dia?.length ? <div ref={ref} className="lf-gasto" /> : <p className="lf-ctrl__nota mono">El servidor todavía no entrega el gasto por día.</p>}</section>
        <section className="lf-tarj"><h3 className="mono">Por tipo de turno y modelo</h3>
          <div className="lf-tabla__scroll"><table className="lf-tabla"><tbody>
            {(c.luffy?.por_tipo_turno ?? []).map((t) => <tr key={t.tipo}><td>Luffy · {t.tipo}</td><td className="num">{t.n}</td><td className="num">{fmtUsd(t.usd)}</td></tr>)}
            {(c.jev?.por_modelo ?? []).map((t) => <tr key={t.modelo}><td>{t.modelo}</td><td className="num">{t.n}</td><td className="num">{fmtUsd(t.usd)}</td></tr>)}
            {!c.luffy && (c.por_modelo ?? []).map((t) => <tr key={t.modelo}><td>{t.modelo}</td><td className="num">{t.n}</td><td className="num">{fmtUsd(t.costo_usd)}</td></tr>)}
          </tbody></table></div>
        </section>
      </div>
    </>
  )
}

function Feed() {
  const [a, setA] = useState<Alertas | null>(null); const [error, setError] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1); const [severidad, setSeveridad] = useState(''); const [tipo, setTipo] = useState('')
  useEffect(() => { let v = true; luffy6b.alertas(pagina, severidad, tipo).then((x) => { if (v) { setA(x); setError(null) } }, (e) => { if (v) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }); return () => { v = false } }, [pagina, severidad, tipo])
  const tipos = [...new Set((a?.alertas ?? []).map((x) => x.tipo))]
  return (
    <section className="lf-tarj">
      <h3 className="mono">Alertas del monitor<em>{a ? `${a.total} en total` : ''}</em></h3>
      <div className="lf-chips">{['', 'alta', 'media', 'baja'].map((s) => <button key={s || 'todas'} type="button" className={`lf-chip ${severidad === s ? 'is-on' : ''}`} onClick={() => { setSeveridad(s); setPagina(1) }}>{s || 'todas'}</button>)}{tipos.map((t) => <button key={t} type="button" className={`lf-chip ${tipo === t ? 'is-on' : ''}`} onClick={() => { setTipo(tipo === t ? '' : t); setPagina(1) }}>{t}</button>)}</div>
      {error && <p className="lf-m__error">{error}</p>}
      {a?.alertas.map((x) => <div key={x.id} className={`lf-alerta lf-alerta--${x.severidad}`}><i /><span>{x.activo ? <Link to={`/luffy/terminal/${x.activo}`}><b>{x.activo}</b> · </Link> : null}{x.texto}</span><span className="mono">{x.tipo} · {fmtHora(x.hora)}</span></div>)}
      {a && a.total > a.por_pagina && <div className="lf-acc-fila"><button type="button" className="lf-chip" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>← anteriores</button><span className="mono" style={{ color: 'var(--ceniza-2)', fontSize: '0.56rem', alignSelf: 'center' }}>página {pagina} de {Math.ceil(a.total / a.por_pagina)}</span><button type="button" className="lf-chip" disabled={pagina * a.por_pagina >= a.total} onClick={() => setPagina((p) => p + 1)}>siguientes →</button></div>}
    </section>
  )
}
