import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { Informe, Informes as InformesT } from './tipos6b'
import { Grafico } from './charts/Grafico'
import { fmtFecha, fmtHora } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* Informes (fase 6b §7): el informe diario por fecha con sus gráficos
   interactivos, la revisión quincenal de la caja, la bitácora y las teorías,
   navegables y legibles en el teléfono. */
export function Informes() {
  const { fecha } = useParams()
  const [lista, setLista] = useState<InformesT | null>(null)
  const [informe, setInforme] = useState<Informe | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'diarios' | 'revisiones' | 'bitacora' | 'teorias'>('diarios')
  useEffect(() => { luffy6b.informes().then((l) => { setLista(l); setError(null) }, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [])
  const activa = fecha ?? lista?.informes[0]?.fecha ?? null
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
          <section className="lf-tarj lf-inf__lista"><h3 className="mono">Por día</h3>{lista.informes.map((i) => <NavLink key={i.fecha} to={`/luffy/informes/${i.fecha}`} className={i.fecha === activa ? 'is-active' : ''} end><em>{fmtFecha(i.fecha)}</em>{i.titulo}</NavLink>)}</section>
          <div className="lf-ficha__graficos">
            {!informe ? <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div> : (
              <>
                <section className="lf-tarj"><h3 className="mono">{fmtFecha(informe.fecha)}<em>{fmtHora(informe.consultado_en)}</em></h3><p className="lf-pag__t" style={{ fontSize: '1.4rem' }}>{informe.titulo}</p></section>
                {informe.secciones.map((s, i) => (
                  <section key={i} className="lf-tarj lf-inf__sec">
                    <h3>{s.titulo}</h3>
                    <p>{s.texto}</p>
                    {s.cifras.length > 0 && <div className="lf-inf__cifras">{s.cifras.map((c) => <span key={c.k}><small>{c.k}</small><b>{c.v}</b></span>)}</div>}
                    {s.graficos.map((g) => <Grafico key={g.spec_id} specId={g.spec_id} compacto acciones={<Link to={`/luffy/laboratorio/${g.spec_id}`} className="lf-chip lf-chip--oro">Abrir en el laboratorio</Link>} />)}
                  </section>
                ))}
              </>
            )}
          </div>
        </div>
      )}
      {pestana === 'revisiones' && <section className="lf-tarj"><h3 className="mono">Revisiones quincenales de la caja</h3>{lista.revisiones.map((r) => <p key={r.fecha} className="lf-nota"><em className="mono">{fmtFecha(r.fecha)}</em><b>{r.titulo}</b> · {r.resumen}</p>)}{!lista.revisiones.length && <p className="lf-ctrl__nota mono">Todavía no hay revisiones.</p>}</section>}
      {pestana === 'bitacora' && <section className="lf-tarj"><h3 className="mono">Bitácora</h3><div className="lf-tabla__scroll"><table className="lf-tabla"><thead><tr><th>Fecha</th><th>Activo</th><th>Tipo</th><th>Tesis</th><th>Resultado</th></tr></thead><tbody>{lista.bitacora.map((b) => <tr key={b.id}><td><small>{fmtFecha(b.fecha, true)}</small></td><td>{b.activo ? <Link to={`/luffy/terminal/${b.activo}`}><b>{b.activo}</b></Link> : '—'}</td><td>{b.tipo}</td><td>{b.tesis}</td><td className={b.resultado?.startsWith('+') ? 'is-pos' : b.resultado?.startsWith('−') || b.resultado?.startsWith('-') ? 'is-neg' : ''}>{b.resultado ?? '—'}</td></tr>)}</tbody></table></div></section>}
      {pestana === 'teorias' && <section className="lf-tarj"><h3 className="mono">Teorías de Luffy</h3>{lista.teorias.map((t) => <p key={t.id} className="lf-nota"><em className="mono">{t.estado} · {fmtFecha(t.fecha)}{t.activo ? ` · ${t.activo}` : ''}</em>{t.texto}</p>)}</section>}
    </div>
  )
}
