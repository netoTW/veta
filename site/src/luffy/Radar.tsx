import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { Candidatas, Modos } from './tipos6b'
import { fmt, fmtFecha, fmtPrecio, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* Radar (fase 6b §4): candidatas por modo con familias, cifras, juicio de Jev,
   etiquetas y seguimiento a 7, 14 y 30 días contra BTC; recetas con su estudio
   y track record por versión; aprobar o rechazar modos propuestos. */
const signo = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmt(v)} %`)
const tono = (v: number | null | undefined) => (v === null || v === undefined ? '' : v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '')

export function Radar() {
  const [modo, setModo] = useState('todos'); const [dias, setDias] = useState(30)
  const [c, setC] = useState<Candidatas | null>(null); const [m, setM] = useState<Modos | null>(null)
  const [error, setError] = useState<string | null>(null); const [aviso, setAviso] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'candidatas' | 'modos'>('candidatas')
  const cargarModos = useCallback(async () => { try { setM(await luffy6b.modos()) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargarModos() }, [cargarModos])
  useEffect(() => { let v = true; luffy6b.candidatas(modo, dias).then((x) => { if (v) { setC(x); setError(null) } }, (e) => { if (v) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }); return () => { v = false } }, [modo, dias])
  const decidir = async (id: string, version: string, d: 'aprobar' | 'rechazar') => { try { const r = await luffy6b.decidirModo(id, version, d); setAviso(`Modo ${id} v${version}: ${r.estado}.`); await cargarModos() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const nombreModo = (id: string) => m?.modos.find((x) => x.id === id)?.nombre ?? id
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">Radar <em>de confluencias</em></h1>
        <div className="lf-tabs" role="tablist"><button type="button" className={pestana === 'candidatas' ? 'is-on' : ''} onClick={() => setPestana('candidatas')}>Candidatas</button><button type="button" className={pestana === 'modos' ? 'is-on' : ''} onClick={() => setPestana('modos')}>Modos y recetas{m?.modos.some((x) => x.estado === 'propuesto') ? ' · 1 propuesto' : ''}</button></div>
      </div>
      {error && <p className="lf-m__error">{error}</p>}
      {aviso && <p className="lf-lab__msg mono">{aviso}</p>}
      {pestana === 'candidatas' ? (
        <>
          <div className="lf-chips">
            <button type="button" className={`lf-chip ${modo === 'todos' ? 'is-on' : ''}`} onClick={() => setModo('todos')}>Todos los modos</button>
            {(c?.modos ?? []).map((x) => <button key={x} type="button" className={`lf-chip ${modo === x ? 'is-on' : ''}`} onClick={() => setModo(x)}>{nombreModo(x)}</button>)}
            <span className="lf-seg lf-seg--mini" style={{ marginLeft: 'auto' }}>{[7, 14, 30].map((d) => <button key={d} type="button" className={dias === d ? 'is-on' : ''} onClick={() => setDias(d)}>{d} d</button>)}</span>
          </div>
          {!c ? <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div> : !c.candidatas.length ? <EmptyState kind="sin-datos" title="Sin candidatas con ese filtro." detail="El radar no marcó nada en ese periodo." /> : (
            <div className="lf-cand">
              {c.candidatas.map((x) => (
                <Link key={`${x.activo}-${x.fecha}-${x.modo}`} to={`/luffy/terminal/${x.activo}`} className="lf-cand__c" data-prueba="candidata">
                  <div className="lf-cand__cab"><span className="lf-cand__sym">{x.activo}<em>{x.nombre}</em></span><span className="mono" style={{ color: 'var(--ceniza-2)', fontSize: '0.54rem' }}>{hace(x.fecha)} · {fmtPrecio(x.precio_marca)}</span></div>
                  <div className="lf-chips"><span className="lf-chip lf-chip--oro">{nombreModo(x.modo)} v{x.version}</span>{x.etiquetas.map((e) => <span key={e} className="lf-mini">{e}</span>)}</div>
                  <div className="lf-cand__seg">{([['7 d', x.seguimiento.d7_pct, x.seguimiento.vs_btc_d7_pct], ['14 d', x.seguimiento.d14_pct, x.seguimiento.vs_btc_d14_pct], ['30 d', x.seguimiento.d30_pct, x.seguimiento.vs_btc_d30_pct]] as [string, number | null, number | null][]).map(([k, v, b]) => <span key={k}><small>{k}</small><b className={`num ${tono(v)}`}>{signo(v)}</b><small style={{ textTransform: 'none', letterSpacing: 0 }}>vs BTC <em className={tono(b)} style={{ fontStyle: 'normal' }}>{signo(b)}</em></small></span>)}</div>
                  <div className="lf-expo__ley">{x.familias.map((f) => <span key={f.nombre} style={{ opacity: f.cumple ? 1 : 0.5 }}><i style={{ background: f.cumple ? 'var(--esmeralda)' : 'var(--ceniza-2)' }} />{f.nombre}: {f.cifras.map((cf) => cf.v).join(' · ')}</span>)}</div>
                  {x.jev && <p className="lf-cand__jev"><b>Jev:</b> {x.jev.juicio}{x.jev.confianza !== null ? ` (${Math.round(x.jev.confianza * 100)} %)` : ''}</p>}
                </Link>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="lf-cand">
          {(m?.modos ?? []).map((x) => (
            <section key={`${x.id}-${x.version}`} className="lf-tarj" data-prueba="modo">
              <h3 className="mono">{x.nombre} · v{x.version}<em className={x.estado === 'propuesto' ? 'is-pos' : ''}>{x.estado} · {fmtFecha(x.creado)}</em></h3>
              <p className="lf-nota">{x.descripcion}</p>
              <ul className="lf-receta">{x.receta.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <div className="lf-cand__seg">
                <span><small>Estudio</small><b className="num">{x.estudio ? `${x.estudio.n} casos` : '—'}</b><small style={{ textTransform: 'none', letterSpacing: 0 }}>{x.estudio ? `acierto ${fmt(x.estudio.acierto_pct)} % · mediana ${signo(x.estudio.retorno_mediano_pct)} a ${x.estudio.horizonte_d} d` : ''}</small></span>
                <span><small>Track record</small><b className="num">{x.track ? `${x.track.n} marcas` : 'sin marcas'}</b><small style={{ textTransform: 'none', letterSpacing: 0 }}>{x.track ? `acierto ${fmt(x.track.acierto_pct)} % · mediana ${signo(x.track.retorno_mediano_pct)}` : ''}</small></span>
              </div>
              {x.estado === 'propuesto' && <div className="lf-acc-fila"><button type="button" className="btn btn--esmeralda" style={{ padding: '8px 14px' }} onClick={() => decidir(x.id, x.version, 'aprobar')}>Aprobar</button><button type="button" className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={() => decidir(x.id, x.version, 'rechazar')}>Rechazar</button></div>}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
