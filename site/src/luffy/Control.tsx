import { useCallback, useEffect, useRef, useState } from 'react'
import { Seguro } from './Seguro'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { AlertaFeed, CostoAmpliado, Gatillo, Manual } from './tipos6b'
import { fmtFecha, fmtHora, fmtUsd, hace } from './formato'
import { echarts, BASE_ECHARTS } from './charts/echarts'
import { C, rgba } from './charts/tema'

/* Control de Luffy (CONTRATO-PANEL.md §8.4): gatillos (pausar, reanudar y
   borrar; crear y cambiar es conversando), manual vivo (versiones, diff
   unificado y propuestas pendientes), gasto por día, tipo de turno y agente
   contra el presupuesto, y el feed de alertas paginado por cursor. */
export function Control() {
  const [pestana, setPestana] = useState<'gatillos' | 'manual' | 'gasto' | 'alertas'>(() => { const v = new URLSearchParams(location.search).get('ver'); return v === 'manual' || v === 'gasto' || v === 'alertas' ? v : 'gatillos' })
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">Control <em>de Luffy</em></h1>
        <div className="lf-tabs" role="tablist">{(['gatillos', 'manual', 'gasto', 'alertas'] as const).map((p) => <button key={p} type="button" className={pestana === p ? 'is-on' : ''} onClick={() => setPestana(p)}>{p === 'manual' ? 'Manual vivo' : p}</button>)}</div>
      </div>
      {pestana === 'gatillos' && <Seguro t="Gatillos"><Gatillos /></Seguro>}
      {pestana === 'manual' && <Seguro t="Manual vivo"><ManualVivo /></Seguro>}
      {pestana === 'gasto' && <Seguro t="Gasto"><Gasto /></Seguro>}
      {pestana === 'alertas' && <Seguro t="Alertas"><Feed /></Seguro>}
    </div>
  )
}

const ESTADO_GATILLO: Record<string, string> = { activo: 'activo', pausado: 'pausado', cumplido: 'cumplido', cancelado: 'borrado' }
function Gatillos() {
  const [g, setG] = useState<Gatillo[] | null>(null); const [error, setError] = useState<string | null>(null); const [borrar, setBorrar] = useState<number | null>(null); const [viejos, setViejos] = useState(false)
  const cargar = useCallback(async () => { try { setG(await luffy6b.gatillos()); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar() }, [cargar])
  const accion = async (f: () => Promise<unknown>) => { try { await f(); await cargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  if (error && !g) return <p className="lf-m__error">{error}</p>
  if (!g) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const vivos = g.filter((x) => x.estado === 'activo' || x.estado === 'pausado'), otros = g.filter((x) => x.estado === 'cumplido' || x.estado === 'cancelado')
  const fila = (x: Gatillo) => {
    const v = x.vigilancia
    const vigila = [v.precio ? `precio de ${v.precio.activo} ${v.precio.direccion === 'sube' ? '≥' : '≤'} ${v.precio.nivel}` : null, v.cuentas?.length ? `cuentas ${v.cuentas.map((c) => `@${c}`).join(', ')}` : null, v.palabras?.length ? `palabras ${v.palabras.join(', ')}` : null, v.exchanges?.length ? `exchanges ${v.exchanges.join(', ')}` : null].filter(Boolean).join(' · ')
    return (
      <div key={x.id} className={`lf-gat is-${x.estado}`} data-prueba="gatillo">
        <div>
          <p className="lf-gat__t">{x.texto}</p>
          <p className="lf-gat__d">si {x.condicion} → {x.accion}{x.avisar ? ' (te avisa antes)' : ''}</p>
          <p className="lf-gat__m mono">{x.id_corto} · {ESTADO_GATILLO[x.estado] ?? x.estado} · lee cada {x.cada_min} min · {x.despertares} despertar{x.despertares === 1 ? '' : 'es'}{x.ultimo_despertar ? `, el último ${hace(x.ultimo_despertar)}` : ''}{x.en_curso ? ' · despierto ahora' : ''} · desde {fmtFecha(x.creado)}{vigila ? ` · vigila ${vigila}` : ''}</p>
          {x.resultado && <p className="lf-gat__m mono">resultado: {x.resultado}</p>}
        </div>
        {(x.estado === 'activo' || x.estado === 'pausado') && (
          <div className="lf-acc-fila">
            {x.estado === 'activo' ? <button type="button" className="lf-chip" onClick={() => accion(() => luffy6b.gatillo(x.id, 'pausado'))}>Pausar</button> : <button type="button" className="lf-chip lf-chip--oro" onClick={() => accion(() => luffy6b.gatillo(x.id, 'activo'))}>Reanudar</button>}
            <Link to={x.hilo_id ? `/luffy/h/${x.hilo_id}` : '/luffy'} className="lf-chip" title="Se cambian conversando con Luffy">Cambiar con Luffy</Link>
            {borrar === x.id ? <><button type="button" className="lf-chip lf-chip--rojo" onClick={() => { setBorrar(null); void accion(() => luffy6b.borrarGatillo(x.id)) }}>Sí, borrar</button><button type="button" className="lf-chip" onClick={() => setBorrar(null)}>No</button></> : <button type="button" className="lf-chip" onClick={() => setBorrar(x.id)}>Borrar</button>}
          </div>
        )}
      </div>
    )
  }
  return (
    <section className="lf-tarj">
      <h3 className="mono">Gatillos<em>{vivos.filter((x) => x.estado === 'activo').length} activos · se crean y cambian conversando con Luffy</em></h3>
      {error && <p className="lf-m__error">{error}</p>}
      {vivos.map(fila)}
      {!vivos.length && <p className="lf-ctrl__nota mono">Sin gatillos vivos. Pídele uno a Luffy en el chat.</p>}
      {otros.length > 0 && <><button type="button" className="lf-chip" onClick={() => setViejos((v) => !v)}>{viejos ? 'Ocultar' : 'Ver'} los {otros.length} cumplidos o borrados</button>{viejos && otros.map(fila)}</>}
    </section>
  )
}

function Diff({ texto }: { texto: string }) {
  return <pre className="lf-diff">{texto.split('\n').map((l, i) => <span key={i} className={l.startsWith('+++') || l.startsWith('---') ? 'donde' : l.startsWith('+') ? 'mas' : l.startsWith('-') ? 'menos' : l.startsWith('@@') ? 'donde' : ''}>{l}{'\n'}</span>)}</pre>
}
function ManualVivo() {
  const [m, setM] = useState<Manual | null>(null); const [error, setError] = useState<string | null>(null); const [diff, setDiff] = useState<{ de: string; a: string; texto: string } | null>(null); const [aviso, setAviso] = useState<string | null>(null); const [verTexto, setVerTexto] = useState(false)
  const cargar = useCallback(async () => { try { setM(await luffy6b.manual()); setError(null) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargar() }, [cargar])
  const decidir = async (id: number, aprobar: boolean) => { try { const r = await luffy6b.decidirManual(id, aprobar); setAviso(r.estado === 'aprobada' ? `Aprobada: el manual pasa a v${r.version}.` : 'Rechazada.'); await cargar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  if (error && !m) return <p className="lf-m__error">{error}</p>
  if (!m) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  return (
    <div className="lf-dos">
      <Seguro t="Propuestas de cambio">{() => (<section className="lf-tarj">
        <h3 className="mono">Propuestas de cambio<em>{m.propuestas_pendientes.length} pendiente{m.propuestas_pendientes.length === 1 ? '' : 's'}</em></h3>
        {aviso && <p className="lf-lab__msg mono">{aviso}</p>}
        {m.propuestas_pendientes.map((p) => (
          <div key={p.id} className="lf-gat" style={{ gridTemplateColumns: '1fr' }} data-prueba="propuesta-manual">
            <div><p className="lf-gat__m mono">#{p.id} · sección {p.seccion} · {fmtFecha(p.creada, true)}</p><p className="lf-gat__t">{p.texto_nuevo}</p><p className="lf-gat__d">por qué: {p.motivo}</p></div>
            <div className="lf-acc-fila"><button type="button" className="btn btn--esmeralda" style={{ padding: '8px 14px' }} onClick={() => decidir(p.id, true)}>Aprobar</button><button type="button" className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={() => decidir(p.id, false)}>Rechazar</button></div>
          </div>
        ))}
        {!m.propuestas_pendientes.length && <p className="lf-ctrl__nota mono">Nada pendiente. Las propuestas salen de la revisión quincenal.</p>}
      </section>)}</Seguro>
      <Seguro t="Versiones del manual">{() => (<section className="lf-tarj">
        <h3 className="mono">Versiones<em>{m.vigente ? `vigente v${m.vigente.version}` : ''}</em></h3>
        {m.vigente && <>{m.vigente.resumen && <p className="lf-nota">{m.vigente.resumen}</p>}<button type="button" className="lf-chip" onClick={() => setVerTexto((v) => !v)}>{verTexto ? 'Ocultar' : 'Leer'} el manual vigente</button>{verTexto && <pre className="lf-diff">{m.vigente.texto}</pre>}</>}
        {m.versiones.map((v, i) => (
          <div key={v.id} className="lf-gat">
            <div><p className="lf-gat__t"><b>v{v.version}</b>{v.vigente ? ' · vigente' : ''} · {v.resumen}</p><p className="lf-gat__m mono">{v.origen} · {fmtFecha(v.creada, true)}</p></div>
            {m.versiones[i + 1] && <button type="button" className="lf-chip" onClick={async () => { try { const r = await luffy6b.diffManual(m.versiones[i + 1].version, v.version); setDiff({ de: r.desde, a: r.hasta, texto: r.unificado }) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }}>Diff con v{m.versiones[i + 1].version}</button>}
          </div>
        ))}
        {diff && <><p className="lf-gat__m mono">v{diff.de} → v{diff.a}</p><Diff texto={diff.texto} /></>}
      </section>)}</Seguro>
    </div>
  )
}

function Gasto() {
  const [c, setC] = useState<CostoAmpliado | null>(null); const [error, setError] = useState<string | null>(null); const [dias, setDias] = useState(30)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { luffy6b.costo(dias).then(setC, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [dias])
  useEffect(() => {
    const el = ref.current; if (!el || !c?.por_dia?.length) return
    const ch = echarts.init(el)
    ch.setOption({ ...BASE_ECHARTS, grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: { ...BASE_ECHARTS.tooltip, trigger: 'axis', valueFormatter: (v: number) => fmtUsd(v) },
      xAxis: { type: 'category', data: c.por_dia.map((d) => fmtFecha(d.dia).replace(/ \d\d$/, '')), axisLine: { lineStyle: { color: C.hairline } }, axisTick: { show: false }, axisLabel: { hideOverlap: true } },
      yAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmtUsd(v, 0) }, splitLine: { lineStyle: { color: C.grid } } },
      series: [{ name: 'Luffy', type: 'bar', stack: 'g', data: c.por_dia.map((d) => d.luffy_usd), itemStyle: { color: rgba(C.esm, 0.8) }, barMaxWidth: 22 }, { name: 'Jev, Haiku y Sonnet', type: 'bar', stack: 'g', data: c.por_dia.map((d) => d.jev_usd), itemStyle: { color: rgba(C.hueso, 0.45) } }] })
    const ro = new ResizeObserver(() => ch.resize()); ro.observe(el)
    return () => { ro.disconnect(); ch.dispose() }
  }, [c])
  if (error && !c) return <p className="lf-m__error">{error}</p>
  if (!c) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  const total = c.total_usd ?? c.costo_usd
  const luffyUsd = c.luffy_usd ?? c.costo_usd
  const pres = c.umbrales ?? (c.presupuesto ? { ...c.presupuesto, estado: total >= c.presupuesto.degradar_usd ? 'degradado' : total >= c.presupuesto.aviso_usd ? 'aviso' : 'normal' } : null)
  return (
    <>
      <div className="lf-kpis">
        <div className="lf-kpi"><span className="mono">Gasto del mes</span><b>{fmtUsd(total)}</b><small>{pres ? `de ${fmtUsd(pres.presupuesto_api_usd, 0)} · aviso en ${fmtUsd(pres.aviso_usd, 0)}` : `desde ${fmtFecha(c.desde)}`}</small></div>
        <div className="lf-kpi"><span className="mono">Luffy</span><b>{fmtUsd(luffyUsd)}</b><small>{c.respuestas ? `${c.respuestas} respuestas` : ''}</small></div>
        <div className="lf-kpi"><span className="mono">Jev, Haiku y Sonnet</span><b>{fmtUsd(c.jev?.costo_usd ?? 0)}</b><small>{c.jev ? `${c.jev.llamadas.toLocaleString('es-ES')} llamadas de clasificación` : ''}</small></div>
        {pres && <div className="lf-kpi"><span className="mono">Del presupuesto</span><b className={pres.estado === 'normal' ? '' : 'is-neg'}>{((total / pres.presupuesto_api_usd) * 100).toFixed(1).replace('.', ',')} %</b><small>{pres.estado === 'degradado' ? 'el chat bajó a Sonnet' : pres.estado === 'aviso' ? 'en zona de aviso' : 'en orden'}</small></div>}
      </div>
      <div className="lf-dos">
        <Seguro t="Gasto por día">{() => (<section className="lf-tarj"><h3 className="mono">Por día<em><span className="lf-seg lf-seg--mini">{[14, 30, 60].map((d) => <button key={d} type="button" className={dias === d ? 'is-on' : ''} onClick={() => setDias(d)}>{d} d</button>)}</span></em></h3>{c.por_dia?.length ? <><div ref={ref} className="lf-gasto" /><p className="lf-ctrl__nota mono">Luffy en esmeralda · Jev, Haiku y Sonnet en hueso · hora de Chile</p></> : <p className="lf-ctrl__nota mono">El servidor todavía no entrega el gasto por día.</p>}</section>)}</Seguro>
        <Seguro t="Gasto por tipo">{() => (<section className="lf-tarj"><h3 className="mono">Por tipo de turno, agente y modelo<em>mes en curso</em></h3>
          <div className="lf-tabla__scroll"><table className="lf-tabla"><tbody>
            {(c.por_tipo ?? []).map((t) => <tr key={t.tipo_turno}><td>Luffy · {t.etiqueta}<small>{t.n} turnos · {fmtUsd(t.promedio_usd)} cada uno{t.iteraciones ? ` · ${String(t.iteraciones).replace('.', ',')} vuelta${t.iteraciones === 1 ? '' : 's'}` : ''}</small></td><td className="num">{fmtUsd(t.costo_usd)}</td></tr>)}
            {(c.agentes ?? []).map((a) => <tr key={a.quien}><td>{a.quien}<small>{a.n} encargos</small></td><td className="num">{fmtUsd(a.costo_usd)}</td></tr>)}
            {(c.jev?.por_modelo ?? []).map((t) => <tr key={t.modelo}><td>{t.modelo}<small>{t.n.toLocaleString('es-ES')} llamadas</small></td><td className="num">{fmtUsd(t.costo_usd)}</td></tr>)}
            {!c.por_tipo && (c.por_modelo ?? []).map((t) => <tr key={t.modelo}><td>{t.modelo}<small>{t.n} respuestas</small></td><td className="num">{fmtUsd(t.costo_usd)}</td></tr>)}
          </tbody></table></div>
          {c.estilo && <p className="lf-ctrl__nota mono">Reescrituras de estilo: {c.estilo.reescrituras ?? c.estilo.reescritos ?? 0} de {c.estilo.turnos} turnos ({String(c.estilo.porcentaje ?? c.estilo.tasa_pct ?? 0).replace('.', ',')} %) · {fmtUsd(c.estilo.costo_extra_usd ?? c.estilo.costo_usd ?? 0)}{c.estilo.lectura ? ` · ${c.estilo.lectura}` : ''}</p>}
        </section>)}</Seguro>
      </div>
    </>
  )
}

function Feed() {
  const [items, setItems] = useState<AlertaFeed[]>([]); const [siguiente, setSiguiente] = useState<number | null>(null); const [tipos, setTipos] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null); const [cargando, setCargando] = useState(true)
  const [severidad, setSeveridad] = useState(''); const [tipo, setTipo] = useState('')
  const pedir = useCallback(async (antes: number | null, sumar: boolean) => {
    setCargando(true)
    try { const r = await luffy6b.alertas({ limite: 30, antes_de: antes, severidad: severidad || undefined, tipo: tipo || undefined }); setItems((xs) => (sumar ? [...xs, ...r.items] : r.items)); setSiguiente(r.siguiente); setTipos(r.tipos); setError(null) }
    catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } finally { setCargando(false) }
  }, [severidad, tipo])
  useEffect(() => { void pedir(null, false) }, [pedir])
  const atender = async (id: number) => { try { await luffy6b.atender(id); setItems((xs) => xs.map((x) => (x.id === id ? { ...x, atendida: true } : x))) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  return (
    <section className="lf-tarj">
      <h3 className="mono">Alertas del monitor<em>{items.filter((x) => !x.atendida).length} sin ver</em></h3>
      <div className="lf-chips">{['', 'alta', 'media', 'baja'].map((s) => <button key={s || 'todas'} type="button" className={`lf-chip ${severidad === s ? 'is-on' : ''}`} onClick={() => setSeveridad(s)}>{s || 'todas'}</button>)}
        <select className="lf-ctrl__mini" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo de alerta"><option value="">todos los tipos</option>{tipos.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select></div>
      {error && <p className="lf-m__error">{error}</p>}
      {items.map((x) => <div key={x.id} className={`lf-alerta lf-alerta--${x.severidad} ${x.atendida ? 'is-vista' : ''}`} data-prueba="alerta"><i /><span>{x.activo ? <Link to={`/luffy/terminal/${x.activo}`}><b>{x.activo}</b> · </Link> : null}{x.texto}</span><span className="mono">{x.tipo.replace(/_/g, ' ')} · {fmtHora(x.enviada_en)}{!x.atendida && <> · <button type="button" className="lf-alerta__ver" onClick={() => atender(x.id)}>vista</button></>}</span></div>)}
      {!items.length && !cargando && <p className="lf-ctrl__nota mono">Sin alertas con ese filtro.</p>}
      {siguiente !== null && <div className="lf-acc-fila"><button type="button" className="lf-chip" disabled={cargando} onClick={() => pedir(siguiente, true)}>{cargando ? 'Cargando…' : 'Más antiguas'}</button></div>}
    </section>
  )
}
