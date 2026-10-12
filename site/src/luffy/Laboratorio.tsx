import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorLuffy, luffy } from './api'
import type { Catalogo, CatalogoSerie, Datos, PanelSpec, SerieSpec, Spec, Tablero, Transformacion } from './tipos'
import { Grafico } from './charts/Grafico'
import { Comparacion } from './charts/Comparacion'
import { Distribucion } from './charts/Distribucion'
import { fmt, INTERVALO_LABEL, RANGO_LABEL } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* ============================================================================
   El laboratorio de gráficos. Abre cualquier gráfico del chat (por spec_id),
   un tablero o uno nuevo, y lo edita: series del catálogo, benchmarks,
   transformaciones, rango, posiciones encima, varios paneles. Cada cambio
   vuelve a pedir los datos sin recargar la página. Se guarda en tableros.
   ========================================================================== */

type SpecEd = Spec & { paneles: PanelSpec[]; activos: string[]; rango: string; intervalo: string }
type Origen = { tipo: 'nuevo' } | { tipo: 'spec'; id: string; hilo_id: string | null } | { tipo: 'tablero'; t: Tablero }
const FUNDAMENTALES = ['ingresos', 'fees', 'holders_revenue', 'tvl', 'volumen_dex']
const GRUPO_LABEL: Record<string, string> = { mercado: 'Mercado', apalancamiento: 'Apalancamiento', fundamental: 'Fundamentales', redes: 'Redes', radar: 'Radar', cartera: 'Cartera', luffy: 'Datasets de Luffy' }
const MOSTRAR: [string, string][] = [['entradas', 'Entradas'], ['salidas', 'Salidas'], ['stop', 'Stop vigente'], ['stops_historial', 'Historial de stops'], ['pnl', 'Resultado acumulado']]

/** Un spec que viene del servidor, listo para editar: paneles con ids y sin atajos ya materializados. */
function base(s: Spec): SpecEd {
  const c = JSON.parse(JSON.stringify(s)) as Spec
  delete c.benchmarks; delete c.series
  const activos = c.activos?.length ? c.activos : ['STONK']
  const paneles = (c.paneles ?? []).map((p, i) => ({ ...p, id: p.id || `panel_${i + 1}`, series: (p.series ?? []).map((se, j) => ({ ...se, id: se.id || `${p.id || 'p'}_${j + 1}` })) }))
  return { ...c, version: 2, activos, rango: c.rango ?? '90d', intervalo: c.intervalo ?? '1d', paneles }
}
function specNuevo(a: string): SpecEd {
  return { version: 2, titulo: `${a}: precio y volumen`, activos: [a], rango: '90d', intervalo: '1d', paneles: [
    { id: 'precio', titulo: 'Precio', altura: 3, escala: 'lineal', series: [{ id: a.toLowerCase(), tipo: 'ohlc', activo: a, estilo: 'velas', rol: 'principal', eje: 'izq' }] },
    { id: 'volumen', titulo: 'Volumen', altura: 1, escala: 'lineal', series: [{ id: 'vol', tipo: 'volumen', activo: a, estilo: 'barras', rol: 'principal', eje: 'izq' }] },
  ] }
}
const idLibre = (s: SpecEd, pref: string) => { const usados = new Set(s.paneles.flatMap((p) => p.series.map((x) => x.id))); let id = pref, n = 2; while (usados.has(id)) id = `${pref}_${n++}`; return id }
const panelPrecio = (s: SpecEd) => s.paneles.find((p) => p.series.some((x) => x.tipo === 'ohlc' || x.tipo === 'cierre')) ?? s.paneles[0]
const tieneBench = (s: SpecEd, activo: string) => s.paneles.some((p) => p.series.some((x) => x.rol === 'benchmark' && x.activo === activo && (x.tipo === 'cierre' || x.tipo === 'ohlc')))
const tieneCategoria = (s: SpecEd) => s.paneles.some((p) => p.series.some((x) => x.tipo === 'categoria'))

export function Laboratorio() {
  const { specId, tableroId } = useParams()
  const [cat, setCat] = useState<Catalogo | null>(null)
  const [spec, setSpec] = useState<SpecEd | null>(null)
  const [origen, setOrigen] = useState<Origen>({ tipo: 'nuevo' })
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoja, setHoja] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [comparar, setComparar] = useState(false)

  useEffect(() => { luffy.catalogo().then(setCat, (e) => setError(e instanceof ErrorLuffy ? e.message : String(e))) }, [])
  useEffect(() => {
    let v = true
    setSpec(null); setDatos(null); setError(null)
    ;(async () => {
      if (specId) { const s = await luffy.spec(specId); const d = await luffy.datos(s.spec); if (v) { setSpec(base(d.spec)); setOrigen({ tipo: 'spec', id: specId, hilo_id: s.hilo_id }) } }
      else if (tableroId) { const ts = await luffy.tableros(); const t = ts.find((x) => x.id === Number(tableroId)); if (!t) throw new ErrorLuffy(404, 'no_encontrado', 'Ese tablero no existe.'); const d = await luffy.datos(t.spec); if (v) { setSpec(base(d.spec)); setOrigen({ tipo: 'tablero', t }) } }
      else { const c = await luffy.catalogo(); const a = c.activos.find((x) => x.en_posicion)?.simbolo ?? c.activos[0]?.simbolo ?? 'BTC'; if (v) { setSpec(specNuevo(a)); setOrigen({ tipo: 'nuevo' }) } }
    })().catch((e) => { if (v) setError(e instanceof ErrorLuffy ? e.message : String(e)) })
    return () => { v = false }
  }, [specId, tableroId])

  const mutar = useCallback((fn: (s: SpecEd) => void) => setSpec((s) => { if (!s) return s; const c = JSON.parse(JSON.stringify(s)) as SpecEd; fn(c); return c }), [])
  const onDatos = useCallback((d: Datos) => setDatos(d), [])
  const porPrecio = useMemo(() => datos?.series.filter((s) => s.formato === 'por_precio' && s.puntos.length) ?? [], [datos])

  if (error && !spec) return <div className="shell lf-lab__vacio"><EmptyState kind="error" title="No se pudo abrir el laboratorio." detail={error} action={<Link to="/luffy/laboratorio" className="btn btn--ghost">Gráfico nuevo</Link>} /></div>
  if (!spec) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  return (
    <div className="lf-lab">
      <aside className={`lf-lab__ctrl ${hoja ? 'is-open' : ''}`} aria-label="Controles">
        <div className="lf-lab__ctrl-cab mono"><span>Ajustes</span><button type="button" className="lf-lab__cerrar" onClick={() => setHoja(false)} aria-label="Cerrar">×</button></div>
        <Controles spec={spec} cat={cat} datos={datos} mutar={mutar} origen={origen} setOrigen={setOrigen} aviso={setMensaje} />
      </aside>
      {hoja && <button type="button" className="lf-velo" aria-label="Cerrar ajustes" onClick={() => setHoja(false)} />}
      <section className="lf-lab__lienzo">
        {mensaje && <p className="lf-lab__msg mono" role="status">{mensaje}</p>}
        <Grafico spec={spec} onSpec={(s) => setSpec(base(s))} onDatos={onDatos} interactivo rangos acciones={
          <div className="lf-lab__acc">
            {origen.tipo === 'spec' && origen.hilo_id && <Link to={`/luffy/h/${origen.hilo_id}`} className="lf-chip">Volver al hilo</Link>}
            <button type="button" className={`lf-chip ${comparar ? 'is-on' : ''}`} onClick={() => setComparar((v) => !v)}>Comparar</button>
          </div>
        } />
        {comparar && datos && <Comparacion datos={datos} />}
        {porPrecio.map((s) => <Distribucion key={s.id} serie={s} />)}
        <button type="button" className="btn btn--esmeralda lf-lab__fab" onClick={() => setHoja(true)}>Ajustar</button>
      </section>
    </div>
  )
}

function Controles({ spec, cat, datos, mutar, origen, setOrigen, aviso }: { spec: SpecEd; cat: Catalogo | null; datos: Datos | null; mutar: (fn: (s: SpecEd) => void) => void; origen: Origen; setOrigen: (o: Origen) => void; aviso: (m: string | null) => void }) {
  const [activoNuevo, setActivoNuevo] = useState('')
  const [parNuevo, setParNuevo] = useState('')
  const [picker, setPicker] = useState<string | null>(null)
  const [nombre, setNombre] = useState(origen.tipo === 'tablero' ? origen.t.nombre : spec.titulo ?? '')
  const [grupo, setGrupo] = useState(origen.tipo === 'tablero' ? origen.t.grupo ?? '' : '')
  const [grupos, setGrupos] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [enlace, setEnlace] = useState<string | null>(null)
  useEffect(() => { luffy.tableros().then((ts) => setGrupos([...new Set(ts.map((t) => t.grupo).filter((g): g is string => !!g))]), () => {}) }, [])
  useEffect(() => { if (origen.tipo === 'tablero') { setNombre(origen.t.nombre); setGrupo(origen.t.grupo ?? '') } }, [origen])
  const etiqueta = (se: SerieSpec) => {
    const c = cat?.series.find((x) => x.tipo === se.tipo)
    const b = se.etiqueta ?? (se.tipo === 'categoria' ? `Categoría · ${se.agregado ?? 'mediana'} de ${se.metrica ?? 'ingresos'}` : se.tipo === 'dataset' ? `Dataset · ${se.dataset ?? ''}` : c?.etiqueta ?? se.tipo)
    return spec.activos.length > 1 || se.rol === 'benchmark' ? `${se.activo ?? ''} · ${b}` : b
  }
  const agregarActivo = (a: string) => { const s = a.trim().toUpperCase().replace(/-USDT$/, ''); if (!s || spec.activos.includes(s)) return; mutar((x) => { x.activos.push(s) }); setActivoNuevo('') }
  const bench = (a: string) => mutar((s) => { if (tieneBench(s, a)) { for (const p of s.paneles) p.series = p.series.filter((x) => !(x.rol === 'benchmark' && x.activo === a && (x.tipo === 'cierre' || x.tipo === 'ohlc'))) } else panelPrecio(s).series.push({ id: idLibre(s, a.toLowerCase()), tipo: 'cierre', activo: a, rol: 'benchmark', estilo: 'linea', eje: 'der', transformaciones: [{ tipo: 'base100' }] }) })
  const categoria = (agregado = 'mediana') => mutar((s) => {
    if (tieneCategoria(s)) { for (const p of s.paneles) p.series = p.series.filter((x) => x.tipo !== 'categoria'); return }
    let p = s.paneles.find((x) => x.series.some((y) => FUNDAMENTALES.includes(y.tipo)))
    if (!p) { p = { id: 'ingresos', titulo: 'Ingresos diarios', altura: 2, escala: 'lineal', series: [{ id: idLibre(s, 'ing'), tipo: 'ingresos', activo: s.activos[0], estilo: 'barras', rol: 'principal', eje: 'izq' }] }; s.paneles.push(p) }
    const metrica = p.series.find((y) => FUNDAMENTALES.includes(y.tipo))?.tipo ?? 'ingresos'
    p.series.push({ id: idLibre(s, 'cat'), tipo: 'categoria', metrica, categoria: 'auto', agregado, activo: s.activos[0], rol: 'benchmark', estilo: 'linea', eje: 'der', transformaciones: [{ tipo: 'base100' }] })
  })
  const catSerie = spec.paneles.flatMap((p) => p.series).find((x) => x.tipo === 'categoria')
  const mostrar = spec.posiciones?.mostrar ?? []
  const posicion = (k: string) => mutar((s) => { const m = new Set(s.posiciones?.mostrar ?? []); if (m.has(k)) m.delete(k); else m.add(k); s.posiciones = { origen: s.posiciones?.origen ?? 'pablo', mostrar: [...m] } })
  const agregarSerie = (panelId: string, c: CatalogoSerie) => mutar((s) => {
    const p = s.paneles.find((x) => x.id === panelId); if (!p) return
    const se: SerieSpec = { id: idLibre(s, c.tipo), tipo: c.tipo, activo: s.activos[0], estilo: c.estilos?.[0] ?? (c.formato === 'valor' && FUNDAMENTALES.includes(c.tipo) ? 'barras' : 'linea'), rol: 'principal', eje: 'izq' }
    if (c.tipo === 'categoria') Object.assign(se, { metrica: p.series.find((y) => FUNDAMENTALES.includes(y.tipo))?.tipo ?? 'ingresos', categoria: 'auto', agregado: 'mediana', rol: 'benchmark', eje: 'der', transformaciones: [{ tipo: 'base100' }] })
    if (c.tipo === 'dataset') Object.assign(se, { dataset: cat?.datasets[0]?.nombre ?? '', campo: 'valor' })
    if (c.tipo === 'pnl') se.origen = s.posiciones?.origen ?? 'pablo'
    p.series.push(se)
  })
  const guardar = async (comoNuevo: boolean) => {
    if (!nombre.trim()) { aviso('Ponle un nombre al tablero.'); return }
    setGuardando(true); aviso(null)
    try {
      const cuerpo = { nombre: nombre.trim(), spec: { ...spec, titulo: spec.titulo || nombre.trim() }, grupo: grupo.trim() || null }
      if (origen.tipo === 'tablero' && !comoNuevo) { const t = await luffy.cambiarTablero(origen.t.id, cuerpo); setOrigen({ tipo: 'tablero', t }); aviso(`Guardado en «${t.nombre}».`) }
      else { const t = await luffy.crearTablero(cuerpo); setOrigen({ tipo: 'tablero', t }); aviso(`Guardado como tablero nuevo: «${t.nombre}».`) }
    } catch (e) { aviso(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`) } finally { setGuardando(false) }
  }
  const compartir = async () => {
    try { const s = await luffy.guardarSpec(spec, spec.titulo, origen.tipo === 'spec' ? origen.hilo_id : null); const url = `${location.origin}/luffy/laboratorio/${s.spec_id}`; setEnlace(url); try { await navigator.clipboard.writeText(url); aviso('Enlace copiado.') } catch { aviso('Enlace listo.') } }
    catch (e) { aviso(`No se pudo crear el enlace: ${e instanceof Error ? e.message : String(e)}`) }
  }
  const transfLabel = (t: Transformacion) => t.tipo === 'media_movil' ? `media móvil ${t.ventana ?? 7}` : t.tipo === 'ratio' ? `ratio contra ${t.contra ?? '?'}` : (cat?.transformaciones.find((x) => x.tipo === t.tipo)?.etiqueta ?? t.tipo).toLowerCase()
  const grupos_cat = useMemo(() => { const g = new Map<string, CatalogoSerie[]>(); for (const s of cat?.series ?? []) { if (!g.has(s.grupo)) g.set(s.grupo, []); g.get(s.grupo)!.push(s) } return [...g] }, [cat])

  return (
    <div className="lf-ctrl">
      <label className="lf-ctrl__campo"><span className="mono">Título</span><input value={spec.titulo ?? ''} onChange={(e) => { const v = e.target.value; mutar((s) => { s.titulo = v }) }} placeholder="Título del gráfico" /></label>

      <section className="lf-ctrl__sec">
        <h3 className="mono">Activos</h3>
        <div className="lf-chips">
          {spec.activos.map((a) => <span key={a} className="lf-chip is-on">{a}{spec.activos.length > 1 && <button type="button" aria-label={`Quitar ${a}`} onClick={() => mutar((s) => { s.activos = s.activos.filter((x) => x !== a) })}>×</button>}</span>)}
          <form className="lf-ctrl__add" onSubmit={(e) => { e.preventDefault(); agregarActivo(activoNuevo) }}>
            <input list="lf-activos" value={activoNuevo} onChange={(e) => setActivoNuevo(e.target.value)} placeholder="+ activo" aria-label="Agregar activo" />
            <datalist id="lf-activos">{cat?.activos.slice(0, 200).map((a) => <option key={a.simbolo} value={a.simbolo}>{a.nombre}{a.en_posicion ? ' · en posición' : ''}</option>)}</datalist>
          </form>
        </div>
      </section>

      <section className="lf-ctrl__sec lf-ctrl__dos">
        <div><h3 className="mono">Rango</h3><div className="lf-seg">{(cat?.rangos ?? ['30d', '60d', '90d', '6m', '1y', 'max']).map((r) => <button key={r} type="button" className={spec.rango === r ? 'is-on' : ''} onClick={() => mutar((s) => { s.rango = r })}>{RANGO_LABEL[r] ?? r}</button>)}</div></div>
        <div><h3 className="mono">Intervalo</h3><div className="lf-seg">{(cat?.intervalos ?? ['1h', '4h', '1d', '1w']).map((r) => <button key={r} type="button" className={spec.intervalo === r ? 'is-on' : ''} onClick={() => mutar((s) => { s.intervalo = r })}>{INTERVALO_LABEL[r] ?? r}</button>)}</div></div>
      </section>

      <section className="lf-ctrl__sec">
        <h3 className="mono">Comparar contra</h3>
        <div className="lf-chips">
          {['BTC', 'ETH'].map((a) => <button key={a} type="button" className={`lf-chip ${tieneBench(spec, a) ? 'is-on' : ''}`} onClick={() => bench(a)}>{a}</button>)}
          <button type="button" className={`lf-chip ${catSerie ? 'is-on' : ''}`} onClick={() => categoria()} data-prueba="categoria">Mediana de la categoría</button>
          {catSerie && <select className="lf-ctrl__mini" value={catSerie.agregado ?? 'mediana'} onChange={(e) => { const v = e.target.value; mutar((s) => { for (const p of s.paneles) for (const x of p.series) if (x.tipo === 'categoria') x.agregado = v }) }} aria-label="Agregado de la categoría">{['mediana', 'media', 'suma'].map((a) => <option key={a} value={a}>{a}</option>)}</select>}
          <form className="lf-ctrl__add" onSubmit={(e) => { e.preventDefault(); const p = parNuevo.trim().toUpperCase().replace(/-USDT$/, ''); if (p) { bench(p); setParNuevo('') } }}>
            <input list="lf-activos" value={parNuevo} onChange={(e) => setParNuevo(e.target.value)} placeholder="+ otro par" aria-label="Comparar contra otro par" />
          </form>
        </div>
      </section>

      <section className="lf-ctrl__sec">
        <h3 className="mono">Tu posición encima</h3>
        <div className="lf-chips">
          <select className="lf-ctrl__mini" value={spec.posiciones?.origen ?? 'pablo'} onChange={(e) => { const v = e.target.value; mutar((s) => { s.posiciones = { origen: v, mostrar: s.posiciones?.mostrar ?? ['entradas', 'salidas', 'stop'] } }) }} aria-label="Origen de las posiciones">{(cat?.origenes_posiciones ?? ['pablo', 'caja', 'ambos']).map((o) => <option key={o} value={o}>{o === 'pablo' ? 'Pablo' : o === 'caja' ? 'la caja' : 'Pablo y la caja'}</option>)}</select>
          {MOSTRAR.map(([k, l]) => <button key={k} type="button" className={`lf-chip ${mostrar.includes(k) ? 'is-on' : ''}`} onClick={() => posicion(k)} data-prueba={`pos-${k}`}>{l}</button>)}
        </div>
        {datos?.posiciones.length ? <p className="lf-ctrl__nota mono">{datos.posiciones.map((p) => `${p.activo} · ${p.origen === 'caja' ? 'caja' : 'Pablo'} · ${p.estado}${p.simulado ? ' · simulada' : ''} · ${fmt(p.cantidad)} a ${fmt(p.precio_medio)}${p.pnl_no_realizado_usdt !== null ? ` · ${p.pnl_no_realizado_usdt >= 0 ? '+' : ''}${fmt(p.pnl_no_realizado_usdt, 'USDT')}` : ''}`).join(' / ')}</p> : null}
      </section>

      <section className="lf-ctrl__sec">
        <h3 className="mono">Paneles</h3>
        {spec.paneles.map((p, pi) => (
          <div key={p.id} className="lf-panel">
            <div className="lf-panel__cab">
              <input className="lf-panel__t" value={p.titulo ?? ''} onChange={(e) => { const v = e.target.value; mutar((s) => { s.paneles[pi].titulo = v }) }} placeholder={p.id} aria-label="Título del panel" />
              <div className="lf-seg lf-seg--mini"><button type="button" className={p.escala !== 'log' ? 'is-on' : ''} onClick={() => mutar((s) => { s.paneles[pi].escala = 'lineal' })}>lin</button><button type="button" className={p.escala === 'log' ? 'is-on' : ''} onClick={() => mutar((s) => { s.paneles[pi].escala = 'log' })}>log</button></div>
              <span className="lf-panel__alt mono" title="Altura relativa"><button type="button" onClick={() => mutar((s) => { s.paneles[pi].altura = Math.max(1, (s.paneles[pi].altura ?? 1) - 1) })}>−</button>{p.altura ?? 1}<button type="button" onClick={() => mutar((s) => { s.paneles[pi].altura = Math.min(5, (s.paneles[pi].altura ?? 1) + 1) })}>+</button></span>
              {spec.paneles.length > 1 && <button type="button" className="lf-panel__x" aria-label="Quitar panel" onClick={() => mutar((s) => { s.paneles.splice(pi, 1) })}>×</button>}
            </div>
            {p.series.map((se, si) => (
              <div key={se.id} className={`lf-serie lf-serie--${se.rol ?? 'principal'}`}>
                <div className="lf-serie__fila">
                  <span className="lf-serie__n">{etiqueta(se)}</span>
                  <select className="lf-ctrl__mini" value={se.estilo ?? 'linea'} onChange={(e) => { const v = e.target.value; mutar((s) => { s.paneles[pi].series[si].estilo = v as SerieSpec['estilo'] }) }} aria-label="Estilo">{((cat?.series.find((x) => x.tipo === se.tipo)?.estilos) ?? cat?.estilos ?? ['linea', 'area', 'barras', 'velas', 'puntos']).map((x) => <option key={x} value={x}>{x}</option>)}</select>
                  <select className="lf-ctrl__mini" value={se.eje ?? 'izq'} onChange={(e) => { const v = e.target.value; mutar((s) => { s.paneles[pi].series[si].eje = v as 'izq' | 'der' }) }} aria-label="Eje"><option value="izq">eje 1</option><option value="der">eje 2</option></select>
                  <button type="button" className="lf-panel__x" aria-label="Quitar serie" onClick={() => mutar((s) => { s.paneles[pi].series.splice(si, 1) })}>×</button>
                </div>
                {spec.activos.length > 1 && <select className="lf-ctrl__mini" value={se.activo ?? spec.activos[0]} onChange={(e) => { const v = e.target.value; mutar((s) => { s.paneles[pi].series[si].activo = v }) }} aria-label="Activo de la serie">{spec.activos.map((a) => <option key={a} value={a}>{a}</option>)}</select>}
                <div className="lf-chips lf-chips--transf">
                  {(se.transformaciones ?? []).map((t, ti) => (
                    <span key={ti} className="lf-chip is-on lf-chip--t">{transfLabel(t)}
                      {t.tipo === 'media_movil' && <input type="number" min={2} max={200} value={t.ventana ?? 7} onChange={(e) => { const v = e.target.value; mutar((s) => { s.paneles[pi].series[si].transformaciones![ti].ventana = Number(v) || 7 }) }} aria-label="Ventana" />}
                      {t.tipo === 'ratio' && <select value={t.contra ?? ''} onChange={(e) => { const v = e.target.value; mutar((s) => { s.paneles[pi].series[si].transformaciones![ti].contra = v }) }} aria-label="Contra"><option value="">serie…</option>{spec.paneles.flatMap((q) => q.series).filter((x) => x.id !== se.id).map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}</select>}
                      <button type="button" aria-label="Quitar transformación" onClick={() => mutar((s) => { s.paneles[pi].series[si].transformaciones!.splice(ti, 1) })}>×</button>
                    </span>
                  ))}
                  <select className="lf-ctrl__mini" value="" onChange={(e) => { const tipo = e.target.value; if (!tipo) return; mutar((s) => { const x = s.paneles[pi].series[si]; x.transformaciones = [...(x.transformaciones ?? []), tipo === 'media_movil' ? { tipo, ventana: 7 } : tipo === 'ratio' ? { tipo, contra: '' } : { tipo }] }) }} aria-label="Agregar transformación">
                    <option value="">+ transformación</option>
                    {(cat?.transformaciones ?? []).filter((t) => t.tipo !== 'log' && (!t.aplica || t.aplica.includes(se.tipo))).map((t) => <option key={t.tipo} value={t.tipo}>{t.etiqueta}</option>)}
                  </select>
                </div>
              </div>
            ))}
            <button type="button" className="lf-chip lf-chip--oro" onClick={() => setPicker(picker === p.id ? null : p.id)}>{picker === p.id ? 'Cerrar catálogo' : '+ serie'}</button>
            {picker === p.id && (
              <div className="lf-picker">
                {grupos_cat.map(([g, ss]) => (
                  <div key={g} className="lf-picker__grupo">
                    <span className="mono">{GRUPO_LABEL[g] ?? g}</span>
                    {ss.map((c) => <button key={c.tipo} type="button" className="lf-picker__item" title={`${c.fuente}${c.nota ? ` · ${c.nota}` : ''}`} onClick={() => { agregarSerie(p.id, c); setPicker(null) }}>{c.etiqueta}<em>{c.unidad ?? c.formato}</em></button>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <button type="button" className="lf-chip" onClick={() => mutar((s) => { s.paneles.push({ id: `panel_${Date.now().toString(36)}`, titulo: 'Panel nuevo', altura: 1, escala: 'lineal', series: [] }) })}>+ panel</button>
      </section>

      <section className="lf-ctrl__sec lf-ctrl__guardar">
        <h3 className="mono">Guardar en tableros</h3>
        <label className="lf-ctrl__campo"><span className="mono">Nombre</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del tablero" data-prueba="nombre-tablero" /></label>
        <label className="lf-ctrl__campo"><span className="mono">Grupo</span><input list="lf-grupos" value={grupo} onChange={(e) => setGrupo(e.target.value)} placeholder="Opcional" /><datalist id="lf-grupos">{grupos.map((g) => <option key={g} value={g} />)}</datalist></label>
        <div className="lf-ctrl__botones">
          <button type="button" className="btn btn--esmeralda" disabled={guardando} onClick={() => guardar(false)} data-prueba="guardar-tablero">{guardando ? 'Guardando…' : origen.tipo === 'tablero' ? 'Guardar cambios' : 'Guardar en tablero'}</button>
          {origen.tipo === 'tablero' && <button type="button" className="btn btn--ghost" disabled={guardando} onClick={() => guardar(true)}>Guardar como nuevo</button>}
          <button type="button" className="btn btn--ghost" onClick={compartir}>Enlace</button>
        </div>
        {enlace && <p className="lf-ctrl__nota mono"><Link to={enlace.replace(location.origin, '')}>{enlace}</Link></p>}
        {origen.tipo === 'tablero' && <p className="lf-ctrl__nota mono">Tablero #{origen.t.id} · <Link to="/luffy/tableros">ver tableros</Link></p>}
      </section>
    </div>
  )
}
