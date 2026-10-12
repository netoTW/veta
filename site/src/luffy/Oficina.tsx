import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Seguro } from './Seguro'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { EstadoFuente, EventoOficina, Oficina as OficinaT, UniversoFila } from './tipos6b'
import { fmtHora, fmtUsd, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'
import { Escena, NOMBRE, type ApiEscena, type IdAgente, type MonedaEscena } from './oficina/Escena'
import { TarjetaCurva } from './Cartera'

/* ============================================================================
   La oficina en vivo (CONTRATO-PANEL.md §8.5), rehecha: una sala isométrica con
   un personaje por agente y la araña de oro en la pantalla grande (oficina/Escena.tsx).

   `GET /oficina/estado` da la foto (agentes, fuentes, trabajos, el turno de Luffy) y
   `GET /eventos` (SSE) la anima: quien trabaja teclea y se le enciende la pantalla;
   al terminar lleva un papel a Luffy; la fuente que entrega datos se enciende en su
   objeto; una alerta o el radar mandan a la araña a la moneda. Las monedas que se
   siguen salen de la lista de la terminal (posiciones, caja, candidatas, gatillos,
   vigilancia). Arriba, una tarjeta por agente; abajo, la curva de la caja, el
   registro (Jev, que son miles al día, agrupado) y los trabajos programados.
   ========================================================================== */
const SALUD_LLANO: Record<EstadoFuente, string> = { al_dia: 'al día', atrasada: 'atrasada', caida: 'caída', apagada: 'apagada', sin_datos: 'sin datos aún' }
const ROL: Record<IdAgente, string> = {
  luffy: 'El jefe: conversa, decide y responde con lo que traen los demás.',
  cuant: 'Las cifras: series, ingresos, apalancamiento y rendimiento.',
  investigador: 'Busca y lee: la web, los documentos y la cadena.',
  estratega: 'Arma la jugada: escenarios, tamaño, entrada y salida.',
  jev: 'Clasifica lo que se publica: personas, bots informativos y granjas.',
  crawler: 'Recorre X y las fuentes; con el radar, marca las monedas.',
}
const AGENTES: IdAgente[] = ['luffy', 'cuant', 'investigador', 'estratega', 'jev', 'crawler']
const usd = (v: number | undefined) => (typeof v === 'number' && v > 0 ? ` · ${fmtUsd(v, 3)}` : '')
const comoAgente = (s: string | null | undefined): IdAgente | null => { const k = (s ?? '').toLowerCase(); return (AGENTES as string[]).includes(k) ? (k as IdAgente) : null }

function describir(e: EventoOficina): { texto: string; clase: string } | null {
  switch (e.tipo) {
    case 'latido': return null
    case 'turno_abierto': return { texto: `Luffy abre un turno (${e.modo}, por ${e.canal})`, clase: '' }
    case 'turno_cerrado': return { texto: `Luffy cierra el turno · ${e.tipo_turno} · ${e.herramientas} herramienta${e.herramientas === 1 ? '' : 's'} · ${Math.round(e.duracion_s)} s${usd(e.costo_usd)}`, clase: '' }
    case 'agente_convocado': return { texto: `convoca al ${e.agente}`, clase: '' }
    case 'agente_terminado': return { texto: `el ${e.agente} entrega${e.ok ? '' : ' con error'} · ${Math.round(e.duracion_s)} s${usd(e.costo_usd)}`, clase: e.ok ? '' : 'is-mal' }
    case 'herramienta': return { texto: `${e.quien} usa ${e.nombre}${e.fuente ? ` → ${e.fuente}` : ''}${e.ok ? '' : ' (falló)'}`, clase: e.ok ? 'is-fuente' : 'is-mal' }
    case 'jev': return { texto: `Jev clasifica ${e.n} (${e.proposito.replace(/_/g, ' ')})${usd(e.costo_usd)}`, clase: 'is-fuente' }
    case 'fuente_leida': return { texto: `${e.fuente.replace(/_/g, ' ')} ${e.ok ? `entrega${e.n ? ` ${e.n}` : ''}` : 'no respondió'}${e.detalle && e.detalle !== 'ok' ? ` · ${e.detalle}` : ''}`, clase: e.ok ? 'is-fuente' : 'is-mal' }
    case 'radar_ciclo': return { texto: `radar ${e.modo}: ${e.n_candidatas} candidata${e.n_candidatas === 1 ? '' : 's'} de ${e.n_evaluados}`, clase: '' }
    case 'caja_ciclo': return { texto: `ciclo de la caja (${e.motivo}): ${e.corrio ? `corrió, ${e.propuestas} propuesta${e.propuestas === 1 ? '' : 's'}` : 'sin novedades, no abrió turno'}${usd(e.costo_usd)}`, clase: '' }
    case 'reconciliacion': return { texto: `reconciliación ${e.origen}: ${e.discrepancias ? `${e.discrepancias} discrepancia${e.discrepancias === 1 ? '' : 's'}` : 'todo cuadra'}`, clase: e.discrepancias ? 'is-mal' : '' }
    case 'alerta': return { texto: `alerta ${e.severidad}${e.activo ? ` sobre ${e.activo}` : ''}`, clase: e.severidad === 'alta' ? 'is-mal' : 'is-fuente' }
    case 'propuesta': return { texto: `propuesta #${e.id_corto} ${e.accion} ${e.par} · ${e.estado}`, clase: '' }
    case 'orden': return { texto: `orden #${e.id_corto} ${e.accion} · ${e.estado}`, clase: e.estado === 'fallida' ? 'is-mal' : '' }
    case 'gatillo': return { texto: `gatillo ${e.id_corto} ${e.evento}`, clase: 'is-fuente' }
    case 'informe': return { texto: `informe del ${e.fecha} listo${usd(e.costo_usd)}`, clase: '' }
    default: return null
  }
}

/** Las monedas que se siguen, por prioridad: posiciones, caja, candidatas de hoy, gatillos, vigilancia. */
function monedasDe(filas: UniversoFila[]): MonedaEscena[] {
  const out: MonedaEscena[] = []
  const tipo = (f: UniversoFila): MonedaEscena['tipo'] | null => f.posiciones.some((p) => p.origen === 'pablo') ? 'pablo' : f.posiciones.some((p) => p.origen === 'caja') ? 'caja' : f.candidata_hoy || f.modos_hoy.length ? 'candidata' : f.gatillos > 0 ? 'gatillo' : f.vigilancia ? 'vigilancia' : null
  const orden: MonedaEscena['tipo'][] = ['pablo', 'caja', 'candidata', 'gatillo', 'vigilancia']
  for (const f of filas) { const t = tipo(f); if (t) out.push({ simbolo: f.simbolo, tipo: t }) }
  return out.sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo)).slice(0, 12)
}

type Registro = (EventoOficina & { clave: number; junto?: { n: number; tandas: number; costo: number } })
let claves = 0
/* `junto` (no `grupo`: los eventos reales de fuentes ya traen un campo `grupo`, «listados» o «gobernanza»). */
/** Suma un evento al registro (más nuevo arriba). Los de Jev, que son miles al día, se juntan en una línea que va sumando. */
function sumar(r: Registro[], e: EventoOficina): Registro[] {
  const d = e.tipo === 'latido' ? null : describir(e)
  if (!d) return r
  // el mismo aviso dos veces seguidas (lo emiten dos procesos) va una sola vez
  if (e.tipo !== 'jev' && r[0] && describir(r[0])?.texto === d.texto && Math.abs(Date.parse(e.hora) - Date.parse(r[0].hora)) < 3 * 60_000) return r
  if (e.tipo === 'jev' && r[0]?.tipo === 'jev' && r[0].junto && Math.abs(Date.parse(e.hora) - Date.parse(r[0].hora)) < 15 * 60_000) {
    const g = r[0].junto; return [{ ...r[0], hora: e.hora, junto: { n: g.n + (e.n ?? 0), tandas: g.tandas + 1, costo: g.costo + (e.costo_usd ?? 0) } }, ...r.slice(1)]
  }
  return [{ ...e, clave: ++claves, ...(e.tipo === 'jev' ? { junto: { n: e.n ?? 0, tandas: 1, costo: e.costo_usd ?? 0 } } : {}) }, ...r].slice(0, 80)
}

export function Oficina() {
  const [estado, setEstado] = useState<OficinaT | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [registro, setRegistro] = useState<Registro[]>([])
  const [conectado, setConectado] = useState(false)
  const [monedas, setMonedas] = useState<MonedaEscena[]>([])
  const [pulsos, setPulsos] = useState<Partial<Record<IdAgente, number>>>({})
  const [enCurso, setEnCurso] = useState<Partial<Record<IdAgente, boolean>>>({})
  const [ultimo, setUltimo] = useState<Partial<Record<IdAgente, { texto: string; hora: string }>>>({})
  const [ahora, setAhora] = useState(() => Date.now())
  const escena = useRef<ApiEscena>(null)

  useEffect(() => { luffy6b.oficina().then((o) => { setEstado(o); setError(null); setEnCurso({ luffy: o.luffy.en_curso.length > 0, ...Object.fromEntries(o.agentes.map((a) => [comoAgente(a.nombre), a.en_curso]).filter(([k]) => k)) }) }, (e) => setError(e instanceof ErrorLuffy6b ? e.message : String(e))) }, [])
  useEffect(() => { luffy6b.universo('todo', '', 300).then((u) => setMonedas(monedasDe(u.activos)), () => setMonedas([])) }, [])
  // los pulsos de trabajo (un agente que usó una herramienta, Jev que clasificó) se apagan solos
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t) }, [])

  const pulso = useCallback((a: IdAgente, s = 5) => setPulsos((p) => ({ ...p, [a]: Date.now() + s * 1000 })), [])
  const anotar = useCallback((a: IdAgente, e: EventoOficina) => { const d = describir(e); if (d) setUltimo((u) => ({ ...u, [a]: { texto: d.texto, hora: e.hora } })) }, [])

  useEffect(() => {
    if (!estado) return
    let cerrar: (() => void) | null = null, vivo = true
    // el registro arranca con lo último que pasó; después sigue en vivo desde ahí
    const ultimo = estado.eventos_ultimo_id ?? null
    const empezar = (desde: number | null) => { if (!vivo) return; cerrar = luffy6b.eventos((e) => {
      if (e.tipo === 'latido') return
      setRegistro((r) => sumar(r, e))
      const es = escena.current
      const activos = (e as { activos?: unknown }).activos
      const primera = Array.isArray(activos) && typeof activos[0] === 'string' ? (activos[0] as string) : null
      switch (e.tipo) {
        case 'turno_abierto': setEnCurso((x) => ({ ...x, luffy: true })); anotar('luffy', e); break
        case 'turno_cerrado': setEnCurso((x) => ({ ...x, luffy: false })); anotar('luffy', e); break
        case 'agente_convocado': { const a = comoAgente(e.agente); if (a) { setEnCurso((x) => ({ ...x, [a]: true })); anotar(a, e) } break }
        case 'agente_terminado': { const a = comoAgente(e.agente); if (a) { setEnCurso((x) => ({ ...x, [a]: false })); anotar(a, e); es?.entregar(a) } break }
        case 'herramienta': { const a = comoAgente(e.quien); if (a) { pulso(a, 4); anotar(a, e) } if (e.fuente) es?.fuente(e.fuente, e.ok); break }
        case 'jev': pulso('jev', 6); anotar('jev', e); break
        case 'fuente_leida': es?.fuente(e.fuente, e.ok); if (e.fuente === 'x') { pulso('crawler', 6); anotar('crawler', e) } if (primera) es?.aMoneda(primera); break
        case 'radar_ciclo': es?.barrer(); pulso('crawler', 4); anotar('crawler', e); if (primera) es?.aMoneda(primera); break
        case 'alerta': if (e.activo) es?.aMoneda(e.activo); break
        default: break
      }
    }, setConectado, desde) }
    if (ultimo) luffy6b.eventosRecientes(Math.max(0, ultimo - 120), 120).then((r) => { if (!vivo) return; setRegistro(r.items.reduce(sumar, [] as Registro[])); empezar(r.ultimo_id ?? ultimo) }, () => empezar(ultimo))
    else empezar(null)
    return () => { vivo = false; cerrar?.() }
  }, [estado, pulso, anotar])

  const trabajando = useMemo(() => Object.fromEntries(AGENTES.map((a) => [a, !!enCurso[a] || (pulsos[a] ?? 0) > ahora])) as Record<IdAgente, boolean>, [enCurso, pulsos, ahora])
  const fuentes = useMemo(() => (estado?.fuentes ?? []).map((f) => ({ nombre: f.nombre, etiqueta: f.etiqueta ?? f.nombre.replace(/_/g, ' '), estado: f.estado })), [estado])

  if (error && !estado) return <div className="lf-pag"><EmptyState kind="error" title="No se pudo abrir la oficina." detail={error} /></div>
  const caidas = (estado?.fuentes ?? []).filter((f) => f.estado === 'caida'), alDia = (estado?.fuentes ?? []).filter((f) => f.estado === 'al_dia').length
  const cifra = (a: IdAgente) => {
    if (!estado) return ''
    if (a === 'luffy') return `${estado.luffy.turnos_24h} turnos en 24 h · ${fmtUsd(estado.luffy.costo_24h_usd)}`
    if (a === 'crawler') { const t = estado.trabajos.find((x) => /crawler/i.test(x.nombre)); const x = estado.fuentes.find((f) => f.nombre === 'x'); return `${(t as { corridas_24h?: number } | undefined)?.corridas_24h ?? '—'} pasadas en 24 h${x?.ultima_lectura ? ` · leyó ${hace(x.ultima_lectura)}` : ''}` }
    const ag = estado.agentes.find((x) => comoAgente(x.nombre) === a)
    return ag ? `${ag.llamadas_24h.toLocaleString('es-ES')} ${a === 'jev' ? 'clasificaciones' : 'encargos'} en 24 h · ${fmtUsd(ag.costo_24h_usd)}` : ''
  }
  const ultimaVez = (a: IdAgente) => ultimo[a] ?? (() => { const ag = estado?.agentes.find((x) => comoAgente(x.nombre) === a); const t = a === 'luffy' ? estado?.luffy.ultimo_turno : ag?.ultima_actividad; return t ? { texto: a === 'luffy' ? 'último turno' : 'última actividad', hora: t } : null })()

  return (
    <div className="lf-pag lf-ofi2">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">La oficina <em>en vivo</em></h1><span className="mono lf-ofi2__con" data-conectado={conectado ? 'si' : 'no'}><i className={`lf-gema ${conectado ? 'is-latiendo' : ''}`} />{conectado ? 'conectada' : 'conectando…'}</span></div>

      <Seguro t="Agentes">{() => (
        <div className="lf-ofi2__tarjetas" role="list" data-prueba="tarjetas-agentes">
          {AGENTES.map((a) => { const u = ultimaVez(a); return (
            <article key={a} role="listitem" className={`lf-ag ${trabajando[a] ? 'is-trabajando' : ''}`} data-prueba={`tarjeta-${a}`}>
              <header><b>{NOMBRE[a]}</b><span className="mono">{trabajando[a] ? 'trabajando' : 'en reposo'}</span></header>
              <p className="lf-ag__rol">{ROL[a]}</p>
              <p className="lf-ag__ultimo">{u ? <>{u.texto}<em className="mono"> · {hace(u.hora)}</em></> : <em className="mono">sin actividad reciente</em>}</p>
              <p className="lf-ag__cifra mono">{cifra(a)}</p>
            </article>
          ) })}
        </div>
      )}</Seguro>

      <Seguro t="La oficina">{() => (
        <section className="lf-ofi2__sala">
          <Escena ref={escena} monedas={monedas} fuentes={fuentes} trabajando={trabajando} />
          {estado && <p className="lf-ofi2__pie mono">
            {estado.luffy.en_curso.length ? <>Luffy trabajando en {estado.luffy.en_curso.map((t, i) => <span key={t.hilo_id}>{i > 0 && ', '}<Link to={`/luffy/h/${t.hilo_id}`}>«{t.titulo}»</Link></span>)}</> : `Luffy en reposo${estado.luffy.ultimo_turno ? ` · último turno ${hace(estado.luffy.ultimo_turno)}` : ''}`}
            {' · '}fuentes: {alDia} al día{caidas.length ? `, caída${caidas.length > 1 ? 's' : ''}: ${caidas.map((f) => f.etiqueta ?? f.nombre).join(', ')}` : ''}
          </p>}
        </section>
      )}</Seguro>

      <div className="lf-ofi2__abajo">
        <Seguro t="Curva de la caja"><TarjetaCurva origen="caja" /></Seguro>
        <Seguro t="Registro de actividad">{() => (<section className="lf-tarj"><h3 className="mono">Registro de actividad<em>{registro.length ? `${registro.length} líneas` : ''}</em></h3>
          <div className="lf-ofi__registro">{registro.map((e) => {
            const d = e.tipo === 'jev' && e.junto ? { texto: `Jev clasificó ${e.junto.n.toLocaleString('es-ES')} publicaciones en ${e.junto.tandas} tanda${e.junto.tandas === 1 ? '' : 's'}${usd(e.junto.costo)}`, clase: 'is-fuente' } : describir(e)
            return d ? <div key={e.clave} className="lf-ev"><span className="mono">{fmtHora(e.hora).slice(-5)}</span><span><i className={d.clase}>{d.texto}</i></span></div> : null
          })}{!registro.length && <p className="lf-ctrl__nota mono">Esperando eventos…</p>}</div>
        </section>)}</Seguro>
        <Seguro t="Trabajos programados">{() => (<section className="lf-tarj"><h3 className="mono">Trabajos programados</h3>{(estado?.trabajos ?? []).map((t) => <p key={t.nombre} className="lf-nota" style={{ fontSize: '0.8rem' }}><b>{t.etiqueta ?? t.nombre}</b> <em className="mono" style={{ display: 'inline' }}>· cada {t.cada}{t.ultima ? ` · último ${hace(t.ultima)}` : ''}{t.estado && t.estado !== 'ok' ? ` · ${t.estado.replace(/_/g, ' ')}` : ''}</em></p>)}</section>)}</Seguro>
      </div>
      <p className="lf-ctrl__nota mono">Fuentes: {(estado?.fuentes ?? []).map((f) => `${f.etiqueta ?? f.nombre.replace(/_/g, ' ')} ${SALUD_LLANO[f.estado]}`).join(' · ')}</p>
    </div>
  )
}
