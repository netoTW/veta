import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Seguro } from './Seguro'
import { luffy6b, ErrorLuffy6b } from './api6b'
import type { EventoOficina, Oficina as OficinaT, UniversoFila } from './tipos6b'
import { fmtHora, fmtUsd, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'
import { Escena, NOMBRE, puertoDe, type ApiEscena, type GrupoFuente, type IdAgente, type MonedaEscena, type Puerto } from './oficina/Escena'
import { HojaAgente, HojaFuentes, SALUD_LLANO, describirPaso } from './oficina/Hojas'
import { actividad as actividadDe, alCambiar, anotar as anotarHistoria, historia, lineaTurno, MODO_LLANO, monedasDe, pasoDe, rotuloDe, todos, type Ev, type Turno } from './oficina/historia'
import { TarjetaCurva } from './Cartera'
import { GastoOficina } from './oficina/Gasto'

/* ============================================================================
   La oficina en vivo (CONTRATO-PANEL.md §8.5): una sala isométrica con un
   personaje por agente y la araña de oro en la pantalla grande (oficina/Escena.tsx).

   `GET /oficina/estado` da la foto y `GET /eventos` (SSE) la anima:
   - Cada lectura del crawler, cada tanda de Jev y cada ciclo del radar mandan a la
     araña a la ficha de la moneda que nombran (o, si no nombran ninguna, al puerto
     de su fuente), a tejer su hilo y mostrar un rótulo corto de lo que leyó. El
     grosor de cada hilo es la actividad de esa moneda en las últimas horas; tres
     horas sin nada y se apaga.
   - Sobre cada personaje, un globo dice en llano lo que está haciendo (los mismos
     pasos del chat), y un papel viaja de escritorio a escritorio en cada entrega.
   - Tocar un agente abre su día (oficina/Hojas.tsx), una moneda abre su ficha del
     terminal y una fuente muestra su salud.
   - Un turno pasado de Luffy se repite paso a paso en la sala, a la velocidad que
     se elija. Mientras se repite, lo que llega en vivo sigue entrando al registro.
   La historia de 24 h (oficina/historia.ts) se trae después de pintar la sala.
   Nada se inventa: lo que se mueve sin eventos es el fondo (luces y antena).
   ========================================================================== */
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
const ABRE: Record<string, string> = { auto: 'leyendo el pedido', chat: 'leyendo el pedido', decision: 'pensando la decisión', caja: 'revisando la caja', gatillo: 'revisando un gatillo', terminal: 'preparando la ficha' }
const DATOS_DE: Record<string, string> = { binance_futures: 'foto de derivados', coinalyze: 'derivados del día', defillama: 'ingresos y depósitos', bingx: 'velas y cuenta', motor_veta: 'fichas del motor' }

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

/** Las monedas que se siguen, por prioridad: posiciones, caja, candidatas de hoy, gatillos; después las que se movieron en el día y la vigilancia. */
function monedasDeUniverso(filas: UniversoFila[], activas: Map<string, { peso: number; ultima: number }>): MonedaEscena[] {
  const out: MonedaEscena[] = []
  const tipo = (f: UniversoFila): MonedaEscena['tipo'] | null => f.posiciones.some((p) => p.origen === 'pablo') ? 'pablo' : f.posiciones.some((p) => p.origen === 'caja') ? 'caja' : f.candidata_hoy || f.modos_hoy.length ? 'candidata' : f.gatillos > 0 ? 'gatillo' : f.vigilancia ? 'vigilancia' : null
  const orden: MonedaEscena['tipo'][] = ['pablo', 'caja', 'candidata', 'gatillo', 'actividad', 'vigilancia']
  const vistos = new Set<string>()
  for (const f of filas) { const t = tipo(f); if (t) { out.push({ simbolo: f.simbolo, tipo: t }); vistos.add(f.simbolo) } }
  const universo = new Set(filas.map((f) => f.simbolo))
  for (const [s, a] of [...activas].sort((x, y) => y[1].peso - x[1].peso)) if (!vistos.has(s) && (universo.has(s) || !filas.length) && Date.now() - a.ultima < 6 * 3600_000) out.push({ simbolo: s, tipo: 'actividad' })
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

type Globos = Partial<Record<IdAgente, { texto: string; t: number; hasta: number }>>
type Abierta = { tipo: 'agente'; a: IdAgente } | { tipo: 'fuente'; cual: GrupoFuente | Puerto } | null
/** `ts` y `costos` vienen de la línea del turno (v2.3) cuando la hay: el ritmo real y lo que costó cada llamada. */
interface Rep { turno: Turno; i: number; vt: number; vel: number; pausa: boolean; fin: boolean; cargando?: boolean; ts?: number[]; costos?: number[]; total?: number | null; nota?: string | null }
const VELOCIDADES = [1, 2, 4, 8]

export function Oficina() {
  const navigate = useNavigate()
  const [estado, setEstado] = useState<OficinaT | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [registro, setRegistro] = useState<Registro[]>([])
  const [conectado, setConectado] = useState(false)
  const [universo, setUniverso] = useState<UniversoFila[]>([])
  const [pulsos, setPulsos] = useState<Partial<Record<IdAgente, number>>>({})
  const [enCurso, setEnCurso] = useState<Partial<Record<IdAgente, boolean>>>({})
  const [ultimo, setUltimo] = useState<Partial<Record<IdAgente, { texto: string; hora: string }>>>({})
  const [globos, setGlobos] = useState<Globos>({})
  const [leido, setLeido] = useState<{ texto: string; t: number } | null>(null)
  const [ahora, setAhora] = useState(() => Date.now())
  const [version, setVersion] = useState(0)
  const [cargada, setCargada] = useState(false)
  const [abierta, setAbierta] = useState<Abierta>(null)
  const [rep, setRep] = useState<Rep | null>(null)
  const [alDia, setAlDia] = useState<number | null>(null)
  const escena = useRef<ApiEscena>(null)
  const enRep = useRef(false)
  const papelJev = useRef(0)
  const listados = useRef<{ t: number; evs: Ev[] } | null>(null)

  const cargarEstado = useCallback(() => luffy6b.oficina().then((o) => { setEstado(o); setError(null); setEnCurso({ luffy: o.luffy.en_curso.length > 0, ...Object.fromEntries(o.agentes.map((a) => [comoAgente(a.nombre), a.en_curso]).filter(([k]) => k)) }); return o }, (e) => { setError(e instanceof ErrorLuffy6b ? e.message : String(e)); return null }), [])
  useEffect(() => { void cargarEstado() }, [cargarEstado])
  useEffect(() => { luffy6b.universo('todo', '', 300).then((u) => setUniverso(u.activos), () => setUniverso([])) }, [])
  useEffect(() => alCambiar(() => setVersion((v) => v + 1)), [])
  // los globos y los pulsos de trabajo se apagan solos
  useEffect(() => { const t = setInterval(() => { const n = Date.now(); setAhora(n); setGlobos((g) => { const v = Object.entries(g).filter(([, x]) => x && x.hasta > n); return v.length === Object.keys(g).length ? g : Object.fromEntries(v) }) }, 1000); return () => clearInterval(t) }, [])

  const actividad = useMemo(() => actividadDe(todos()), [version]) // eslint-disable-line react-hooks/exhaustive-deps
  const monedas = useMemo(() => monedasDeUniverso(universo, actividad), [universo, actividad])

  const pulso = useCallback((a: IdAgente, s = 5) => setPulsos((p) => ({ ...p, [a]: Date.now() + s * 1000 })), [])
  const globo = useCallback((a: IdAgente, texto: string, s = 6) => setGlobos((g) => ({ ...g, [a]: { texto, t: Date.now(), hasta: Date.now() + s * 1000 } })), [])
  const leer = useCallback((texto: string | null) => { if (texto) setLeido({ texto, t: Date.now() }) }, [])

  /** Lo que un evento hace en la sala: quién trabaja, qué dice su globo, a dónde va la araña, qué papel viaja. */
  const enSala = useCallback((e: Ev, x = 1) => {
    const es = escena.current
    const ms = monedasDe(e)
    const viajar = (rotulo: string | null, puerto?: Puerto) => {
      leer(rotulo)
      if (ms.length) ms.slice(0, 3).forEach((s, i) => { if (!es?.viajar({ sym: s, rotulo: i === 0 ? rotulo : null }) && i === 0) es?.viajar({ puerto, rotulo }) })
      else es?.viajar({ puerto, rotulo })
    }
    switch (e.tipo) {
      case 'turno_abierto': setEnCurso((c) => ({ ...c, luffy: true })); globo('luffy', `${ABRE[e.modo] ?? 'trabajando'}…`, 180 / x); break
      case 'turno_cerrado': setEnCurso((c) => ({ ...c, luffy: false })); globo('luffy', `listo · ${e.herramientas} paso${e.herramientas === 1 ? '' : 's'} · ${Math.round(e.duracion_s)} s`, 5 / Math.min(x, 2)); break
      case 'agente_convocado': { const a = comoAgente(e.agente); if (a) { setEnCurso((c) => ({ ...c, [a]: true })); globo('luffy', `convocando al ${NOMBRE[a]}…`, 120 / x); globo(a, 'recibiendo el encargo…', 300 / x); es?.entregar('luffy', a) } break }
      case 'agente_terminado': { const a = comoAgente(e.agente); if (a) { setEnCurso((c) => ({ ...c, [a]: false })); globo(a, e.ok ? 'entregando a Luffy' : 'entrega con error', 4); es?.entregar(a, 'luffy') } break }
      case 'herramienta': {
        const a = comoAgente(e.quien)
        if (a) { pulso(a, 4 / x); globo(a, `${pasoDe(e)}…`, (a === 'luffy' ? 120 : 60) / x) }
        if (e.fuente) es?.fuente(e.fuente, e.ok)
        if (ms.length) ms.slice(0, 2).forEach((s) => es?.viajar({ sym: s, rotulo: null }))
        break
      }
      case 'jev': {
        pulso('jev', 6)
        setGlobos((g) => { const p = g.jev, n = (p && p.hasta > Date.now() && /^clasificando/.test(p.texto) ? Number(p.texto.match(/\d+/)?.[0] ?? 0) : 0) + (e.n ?? 0); return { ...g, jev: { texto: `clasificando ${n} publicacion${n === 1 ? '' : 'es'}…`, t: p?.t ?? Date.now(), hasta: Date.now() + 6000 } } })
        if (Date.now() - papelJev.current > 8000) { papelJev.current = Date.now(); es?.entregar('crawler', 'jev') }
        viajar(rotuloDe(e), 'social')
        break
      }
      case 'fuente_leida': {
        es?.fuente(e.fuente, e.ok)
        const grupo = e.grupo
        if (grupo === 'listados' || grupo === 'gobernanza') {
          // los listados llegan de a cuatro sitios en el mismo segundo: una sola lectura, con el que falló a la vista
          const b = listados.current && Date.now() - listados.current.t < 1500 ? listados.current : (listados.current = { t: Date.now(), evs: [] })
          b.evs.push(e)
          if (b.evs.length === 1) setTimeout(() => {
            if (listados.current === b) listados.current = null
            const evs = b.evs, malos = evs.filter((v) => !(v as { ok?: boolean }).ok), m = malos[0]
            const nombre = grupo === 'listados' ? 'Listados' : 'Votaciones'
            const r = `${nombre}: ${evs.length - malos.length} al día${m ? ` · ${rotuloDe(m)}` : ''}`
            pulso('crawler', 4); globo('crawler', `${grupo === 'listados' ? 'revisando listados' : 'revisando votaciones'}…`, 5)
            leer(r); es?.viajar({ puerto: puertoDe(e.fuente, grupo), rotulo: r })
            monedasDe(e).forEach((s) => es?.viajar({ sym: s, rotulo: null }))
          }, 900)
          break
        }
        pulso('crawler', 5)
        globo('crawler', e.fuente === 'x' ? 'leyendo X…' : e.fuente === 'telegram_fuente' ? 'leyendo Telegram…' : `${DATOS_DE[e.fuente] ?? `leyendo ${e.fuente.replace(/_/g, ' ')}`}…`, 6)
        viajar(rotuloDe(e), puertoDe(e.fuente, grupo))
        break
      }
      case 'radar_ciclo': es?.barrer(); pulso('crawler', 4); globo('crawler', `radar ${e.modo}: ${e.n_candidatas} de ${e.n_evaluados}`, 6); viajar(rotuloDe(e)); if (e.n_candidatas > 0) es?.entregar('crawler', 'luffy'); break
      case 'modelo': { const a = comoAgente(e.quien) ?? 'luffy'; pulso(a, 3 / x); globo(a, `pensando${e.iteracion ? ` · vuelta ${e.iteracion}` : ''}${e.costo_usd ? ` · ${fmtUsd(e.costo_usd, 3)}` : ''}`, 60 / x); break }
      case 'caja_ciclo': if (!e.corrio) globo('luffy', 'la caja: sin novedades', 5); break
      case 'reconciliacion': es?.fuente('bingx', !e.discrepancias); break
      case 'alerta': viajar(rotuloDe(e)); break
      case 'propuesta': globo('luffy', `propone ${e.accion} ${e.par}`, 6); viajar(rotuloDe(e)); break
      case 'orden': viajar(rotuloDe(e)); break
      default: break
    }
  }, [globo, pulso, leer])

  const anotar = useCallback((e: EventoOficina) => {
    const a = e.tipo === 'turno_abierto' || e.tipo === 'turno_cerrado' || e.tipo === 'caja_ciclo' ? 'luffy' : e.tipo === 'agente_convocado' || e.tipo === 'agente_terminado' ? comoAgente(e.agente) : e.tipo === 'herramienta' ? comoAgente(e.quien) : e.tipo === 'jev' ? 'jev' : e.tipo === 'fuente_leida' || e.tipo === 'radar_ciclo' ? 'crawler' : null
    const d = a && describir(e)
    if (a && d) setUltimo((u) => ({ ...u, [a]: { texto: e.tipo === 'herramienta' ? pasoDe(e as Ev) : d.texto, hora: e.hora } }))
  }, [])

  useEffect(() => {
    if (!estado) return
    let cerrar: (() => void) | null = null, vivo = true
    // el registro arranca con lo último que pasó; después sigue en vivo desde ahí
    const ultimoId = estado.eventos_ultimo_id ?? null
    const empezar = (desde: number | null) => { if (!vivo) return; cerrar = luffy6b.eventos((e) => {
      if (e.tipo === 'latido') return
      anotarHistoria(e as Ev)
      setRegistro((r) => sumar(r, e))
      anotar(e)
      if (!enRep.current) enSala(e as Ev)
    }, setConectado, desde) }
    const tiempos: number[] = []
    if (ultimoId) luffy6b.eventosRecientes(Math.max(0, ultimoId - 120), 120).then((r) => {
      if (!vivo) return
      setRegistro(r.items.reduce(sumar, [] as Registro[])); r.items.forEach(anotar); empezar(r.ultimo_id ?? ultimoId)
      // la puesta al día: lo que pasó de verdad en los últimos 10 minutos, pasado rápido por la sala (con su aviso), y después en vivo
      const diez = (r.items as Ev[]).filter((e) => e.tipo !== 'latido' && Date.now() - Date.parse(e.hora) < 10 * 60_000)
      if (diez.length) {
        setAlDia(Date.parse(diez[0].hora))
        // una ráfaga (los cuatro sitios de listados, las tandas de Jev del mismo segundo) sale junta
        let k = 0
        diez.forEach((e, i) => {
          const a = diez[i - 1]
          if (a && !(a.tipo === e.tipo && Math.abs(Date.parse(e.hora) - Date.parse(a.hora)) < 3000)) k++
          tiempos.push(window.setTimeout(() => { if (vivo && !enRep.current) enSala(e, 6) }, 900 + k * 700))
        })
        tiempos.push(window.setTimeout(() => { if (vivo) setAlDia(null) }, 900 + k * 700 + 3000))
      }
    }, () => empezar(ultimoId))
    else empezar(null)
    // la historia de 24 h, después de pintar: las hojas, los turnos para repetir y el grosor de los hilos
    const t = setTimeout(() => { historia(ultimoId).finally(() => { if (vivo) setCargada(true) }) }, 1200)
    return () => { vivo = false; clearTimeout(t); tiempos.forEach(clearTimeout); cerrar?.() }
  }, [estado?.eventos_ultimo_id]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- repetir un turno ---------- */
  const repetir = useCallback((t: Turno) => {
    setAbierta(null)
    enRep.current = true
    escena.current?.limpiar()
    setGlobos({}); setEnCurso({}); setPulsos({}); setLeido(null)
    setRep({ turno: t, i: 0, vt: 0, vel: 4, pausa: false, fin: false, cargando: true })
    document.querySelector('.lf-ofi2__sala')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // la línea real del turno (con el costo de cada llamada); sin ella, los eventos
    void lineaTurno(t).then((l) => setRep((r) => (r && r.turno.clave === t.clave ? (l ? { ...r, turno: { ...t, pasos: l.pasos }, ts: l.ts, costos: l.costos, total: l.total, nota: l.completo ? null : l.nota, cargando: false } : { ...r, cargando: false }) : r)))
  }, [])
  const salirRep = useCallback(() => { enRep.current = false; setRep(null); setGlobos({}); setLeido(null); escena.current?.limpiar(); void cargarEstado() }, [cargarEstado])
  const tiempos = useMemo(() => {
    if (!rep) return []
    // la hora real de cada paso, con lo que pasó en el mismo segundo separado un poco y las esperas largas acortadas
    const t0 = Date.parse(rep.turno.desde); let prev = -1
    return rep.turno.pasos.map((p, i) => { let s = rep.ts ? rep.ts[i] : (Date.parse(p.hora) - t0) / 1000; s = Math.max(s, prev + (rep.ts ? 0.35 : 0.8)); if (s - prev > 20) s = prev + 20; prev = s; return s })
  }, [rep?.turno, rep?.ts]) // eslint-disable-line react-hooks/exhaustive-deps
  // el reloj de la repetición: avanza con la velocidad elegida y suelta en la sala cada paso cuando le toca
  const repRef = useRef(rep)
  useEffect(() => { repRef.current = rep }, [rep])
  useEffect(() => {
    if (!rep || rep.pausa || rep.fin || rep.cargando) return
    const iv = setInterval(() => {
      const r = repRef.current
      if (!r || r.pausa || r.fin || r.cargando) return
      const vt = r.vt + 0.1 * r.vel
      let i = r.i
      while (i < r.turno.pasos.length && tiempos[i] <= vt) { enSala(r.turno.pasos[i], r.vel); i++ }
      const fin = i >= r.turno.pasos.length && vt > (tiempos[tiempos.length - 1] ?? 0) + 2
      const nuevo = { ...r, vt, i, fin }
      repRef.current = nuevo
      setRep(nuevo)
    }, 100)
    return () => clearInterval(iv)
  }, [rep?.pausa, rep?.fin, rep?.turno, rep?.cargando, tiempos, enSala]) // eslint-disable-line react-hooks/exhaustive-deps

  const trabajando = useMemo(() => Object.fromEntries(AGENTES.map((a) => [a, !!enCurso[a] || (pulsos[a] ?? 0) > ahora])) as Record<IdAgente, boolean>, [enCurso, pulsos, ahora])
  const fuentes = useMemo(() => (estado?.fuentes ?? []).map((f) => ({ nombre: f.nombre, etiqueta: f.etiqueta ?? f.nombre.replace(/_/g, ' '), estado: f.estado })), [estado])
  const alAgente = useCallback((a: IdAgente) => setAbierta({ tipo: 'agente', a }), [])
  const alFuente = useCallback((cual: GrupoFuente | Puerto) => setAbierta({ tipo: 'fuente', cual }), [])
  const alMoneda = useCallback((s: string) => navigate(`/luffy/terminal/${encodeURIComponent(s)}`), [navigate])
  const cerrarHoja = useCallback(() => setAbierta(null), [])

  if (error && !estado) return <div className="lf-pag"><EmptyState kind="error" title="No se pudo abrir la oficina." detail={error} /></div>
  const caidas = (estado?.fuentes ?? []).filter((f) => f.estado === 'caida'), fuentesAlDia = (estado?.fuentes ?? []).filter((f) => f.estado === 'al_dia').length
  const cifra = (a: IdAgente) => {
    if (!estado) return ''
    if (a === 'luffy') return `${estado.luffy.turnos_24h} turnos en 24 h · ${fmtUsd(estado.luffy.costo_24h_usd)}`
    if (a === 'crawler') { const t = estado.trabajos.find((x) => /crawler/i.test(x.nombre)); const x = estado.fuentes.find((f) => f.nombre === 'x'); return `${(t as { corridas_24h?: number } | undefined)?.corridas_24h ?? '—'} pasadas en 24 h${x?.ultima_lectura ? ` · leyó ${hace(x.ultima_lectura)}` : ''}` }
    const ag = estado.agentes.find((x) => comoAgente(x.nombre) === a)
    return ag ? `${ag.llamadas_24h.toLocaleString('es-ES')} ${a === 'jev' ? 'clasificaciones' : 'encargos'} en 24 h · ${fmtUsd(ag.costo_24h_usd)}` : ''
  }
  const ultimaVez = (a: IdAgente) => ultimo[a] ?? (() => { const ag = estado?.agentes.find((x) => comoAgente(x.nombre) === a); const t = a === 'luffy' ? estado?.luffy.ultimo_turno : ag?.ultima_actividad; return t ? { texto: a === 'luffy' ? 'último turno' : 'última actividad', hora: t } : null })()
  const ahoraHacen = AGENTES.filter((a) => globos[a]).sort((x, y) => (globos[y]?.t ?? 0) - (globos[x]?.t ?? 0))
  const pasoRep = rep && rep.i > 0 ? rep.turno.pasos[rep.i - 1] : null
  const largo = tiempos[tiempos.length - 1] ?? 1

  return (
    <div className="lf-pag lf-ofi2">
      <div className="lf-pag__cab"><h1 className="lf-pag__t">La oficina <em>en vivo</em></h1>
        <div className="lf-ofi2__acc">
          <button type="button" className="lf-chip" onClick={() => alAgente('luffy')} data-prueba="elegir-turno">Repetir un turno</button>
          <span className="mono lf-ofi2__con" data-conectado={conectado ? 'si' : 'no'}><i className={`lf-gema ${conectado ? 'is-latiendo' : ''}`} />{conectado ? 'conectada' : 'conectando…'}</span>
        </div>
      </div>

      <Seguro t="Agentes">{() => (
        <div className="lf-ofi2__tarjetas" role="list" data-prueba="tarjetas-agentes">
          {AGENTES.map((a) => { const u = ultimaVez(a); return (
            <article key={a} role="listitem" className={`lf-ag ${trabajando[a] ? 'is-trabajando' : ''}`} data-prueba={`tarjeta-${a}`}>
              <header><b>{NOMBRE[a]}</b><span className="mono">{trabajando[a] ? 'trabajando' : 'en reposo'}</span></header>
              <p className="lf-ag__rol">{ROL[a]}</p>
              <p className="lf-ag__ultimo">{u ? <>{u.texto}<em className="mono"> · {hace(u.hora)}</em></> : <em className="mono">sin actividad reciente</em>}</p>
              <p className="lf-ag__cifra mono">{cifra(a)}</p>
              <button type="button" className="lf-ag__abrir" onClick={() => alAgente(a)} aria-label={`${NOMBRE[a]}: su día`} />
            </article>
          ) })}
        </div>
      )}</Seguro>

      <Seguro t="La oficina">{() => (
        <section className={`lf-ofi2__sala ${rep ? 'is-repeticion' : ''}`}>
          {rep && (
            <div className="lf-rep" data-prueba="repeticion">
              <div className="lf-rep__fila">
                <p className="lf-rep__t"><b>Repitiendo</b> {MODO_LLANO[rep.turno.modo] ?? rep.turno.modo} · {fmtHora(rep.turno.desde)}{rep.turno.duracion_s ? ` · ${Math.round(rep.turno.duracion_s)} s` : ''}{usd(rep.turno.costo_usd ?? undefined)}</p>
                <div className="lf-rep__ctl">
                  <button type="button" className="lf-chip" onClick={() => { if (rep.fin) { escena.current?.limpiar(); setGlobos({}); setEnCurso({}) } setRep((r) => (r ? (r.fin ? { ...r, i: 0, vt: 0, fin: false, pausa: false } : { ...r, pausa: !r.pausa }) : r)) }} data-prueba="rep-pausa">{rep.fin ? 'Otra vez' : rep.pausa ? 'Seguir' : 'Pausa'}</button>
                  <div className="lf-rep__vel" role="group" aria-label="Velocidad">{VELOCIDADES.map((v) => <button key={v} type="button" className={rep.vel === v ? 'is-on' : ''} aria-pressed={rep.vel === v} onClick={() => setRep((r) => (r ? { ...r, vel: v } : r))}>{v}×</button>)}</div>
                  <Link className="lf-chip" to={`/luffy/h/${rep.turno.hilo_id}`}>El hilo</Link>
                  <button type="button" className="lf-chip" onClick={salirRep} data-prueba="rep-salir">Volver al vivo</button>
                </div>
              </div>
              <div className="lf-rep__barra"><i style={{ width: `${Math.min(100, (rep.vt / (largo + 2)) * 100)}%` }} /></div>
              <p className="lf-rep__paso mono" data-prueba="rep-paso">{rep.cargando ? 'Trayendo la línea del turno…' : rep.fin ? 'Fin del turno.' : pasoRep ? `${rep.i} de ${rep.turno.pasos.length} · ${describirPaso(pasoRep)}` : 'Empieza…'}{rep.costos && <span className="lf-rep__costo" data-prueba="rep-costo"> · llevamos {fmtUsd(rep.costos.slice(0, rep.i).reduce((a, c) => a + c, 0), 3)}{rep.total ? ` de ${fmtUsd(rep.total, 3)}` : ''}</span>}{rep.nota ? ` · ${rep.nota}` : ''}</p>
            </div>
          )}
          <Escena ref={escena} monedas={monedas} fuentes={fuentes} trabajando={trabajando} actividad={actividad} globos={globos} onAgente={alAgente} onMoneda={alMoneda} onFuente={alFuente} repeticion={!!rep} />
          {/* lo mismo que dicen los globos, en letra legible (en el teléfono la sala es chica) */}
          <div className="lf-ofi2__ahora" aria-live="polite" data-prueba="ahora">
            {alDia && <span className="lf-ofi2__chip is-aldia" data-prueba="al-dia"><b>Puesta al día</b> lo que pasó desde las {fmtHora(new Date(alDia).toISOString())}</span>}
            {ahoraHacen.length || leido ? <>
              {ahoraHacen.slice(0, 4).map((a) => <button type="button" key={a} className="lf-ofi2__chip" onClick={() => alAgente(a)}><b>{NOMBRE[a]}</b> {globos[a]?.texto}</button>)}
              {leido && ahora - leido.t < 8000 && <span className="lf-ofi2__chip is-arana"><b>Araña</b> {leido.texto}</span>}
            </> : alDia ? null : <span className="lf-ofi2__chip is-quieto">Todo en calma{estado?.luffy.ultimo_turno ? ` · último turno ${hace(estado.luffy.ultimo_turno)}` : ''}</span>}
          </div>
          {estado && <p className="lf-ofi2__pie mono">
            {estado.luffy.en_curso.length ? <>Luffy trabajando en {estado.luffy.en_curso.map((t, i) => <span key={t.hilo_id}>{i > 0 && ', '}<Link to={`/luffy/h/${t.hilo_id}`}>«{t.titulo}»</Link></span>)}</> : `Luffy en reposo${estado.luffy.ultimo_turno ? ` · último turno ${hace(estado.luffy.ultimo_turno)}` : ''}`}
            {' · '}fuentes: {fuentesAlDia} al día{caidas.length ? `, caída${caidas.length > 1 ? 's' : ''}: ${caidas.map((f) => f.etiqueta ?? f.nombre).join(', ')}` : ''}
            {' · '}toca un agente, una moneda o una fuente
          </p>}
        </section>
      )}</Seguro>

      <Seguro t="Gasto"><GastoOficina /></Seguro>

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
      <p className="lf-ctrl__nota mono lf-ofi2__fuentes">Fuentes: {(estado?.fuentes ?? []).map((f, i) => <span key={f.nombre}>{i > 0 && ' · '}<button type="button" onClick={() => alFuente(puertoOGrupo(f.nombre))}>{f.etiqueta ?? f.nombre.replace(/_/g, ' ')} {SALUD_LLANO[f.estado]}</button></span>)}</p>

      {abierta?.tipo === 'agente' && <Seguro t="Su día">{() => <HojaAgente a={abierta.a} rol={ROL[abierta.a]} cifra={cifra(abierta.a)} version={version} cargada={cargada} cerrar={cerrarHoja} repetir={repetir} />}</Seguro>}
      {abierta?.tipo === 'fuente' && <Seguro t="Salud de las fuentes">{() => <HojaFuentes cual={abierta.cual} estado={estado} version={version} cargada={cargada} cerrar={cerrarHoja} />}</Seguro>}
    </div>
  )
}
const puertoOGrupo = (nombre: string): Puerto => puertoDe(nombre)
