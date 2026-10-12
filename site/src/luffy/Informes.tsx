import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { Bitacora, Informe, InformeItem, Revision, Teoria } from './tipos6b'
import { Grafico } from './charts/Grafico'
import { Md } from './md'
import { fmtFecha, fmtUsd } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* Informes (CONTRATO-PANEL.md §8.6): el informe diario por fecha, estructurado,
   con sus gráficos interactivos; la revisión quincenal de la caja; la bitácora
   (con cursor) y las teorías con su evidencia. Legibles en el teléfono. */
export function Informes() {
  const { fecha } = useParams()
  const [lista, setLista] = useState<InformeItem[] | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'diarios' | 'revisiones' | 'bitacora' | 'teorias'>('diarios')
  useEffect(() => { luffy6b.informes(30).then((l) => { setLista(l.items); setError(null) }, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [])
  const activa = fecha ?? lista?.[0]?.fecha ?? null
  useEffect(() => { if (!activa) return; let v = true; setInforme(null); luffy6b.informe(activa).then((i) => { if (v) setInforme(i) }, (e) => { if (v) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }); return () => { v = false } }, [activa])
  if (error && !lista) return <div className="lf-pag"><EmptyState kind="error" title="No se pudieron cargar los informes." detail={error} /></div>
  if (!lista) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">Informes <em>y bitácora</em></h1>
        <div className="lf-tabs" role="tablist">{(['diarios', 'revisiones', 'bitacora', 'teorias'] as const).map((p) => <button key={p} type="button" className={pestana === p ? 'is-on' : ''} onClick={() => setPestana(p)}>{p === 'bitacora' ? 'bitácora' : p === 'teorias' ? 'teorías' : p}</button>)}</div>
      </div>
      {pestana === 'diarios' && (
        <div className="lf-inf">
          <section className="lf-tarj lf-inf__lista"><h3 className="mono">Por día</h3>{lista.map((i) => <NavLink key={i.id} to={`/luffy/informes/${i.fecha}`} className={i.fecha === activa ? 'is-active' : ''} end><em>{fmtFecha(i.fecha)}{i.enviado ? ' · enviado' : ''}</em>{i.resumen}</NavLink>)}{!lista.length && <p className="lf-ctrl__nota mono">Todavía no hay informes.</p>}</section>
          <div className="lf-ficha__graficos">
            {!activa ? null : !informe ? <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div> : (
              <>
                <section className="lf-tarj"><h3 className="mono">{fmtFecha(informe.fecha)}<em>{informe.modelo.replace('claude-', '')} · {fmtUsd(informe.costo_usd)}{informe.hilo_id ? <> · <Link to={`/luffy/h/${informe.hilo_id}`} className="lf-nota__ir">hilo</Link></> : null}</em></h3><p className="lf-pag__t" style={{ fontSize: '1.3rem' }}>Informe diario</p></section>
                {(informe.secciones.length ? informe.secciones : [{ titulo: '', texto: informe.texto }]).map((s, i) => (
                  <section key={i} className="lf-tarj lf-inf__sec">{s.titulo && <h3>{s.titulo}</h3>}<Md texto={s.texto} /></section>
                ))}
                {informe.graficos.map((g) => <Grafico key={g.spec_id} specId={g.spec_id} compacto acciones={<Link to={`/luffy/laboratorio/${g.spec_id}`} className="lf-chip lf-chip--oro">Abrir en el laboratorio</Link>} />)}
              </>
            )}
          </div>
        </div>
      )}
      {pestana === 'revisiones' && <Revisiones />}
      {pestana === 'bitacora' && <BitacoraLista />}
      {pestana === 'teorias' && <Teorias />}
    </div>
  )
}

function Revisiones() {
  const [r, setR] = useState<Revision[] | null>(null); const [error, setError] = useState<string | null>(null)
  useEffect(() => { luffy6b.revisiones(10).then((x) => setR(x.items), (e) => setError(e instanceof Error ? e.message : String(e))) }, [])
  if (error) return <p className="lf-m__error">{error}</p>
  if (!r) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  return <>{r.map((x) => <section key={x.id} className="lf-tarj lf-inf__sec"><h3>Revisión del {fmtFecha(x.desde)} al {fmtFecha(x.hasta)}</h3><Md texto={x.texto} />{x.propuestas.length > 0 && <p className="lf-ctrl__nota mono">Propuestas al manual: {x.propuestas.map((p) => `${p.seccion} (${p.estado})`).join(' · ')} · <Link to="/luffy/control" className="lf-nota__ir">decidir en Control</Link></p>}<p className="lf-ctrl__nota mono">{fmtUsd(x.costo_usd)}{x.hilo_id ? <> · <Link to={`/luffy/h/${x.hilo_id}`} className="lf-nota__ir">hilo</Link></> : null}</p></section>)}{!r.length && <p className="lf-ctrl__nota mono">Todavía no hay revisiones.</p>}</>
}

function BitacoraLista() {
  const [items, setItems] = useState<Bitacora[]>([]); const [sig, setSig] = useState<string | null>(null); const [tipos, setTipos] = useState<string[]>([])
  const [tipo, setTipo] = useState(''); const [origen, setOrigen] = useState(''); const [error, setError] = useState<string | null>(null); const [cargando, setCargando] = useState(true)
  const pedir = useCallback(async (antes: string | null, sumar: boolean) => { setCargando(true); try { const r = await luffy6b.bitacora({ tipo: tipo || undefined, origen: origen || undefined, limite: 50, antes_de: antes }); setItems((xs) => (sumar ? [...xs, ...r.items] : r.items)); setSig(r.siguiente === null ? null : String(r.siguiente)); setTipos(r.tipos ?? []); setError(null) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setCargando(false) } }, [tipo, origen])
  useEffect(() => { void pedir(null, false) }, [pedir])
  return (
    <section className="lf-tarj"><h3 className="mono">Bitácora</h3>
      <div className="lf-chips"><select className="lf-ctrl__mini" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">todos los tipos</option>{tipos.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select><select className="lf-ctrl__mini" value={origen} onChange={(e) => setOrigen(e.target.value)} aria-label="Origen"><option value="">Pablo y la caja</option><option value="pablo">Pablo</option><option value="caja">la caja</option></select></div>
      {error && <p className="lf-m__error">{error}</p>}
      <div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Fecha</th><th>Activo</th><th>Tipo</th><th>Tesis</th><th>Resultado</th></tr></thead><tbody>{items.map((b) => <tr key={b.id}><td><small>{fmtFecha(b.fecha, true)}</small></td><td>{b.activo && b.activo !== 'CAJA' ? <Link to={`/luffy/terminal/${b.activo}`}><b>{b.activo}</b></Link> : b.activo ?? '—'}<small>{b.origen ?? ''}{b.mandato ? ` · ${b.mandato}` : ''}</small></td><td>{b.tipo.replace(/_/g, ' ')}{b.modo ? <small>modo {b.modo} v{b.modo_version}</small> : null}</td><td>{b.tesis}{b.hilo_id ? <> <Link to={`/luffy/h/${b.hilo_id}`} className="lf-nota__ir mono">hilo</Link></> : null}</td><td className={b.resultado?.startsWith('+') ? 'is-pos' : /^[−-]/.test(b.resultado ?? '') ? 'is-neg' : ''}>{b.resultado ?? '—'}</td></tr>)}</tbody></table></div>
      {sig && <div className="lf-acc-fila"><button type="button" className="lf-chip" disabled={cargando} onClick={() => pedir(sig, true)}>{cargando ? 'Cargando…' : 'Más antiguas'}</button></div>}
    </section>
  )
}

function Teorias() {
  const [t, setT] = useState<Teoria[] | null>(null); const [estado, setEstado] = useState(''); const [error, setError] = useState<string | null>(null)
  useEffect(() => { luffy6b.teorias({ estado: estado || undefined }).then((x) => setT(x.items), (e) => setError(e instanceof Error ? e.message : String(e))) }, [estado])
  return (
    <section className="lf-tarj"><h3 className="mono">Teorías de Luffy</h3>
      <div className="lf-chips">{['', 'abierta', 'confirmada', 'refutada'].map((e) => <button key={e || 'todas'} type="button" className={`lf-chip ${estado === e ? 'is-on' : ''}`} onClick={() => setEstado(e)}>{e || 'todas'}</button>)}</div>
      {error && <p className="lf-m__error">{error}</p>}
      {t?.map((x) => (
        <div key={x.id} className="lf-teoria">
          <p className="lf-gat__m mono">{x.estado}{x.confianza ? ` · confianza ${x.confianza}` : ''} · {x.activos.map((a, i) => <span key={a}>{i > 0 && ', '}<Link to={`/luffy/terminal/${a}`} className="lf-nota__ir">{a}</Link></span>)}{x.revisada ? ` · revisada ${fmtFecha(x.revisada)}` : ''}</p>
          <p className="lf-gat__t"><b>{x.titulo}</b></p>
          <p className="lf-nota">{x.hipotesis}</p>
          {x.como_probar && <p className="lf-gat__d">cómo se prueba: {x.como_probar}</p>}
          {(x.evidencia_favor?.length || x.evidencia_contra?.length) ? <div className="lf-teoria__ev">{x.evidencia_favor?.map((e, i) => <p key={`f${i}`} className="is-pos">+ {e.texto}{e.fuente ? <em className="mono"> · {e.fuente}</em> : null}</p>)}{x.evidencia_contra?.map((e, i) => <p key={`c${i}`} className="is-neg">− {e.texto}{e.fuente ? <em className="mono"> · {e.fuente}</em> : null}</p>)}</div> : null}
        </div>
      ))}
      {t && !t.length && <p className="lf-ctrl__nota mono">Ninguna con ese estado.</p>}
    </section>
  )
}
