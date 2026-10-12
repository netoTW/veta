import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { luffy } from './api'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { FichaTerminal, Filtro, UniversoFila } from './tipos6b'
import type { Spec } from './tipos'
import { Grafico } from './charts/Grafico'
import { Sincronia } from './charts/sincronia'
import { fmt, fmtFecha, fmtPrecio, hace, RANGO_LABEL } from './formato'
import { EmptyState } from '../ui/EmptyState'
import { TarjetaPropuesta } from './Chat'
import type { Propuesta } from './tipos'

/* ============================================================================
   El terminal por moneda (fase 6b §2): a la izquierda la lista con filtros y
   búsqueda; al elegir una moneda, la ficha completa sin recargar: precio y
   volumen con posiciones, gatillos, catalizadores y marcas del radar;
   derivados; fundamento contra la categoría; atención; la ficha del radar;
   catalizadores próximos; notas y teorías. Todos los gráficos de la ficha se
   mueven juntos (cruz, zoom y rango). ↑ ↓ cambian de moneda en escritorio;
   deslizar sobre la cabecera, en el teléfono; la siguiente se precarga.
   ========================================================================== */

const FILTROS: [Filtro, string][] = [['mis_posiciones', 'Mis posiciones'], ['caja', 'Caja'], ['candidatas', 'Candidatas'], ['vigilancia', 'Vigilancia'], ['gatillos', 'Gatillos'], ['todo', 'Todo']]
const RANGOS = ['30d', '60d', '90d', '6m', '1y']
const MODO_LABEL: Record<string, string> = { impulso: 'impulso', squeeze: 'squeeze', pre_catalizador: 'pre-catalizador', ingresos_vs_precio: 'ingresos vs precio' }
const signo = (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dec).replace('.', ',')} %`)
const tono = (v: number | null | undefined) => (v === null || v === undefined ? '' : v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '')

export function Terminal() {
  const { activo } = useParams()
  const nav = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>(() => { try { return (localStorage.getItem('luffy.terminal.filtro') as Filtro) || 'todo' } catch { return 'todo' } })
  const [q, setQ] = useState('')
  const [filas, setFilas] = useState<UniversoFila[] | null>(null)
  const [errorLista, setErrorLista] = useState<string | null>(null)
  const [hoja, setHoja] = useState(false)
  const [rango, setRango] = useState('90d')
  const sincronia = useMemo(() => new Sincronia(), [activo])

  useEffect(() => {
    let v = true; setErrorLista(null)
    const t = setTimeout(() => luffy6b.universo(filtro, q).then((u) => { if (v) setFilas(u.filas) }, (e) => { if (v) setErrorLista(e instanceof ErrorLuffy6b ? e.message : String(e)) }), q ? 200 : 0)
    try { localStorage.setItem('luffy.terminal.filtro', filtro) } catch { /* sin storage */ }
    return () => { v = false; clearTimeout(t) }
  }, [filtro, q])

  const seleccion = (activo ?? filas?.[0]?.simbolo ?? '').toUpperCase()
  const indice = filas ? filas.findIndex((f) => f.simbolo === seleccion) : -1
  const irA = useCallback((d: 1 | -1) => { if (!filas?.length) return; const i = indice < 0 ? 0 : Math.min(filas.length - 1, Math.max(0, indice + d)); nav(`/luffy/terminal/${filas[i].simbolo}`) }, [filas, indice, nav])
  const alTeclado = useCallback((e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return; if (e.key === 'ArrowDown') { e.preventDefault(); irA(1) } else if (e.key === 'ArrowUp') { e.preventDefault(); irA(-1) } }, [irA])
  useEffect(() => { window.addEventListener('keydown', alTeclado); return () => window.removeEventListener('keydown', alTeclado) }, [alTeclado])
  // la siguiente y la anterior de la lista, precargadas
  useEffect(() => { if (!filas || indice < 0) return; if (filas[indice + 1]) luffy6b.precargar(filas[indice + 1].simbolo); if (filas[indice - 1]) luffy6b.precargar(filas[indice - 1].simbolo) }, [filas, indice])
  useEffect(() => { setHoja(false) }, [activo])
  const toque = useRef<{ x: number; y: number } | null>(null)
  const alTocar = (e: React.TouchEvent) => { toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const alSoltar = (e: React.TouchEvent) => { const t = toque.current; toque.current = null; if (!t) return; const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y; if (Math.abs(dx) > 60 && Math.abs(dy) < 40) irA(dx < 0 ? 1 : -1) }

  return (
    <div className="lf-term">
      <aside className={`lf-term__lista ${hoja ? 'is-open' : ''}`} aria-label="Monedas">
        <div className="lf-lab__ctrl-cab mono"><span>Monedas</span><button type="button" className="lf-lab__cerrar" onClick={() => setHoja(false)} aria-label="Cerrar">×</button></div>
        <div className="lf-term__filtros">
          <input className="lf-term__busca" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar moneda" aria-label="Buscar" />
          <div className="lf-chips">{FILTROS.map(([k, l]) => <button key={k} type="button" className={`lf-chip ${filtro === k ? 'is-on' : ''}`} onClick={() => setFiltro(k)}>{l}</button>)}</div>
        </div>
        {errorLista && <p className="lf-hilos__error">{errorLista}</p>}
        <div className="lf-term__filas" role="listbox" aria-label="Monedas">
          {filas?.map((f) => (
            <Link key={f.simbolo} to={`/luffy/terminal/${f.simbolo}`} className={`lf-fila ${f.simbolo === seleccion ? 'is-activa' : ''}`} role="option" aria-selected={f.simbolo === seleccion} data-prueba="moneda" data-simbolo={f.simbolo}>
              <span className="lf-fila__sym">{f.simbolo}<em>{f.nombre}</em></span>
              <span className="lf-fila__precio num">{fmtPrecio(f.precio)}<em className={tono(f.cambio_24h_pct)}>{signo(f.cambio_24h_pct)}</em></span>
              <span className="lf-fila__btc num"><small>vs BTC 7 d</small><em className={tono(f.vs_btc_7d_pct)}>{signo(f.vs_btc_7d_pct)}</em></span>
              <span className="lf-fila__marcas mono">
                {f.modos.map((m) => <i key={m} className="lf-mini lf-mini--oro">{MODO_LABEL[m] ?? m}</i>)}
                {f.squeeze && <i className={`lf-mini ${f.squeeze === 'ignicion' ? 'lf-mini--rojo' : 'lf-mini--esm'}`}>squeeze {f.squeeze === 'ignicion' ? 'ignición' : 'cargado'}</i>}
                {f.posicion && <i className="lf-mini lf-mini--esm">{f.posicion.origen === 'caja' ? 'caja' : 'posición'}</i>}
                {f.gatillos > 0 && <i className="lf-mini">{f.gatillos} gatillo{f.gatillos > 1 ? 's' : ''}</i>}
                {f.catalizador && <i className="lf-mini lf-mini--hueso">{fmtFecha(f.catalizador.fecha)}</i>}
              </span>
            </Link>
          ))}
          {filas && !filas.length && <p className="lf-conv__nada">Nada con ese filtro.</p>}
        </div>
      </aside>
      {hoja && <button type="button" className="lf-velo" aria-label="Cerrar monedas" onClick={() => setHoja(false)} />}
      <section className="lf-term__ficha">
        {seleccion ? <Ficha key={seleccion} activo={seleccion} rango={rango} setRango={setRango} sincronia={sincronia} abrirLista={() => setHoja(true)} fila={filas?.find((f) => f.simbolo === seleccion) ?? null} onTocar={alTocar} onSoltar={alSoltar} />
          : filas ? <div className="lf-lab__vacio"><EmptyState kind="vacio" title="Elige una moneda." detail="A la izquierda, con filtros y búsqueda." /></div>
          : <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>}
      </section>
    </div>
  )
}

function Ficha({ activo, rango, setRango, sincronia, abrirLista, fila, onTocar, onSoltar }: { activo: string; rango: string; setRango: (r: string) => void; sincronia: Sincronia; abrirLista: () => void; fila: UniversoFila | null; onTocar: (e: React.TouchEvent) => void; onSoltar: (e: React.TouchEvent) => void }) {
  const nav = useNavigate()
  const [ficha, setFicha] = useState<FichaTerminal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abriendo, setAbriendo] = useState<string | null>(null)
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null)
  const moverStop = async (a: string, precio: number) => { try { setPropuesta(await luffy6b.proponer({ accion: 'mover_stop', activo: a, stop: precio })) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } }
  useEffect(() => { let v = true; setFicha(null); setError(null); luffy6b.ficha(activo).then((f) => { if (v) setFicha(f) }, (e) => { if (v) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }); return () => { v = false } }, [activo])
  const abrirEnLab = async (spec: Spec, titulo: string) => { setAbriendo(titulo); try { const s = await luffy.guardarSpec({ ...spec, rango }, titulo); nav(`/luffy/laboratorio/${s.spec_id}`) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setAbriendo(null) } }
  const preguntar = async () => { setAbriendo('luffy'); try { const r = await luffy6b.preguntar(activo); nav(`/luffy/h/${r.hilo_id}`) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setAbriendo(null) } }
  const cab = (
    <header className="lf-ficha__cab" onTouchStart={onTocar} onTouchEnd={onSoltar}>
      <button type="button" className="lf-conv__hilos mono lf-ficha__monedas" onClick={abrirLista}>Monedas</button>
      <div className="lf-ficha__id">
        <h1 className="lf-ficha__sym">{activo}<em>{ficha?.nombre ?? fila?.nombre ?? ''}</em></h1>
        <span className="lf-ficha__precio num">{fmtPrecio(ficha?.precio ?? fila?.precio)}<em className={tono(ficha?.cambio_24h_pct ?? fila?.cambio_24h_pct)}>{signo(ficha?.cambio_24h_pct ?? fila?.cambio_24h_pct)} · 24 h</em></span>
      </div>
      <div className="lf-ficha__marcas mono">
        {fila?.modos.map((m) => <i key={m} className="lf-mini lf-mini--oro">{MODO_LABEL[m] ?? m}</i>)}
        {fila?.squeeze && <i className={`lf-mini ${fila.squeeze === 'ignicion' ? 'lf-mini--rojo' : 'lf-mini--esm'}`}>squeeze {fila.squeeze === 'ignicion' ? 'ignición' : 'cargado'}</i>}
        {fila && <i className="lf-mini"><small>vs BTC 7 d</small> <b className={tono(fila.vs_btc_7d_pct)}>{signo(fila.vs_btc_7d_pct)}</b> · <small>30 d</small> <b className={tono(fila.vs_btc_30d_pct)}>{signo(fila.vs_btc_30d_pct)}</b></i>}
      </div>
      <div className="lf-ficha__acc">
        <div className="lf-g__rangos" role="group" aria-label="Rango de la ficha">{RANGOS.map((r) => <button key={r} type="button" className={`lf-chip ${rango === r ? 'is-on' : ''}`} onClick={() => setRango(r)}>{RANGO_LABEL[r] ?? r}</button>)}</div>
        <button type="button" className="btn btn--esmeralda lf-ficha__preguntar" onClick={preguntar} disabled={abriendo === 'luffy'} data-prueba="preguntar">{abriendo === 'luffy' ? 'Abriendo…' : 'Preguntarle a Luffy'}</button>
      </div>
    </header>
  )
  if (error && !ficha) return <>{cab}<div className="lf-lab__vacio"><EmptyState kind="error" title={`No se pudo armar la ficha de ${activo}.`} detail={error} /></div></>
  if (!ficha) return <>{cab}<div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div></>
  const noDisp = new Map(ficha.no_disponibles.map((n) => [n.seccion, n.motivo]))
  return (
    <>
      {cab}
      {error && <p className="lf-m__error">{error}</p>}
      {propuesta && <div className="lf-ficha__prop"><TarjetaPropuesta p={propuesta} alCambiar={async () => {}} cambiar={() => {}} /></div>}
      <div className="lf-ficha__cuerpo">
        <div className="lf-ficha__graficos">
          {ficha.secciones.map((s) => (
            <section key={s.id} className="lf-ficha__sec" data-prueba={`seccion-${s.id}`}>
              {noDisp.has(s.id) ? (
                <div className="lf-g lf-g--nota"><div className="lf-g__cab"><span className="lf-g__titulo">{s.titulo}</span></div><p className="lf-g__nota">Sin datos: {noDisp.get(s.id)}</p></div>
              ) : (
                <Grafico spec={{ ...s.spec, rango }} interactivo rangos={false} sincronia={sincronia} compacto alto={s.id === 'precio' ? 400 : 320} onMoverStop={s.id === 'precio' ? moverStop : undefined}
                  acciones={<button type="button" className="lf-chip lf-chip--oro" onClick={() => abrirEnLab(s.spec, s.spec.titulo ?? s.titulo)} disabled={abriendo === (s.spec.titulo ?? s.titulo)} data-prueba={`lab-${s.id}`}>{abriendo === (s.spec.titulo ?? s.titulo) ? 'Abriendo…' : 'Abrir en el laboratorio'}</button>} />
              )}
            </section>
          ))}
        </div>
        <aside className="lf-ficha__lado">
          {ficha.radar ? (
            <section className="lf-tarj">
              <h3 className="mono">Ficha del radar<em>{ficha.radar.ultima_marca ? ` · marcada ${hace(ficha.radar.ultima_marca)}` : ''}</em></h3>
              {ficha.radar.etiquetas.length > 0 && <div className="lf-chips">{ficha.radar.etiquetas.map((e) => <span key={e} className="lf-chip is-on">{e}</span>)}</div>}
              <div className="lf-fam">
                {ficha.radar.familias.map((f) => (
                  <div key={f.nombre} className={`lf-fam__f ${f.cumple ? 'is-on' : ''}`}>
                    <span className="lf-fam__n mono"><i className="lf-gema" />{f.nombre}</span>
                    {f.cifras.map((c) => <span key={c.k} className="lf-fam__c"><small>{c.k}</small><b className="num">{c.v}</b></span>)}
                  </div>
                ))}
              </div>
              <div className="lf-modos">
                {ficha.radar.modos.map((m) => (
                  <div key={`${m.id}-${m.version}`} className={`lf-modo ${m.cumple ? 'is-on' : ''}`}>
                    <span className="lf-modo__n">{m.nombre} <em className="mono">v{m.version}</em></span>
                    <span className="lf-modo__e mono">{m.cumple ? 'se cumple' : 'no se cumple'}{m.estudio ? ` · estudio: ${m.estudio.n} casos, acierto ${fmt(m.estudio.acierto_pct)} %, mediana ${signo(m.estudio.retorno_mediano_pct)} a ${m.estudio.horizonte_d} d` : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : <section className="lf-tarj"><h3 className="mono">Ficha del radar</h3><p className="lf-ctrl__nota mono">El radar no marcó {activo} en los últimos 30 días.</p></section>}
          <section className="lf-tarj">
            <h3 className="mono">Catalizadores próximos</h3>
            {ficha.catalizadores.length ? ficha.catalizadores.map((c, i) => <p key={i} className="lf-nota"><b className="num">{fmtFecha(c.fecha)}</b> · {c.etiqueta} <em className="mono">{c.tipo} · {c.fuente}</em></p>) : <p className="lf-ctrl__nota mono">Ninguno fechado.</p>}
          </section>
          <section className="lf-tarj">
            <h3 className="mono">Posiciones y gatillos</h3>
            {ficha.posiciones.map((p, i) => <p key={i} className="lf-nota"><b>{p.origen === 'caja' ? 'Caja' : 'Pablo'}</b> · {p.estado}{p.simulado ? ' · simulada' : ''} · {fmt(p.cantidad)} a {fmtPrecio(p.precio_medio)}{p.stop_precio ? ` · stop ${fmtPrecio(p.stop_precio)}` : ''}{p.pnl_no_realizado_usdt !== null ? <> · <em className={tono(p.pnl_no_realizado_usdt)}>{p.pnl_no_realizado_usdt >= 0 ? '+' : ''}{fmt(p.pnl_no_realizado_usdt, 'USDT')}</em></> : null}</p>)}
            {ficha.gatillos.map((g) => <p key={g.id} className="lf-nota"><em className="mono">gatillo #{g.id} · {g.estado}</em> {g.texto}</p>)}
            {!ficha.posiciones.length && !ficha.gatillos.length && <p className="lf-ctrl__nota mono">Sin posición ni gatillos sobre {activo}.</p>}
          </section>
          <section className="lf-tarj">
            <h3 className="mono">Notas y teorías de Luffy</h3>
            {ficha.notas.length ? ficha.notas.map((n, i) => <p key={i} className="lf-nota"><em className="mono">{n.tipo === 'teoria' ? 'teoría' : 'bitácora'}{n.estado ? ` · ${n.estado}` : ''} · {fmtFecha(n.fecha, true)}</em>{n.texto}{n.hilo_id && <> <Link to={`/luffy/h/${n.hilo_id}`} className="lf-nota__ir mono">ver hilo</Link></>}</p>) : <p className="lf-ctrl__nota mono">Nada todavía.</p>}
          </section>
        </aside>
      </div>
    </>
  )
}
