import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Cabecera } from '../Shell'
import { ProveedorNivel, TierBadge, Volver } from '../piezas'
import { Cuerpo } from './InformeDetalle'
import { api, ErrorApi, invalidarDatos } from '../../lib/datos'
import { useRol } from '../../lib/acceso'
import { useSesion } from '../../lib/sesion'
import { fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'
import type { Informe } from '../../lib/contrato'
import {
  LecturaDeterminista, SinDatosAun, Decidir, EscenaAnalisis, Etapas, Transcurrido, BotonAviso, CupoChip, Nota, useCupo, useUniverso, llano,
  FormatoAceptado, Candidatas, SinCoincidencia, NoAnalizable, InformeNarrado, narradoDe,
  type Lectura, type Cupo, type Solicitud, type Moneda, type Candidata, type Resolucion,
} from '../analizar/piezasAnalizar'

/* ============================================================================
   Analiza tu moneda.

   1. Buscás una moneda. 2. Ves la lectura estructural, gratis, al instante.
   3. Sólo entonces decides si gastar un análisis del cupo. 4. La espera es un
   momento: la roca refleja el avance real. 5. El resultado es tuyo; la mesa
   decide después si vale publicarlo. Nunca dice "es gema".
   ========================================================================== */

interface Elegida { contrato?: string | null; cadena?: string | null; nombre?: string }

export function Analizar() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const { rol } = useRol()
  const universo = useUniverso()
  const cupoSt = useCupo()
  const [q, setQ] = useState(params.get('m') ?? '')
  const [lectura, setLectura] = useState<{ l: Lectura | null; sin_datos: { codigo: string; texto: string } | null; moneda: Moneda | null; cupo: Cupo | null; puede_profundo: boolean } | null>(null)
  const [resol, setResol] = useState<Resolucion | null>(null)
  const [noAnalizable, setNoAnalizable] = useState<Moneda | null>(null)
  const [elegida, setElegida] = useState<Elegida | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pidiendo, setPidiendo] = useState(false)
  const [errorPedido, setErrorPedido] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const monedas = universo.estado === 'ok' ? universo.datos.monedas : []
  const sugerencias = useMemo(() => {
    const t = q.trim().toLowerCase(); if (!t) return monedas.filter((m) => m.con_informe).slice(0, 6)
    return monedas.filter((m) => m.simbolo.toLowerCase().startsWith(t) || m.nombre.toLowerCase().includes(t)).slice(0, 8)
  }, [q, monedas])

  const analizar = useCallback(async (simbolo: string, ref?: Elegida) => {
    const sym = simbolo.trim().toUpperCase(); if (!sym) return
    setElegida(ref ?? null)
    setBuscando(true); setError(null); setLectura(null); setErrorPedido(null); setResol(null); setNoAnalizable(null)
    try {
      const r = await api<{ lectura: Lectura | null; sin_datos: { codigo: string; texto: string } | null; moneda: Moneda | null; cupo: Cupo | null; puede_profundo: boolean }>('/api/analizar/determinista', { cuerpo: { simbolo: sym, contrato: ref?.contrato ?? undefined, cadena: ref?.cadena ?? undefined } })
      setLectura({ l: r.lectura, sin_datos: r.sin_datos, moneda: r.moneda, cupo: r.cupo, puede_profundo: r.puede_profundo }); setQ(sym); setParams({ m: sym }, { replace: true })
    } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } finally { setBuscando(false) }
  }, [setParams])

  useEffect(() => { const m = params.get('m'); if (m && !lectura && !buscando && !error && !resol && !noAnalizable) analizar(m) }, [params, lectura, buscando, error, resol, noAnalizable, analizar])

  const pedir = async () => {
    if (!lectura) return
    setPidiendo(true); setErrorPedido(null)
    try {
      const r = await api<{ id: string }>('/api/analizar/profundo', { cuerpo: { simbolo: simboloActual, contrato: elegida?.contrato ?? undefined, cadena: elegida?.cadena ?? undefined } })
      invalidarDatos(); nav(`/analizar/s/${r.id}`)
    } catch (e) {
      if (e instanceof ErrorApi && e.codigo === 'ya_en_curso' && typeof (e.cuerpo as { id?: string })?.id === 'string') { nav(`/analizar/s/${(e.cuerpo as { id: string }).id}`); return }
      setErrorPedido(e instanceof ErrorApi ? e.message : String(e))
    } finally { setPidiendo(false) }
  }
  /* Una moneda elegida de la lista: si no da para análisis se dice acá, antes de ofrecer gastar nada. */
  const elegir = useCallback((c: Candidata | Moneda) => {
    setResol(null)
    if (c.analizable === false) { setNoAnalizable(c); setQ(c.simbolo); return }
    analizar(c.simbolo, { contrato: ('contrato' in c ? c.contrato : null) ?? null, cadena: c.cadena ?? null, nombre: c.nombre })
  }, [analizar, setParams])

  /* Buscar no gasta nada: resolver, y sólo leer cuando hay una sola candidata. */
  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    const consulta = q.trim(); if (!consulta) return
    setBuscando(true); setError(null); setLectura(null); setResol(null); setNoAnalizable(null); setErrorPedido(null)
    try {
      const r = await api<Resolucion>('/api/analizar/resolver', { cuerpo: { consulta } })
      if (r.candidatas.length === 1) { setBuscando(false); elegir(r.candidatas[0]); return }
      setResol(r)
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : String(e))
    } finally { setBuscando(false) }
  }
  const otra = () => { setResol(null); setNoAnalizable(null); setLectura(null); setError(null); setQ(''); setParams({}, { replace: true }); inputRef.current?.focus() }
  const cupo = lectura?.cupo ?? (cupoSt.estado === 'ok' ? cupoSt.datos.cupo : null)
  const simboloActual = lectura?.l?.simbolo ?? lectura?.moneda?.simbolo ?? ''
  /* El motor guarda los informes por símbolo, así que con monedas homónimas puede devolver
     una distinta de la elegida. Cuando pasa, se dice; no se hace pasar una por otra. */
  const norm = (t?: string | null) => (t ?? '').trim().toLowerCase()
  const otraMoneda = !!(lectura?.l && elegida?.cadena && norm(lectura.l.cadena) && norm(lectura.l.cadena) !== norm(elegida.cadena))

  return (
    <>
      <Cabecera
        eyebrow="Analiza tu moneda"
        titulo={<>Pon a <em>nuestro equipo</em> a analizar tu moneda</>}
        lead="Escribe un ticker y empezamos. La primera lectura es gratis."
        acciones={rol !== 'visitante' ? <CupoChip cupo={cupo} /> : undefined}
      />
      <div className="shell an">
        <form className={`an-busca ${lectura || resol || noAnalizable ? 'is-chica' : ''}`} onSubmit={enviar} role="search">
          <label className="vh" htmlFor="an-q">Moneda</label>
          <div className="an-busca__campo">
            <input ref={inputRef} id="an-q" className="an-busca__input mono" value={q} onChange={(e) => { setQ(e.target.value); if (lectura) setLectura(null) }} placeholder="RAY, ORCA, PENDLE…" autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn an-busca__btn" disabled={buscando || !q.trim()}>{buscando ? 'Leyendo…' : 'Leer'}</button>
          </div>
          {!lectura && !resol && !noAnalizable && <FormatoAceptado />}
          {!lectura && !resol && !noAnalizable && (
            <>
            <p className="an-busca__sugk mono">{q.trim() ? 'Coinciden' : 'O empieza por una de éstas'}</p>
            <ul className="an-busca__sug" aria-label="Sugerencias">
              {sugerencias.map((m: Moneda) => (
                <li key={m.simbolo}><button type="button" className={`an-sug ${m.con_informe ? 'is-informe' : ''}`} onClick={() => elegir(m)}><b className="mono">{m.simbolo}</b><span>{m.nombre}</span>{m.con_informe && <i className="mono">análisis previo</i>}</button></li>
              ))}
              {universo.estado === 'ok' && !sugerencias.length && <li className="an-busca__nada body-muted">Nada con ese nombre entre las monedas que cubrimos.</li>}
            </ul>
            </>
          )}
          {universo.estado === 'ok' && !lectura && !resol && !noAnalizable && <p className="an-busca__nota mono">{universo.datos.monedas.length} monedas con cobertura hoy{universo.datos.motor === 'simulador' ? ' · respuestas simuladas por ahora' : ''}</p>}
        </form>

        {buscando && <div className="p-cargando"><Loader size={72} label="Leyendo" /></div>}
        {resol && !buscando && (resol.candidatas.length ? <Candidatas r={resol} onElegir={elegir} onOtra={otra} /> : <SinCoincidencia r={resol} onOtra={otra} />)}
        {noAnalizable && !buscando && <NoAnalizable moneda={noAnalizable} onOtra={otra} />}
        {error && <EmptyState kind="sin-datos" title="No la encontramos" detail={error} action={<button type="button" className="btn btn--ghost" onClick={() => { setError(null); inputRef.current?.focus() }}>Probar otra</button>} />}
        {lectura && (
          <>
            {otraMoneda && <Nota tono="oro">De las monedas que se llaman <b>{simboloActual}</b>, la única con datos guardados es <b>{lectura.l?.nombre}</b>{lectura.l?.cadena ? <> en {lectura.l.cadena}</> : null}. Es la que estás viendo. La que elegiste todavía no tiene lectura: el análisis profundo la crea.</Nota>}
            {lectura.l ? <LecturaDeterminista l={lectura.l} /> : lectura.moneda && lectura.sin_datos ? <SinDatosAun moneda={lectura.moneda} texto={lectura.sin_datos.texto} /> : null}
            <Decidir simbolo={simboloActual} cupo={lectura.cupo} puedeProfundo={lectura.puede_profundo} onPedir={pedir} ocupado={pidiendo} error={errorPedido} />
            {lectura.l?.origen_motor === 'simulador' && <Nota tono="mudo">Lectura simulada: los números salen de la última pasada que VETA hizo sobre esta moneda; el análisis en vivo todavía no está conectado.</Nota>}
          </>
        )}
        {!lectura && !resol && !noAnalizable && !buscando && !error && <MisAnalisis />}
      </div>
    </>
  )
}

/* ---------- mis pedidos anteriores ---------- */
function MisAnalisis() {
  const { yo } = useSesion()
  const [lista, setLista] = useState<Solicitud[] | null>(null)
  useEffect(() => { if (!yo?.usuario) return; api<{ solicitudes: Solicitud[] }>('/api/analizar/solicitudes').then((d) => setLista(d.solicitudes.filter((s) => s.nivel === 'profundo')), () => setLista([])) }, [yo])
  if (!yo?.usuario || !lista?.length) return null
  return (
    <section className="an-mios" aria-labelledby="an-mios-t">
      <div className="p-seccion__head"><h2 id="an-mios-t" className="display an-h3">Tus análisis</h2><span className="mono body-muted">{lista.length}</span></div>
      <ul className="an-mios__lista">
        {lista.map((s) => (
          <li key={s.id}>
            <Link to={`/analizar/s/${s.id}`} className={`an-mio an-mio--${s.estado}`}>
              <span className="an-mio__gema" aria-hidden="true" />
              <b className="display">{s.simbolo}</b>
              <span className="an-mio__estado mono">{ESTADO_LABEL[s.estado]}{s.estado === 'en_curso' && s.etapa ? ` · ${s.etapa}` : ''}</span>
              {s.tier && <TierBadge tier={s.tier} size={18} />}
              <span className="an-mio__fecha mono">{fechaHora(s.terminada ?? s.creada)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
const ESTADO_LABEL: Record<string, string> = { en_cola: 'en cola', en_curso: 'en marcha', listo: 'listo', fallido: 'no terminó', bloqueado: 'no pasó la verificación' }

/* ============================ la espera y el resultado ============================ */
export function AnalizarSolicitud() {
  const { id } = useParams()
  const [s, setS] = useState<Solicitud | null>(null)
  const [cupo, setCupo] = useState<Cupo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const avisado = useRef(false)
  const terminal = s ? ['listo', 'fallido', 'bloqueado'].includes(s.estado) : false

  const cargar = useCallback(async () => {
    try { const d = await api<{ solicitud: Solicitud; cupo: Cupo | null }>(`/api/analizar/solicitudes/${id}`); setS(d.solicitud); setCupo(d.cupo); setError(null) } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) }
  }, [id])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (terminal) return; const t = setInterval(cargar, 2000); return () => clearInterval(t) }, [cargar, terminal])
  useEffect(() => {
    if (!s || !terminal || avisado.current) return
    avisado.current = true
    api(`/api/analizar/solicitudes/${s.id}/vista`, { cuerpo: {} }).catch(() => {})
    invalidarDatos()
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(`VETA · ${s.simbolo}`, { body: s.estado === 'listo' ? 'Tu análisis está listo.' : 'El análisis no terminó: no se descontó del cupo.' }) } catch { /* sin permiso */ }
    }
  }, [s, terminal])

  if (error) return <div className="shell p-cargando"><EmptyState kind="error" title="No encontramos ese análisis" detail={error} action={<Link to="/analizar" className="btn btn--ghost">Volver</Link>} /></div>
  if (!s) return <div className="shell p-cargando"><Loader size={72} label="Cargando" /></div>

  const inf = s.estado === 'listo' && s.resultado ? (s.resultado as unknown as Informe) : null
  const narrado = s.estado === 'listo' ? narradoDe(s.resultado) : null
  return (
    <div className={`an-sol an-sol--${s.estado}`}>
      <div className="shell"><Volver to="/analizar" label="Analiza tu moneda" /></div>
      <section className="shell an-espera" aria-live="polite">
        <EscenaAnalisis s={s} />
        <div className="an-espera__panel">
          <span className="eyebrow mono" data-mat={s.estado === 'listo' ? 'esmeralda' : 'oro'}><span className="eyebrow__mark" aria-hidden="true" />{s.estado === 'listo' ? 'Análisis profundo · listo' : s.estado === 'en_cola' ? 'En cola' : s.estado === 'en_curso' ? 'Analizando' : s.estado === 'bloqueado' ? 'Verificación · no pasó' : 'No terminó'}</span>
          <h1 className="display an-espera__t">
            {s.estado === 'en_curso' ? <>Leyendo <b>{s.simbolo}</b></> : <>{s.simbolo}<small>{s.estado === 'listo' ? s.nombre : s.estado === 'en_cola' ? 'en la cola, esperando lanzamiento' : s.estado === 'bloqueado' ? 'no pasó la verificación · no se descontó' : 'no terminó · no se descontó'}</small></>}
          </h1>
          <div className="an-espera__meta mono">
            <Transcurrido desde={s.iniciada ?? s.creada} hasta={s.terminada} />
            {s.estado === 'listo' && s.tier && <TierBadge tier={s.tier} size={20} />}
            {cupo && <CupoChip cupo={cupo} compacto />}
          </div>
          <Etapas s={s} />
          {s.estado === 'en_cola' && (
            <div className="an-cola">
              <Nota tono="oro">
                <b>{s.enviada ? `Tu pedido está en la cola${s.posicion_cola ? `, en el puesto ${s.posicion_cola}` : ''}.` : 'Tu pedido espera por el tope de gasto de este mes.'}</b>{' '}
                {s.enviada
                  ? 'Los análisis profundos los lanza el equipo a mano, uno por uno, porque cada uno gasta dinero real. No hay un tiempo garantizado: puede ser en minutos o al día siguiente.'
                  : 'Arranca solo en cuanto se libere margen; no tienes que hacer nada.'}
              </Nota>
              <p className="an-cola__que">{llano(s.detalle ?? '')}</p>
              <ul className="an-cola__lista">
                <li>Cuando arranque verás aquí las etapas, y en la barra el avance.</li>
                <li>Te avisamos al terminar, también si te fuiste.</li>
                <li>El cupo se descuenta sólo si el análisis termina y pasa la verificación.</li>
              </ul>
            </div>
          )}
          {(s.estado === 'en_curso' || s.estado === 'en_cola') && (
            <div className="an-espera__pie">
              <p className="body-muted">Puedes irte. Cuando termine te avisamos arriba, en la barra, y el resultado queda en <Link to="/analizar">tus análisis</Link>.</p>
              <BotonAviso />
            </div>
          )}
          {s.estado === 'bloqueado' && <Nota tono="rojo">No pasó nuestro control de calidad{s.verificador?.motivo_bloqueo ? `: ${s.verificador.motivo_bloqueo}` : ''}. <b>No se descontó de tu cupo.</b></Nota>}
          {s.estado === 'fallido' && <Nota tono="rojo">{s.fallo?.texto ?? 'No se pudo terminar.'} <b>No se descontó de tu cupo.</b></Nota>}
          {s.estado === 'listo' && (
            <>
              <Nota tono="esm">Este análisis es tuyo. No lleva sello editorial: si vale para todos, se publica desde la mesa de revisión.</Nota>
              {!!(s.resultado as { simulado?: boolean })?.simulado && <Nota tono="mudo">Resultado de simulación: reproduce un análisis que VETA ya hizo sobre esta moneda. El análisis en vivo todavía no está conectado.</Nota>}
            </>
          )}
          {(s.estado === 'fallido' || s.estado === 'bloqueado') && <div className="an-espera__pie"><Link to="/analizar" className="btn btn--ghost">Probar con otra moneda</Link></div>}
        </div>
      </section>
      {inf && (
        <div className="an-resultado">
          {narrado && <div className="shell"><InformeNarrado n={narrado} simbolo={s.simbolo} /></div>}
          <ProveedorNivel><Cuerpo inf={inf} esAnalisis /></ProveedorNivel>
        </div>
      )}
    </div>
  )
}
