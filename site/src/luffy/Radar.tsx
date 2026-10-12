import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { Candidatas, Modos } from './tipos6b'
import { fmt, fmtFecha, fmtPrecio, lista } from './formato'
import { Seguro } from './Seguro'
import { Plegable } from './Plegable'
import { EmptyState } from '../ui/EmptyState'

/* Radar (CONTRATO-PANEL.md §8.3): candidatas por modo con familias, cifras,
   etiquetas en llano y el seguimiento a 7, 14 y 30 días contra BTC; modos con
   su hipótesis, estudio y rendimiento vivo; aprobar o rechazar los propuestos.
   Cada candidata abre su ficha del terminal. */
const signo = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${fmt(v)} %`)
const tono = (v: number | null | undefined) => (v === null || v === undefined ? '' : v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '')
const NOMBRE_MODO: Record<string, string> = { impulso: 'Impulso', squeeze: 'Squeeze', pre_catalizador: 'Pre-catalizador', ingresos_vs_precio: 'Ingresos contra precio' }
const nombreModo = (id: string) => NOMBRE_MODO[id] ?? id.replace(/_/g, ' ')
/** `impulso:-` es la familia en contra (que no se cumpla): se lee en llano. */
const familia = (f: string) => (f.endsWith(':-') ? `${f.slice(0, -2)} en contra` : f.replace(/_/g, ' '))
const valor = (v: unknown) => (typeof v === 'number' ? fmt(v) : typeof v === 'string' ? v : '—')

export function Radar() {
  const [modo, setModo] = useState(''); const [dias, setDias] = useState(30); const [descartadas, setDescartadas] = useState(false)
  const [c, setC] = useState<Candidatas | null>(null); const [m, setM] = useState<Modos | null>(null)
  const [error, setError] = useState<string | null>(null); const [aviso, setAviso] = useState<string | null>(null)
  const [pestana, setPestana] = useState<'candidatas' | 'modos'>('candidatas')
  const [motivo, setMotivo] = useState<Record<string, string>>({})
  const cargarModos = useCallback(async () => { try { setM(await luffy6b.modos()) } catch (e) { setError(e instanceof ErrorLuffy6b ? e.message : String(e)) } }, [])
  useEffect(() => { void cargarModos() }, [cargarModos])
  useEffect(() => { let v = true; luffy6b.candidatas({ modo: modo || undefined, dias, incluirDescartadas: descartadas }).then((x) => { if (v) { setC(x); setError(null) } }, (e) => { if (v) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }); return () => { v = false } }, [modo, dias, descartadas])
  const decidir = async (id: string, version: string, aprobar: boolean) => { try { const r = await luffy6b.decidirModo(id, version, aprobar, motivo[`${id}-${version}`] ?? ''); setAviso(`${nombreModo(id)} v${version}: ${r.modo.estado}.`); await cargarModos() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  const propuestos = m?.modos.filter((x) => x.estado === 'propuesto').length ?? 0
  return (
    <div className="lf-pag">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">Radar <em>de confluencias</em></h1>
        <div className="lf-tabs" role="tablist"><button type="button" className={pestana === 'candidatas' ? 'is-on' : ''} onClick={() => setPestana('candidatas')}>Candidatas</button><button type="button" className={pestana === 'modos' ? 'is-on' : ''} onClick={() => setPestana('modos')}>Modos{propuestos ? ` · ${propuestos} propuesto${propuestos > 1 ? 's' : ''}` : ''}</button></div>
      </div>
      {error && <p className="lf-m__error">{error}</p>}
      {aviso && <p className="lf-lab__msg mono">{aviso}</p>}
      {pestana === 'candidatas' ? (
        <>
          <div className="lf-chips">
            <button type="button" className={`lf-chip ${!modo ? 'is-on' : ''}`} onClick={() => setModo('')}>Todos los modos</button>
            {(m?.modos ?? []).filter((x) => x.estado !== 'retirado').map((x) => <button key={`${x.id}-${x.version}`} type="button" className={`lf-chip ${modo === x.id ? 'is-on' : ''}`} onClick={() => setModo(x.id)}>{nombreModo(x.id)}</button>)}
            <button type="button" className={`lf-chip ${descartadas ? 'is-on' : ''}`} onClick={() => setDescartadas((v) => !v)}>Con descartadas</button>
            <span className="lf-seg lf-seg--mini" style={{ marginLeft: 'auto' }}>{[7, 14, 30].map((d) => <button key={d} type="button" className={dias === d ? 'is-on' : ''} onClick={() => setDias(d)}>{d} d</button>)}</span>
          </div>
          {m?.regimen?.lectura && <p className="lf-ctrl__nota mono">Régimen de mercado: {m.regimen.lectura.replace('_', ' ')}{c ? ` · del ${fmtFecha(c.desde)} al ${fmtFecha(c.hasta)}` : ''}</p>}
          {!c ? <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div> : !c.candidatas.length ? <EmptyState kind="sin-datos" title="Sin candidatas con ese filtro." detail="El radar no marcó nada en ese periodo." /> : (
            <div className="lf-cand">
              <Plegable items={c.candidatas} tope={12} texto="Ver todas las candidatas" pintar={(x) => (
                <Seguro key={x.id} t={x.activo ?? 'Candidata'}>{() => (<Link to={`/luffy/terminal/${x.activo}`} className={`lf-cand__c ${x.decision !== 'analizar' ? 'is-descartada' : ''}`} data-prueba="candidata">
                  <div className="lf-cand__cab"><span className="lf-cand__sym">{x.activo}</span><span className="mono" style={{ color: 'var(--ceniza-2)', fontSize: '0.54rem' }}>{fmtFecha(x.fecha)} · {fmtPrecio(x.precio_ref)}</span></div>
                  <div className="lf-chips"><span className="lf-chip lf-chip--oro">{nombreModo(x.modo)} v{x.version}</span><span className="lf-mini">{x.decision}{x.p_merece !== null ? ` · ${Math.round(x.p_merece * 100)} %` : ''}</span><span className="lf-mini">confluencia {fmt(x.confluencia?.score)}</span></div>
                  {x.por_que && <p className="lf-cand__jev">{/^[a-z0-9_]+$/.test(x.por_que) ? x.por_que.replace(/_/g, ' ').replace(/^./, (l) => l.toUpperCase()) : x.por_que}</p>}
                  {Object.keys(x.seguimiento ?? {}).length > 0 && <div className="lf-cand__seg">{(['7d', '14d', '30d'] as const).map((k) => { const s = x.seguimiento?.[k]; return <span key={k}><small>{k.replace('d', ' d')}</small><b className={`num ${tono(s?.ret_pct)}`}>{s?.ret_pct !== null && s?.ret_pct !== undefined ? signo(s.ret_pct) : s ? `el ${fmtFecha(s.fecha)}` : '—'}</b><small style={{ textTransform: 'none', letterSpacing: 0 }}>{s?.exceso_pct !== null && s?.exceso_pct !== undefined ? <>vs BTC <em className={tono(s.exceso_pct)} style={{ fontStyle: 'normal' }}>{signo(s.exceso_pct)}</em></> : ''}</small></span> })}</div>}
                  {/* v2.2: las familias que cuentan se leen en una frase llana; el resto, como marca tenue */}
                  {Object.entries(x.familias ?? {}).filter(([, f]) => (f.cumple || f.cumple_inverso || f.inverso) && f.frase).map(([k, f]) => <p key={k} className={`lf-cand__fr ${f.cumple_inverso || f.inverso ? 'is-inverso' : ''}`}><i />{f.frase}</p>)}
                  <div className="lf-expo__ley">{Object.entries(x.familias ?? {}).filter(([, f]) => !((f.cumple || f.cumple_inverso || f.inverso) && f.frase)).map(([k, f]) => <span key={k} title={f.frase ?? ''} style={{ opacity: f.cumple || f.inverso || f.cumple_inverso ? 1 : 0.55 }}><i style={{ background: f.inverso || f.cumple_inverso ? 'var(--rojo-luz)' : f.cumple ? 'var(--esmeralda)' : 'var(--ceniza-2)' }} />{f.etiqueta ?? k}{f.etiqueta ? '' : `: ${valor(f.valor)}`}</span>)}</div>
                  {(x.etiquetas ?? []).map((e) => typeof e === 'string' ? <p key={e} className="lf-etiq__e"><b>{e}</b></p> : <p key={e.etiqueta} className={`lf-etiq__e ${e.fuerte ? 'is-fuerte' : ''}`}><b>{e.llano ?? e.etiqueta}</b>{e.detalle ? <em className="mono"> · {e.detalle}</em> : null}</p>)}
                  {x.linea_estudio && <p className="lf-ctrl__nota">{x.linea_estudio}</p>}
                </Link>)}</Seguro>
              )} />
            </div>
          )}
        </>
      ) : (
        <div className="lf-cand">
          {(m?.modos ?? []).map((x) => {
            const k = `${x.id}-${x.version}`
            const hzs = Object.entries(x.rendimiento_vivo?.horizontes ?? {})
            return (
              <Seguro key={k} t={nombreModo(x.id)}>{() => (<section className={`lf-tarj ${x.estado === 'propuesto' ? 'lf-tarj--oro' : ''}`} data-prueba="modo">
                <h3 className="mono">{nombreModo(x.id)} · v{x.version}<em className={x.estado === 'propuesto' ? 'is-pos' : ''}>{x.estado} · {x.origen} · {fmtFecha(x.creado_en)}</em></h3>
                <p className="lf-nota">{x.hipotesis}</p>
                <ul className="lf-receta">
                  <li>obligatorias: {lista(x.familias_obligatorias).map(familia).join(', ')}</li>
                  {lista(x.apoyo?.familias).length > 0 && <li>apoyo: {lista(x.apoyo?.familias).map(familia).join(', ')}{x.apoyo?.minimo ? ` (mínimo ${x.apoyo.minimo})` : ''}</li>}
                  <li>régimen {x.regimen} · cada {x.cadencia} · horizontes {lista(x.horizontes_dias).join(', ')} días</li>
                  {x.invalidacion && <li>se invalida si {x.invalidacion}</li>}
                </ul>
                {x.estudio?.resumen && <p className="lf-ctrl__nota mono">Estudio ({x.estudio.estado}): {x.estudio.resumen}</p>}
                <div className="lf-cand__seg">
                  <span><small>Emitidas</small><b className="num">{x.rendimiento_vivo?.emitidas ?? 0}</b><small style={{ textTransform: 'none', letterSpacing: 0 }}>{x.rendimiento_vivo?.descartadas ? `${x.rendimiento_vivo.descartadas} descartadas` : ''}</small></span>
                  {hzs.slice(0, 2).map(([h, r]) => <span key={h}><small>{h.replace(/_/g, ' ')}</small><b className="num">{r.n ? `${r.n} casos` : 'sin casos'}</b><small style={{ textTransform: 'none', letterSpacing: 0 }}>{r.n ? `acierto ${fmt(r.acierto_pct)} % · exceso ${signo(r.exceso_medio_pct)}` : 'todavía no se cumple el horizonte'}</small></span>)}
                </div>
                {x.motivo && <p className="lf-ctrl__nota mono">{x.motivo}</p>}
                {x.estado === 'propuesto' && <div className="lf-acc-fila"><input className="lf-ctrl__mini" style={{ maxWidth: 'none', flex: 1 }} value={motivo[k] ?? ''} onChange={(e) => setMotivo({ ...motivo, [k]: e.target.value })} placeholder="motivo (opcional)" aria-label="Motivo" /><button type="button" className="btn btn--esmeralda" style={{ padding: '8px 14px' }} onClick={() => decidir(x.id, x.version, true)}>Aprobar</button><button type="button" className="btn btn--ghost" style={{ padding: '8px 14px' }} onClick={() => decidir(x.id, x.version, false)}>Rechazar</button></div>}
              </section>)}</Seguro>
            )
          })}
        </div>
      )}
    </div>
  )
}
