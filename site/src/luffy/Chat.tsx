import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ErrorLuffy, leerImagen, luffy, urlPng } from './api'
import type { Confirmacion, EventoChat, Fin, GraficoRef, HiloDetalle, HiloResumen, Mensaje, PropuestaResumen } from './tipos'
import { Md, aTextoPlano } from './md'
import { Grafico } from './charts/Grafico'
import { fmtHora, fmtUsd, hace, quedan } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* ============================================================================
   El chat con Luffy. Los hilos son los mismos de Telegram. La respuesta llega
   en streaming con el paso en curso visible; los gráficos se dibujan
   interactivos dentro del mensaje y las órdenes propuestas son tarjetas con
   Confirmar y Cancelar (la confirmación es por código, nunca por el modelo).
   ========================================================================== */

interface Turno { pregunta: string; imagenes: string[]; paso: string | null; texto: string; graficos: GraficoRef[]; propuestas: PropuestaResumen[]; avisos: string[]; error: string | null; fin: Fin | null }

export function Chat() {
  const { hiloId } = useParams()
  const loc = useLocation()
  const [hilos, setHilos] = useState<HiloResumen[] | null>(null)
  const [errorHilos, setErrorHilos] = useState<string | null>(null)
  const [cajon, setCajon] = useState(false)
  const cargarHilos = useCallback(async () => { try { setHilos(await luffy.hilos()); setErrorHilos(null) } catch (e) { setErrorHilos(e instanceof ErrorLuffy ? e.message : String(e)) } }, [])
  useEffect(() => { void cargarHilos() }, [cargarHilos])
  useEffect(() => { setCajon(false) }, [loc.pathname])
  const activo = hiloId ?? hilos?.find((h) => h.telegram_activo)?.id ?? hilos?.[0]?.id ?? null
  return (
    <div className="lf-chat">
      <aside className={`lf-hilos ${cajon ? 'is-open' : ''}`} aria-label="Hilos">
        <ListaHilos hilos={hilos} error={errorHilos} activo={activo} recargar={cargarHilos} />
      </aside>
      {cajon && <button type="button" className="lf-velo" aria-label="Cerrar hilos" onClick={() => setCajon(false)} />}
      <section className="lf-conv">
        {activo ? <Conversacion key={activo} id={activo} alCambiar={cargarHilos} abrirCajon={() => setCajon(true)} />
          : hilos && !hilos.length ? <div className="lf-conv__vacio"><EmptyState kind="vacio" title="Todavía no hay hilos." detail="Crea uno a la izquierda y escríbele a Luffy." /></div>
          : errorHilos ? <div className="lf-conv__vacio"><EmptyState kind="error" title="Luffy no responde." detail={errorHilos} /></div>
          : <div className="lf-conv__vacio"><span className="lf-gema is-latiendo" /></div>}
      </section>
    </div>
  )
}

/* Los hilos de prueba, los clones del banco de calidad y los bancos no son conversación: van a un
   grupo «Archivo», plegado. La vista previa es el último mensaje visible, en texto plano, no el
   memo interno del resumen vivo. */
const esArchivo = (h: HiloResumen) => /\b(prueba|clon|clones|banco|test)\b/i.test(h.titulo)
function ListaHilos({ hilos, error, activo, recargar }: { hilos: HiloResumen[] | null; error: string | null; activo: string | null; recargar: () => Promise<void> }) {
  const [nuevo, setNuevo] = useState(false)
  const [previas, setPrevias] = useState<Record<string, string>>({})
  const claveHilos = hilos?.map((h) => `${h.id}:${h.actualizado}`).join('|') ?? ''
  useEffect(() => {
    if (!hilos) return
    let v = true
    const visibles = hilos.filter((h) => !esArchivo(h)).slice(0, 24)
    Promise.all(visibles.map(async (h): Promise<[string, string]> => {
      try { const d = await luffy.hilo(h.id, 4); const m = [...d.mensajes].reverse().find((x) => x.rol === 'luffy' || x.rol === 'usuario'); return [h.id, m ? aTextoPlano(m.contenido).slice(0, 180) : ''] } catch { return [h.id, ''] }
    })).then((ps) => { if (v) setPrevias(Object.fromEntries(ps)) })
    return () => { v = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se recarga cuando cambia la lista o la fecha de algún hilo
  }, [claveHilos])
  const fila = (h: HiloResumen) => (
    <Link key={h.id} to={`/luffy/h/${h.id}`} className={`lf-hilo ${h.id === activo ? 'is-activo' : ''}`}>
      <span className="lf-hilo__t">{h.titulo}</span>
      {previas[h.id] ? <span className="lf-hilo__r">{previas[h.id]}</span> : null}
      <span className="lf-hilo__m mono">{hace(h.actualizado)} · {h.n_mensajes} msj{h.telegram_activo && <em>Telegram</em>}</span>
    </Link>
  )
  const vivos = hilos?.filter((h) => !esArchivo(h)) ?? [], archivo = hilos?.filter(esArchivo) ?? []
  const [titulo, setTitulo] = useState('')
  const [creando, setCreando] = useState(false)
  const crear = async (e: FormEvent) => { e.preventDefault(); if (!titulo.trim()) return; setCreando(true); try { await luffy.crearHilo(titulo.trim()); setTitulo(''); setNuevo(false); await recargar() } finally { setCreando(false) } }
  return (
    <>
      <div className="lf-hilos__cab">
        <span className="mono">Hilos</span>
        <button type="button" className="lf-hilos__nuevo mono" onClick={() => setNuevo((v) => !v)}>{nuevo ? 'Cerrar' : '+ Nuevo'}</button>
      </div>
      {nuevo && (
        <form className="lf-hilos__form" onSubmit={crear}>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título del hilo" autoFocus maxLength={80} />
          <button type="submit" className="btn btn--esmeralda" disabled={creando || !titulo.trim()}>{creando ? 'Creando…' : 'Crear'}</button>
        </form>
      )}
      {error && <p className="lf-hilos__error">{error}</p>}
      <div className="lf-hilos__lista">
        {vivos.map(fila)}
        {archivo.length > 0 && (
          <details className="lf-hilos__archivo" open={!!activo && archivo.some((h) => h.id === activo)}>
            <summary className="mono">Archivo · {archivo.length} hilo{archivo.length > 1 ? 's' : ''} de prueba</summary>
            {archivo.map(fila)}
          </details>
        )}
      </div>
    </>
  )
}

function Conversacion({ id, alCambiar, abrirCajon }: { id: string; alCambiar: () => Promise<void>; abrirCajon: () => void }) {
  const [det, setDet] = useState<HiloDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [turno, setTurno] = useState<Turno | null>(null)
  const [texto, setTexto] = useState('')
  const [imagenes, setImagenes] = useState<{ f: File; url: string }[]>([])
  const [aviso, setAviso] = useState<string | null>(null)
  const [renombrando, setRenombrando] = useState<string | null>(null)
  const lista = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const fichero = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => { try { setDet(await luffy.hilo(id)); setError(null) } catch (e) { setError(e instanceof ErrorLuffy ? e.message : String(e)) } }, [id])
  useEffect(() => { void cargar() }, [cargar])
  const nMsj = det?.mensajes.length ?? 0, nTexto = turno?.texto.length ?? 0, nGraf = turno?.graficos.length ?? 0, paso = turno?.paso ?? null
  useEffect(() => { const el = lista.current; if (el) el.scrollTop = el.scrollHeight }, [nMsj, nTexto, nGraf, paso])
  useEffect(() => { const a = area.current; if (!a) return; a.style.height = 'auto'; a.style.height = `${Math.min(180, a.scrollHeight)}px` }, [texto])

  const agregarImagenes = (fs: FileList | null) => {
    if (!fs) return
    const nuevas = [...fs].filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type) && f.size <= 5 * 1024 * 1024).slice(0, 4 - imagenes.length).map((f) => ({ f, url: URL.createObjectURL(f) }))
    if (nuevas.length) setImagenes((x) => [...x, ...nuevas])
  }
  const enviar = async (forzado?: string) => {
    const t = (forzado ?? texto).trim()
    if ((!t && !imagenes.length) || turno) return
    const imgs = await Promise.all(imagenes.map((i) => leerImagen(i.f)))
    setTurno({ pregunta: t, imagenes: imagenes.map((i) => i.url), paso: 'enviando', texto: '', graficos: [], propuestas: [], avisos: [], error: null, fin: null })
    setTexto(''); setImagenes([]); setAviso(null)
    const onEvento = (ev: EventoChat) => setTurno((x) => {
      if (!x) return x
      switch (ev.tipo) {
        case 'inicio': return { ...x, paso: 'leyendo' }
        case 'paso': return ev.paso ? { ...x, paso: ev.paso } : x
        case 'texto': return { ...x, texto: x.texto + ev.texto, paso: null }
        case 'grafico': return { ...x, graficos: [...x.graficos, ev] }
        case 'propuesta': return { ...x, propuestas: [...x.propuestas, ev] }
        case 'aviso': return { ...x, avisos: [...x.avisos, ev.texto] }
        case 'error': return { ...x, error: ev.texto, paso: null }
        case 'fin': return { ...x, fin: ev, texto: ev.texto || x.texto, paso: null, error: ev.error ?? x.error }
        default: return x
      }
    })
    try {
      // un hilo «Terminal · WAL» lleva la ficha del activo como contexto compacto (CONTRATO-PANEL.md §8.1)
      const delTerminal = /^Terminal · ([A-Z0-9]+)$/.exec(det?.hilo.titulo ?? '')
      await luffy.chat({ hilo_id: id, texto: t, modo: 'auto', imagenes: imgs.length ? imgs : undefined, contexto: delTerminal ? { tipo: 'terminal', activo: delTerminal[1] } : undefined }, onEvento)
    } catch (e) {
      if (e instanceof ErrorLuffy && e.codigo === 'en_curso') { setAviso(e.message); setTurno(null); setTexto(t); return }
      setTurno((x) => (x ? { ...x, error: e instanceof Error ? e.message : String(e), paso: null } : x))
      return
    }
    await cargar(); setTurno(null); void alCambiar()
  }
  const alTeclado = (e: React.KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar() } }
  const usarEnTelegram = async () => { await luffy.cambiarHilo(id, { telegram_activo: true }); await cargar(); void alCambiar() }
  const renombrar = async (e: FormEvent) => { e.preventDefault(); if (renombrando?.trim()) { await luffy.cambiarHilo(id, { titulo: renombrando.trim() }); setRenombrando(null); await cargar(); void alCambiar() } }
  const cambiarPropuesta = (idCorto: string) => { setTexto(`cambiar (propuesta #${idCorto}): `); area.current?.focus() }

  if (error && !det) return <div className="lf-conv__vacio"><EmptyState kind="error" title="No se pudo abrir el hilo." detail={error} /></div>
  return (
    <>
      <div className="lf-conv__cab">
        <button type="button" className="lf-conv__hilos mono" onClick={abrirCajon}>Hilos</button>
        {renombrando !== null ? (
          <form className="lf-conv__ren" onSubmit={renombrar}><input value={renombrando} onChange={(e) => setRenombrando(e.target.value)} autoFocus maxLength={80} /><button type="submit" className="btn btn--esmeralda">Guardar</button><button type="button" className="btn btn--ghost" onClick={() => setRenombrando(null)}>Cancelar</button></form>
        ) : (
          <h1 className="lf-conv__t" onDoubleClick={() => setRenombrando(det?.hilo.titulo ?? '')} title="Doble clic para renombrar">{det?.hilo.titulo ?? '…'}</h1>
        )}
        <div className="lf-conv__acciones mono">
          {det?.telegram_activo ? <span className="lf-tg is-on">Telegram</span> : det ? <button type="button" className="lf-tg" onClick={usarEnTelegram} title="Que el bot de Telegram escriba en este hilo">Usar en Telegram</button> : null}
          {det && renombrando === null && <button type="button" className="lf-conv__ren-btn" onClick={() => setRenombrando(det.hilo.titulo)}>Renombrar</button>}
        </div>
      </div>
      {/^Terminal · /.test(det?.hilo.titulo ?? '') ? <p className="lf-conv__resumen">Luffy ve la ficha del terminal de {det!.hilo.titulo.split(' · ')[1]} en cada turno de este hilo. <Link to={`/luffy/terminal/${det!.hilo.titulo.split(' · ')[1]}`} className="lf-nota__ir mono">abrir la ficha</Link></p> : det?.resumen_vivo && !/^(\*\*)?RESUMEN VIVO/i.test(det.resumen_vivo) ? <p className="lf-conv__resumen">{det.resumen_vivo}</p> : null}
      <div className="lf-conv__lista" ref={lista}>
        {det?.mensajes.map((m) => <Burbuja key={m.id} m={m} alCambiar={cargar} cambiar={cambiarPropuesta} />)}
        {turno && <TurnoVivo t={turno} cambiar={cambiarPropuesta} />}
        {det && !det.mensajes.length && !turno && <p className="lf-conv__nada">Hilo nuevo. Escríbele a Luffy.</p>}
      </div>
      <form className={`lf-comp ${turno ? 'is-pensando' : ''}`} onSubmit={(e) => { e.preventDefault(); void enviar() }}>
        {aviso && <p className="lf-comp__aviso">{aviso}</p>}
        {imagenes.length > 0 && (
          <div className="lf-comp__imgs">{imagenes.map((i, k) => <span key={k} className="lf-comp__img"><img src={i.url} alt="" /><button type="button" aria-label="Quitar" onClick={() => setImagenes((x) => x.filter((_, j) => j !== k))}>×</button></span>)}</div>
        )}
        <div className="lf-comp__fila">
          <button type="button" className="lf-comp__adj mono" onClick={() => fichero.current?.click()} disabled={!!turno || imagenes.length >= 4} title="Adjuntar imagen (hasta 4, 5 MB cada una)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /><path d="M19 22v-6m-3 3h6" /></svg>
          </button>
          <input ref={fichero} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={(e) => { agregarImagenes(e.target.files); e.target.value = '' }} />
          <textarea ref={area} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={alTeclado} onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); agregarImagenes(e.clipboardData.files) } }} placeholder={turno ? 'Luffy está trabajando…' : 'Escríbele a Luffy'} rows={1} disabled={!!turno} />
          <button type="submit" className="btn btn--esmeralda lf-comp__enviar" disabled={!!turno || (!texto.trim() && !imagenes.length)}>Enviar</button>
        </div>
      </form>
    </>
  )
}

function Meta({ ts, modelo, costo, herramientas }: { ts?: string; modelo?: string | null; costo?: number; herramientas?: string[] }) {
  return (
    <span className="lf-m__meta mono">
      {ts && <span>{fmtHora(ts)}</span>}
      {modelo && <span>{modelo.replace('claude-', '')}</span>}
      {typeof costo === 'number' && costo > 0 && <span className="num">{fmtUsd(costo, 3)}</span>}
      {herramientas?.length ? <span className="lf-m__herr">{[...new Set(herramientas)].join(' · ')}</span> : null}
    </span>
  )
}

function Burbuja({ m, alCambiar, cambiar }: { m: Mensaje; alCambiar: () => Promise<void>; cambiar: (id: string) => void }) {
  if (m.rol === 'sistema') return null
  if (m.rol === 'usuario') return <div className="lf-m lf-m--yo"><div className="lf-m__cuerpo">{m.contenido}</div><Meta ts={m.ts} /></div>
  if (m.rol === 'ejecucion') return <div className="lf-m lf-m--ejecucion"><span className="lf-gema" /><pre>{m.contenido}</pre><Meta ts={m.ts} /></div>
  return (
    <div className="lf-m lf-m--luffy">
      <span className="lf-m__quien mono"><span className="lf-gema" />Luffy</span>
      <Md texto={m.contenido} />
      {m.graficos?.map((g, i) => <GraficoMensaje key={g.spec_id ?? `${m.id}-${i}`} g={g} />)}
      {m.propuestas?.map((p) => <TarjetaPropuesta key={p.id_corto} p={p} alCambiar={alCambiar} cambiar={cambiar} />)}
      <Meta ts={m.ts} modelo={m.modelo} costo={m.costo_usd} herramientas={m.herramientas_usadas?.map((h) => h.nombre)} />
    </div>
  )
}

function TurnoVivo({ t, cambiar }: { t: Turno; cambiar: (id: string) => void }) {
  return (
    <>
      <div className="lf-m lf-m--yo"><div className="lf-m__cuerpo">{t.imagenes.map((u, i) => <img key={i} className="lf-m__img" src={u} alt="" />)}{t.pregunta}</div></div>
      <div className="lf-m lf-m--luffy is-vivo" aria-live="polite">
        <span className="lf-m__quien mono"><span className={`lf-gema ${!t.fin ? 'is-latiendo' : ''}`} />Luffy</span>
        {t.paso && <p className="lf-m__paso mono"><span className="lf-m__paso-pt" />{t.paso}…</p>}
        {t.texto && <Md texto={t.texto} />}
        {t.graficos.map((g, i) => <GraficoMensaje key={g.spec_id ?? i} g={g} />)}
        {t.propuestas.map((p) => <TarjetaPropuesta key={p.id_corto} p={p} alCambiar={async () => {}} cambiar={cambiar} />)}
        {t.avisos.map((a, i) => <p key={i} className="lf-m__aviso">{a}</p>)}
        {t.error && <p className="lf-m__error">No se pudo terminar el turno: {t.error}</p>}
        {t.fin && !t.error && <Meta ts={t.fin.hora} modelo={t.fin.modelo} costo={t.fin.costo_usd} herramientas={t.fin.herramientas} />}
      </div>
    </>
  )
}

function GraficoMensaje({ g }: { g: GraficoRef }) {
  if (!g.spec_id) return g.url ? <figure className="lf-m__fig"><img src={urlPng(g.url)} alt={g.titulo} loading="lazy" /><figcaption className="mono">{g.titulo}</figcaption></figure> : null
  return <Grafico specId={g.spec_id} compacto png={urlPng(g.url)} acciones={<Link to={`/luffy/laboratorio/${g.spec_id}`} className="lf-chip lf-chip--oro">Abrir en el laboratorio</Link>} />
}

const ACCION_LABEL: Record<string, string> = { entrada: 'Entrada', mover_stop: 'Mover el stop', cerrar: 'Cerrar', cancelar: 'Cancelar orden', cambio_mandato: 'Cambio de mandato' }
const ESTADO_LABEL: Record<string, string> = { propuesta: 'esperando tu confirmación', confirmada: 'confirmada', enviada: 'enviada', parcial: 'parcialmente llena', llena: 'ejecutada', cancelada: 'cancelada', rechazada: 'cancelada', fallida: 'falló', expirada: 'expiró', reemplazada: 'reemplazada' }

export function TarjetaPropuesta({ p, alCambiar, cambiar }: { p: PropuestaResumen; alCambiar: () => Promise<void>; cambiar: (id: string) => void }) {
  const [estado, setEstado] = useState(p.estado)
  const [paso, setPaso] = useState<'quieto' | 'confirmando' | 'enviando' | 'cancelando'>('quieto')
  const [resultado, setResultado] = useState<Confirmacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloj, setReloj] = useState(() => quedan(p.expira))
  useEffect(() => { if (estado !== 'propuesta') return; const t = setInterval(() => setReloj(quedan(p.expira)), 1000); return () => clearInterval(t) }, [estado, p.expira])
  const expirada = estado === 'propuesta' && reloj === null && !!p.expira
  const pendiente = estado === 'propuesta' && !expirada
  const confirmar = async () => {
    setPaso('enviando'); setError(null)
    try { const r = await luffy.confirmar(p.id_corto); setResultado(r); setEstado(r.ok ? (r.estado ?? 'llena') : (r.propuesta?.estado ?? 'fallida')); if (!r.ok) setError(r.error ?? 'no se ejecutó'); void alCambiar() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setPaso('quieto') }
  }
  const cancelar = async () => {
    setPaso('cancelando'); setError(null)
    try { await luffy.rechazar(p.id_corto); setEstado('cancelada'); void alCambiar() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setPaso('quieto') }
  }
  const tono = estado === 'llena' || estado === 'confirmada' || estado === 'enviada' || estado === 'parcial' ? 'esm' : pendiente ? 'oro' : estado === 'fallida' ? 'rojo' : 'mudo'
  return (
    <div className={`lf-prop lf-prop--${tono}`}>
      <div className="lf-prop__cab mono">
        <span className="lf-prop__accion">{ACCION_LABEL[p.accion] ?? p.accion} · <b>{p.par}</b>{p.lado ? ` · ${p.lado}` : ''}{p.mandato ? ` · ${p.mandato}` : ''}</span>
        <span className="lf-prop__estado">#{p.id_corto} · {expirada ? 'expiró' : ESTADO_LABEL[estado] ?? estado}{pendiente && reloj ? <b className="num"> · {reloj}</b> : null}</span>
      </div>
      {p.bloque && <pre className="lf-prop__bloque">{p.bloque}</pre>}
      {pendiente && paso !== 'enviando' && paso !== 'cancelando' && (
        paso === 'confirmando' ? (
          <div className="lf-prop__botones">
            <span className="lf-prop__pregunta">Se envía a BingX tal como está escrito arriba.</span>
            <button type="button" className="btn btn--esmeralda" onClick={confirmar}>Sí, enviar la orden</button>
            <button type="button" className="btn btn--ghost" onClick={() => setPaso('quieto')}>Volver</button>
          </div>
        ) : (
          <div className="lf-prop__botones">
            <button type="button" className="btn btn--esmeralda" onClick={() => setPaso('confirmando')}>Confirmar</button>
            <button type="button" className="btn btn--ghost" onClick={() => cambiar(p.id_corto)}>Cambiar</button>
            <button type="button" className="btn btn--ghost lf-prop__cancelar" onClick={cancelar}>Cancelar</button>
          </div>
        )
      )}
      {(paso === 'enviando' || paso === 'cancelando') && <p className="lf-prop__nota mono"><span className="lf-gema is-latiendo" />{paso === 'enviando' ? 'Enviando la orden…' : 'Cancelando…'}</p>}
      {resultado?.ok && (
        <div className="lf-prop__res">
          <pre>{resultado.texto}</pre>
          {resultado.fills?.length ? <p className="mono">{resultado.fills.length} ejecución{resultado.fills.length > 1 ? 'es' : ''}{resultado.stop ? ` · stop ${resultado.stop.ok ? 'colocado' : 'NO colocado'} en ${resultado.stop.precio}` : ''}</p> : null}
          {resultado.alertas?.length ? <p className="lf-prop__alerta">{resultado.alertas.join(' · ')}</p> : null}
        </div>
      )}
      {error && <p className="lf-m__error">{error}</p>}
    </div>
  )
}
