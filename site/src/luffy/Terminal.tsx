import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { luffy } from './api'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { FichaTerminal, Filtro, PosicionHistorial, UniversoFila } from './tipos6b'
import type { Propuesta, Spec } from './tipos'
import { Grafico } from './charts/Grafico'
import { Sincronia } from './charts/sincronia'
import { fmt, fmtFecha, fmtPrecio, hace, RANGO_LABEL } from './formato'
import { EmptyState } from '../ui/EmptyState'
import { TarjetaPropuesta } from './Chat'

/* ============================================================================
   El terminal por moneda (CONTRATO-PANEL.md §8.1). A la izquierda la lista
   (`/terminal/universo`) con filtros y búsqueda; al elegir una moneda, la ficha
   (`/terminal/{activo}?rango=`) sin recargar: cada sección es un spec v2 que se
   dibuja con `Grafico` y todas se mueven juntas (cruz, zoom y rango). Ficha del
   radar, catalizadores, bitácora, teorías, posiciones, gatillos e hilos.
   ↑ ↓ cambian de moneda en escritorio; deslizar sobre la cabecera, en el
   teléfono; la siguiente y la anterior se precargan. El stop vigente se
   arrastra en el gráfico y crea la propuesta de moverlo (§8.2).
   ========================================================================== */

const FILTROS: [Filtro, string][] = [['mis_posiciones', 'Mis posiciones'], ['caja', 'Caja'], ['candidatas', 'Candidatas'], ['vigilancia', 'Vigilancia'], ['gatillos', 'Gatillos'], ['todo', 'Todo']]
const RANGOS = ['30d', '60d', '90d', '6m', '1y']
const NOMBRE_MODO: Record<string, string> = { impulso: 'impulso', squeeze: 'squeeze', pre_catalizador: 'pre-catalizador', ingresos_vs_precio: 'ingresos vs precio' }
const NOMBRE_FAMILIA: Record<string, string> = { impulso: 'Impulso', preparacion: 'Preparación', fundamento: 'Fundamento', posicionamiento: 'Posicionamiento', atencion: 'Atención', catalizadores: 'Catalizadores', squeeze: 'Squeeze', onchain: 'En cadena' }
const signo = (v: number | null | undefined, dec = 1) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dec).replace('.', ',')} %`)
const tono = (v: number | null | undefined) => (v === null || v === undefined ? '' : v > 0 ? 'is-pos' : v < 0 ? 'is-neg' : '')
const valorFamilia = (v: unknown) => (typeof v === 'number' ? fmt(v) : typeof v === 'string' ? v : '—')
const cifraDetalle = (k: string, v: unknown) => (typeof v === 'number' ? `${fmt(v)}${/pct|_pct$/.test(k) ? ' %' : ''}` : Array.isArray(v) ? `${v.length}` : v === null || v === undefined ? '—' : String(v))
const etiquetaDetalle = (k: string) => k.replace(/_pct$/, ' %').replace(/_/g, ' ')

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
    const t = setTimeout(() => luffy6b.universo(filtro, q).then((u) => { if (v) setFilas(u.activos) }, (e) => { if (v) { setErrorLista(e instanceof ErrorLuffy6b ? e.message : String(e)); setFilas((f) => f ?? []) } }), q ? 200 : 0)
    try { localStorage.setItem('luffy.terminal.filtro', filtro) } catch { /* sin storage */ }
    return () => { v = false; clearTimeout(t) }
  }, [filtro, q])

  const seleccion = (activo ?? filas?.[0]?.simbolo ?? '').toUpperCase().replace(/-USDT$/, '')
  const indice = filas ? filas.findIndex((f) => f.simbolo === seleccion) : -1
  const irA = useCallback((d: 1 | -1) => { if (!filas?.length) return; const i = indice < 0 ? 0 : Math.min(filas.length - 1, Math.max(0, indice + d)); nav(`/luffy/terminal/${filas[i].simbolo}`) }, [filas, indice, nav])
  const alTeclado = useCallback((e: KeyboardEvent) => { const t = e.target as HTMLElement; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return; if (e.key === 'ArrowDown') { e.preventDefault(); irA(1) } else if (e.key === 'ArrowUp') { e.preventDefault(); irA(-1) } }, [irA])
  useEffect(() => { window.addEventListener('keydown', alTeclado); return () => window.removeEventListener('keydown', alTeclado) }, [alTeclado])
  useEffect(() => { if (!filas || indice < 0) return; if (filas[indice + 1]) luffy6b.precargar(filas[indice + 1].simbolo, rango); if (filas[indice - 1]) luffy6b.precargar(filas[indice - 1].simbolo, rango) }, [filas, indice, rango])
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
              <span className="lf-fila__sym">{f.simbolo}<em>{f.nombre ?? ''}</em></span>
              <span className="lf-fila__precio num">{fmtPrecio(f.precio)}<em className={tono(f.cambio_24h_pct)}>{signo(f.cambio_24h_pct)}</em></span>
              <span className="lf-fila__btc num"><small>vs BTC 7 d</small><em className={tono(f.vs_btc_7d_pct)}>{signo(f.vs_btc_7d_pct)}</em></span>
              <span className="lf-fila__marcas mono">
                {f.modos_hoy.map((m) => <i key={m} className="lf-mini lf-mini--oro">{NOMBRE_MODO[m] ?? m}</i>)}
                {f.squeeze && <i className={`lf-mini ${f.squeeze === 'ignicion' ? 'lf-mini--rojo' : 'lf-mini--esm'}`}>squeeze {f.squeeze === 'ignicion' ? 'ignición' : 'cargado'}</i>}
                {f.posiciones.map((p) => <i key={p.origen} className="lf-mini lf-mini--esm">{p.origen === 'caja' ? 'caja' : 'posición'}{p.simulado ? ' · sim' : ''}</i>)}
                {f.gatillos > 0 && <i className="lf-mini">{f.gatillos} gatillo{f.gatillos > 1 ? 's' : ''}</i>}
                {f.proximo_catalizador && <i className="lf-mini lf-mini--hueso" title={f.proximo_catalizador.titulo}>{f.proximo_catalizador.tipo === 'votacion' ? 'votación' : f.proximo_catalizador.tipo === 'listado' ? 'listado' : 'agenda'} {f.proximo_catalizador.dias !== null ? `en ${f.proximo_catalizador.dias} d` : fmtFecha(f.proximo_catalizador.fecha)}</i>}
              </span>
            </Link>
          ))}
          {filas && !filas.length && !errorLista && <p className="lf-conv__nada">Nada con ese filtro.</p>}
        </div>
      </aside>
      {hoja && <button type="button" className="lf-velo" aria-label="Cerrar monedas" onClick={() => setHoja(false)} />}
      <section className="lf-term__ficha">
        {seleccion ? <Ficha key={`${seleccion}|${rango}`} activo={seleccion} rango={rango} setRango={setRango} sincronia={sincronia} abrirLista={() => setHoja(true)} fila={filas?.find((f) => f.simbolo === seleccion) ?? null} onTocar={alTocar} onSoltar={alSoltar} />
          : filas ? <div className="lf-lab__vacio"><EmptyState kind={errorLista ? 'error' : 'vacio'} title={errorLista ? 'No se pudo cargar la lista.' : 'Elige una moneda.'} detail={errorLista ?? 'A la izquierda, con filtros y búsqueda.'} /></div>
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
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  useEffect(() => { let v = true; setFicha(null); setError(null); luffy6b.ficha(activo, rango).then((f) => { if (v) setFicha(f) }, (e) => { if (v) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) }); return () => { v = false } }, [activo, rango])
  const stopVigente = (ficha?.posiciones ?? []).find((p) => p.stop_vigente)?.stop_vigente?.precio ?? null
  const moverStop = async (a: string, precio: number) => {
    try { const r = await luffy6b.proponer({ accion: 'mover_stop', par: `${a}-USDT`, stop: precio, afloja: stopVigente !== null && precio < stopVigente, razon: 'movido desde el terminal' }); setPropuestas(r.propuestas) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }
  const abrirEnLab = async (spec: Spec, titulo: string) => { setAbriendo(titulo); try { const s = await luffy.guardarSpec({ ...spec, titulo }, titulo); nav(`/luffy/laboratorio/${s.spec_id}`) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setAbriendo(null) } }
  const preguntar = async () => { setAbriendo('luffy'); try { const r = await luffy6b.hiloTerminal(activo); nav(`/luffy/h/${r.hilo_id}`) } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setAbriendo(null) } }
  const precio = ficha?.precio.ultimo ?? fila?.precio ?? null
  const cambio = ficha?.precio.cambio_24h_pct ?? fila?.cambio_24h_pct ?? null
  const cab = (
    <header className="lf-ficha__cab" onTouchStart={onTocar} onTouchEnd={onSoltar}>
      <button type="button" className="lf-conv__hilos mono lf-ficha__monedas" onClick={abrirLista}>Monedas</button>
      <div className="lf-ficha__id">
        <h1 className="lf-ficha__sym">{activo}<em>{ficha?.nombre ?? fila?.nombre ?? ''}</em></h1>
        <span className="lf-ficha__precio num">{fmtPrecio(precio)}<em className={tono(cambio)}>{signo(cambio)} · 24 h</em></span>
      </div>
      <div className="lf-ficha__marcas mono">
        {fila?.modos_hoy.map((m) => <i key={m} className="lf-mini lf-mini--oro">{NOMBRE_MODO[m] ?? m}</i>)}
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
  const radar = ficha.radar
  return (
    <>
      {cab}
      {error && <p className="lf-m__error">{error}</p>}
      {propuestas.length > 0 && <div className="lf-ficha__prop">{propuestas.map((p) => <TarjetaPropuesta key={p.id_corto} p={p} alCambiar={async () => {}} cambiar={() => {}} />)}</div>}
      <div className="lf-ficha__cuerpo">
        <div className="lf-ficha__graficos">
          {ficha.secciones.map((s) => (
            <section key={s.id} className="lf-ficha__sec" data-prueba={`seccion-${s.id}`}>
              {noDisp.has(s.id) ? (
                <div className="lf-g lf-g--nota"><div className="lf-g__cab"><span className="lf-g__titulo">{s.titulo}</span></div><p className="lf-g__nota">Sin datos: {noDisp.get(s.id)}</p></div>
              ) : (
                <Grafico spec={{ ...s.spec, titulo: s.spec.titulo ?? s.titulo }} interactivo rangos={false} sincronia={sincronia} compacto alto={s.id === 'precio' ? 400 : 340} onMoverStop={s.id === 'precio' && stopVigente !== null ? moverStop : undefined}
                  acciones={<button type="button" className="lf-chip lf-chip--oro" onClick={() => abrirEnLab(s.spec, s.titulo)} disabled={abriendo === s.titulo} data-prueba={`lab-${s.id}`}>{abriendo === s.titulo ? 'Abriendo…' : 'Abrir en el laboratorio'}</button>} />
              )}
            </section>
          ))}
        </div>
        <aside className="lf-ficha__lado">
          {radar ? (
            <section className="lf-tarj">
              <h3 className="mono">Ficha del radar<em>{radar.regimen ? `régimen ${radar.regimen.lectura.replace('_', ' ')}` : ''}</em></h3>
              {radar.etiquetas.length > 0 && <div className="lf-etiq">{radar.etiquetas.map((e) => <p key={e.etiqueta} className={`lf-etiq__e ${e.fuerte ? 'is-fuerte' : ''}`}><b>{e.llano}</b>{e.detalle ? <em className="mono"> · {e.detalle}</em> : null}</p>)}</div>}
              <div className="lf-modos">
                {radar.modos_cumplidos.length ? radar.modos_cumplidos.map((m) => (
                  <div key={`${m.modo}-${m.version}`} className="lf-modo is-on">
                    <span className="lf-modo__n">{NOMBRE_MODO[m.modo] ?? m.modo} <em className="mono">v{m.version} · {m.decision}{m.p_merece !== null ? ` · ${Math.round(m.p_merece * 100)} %` : ''}</em></span>
                    <span className="lf-modo__e mono">confluencia {fmt(m.confluencia.score)} · obligatorias {m.confluencia.obligatorias.join(', ')}{m.confluencia.apoyo.length ? ` · apoyo ${m.confluencia.apoyo.join(', ')}` : ''}</span>
                    {m.linea_estudio && <span className="lf-modo__e">{m.linea_estudio}</span>}
                  </div>
                )) : <p className="lf-ctrl__nota mono">Hoy no se cumple ningún modo.</p>}
              </div>
              <div className="lf-fam">
                {Object.entries(radar.familias).map(([k, f]) => (
                  <div key={k} className={`lf-fam__f ${f.cumple ? 'is-on' : ''} ${f.cumple_inverso ? 'is-inverso' : ''}`}>
                    <span className="lf-fam__n mono"><i className="lf-gema" />{NOMBRE_FAMILIA[k] ?? k} · {f.etiqueta}{f.z !== null ? <em> z {fmt(f.z)}</em> : null}</span>
                    {f.motivo ? <span className="lf-fam__m">{f.motivo}</span> : <>
                      <span className="lf-fam__c"><small>valor</small><b className="num">{valorFamilia(f.valor)}</b></span>
                      {Object.entries(f.detalle).filter(([, v]) => typeof v === 'number' || typeof v === 'string').slice(0, 3).map(([dk, dv]) => <span key={dk} className="lf-fam__c"><small>{etiquetaDetalle(dk)}</small><b className="num">{cifraDetalle(dk, dv)}</b></span>)}
                    </>}
                  </div>
                ))}
              </div>
            </section>
          ) : <section className="lf-tarj"><h3 className="mono">Ficha del radar</h3><p className="lf-ctrl__nota mono">Sin perfil del radar para {activo}.</p></section>}
          <section className="lf-tarj">
            <h3 className="mono">Catalizadores próximos</h3>
            {ficha.catalizadores.length ? ficha.catalizadores.map((c, i) => <p key={i} className="lf-nota"><b className="num">{c.dias !== null ? `en ${c.dias} d` : fmtFecha(c.fecha)}</b> · {c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer">{c.titulo}</a> : c.titulo} <em className="mono">{c.tipo} · {c.fuente ?? ''}{c.impacto ? ` · impacto ${c.impacto}` : ''}</em></p>) : <p className="lf-ctrl__nota mono">Ninguno en los próximos 30 días.</p>}
          </section>
          <section className="lf-tarj">
            <h3 className="mono">Posiciones y gatillos</h3>
            {ficha.posiciones.map((p, i) => <PosicionFicha key={i} p={p} precio={precio} />)}
            {ficha.gatillos.map((g) => <p key={g.id} className="lf-nota"><em className="mono">gatillo {g.id_corto} · {g.estado}{g.vigilancia.precio ? ` · nivel ${fmtPrecio(g.vigilancia.precio.nivel)} ${g.vigilancia.precio.direccion}` : ''}</em>{g.texto}</p>)}
            {!ficha.posiciones.length && !ficha.gatillos.length && <p className="lf-ctrl__nota mono">Sin posición ni gatillos sobre {activo}.</p>}
          </section>
          <section className="lf-tarj">
            <h3 className="mono">Bitácora y teorías</h3>
            {ficha.bitacora.map((b) => <p key={b.id} className="lf-nota"><em className="mono">bitácora · {b.tipo}{b.origen ? ` · ${b.origen}` : ''} · {fmtFecha(b.fecha, true)}{b.resultado ? ` · ${b.resultado}` : ''}</em>{b.tesis}{b.hilo_id && <> <Link to={`/luffy/h/${b.hilo_id}`} className="lf-nota__ir mono">ver hilo</Link></>}</p>)}
            {ficha.teorias.map((t) => <p key={t.id} className="lf-nota"><em className="mono">teoría · {t.estado}{t.confianza ? ` · confianza ${t.confianza}` : ''}</em><b>{t.titulo}</b> · {t.hipotesis}</p>)}
            {!ficha.bitacora.length && !ficha.teorias.length && <p className="lf-ctrl__nota mono">Nada todavía.</p>}
            {ficha.hilos.length > 0 && <p className="lf-ctrl__nota mono">Hilos: {ficha.hilos.map((h, i) => <span key={h.id}>{i > 0 && ' · '}<Link to={`/luffy/h/${h.id}`} className="lf-nota__ir">{h.titulo}</Link> ({hace(h.actualizado)})</span>)}</p>}
          </section>
        </aside>
      </div>
    </>
  )
}

function PosicionFicha({ p, precio }: { p: PosicionHistorial; precio: number | null }) {
  const pnl = precio !== null && p.cantidad ? (precio - p.precio_medio) * p.cantidad : null
  const declarada = p.entradas.some((e) => e.declarada)
  return (
    <p className="lf-nota">
      <b>{p.origen === 'caja' ? 'Caja' : 'Pablo'}</b> · {p.estado}{p.simulado ? <span className="lf-sim"> · simulada</span> : ''}{declarada ? ' · declarada' : ''} · {p.mandato} · {fmt(p.cantidad)} a {fmtPrecio(p.precio_medio)}
      {p.stop_vigente ? ` · stop ${fmtPrecio(p.stop_vigente.precio)}` : ''}
      {pnl !== null && p.estado === 'abierta' ? <> · <em className={tono(pnl)}>{pnl >= 0 ? '+' : ''}{fmt(pnl, 'USDT')}</em></> : null}
      {p.estado !== 'abierta' && typeof p.pnl_realizado_usdt === 'number' ? <> · realizado <em className={tono(p.pnl_realizado_usdt)}>{p.pnl_realizado_usdt >= 0 ? '+' : ''}{fmt(p.pnl_realizado_usdt, 'USDT')}</em></> : null}
    </p>
  )
}
