import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import type React from 'react'
import type { EstadoFuente } from '../tipos6b'

/* ============================================================================
   La oficina de Luffy, dibujada en código (SVG). Original: roca pulida, oro y
   esmeralda; nada tomado de otra oficina más que la idea.

   Una sala isométrica con un escritorio por agente (Luffy al frente, el jefe;
   Cuant, Investigador, Estratega, Jev y el Crawler), la pantalla grande de la
   pared con la araña de oro (el crawler y el radar) tejiendo hilos hacia las
   monedas que se siguen, y las fuentes como objetos con su luz: la antena (lo
   social), el radar de antena parabólica (anuncios y gobernanza) y el servidor
   (exchanges y datos).

   Quién trabaja llega por prop (`trabajando`: teclea y se le enciende la pantalla);
   lo demás, por una referencia: entregar(de, a) (un papel de un escritorio a
   otro), fuente(nombre, ok), viajar({sym | puerto, rotulo}) (la araña camina,
   teje el hilo y muestra lo que leyó; los viajes hacen cola y una ráfaga al mismo
   destino se junta), barrer() y limpiar(). Los globos (qué hace cada uno, en
   llano) llegan por prop. Se toca un agente, una moneda o una fuente. Las animaciones largas
   (la araña que camina, el papel que viaja, el barrido) van en un solo bucle de
   requestAnimationFrame que se apaga cuando no hay nada moviéndose, fuera de
   pantalla o con la pestaña oculta; el tecleo es CSS y se pausa igual. Con
   «reducir movimiento» no hay viajes: los estados cambian sin animación.
   ========================================================================== */

export type IdAgente = 'luffy' | 'cuant' | 'investigador' | 'estratega' | 'jev' | 'crawler'
export interface MonedaEscena { simbolo: string; tipo: 'pablo' | 'caja' | 'candidata' | 'gatillo' | 'actividad' | 'vigilancia' }
export interface FuenteEscena { nombre: string; etiqueta: string; estado: EstadoFuente }
export type GrupoFuente = 'antena' | 'parabolica' | 'servidor'
/** Los puertos de la tela: por dónde entra lo que lee cada fuente (la araña va ahí si lo leído no nombra una moneda). */
export type Puerto = 'social' | 'datos' | 'anuncios' | 'votaciones'
export interface ApiEscena {
  /** un papel que viaja de un escritorio a otro (por omisión, a Luffy) */
  entregar: (de: IdAgente, a?: IdAgente) => void
  fuente: (nombre: string, ok: boolean) => void
  /** la araña camina a la moneda (o al puerto), teje su hilo y muestra lo que leyó; false si no hay a dónde ir */
  viajar: (v: { sym?: string; puerto?: Puerto; rotulo?: string | null }) => boolean
  barrer: () => void
  /** para empezar una repetición: sin viajes ni papeles pendientes */
  limpiar: () => void
}

/* ---------- geometría ---------- */
const SUELO = [[600, 170], [1080, 430], [696, 638], [216, 378]] as const
const ALTO_MURO = 150
// dónde se sienta cada uno (centro del escritorio)
const PUESTO: Record<IdAgente, { x: number; y: number; z?: number }> = {
  crawler: { x: 604, y: 316 },
  cuant: { x: 400, y: 362 },
  jev: { x: 846, y: 382 },
  investigador: { x: 470, y: 470 },
  estratega: { x: 760, y: 486 },
  luffy: { x: 612, y: 560, z: 1.22 },
}
const PANTALLA = { x: 392, y: 22, w: 416, h: 214 }
const CUBO = { x: PANTALLA.x + PANTALLA.w / 2, y: PANTALLA.y + 104 }
const GRUPO_FUENTE: Record<string, GrupoFuente> = {
  x: 'antena', telegram_fuente: 'antena', telegram_grupos: 'antena', telegram: 'antena',
  binance: 'parabolica', upbit: 'parabolica', bithumb: 'parabolica', coinbase: 'parabolica', snapshot: 'parabolica', tally: 'parabolica', gobernanza: 'parabolica', listados: 'parabolica',
}
export const grupoDe = (nombre: string): GrupoFuente => GRUPO_FUENTE[nombre] ?? 'servidor'
// en las esquinas de la pantalla, fuera del óvalo de las monedas
export const PUERTO: Record<Puerto, { x: number; y: number; rotulo: string }> = {
  social: { x: PANTALLA.x + 22, y: PANTALLA.y + 22, rotulo: 'X · TELEGRAM' }, anuncios: { x: PANTALLA.x + PANTALLA.w - 22, y: PANTALLA.y + 22, rotulo: 'LISTADOS' },
  datos: { x: PANTALLA.x + 22, y: PANTALLA.y + PANTALLA.h - 20, rotulo: 'DATOS' }, votaciones: { x: PANTALLA.x + PANTALLA.w - 22, y: PANTALLA.y + PANTALLA.h - 20, rotulo: 'VOTACIONES' },
}
const PUERTO_DE: Record<string, Puerto> = { x: 'social', telegram_fuente: 'social', telegram_grupos: 'social', telegram: 'social', binance: 'anuncios', upbit: 'anuncios', bithumb: 'anuncios', coinbase: 'anuncios', listados: 'anuncios', snapshot: 'votaciones', tally: 'votaciones', gobernanza: 'votaciones' }
export const puertoDe = (fuente: string, grupo?: string): Puerto => PUERTO_DE[fuente] ?? (grupo ? PUERTO_DE[grupo] : undefined) ?? 'datos'
const LUZ: Record<EstadoFuente, string> = { al_dia: '#5FE0A6', atrasada: '#EAD189', caida: '#E0705F', apagada: '#3A3F43', sin_datos: '#5C605D' }
const COLOR_MONEDA: Record<MonedaEscena['tipo'], string> = { pablo: '#5FE0A6', caja: '#5FE0A6', candidata: '#EAD189', gatillo: '#ECE6D8', actividad: '#C9A24B', vigilancia: '#8E918C' }

/* ---------- piezas ---------- */
/** La mesa: tapa en rombo y dos caras. `z` escala todo el puesto. */
function Escritorio({ x, y, z = 1, ancho = 1 }: { x: number; y: number; z?: number; ancho?: number }) {
  const a = 42 * z * ancho, b = 23 * z * ancho, c = 24 * z, d = 13 * z, h = 20 * z
  const N = [x - a + c, y - b - d], E = [x + a + c, y + b - d], S = [x + a - c, y + b + d], O = [x - a - c, y - b + d]
  const p = (q: number[]) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`
  return (
    <g className="es-escritorio">
      <polygon points={[O, S, [S[0], S[1] + h], [O[0], O[1] + h]].map(p).join(' ')} fill="#181B1E" />
      <polygon points={[S, E, [E[0], E[1] + h], [S[0], S[1] + h]].map(p).join(' ')} fill="#111316" />
      <polygon points={[N, E, S, O].map(p).join(' ')} fill="#262B2F" stroke="rgba(201,162,75,0.4)" strokeWidth="1" />
      <line x1={O[0]} y1={O[1]} x2={S[0]} y2={S[1]} stroke="rgba(236,230,216,0.2)" strokeWidth="1" />
    </g>
  )
}

/** El monitor, sobre la mesa, mirando hacia quien se sienta: se enciende cuando el agente trabaja. */
function Monitor({ x, y, z = 1 }: { x: number; y: number; z?: number }) {
  const w = 30 * z, h = 22 * z
  return (
    <g className="es-monitor" transform={`translate(${x} ${y})`}>
      <polygon points={`${-3 * z},${h + 6 * z} ${7 * z},${h + 1 * z} ${12 * z},${h + 4 * z} ${2 * z},${h + 9 * z}`} fill="#2B3035" />
      <rect x={3 * z} y={h - 2 * z} width={3 * z} height={6 * z} fill="#2B3035" />
      <polygon points={`0,${5 * z} ${w},${-5 * z} ${w},${h - 9 * z} 0,${h + 1 * z}`} fill="#0A0C0E" stroke="#3A3F43" strokeWidth="1.2" />
      <polygon className="es-monitor__luz" points={`${2.2 * z},${6.2 * z} ${w - 2.2 * z},${-2.6 * z} ${w - 2.2 * z},${h - 10.5 * z} ${2.2 * z},${h - 1.2 * z}`} />
      <g className="es-monitor__lineas">{[0, 1, 2, 3].map((i) => <line key={i} x1={5 * z} y1={(8.6 + i * 3.6) * z} x2={(14 + (i % 2) * 8) * z} y2={(5.6 + i * 3.6 - (i % 2) * 2.6) * z} />)}</g>
    </g>
  )
}

const TONO: Record<IdAgente, { cuerpo: string; cabeza: string }> = {
  luffy: { cuerpo: '#2A3036', cabeza: '#1FA46F' }, cuant: { cuerpo: '#4A5157', cabeza: '#B9BDB7' }, investigador: { cuerpo: '#33433B', cabeza: '#AEB5AF' },
  estratega: { cuerpo: '#4D4335', cabeza: '#C6BEB1' }, jev: { cuerpo: '#3C4450', cabeza: '#B3B8BE' }, crawler: { cuerpo: '#30413A', cabeza: '#AAB5AF' },
}
/** El personaje, de frente, sentado: silla, cuerpo y cabeza (va detrás de la mesa). Cada agente con su silueta. */
function Personaje({ id, x, y, k }: { id: IdAgente; x: number; y: number; k: number }) {
  const t = TONO[id], cx = x, base = y
  const P = (dx: number, dy: number) => `${(cx + dx * k).toFixed(1)},${(base + dy * k).toFixed(1)}`
  return (
    <g className={`es-pj es-pj--${id}`}>
      {/* respaldo de la silla */}
      <path d={`M${P(-17, 4)} L${P(-17, -38)} Q${P(0, -50)} ${P(17, -38)} L${P(17, 4)} Z`} fill="#14171A" stroke="rgba(236,230,216,0.06)" strokeWidth={1} />
      {id === 'luffy' && <path d={`M${P(-17, -38)} Q${P(0, -50)} ${P(17, -38)}`} fill="none" stroke="#C9A24B" strokeWidth={2} />}
      <g className="es-pj__cuerpo">
        <path d={`M${P(-15, 6)} Q${P(-16, -26)} ${P(0, -28)} Q${P(16, -26)} ${P(15, 6)} Z`} fill={t.cuerpo} stroke="rgba(236,230,216,0.16)" />
        <path d={`M${P(-13, -14)} Q${P(-10, -25)} ${P(0, -26)}`} fill="none" stroke="rgba(236,230,216,0.32)" strokeWidth={1.4} strokeLinecap="round" />
        {id === 'luffy' && <><path d={`M${P(-15, -16)} Q${P(0, -30)} ${P(15, -16)} L${P(12, -22)} Q${P(0, -33)} ${P(-12, -22)} Z`} fill="#C9A24B" /><path d={`M${P(-6, -24)} L${P(0, -14)} L${P(6, -24)}`} fill="none" stroke="#EAD189" strokeWidth={1.4} /></>}
        {id === 'luffy'
          ? <><polygon points={[[0, -55], [10, -48], [10, -35], [0, -28], [-10, -35], [-10, -48]].map(([a, b]) => P(a, b)).join(' ')} fill="#1FA46F" stroke="#EAD189" strokeWidth={1.4} /><polygon points={[[0, -55], [10, -48], [0, -42], [-10, -48]].map(([a, b]) => P(a, b)).join(' ')} fill="#5FE0A6" /><polygon points={[[-3, -51], [-1, -53], [-5, -43], [-7, -43]].map(([a, b]) => P(a, b)).join(' ')} fill="#F2FFF9" opacity="0.6" /></>
          : <circle cx={cx} cy={base - 40 * k} r={10.5 * k} fill={t.cabeza} />}
        {id !== 'luffy' && <><circle cx={cx - 3.6 * k} cy={base - 41 * k} r={1.3 * k} fill="#15181B" /><circle cx={cx + 3.6 * k} cy={base - 41 * k} r={1.3 * k} fill="#15181B" /></>}
        {id === 'cuant' && <g fill="rgba(234,209,137,0.12)" stroke="#EAD189" strokeWidth={1.5}><rect x={cx - 9 * k} y={base - 44 * k} width={7.5 * k} height={5.5 * k} rx={1.5} /><rect x={cx + 1.5 * k} y={base - 44 * k} width={7.5 * k} height={5.5 * k} rx={1.5} /></g>}
        {id === 'investigador' && <path d={`M${P(-15, -26)} Q${P(-14, -60)} ${P(0, -60)} Q${P(14, -60)} ${P(15, -26)} Q${P(10, -40)} ${P(0, -40)} Q${P(-10, -40)} ${P(-15, -26)}`} fill="#18201C" stroke="rgba(95,224,166,0.4)" />}
        {id === 'estratega' && <><rect x={cx - 11 * k} y={base - 44 * k} width={22 * k} height={4.5 * k} rx={2.2 * k} fill="#5FE0A6" opacity="0.9" /><path d={`M${P(-9, -50)} L${P(-4, -57)} L${P(0, -51)} L${P(4, -57)} L${P(9, -50)}`} fill="none" stroke="#EAD189" strokeWidth={1.6} /></>}
        {id === 'jev' && <><path d={`M${P(-12, -42)} a${12 * k} ${12 * k} 0 0 1 ${24 * k} 0`} fill="none" stroke="#EAD189" strokeWidth={2.6 * k} /><rect x={cx - 14.5 * k} y={base - 45 * k} width={5 * k} height={8 * k} rx={2 * k} fill="#C9A24B" /><rect x={cx + 9.5 * k} y={base - 45 * k} width={5 * k} height={8 * k} rx={2 * k} fill="#C9A24B" /></>}
        {id === 'crawler' && <g fill="#0F5A3C" stroke="#5FE0A6" strokeWidth={1.3}><circle cx={cx - 4.4 * k} cy={base - 41 * k} r={3.8 * k} /><circle cx={cx + 4.4 * k} cy={base - 41 * k} r={3.8 * k} /><line x1={cx - 10.5 * k} y1={base - 42 * k} x2={cx + 10.5 * k} y2={base - 42 * k} /></g>}
      </g>
    </g>
  )
}
/** Lo que va sobre la mesa, delante del cuerpo: el teclado y las manos que teclean. */
function Manos({ id, x, y, k }: { id: IdAgente; x: number; y: number; k: number }) {
  const c = TONO[id].cabeza === '#1FA46F' ? '#2FB57E' : TONO[id].cabeza
  return (
    <g className="es-pj__manos">
      <polygon points={`${x - 15 * k},${y + 1 * k} ${x + 1 * k},${y - 7 * k} ${x + 13 * k},${y - 1 * k} ${x - 3 * k},${y + 7 * k}`} fill="#2E3438" stroke="rgba(236,230,216,0.14)" />
      <ellipse className="es-mano es-mano--i" cx={x - 7 * k} cy={y - 1 * k} rx={3.6 * k} ry={2.8 * k} fill={c} />
      <ellipse className="es-mano es-mano--d" cx={x + 6 * k} cy={y - 3 * k} rx={3.6 * k} ry={2.8 * k} fill={c} />
      {id === 'investigador' && <g className="es-lupa" transform={`translate(${x + 20 * k} ${y - 2 * k})`}><circle r={5.5 * k} fill="rgba(95,224,166,0.14)" stroke="#EAD189" strokeWidth={1.8} /><line x1={4 * k} y1={4 * k} x2={9 * k} y2={9 * k} stroke="#EAD189" strokeWidth={2.2} /></g>}
    </g>
  )
}

/** Una luz de estado con su nombre al lado. */
function Luz({ x, y, f, rotulo = true, i = 0 }: { x: number; y: number; f: FuenteEscena; rotulo?: boolean; i?: number }) {
  return (
    <g className={`es-luz es-luz--${f.estado}`} data-fuente={f.nombre} style={{ animationDelay: `${(i * 1.37) % 5}s` }}>
      <title>{`${f.etiqueta}: ${f.estado.replace('_', ' ')}`}</title>
      <circle cx={x} cy={y} r={3.4} fill={LUZ[f.estado]} className="es-luz__p" />
      {rotulo && <text x={x + 8} y={y + 3} className="es-mini">{f.etiqueta}</text>}
    </g>
  )
}

const corto = (s: string) => s.replace(/\s*\(.*?\)\s*/g, ' ').replace(/^Binance futures$/i, 'Binance fut.').trim().slice(0, 13)

/* ---------- la escena ---------- */
type Viaje = { sym?: string; puerto?: Puerto; rotulo?: string | null }
const CAPA_GLOBO: IdAgente[] = ['crawler', 'cuant', 'jev', 'investigador', 'estratega', 'luffy']
/** Dónde sale el globo de cada uno: sobre la cabeza; el del Crawler, a su derecha (encima tiene las monedas de la pantalla). */
const GLOBO: Record<IdAgente, { dx: number; dy: number; lado: 'arriba' | 'der' }> = {
  crawler: { dx: 24, dy: -66, lado: 'der' }, cuant: { dx: 0, dy: -112, lado: 'arriba' }, jev: { dx: 0, dy: -112, lado: 'arriba' },
  investigador: { dx: 0, dy: -112, lado: 'arriba' }, estratega: { dx: 0, dy: -112, lado: 'arriba' }, luffy: { dx: 0, dy: -124, lado: 'arriba' },
}
const recorte = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const MIN_X = 182, MAX_X = 1090

function Globo({ id, texto, reciente }: { id: IdAgente; texto: string; reciente: boolean }) {
  const p = PUESTO[id], z = p.z ?? 1, g = GLOBO[id]
  const t = recorte(texto, 38), w = 26 + t.length * 6.65, h = 24
  const ax = p.x + g.dx * z, ay = p.y + g.dy * z
  let x = g.lado === 'der' ? ax + 8 : ax - w / 2
  x = Math.max(MIN_X, Math.min(MAX_X - w, x))
  const y = g.lado === 'der' ? ay - h / 2 : ay - h - 8
  const cola = g.lado === 'der' ? `M${x + 1} ${ay - 5} L${ax} ${ay + 6} L${x + 1} ${ay + 4} Z` : `M${ax - 6} ${y + h - 1} L${ax} ${y + h + 8} L${ax + 6} ${y + h - 1} Z`
  return (
    <g className={`es-globo es-globo--${id} ${reciente ? 'is-reciente' : ''}`} data-prueba={`globo-${id}`} style={{ transformOrigin: `${ax}px ${ay}px` }}>
      <path d={cola} fill="#101412" stroke="rgba(234,209,137,0.55)" strokeWidth="1" />
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="#101412" stroke="rgba(234,209,137,0.55)" strokeWidth="1" />
      <path d={cola.replace(/Z$/, '')} fill="#101412" stroke="none" transform="translate(0 -1.2)" />
      <circle cx={x + 12} cy={y + h / 2} r={2.6} className="es-globo__punto" />
      <text x={x + 21} y={y + h / 2 + 3.8} className="es-globo__t">{t}</text>
    </g>
  )
}

export interface PropsEscena {
  monedas: MonedaEscena[]; fuentes: FuenteEscena[]; trabajando: Partial<Record<IdAgente, boolean>>
  /** actividad reciente por moneda: el grosor del hilo y si la ficha está encendida */
  actividad?: Map<string, { peso: number; ultima: number }>
  globos?: Partial<Record<IdAgente, { texto: string; t: number }>>
  onAgente?: (a: IdAgente) => void; onMoneda?: (s: string) => void; onFuente?: (grupo: GrupoFuente | Puerto) => void
  repeticion?: boolean
}
const tocable = (f?: () => void, etiqueta?: string) => (f ? { role: 'button', tabIndex: 0, 'aria-label': etiqueta, onClick: f, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); f() } } } : {})

export const Escena = forwardRef<ApiEscena, PropsEscena>(function Escena({ monedas, fuentes, trabajando, actividad, globos, onAgente, onMoneda, onFuente, repeticion }, ref) {
  const raiz = useRef<SVGSVGElement>(null)
  const arana = useRef<SVGGElement>(null)
  const seda = useRef<SVGLineElement>(null)
  const rotulo = useRef<SVGGElement>(null)
  const barrido = useRef<SVGLineElement>(null)
  const capaPapeles = useRef<SVGGElement>(null)
  const hilos = useRef<Map<string, SVGLineElement>>(new Map())
  const refuerzo = useRef<Map<string, number>>(new Map())
  const quieto = useRef(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const telefono = useRef(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches)
  const visible = useRef(true)
  const estado = useRef({
    ax: CUBO.x, ay: CUBO.y, sx: CUBO.x, sy: CUBO.y,
    destino: null as null | { x: number; y: number; sym?: string; rotulo?: string | null; vuelta: boolean },
    cola: [] as (Viaje & { x: number; y: number })[], espera: 0, rotuloHasta: 0,
    barrer: 0, papeles: [] as { el: SVGGElement; x0: number; y0: number; x1: number; y1: number; t0: number; a: IdAgente }[], marco: 0,
  })

  // las monedas, en un óvalo alrededor del centro de la pantalla
  const fichas = useMemo(() => {
    const n = Math.max(1, monedas.length)
    return monedas.map((m, i) => {
      const ang = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2
      return { ...m, x: CUBO.x + Math.cos(ang) * 172, y: CUBO.y + Math.sin(ang) * 70 }
    })
  }, [monedas])
  const porSimbolo = useMemo(() => new Map(fichas.map((f) => [f.simbolo, f])), [fichas])
  const grupos = useMemo(() => {
    const g = { antena: [] as FuenteEscena[], parabolica: [] as FuenteEscena[], servidor: [] as FuenteEscena[] }
    for (const f of fuentes) g[grupoDe(f.nombre)].push({ ...f, etiqueta: corto(f.etiqueta) })
    return g
  }, [fuentes])
  const peor = (fs: FuenteEscena[]) => (fs.some((f) => f.estado === 'caida') ? 'caida' : fs.some((f) => f.estado === 'atrasada') ? 'atrasada' : fs.some((f) => f.estado === 'al_dia') ? 'al_dia' : 'apagada') as EstadoFuente
  // el grosor de base de cada hilo: lo que se movió esa moneda en las últimas horas (más reciente, más grueso); tres horas sin nada, apagada
  const base = useMemo(() => {
    const m = new Map<string, { w: number; o: number; apagada: boolean }>(), ahora = Date.now()
    for (const f of fichas) {
      const a = actividad?.get(f.simbolo)
      const apagada = !a || ahora - a.ultima > 3 * 3600_000
      m.set(f.simbolo, { w: apagada ? 0.7 : 1 + Math.min(3.4, a.peso * 0.9), o: apagada ? 0.14 : 0.32 + Math.min(0.5, a.peso * 0.18), apagada })
    }
    return m
  }, [fichas, actividad])
  const baseRef = useRef(base)

  const pintarHilo = (s: string, r: number) => {
    const el = hilos.current.get(s), b = baseRef.current.get(s) ?? { w: 1, o: 0.3 }
    if (el) { el.style.strokeWidth = String(b.w + r * 3); el.style.opacity = String(Math.min(1, b.o + r * 0.7)) }
  }
  useEffect(() => { baseRef.current = base; for (const f of fichas) pintarHilo(f.simbolo, refuerzo.current.get(f.simbolo) ?? 0) }, [base, fichas]) // eslint-disable-line react-hooks/exhaustive-deps

  /** El rótulo de lo que leyó, junto a la moneda o al puerto, sin salirse de la pantalla. */
  const mostrarRotulo = (texto: string, x: number, y: number) => {
    const g = rotulo.current; if (!g) return
    const k = telefono.current ? 1.35 : 1, t = recorte(texto, telefono.current ? 32 : 44), w = (20 + t.length * 6.35) * k, h = 20 * k
    const arriba = y > CUBO.y
    let rx = x - w / 2; rx = Math.max(PANTALLA.x + 6, Math.min(PANTALLA.x + PANTALLA.w - 6 - w, rx))
    const ry = arriba ? y - h - 8 * k : y + 28 * k
    g.setAttribute('transform', `translate(${rx.toFixed(1)} ${Math.max(PANTALLA.y + 4, Math.min(PANTALLA.y + PANTALLA.h - h - 4, ry)).toFixed(1)}) scale(${k})`)
    g.querySelector('rect')?.setAttribute('width', String(w / k))
    const tx = g.querySelector('text'); if (tx) tx.textContent = t
    g.classList.remove('is-visible'); void g.getBBox(); g.classList.add('is-visible')
    estado.current.rotuloHasta = performance.now() + 3200
  }

  /* el bucle: sólo corre mientras algo se mueve */
  const andar = useRef<() => void>(() => {})
  useEffect(() => {
    const e = estado.current
    const siguiente = () => {
      const v = e.cola.shift()
      if (!v) return false
      e.sx = e.ax; e.sy = e.ay
      e.destino = { x: v.x, y: v.y, sym: v.sym, rotulo: v.rotulo, vuelta: false }
      arana.current?.classList.add('is-andando')
      return true
    }
    const paso = (t: number) => {
      e.marco = 0
      let sigue = false
      // la araña: camina a la moneda (o al puerto de la fuente), teje, muestra lo que leyó y sigue con el próximo viaje o vuelve al centro
      if (e.espera && t < e.espera) sigue = true
      else if (e.espera) { e.espera = 0; if (!siguiente()) { e.destino = { x: CUBO.x, y: CUBO.y, vuelta: true }; e.sx = e.ax; e.sy = e.ay } sigue = true }
      else if (!e.destino && e.cola.length) { siguiente(); sigue = true }
      if (e.destino && arana.current && !e.espera) {
        const dx = e.destino.x - e.ax, dy = e.destino.y - e.ay, d = Math.hypot(dx, dy)
        const v = e.cola.length > 2 ? 5.5 : 3.4
        if (d < v) {
          e.ax = e.destino.x; e.ay = e.destino.y
          if (!e.destino.vuelta) {
            const s = e.destino.sym
            if (s) refuerzo.current.set(s, 1)
            if (e.destino.rotulo) mostrarRotulo(e.destino.rotulo, e.ax, e.ay)
            e.espera = t + (e.cola.length > 2 ? 650 : 1300)
            arana.current.classList.remove('is-andando'); arana.current.classList.add('is-teje')
            setTimeout(() => arana.current?.classList.remove('is-teje'), 900)
          } else { e.destino = null; arana.current.classList.remove('is-andando') }
        } else { e.ax += (dx / d) * v; e.ay += (dy / d) * v }
        const ang = Math.atan2(dy, dx) * 180 / Math.PI + 90
        arana.current.setAttribute('transform', `translate(${e.ax.toFixed(1)} ${e.ay.toFixed(1)}) rotate(${e.destino && !e.espera ? ang.toFixed(0) : 0})`)
        // la seda que va dejando
        if (seda.current) { seda.current.setAttribute('x1', String(e.sx)); seda.current.setAttribute('y1', String(e.sy)); seda.current.setAttribute('x2', e.ax.toFixed(1)); seda.current.setAttribute('y2', e.ay.toFixed(1)); seda.current.style.opacity = e.destino && !e.destino.vuelta ? '0.9' : '0' }
        sigue = sigue || !!e.destino || !!e.espera
      }
      if (e.rotuloHasta && t > e.rotuloHasta) { rotulo.current?.classList.remove('is-visible'); e.rotuloHasta = 0 }
      else if (e.rotuloHasta) sigue = true
      // los hilos reforzados vuelven despacio a su grosor
      for (const [s, r] of refuerzo.current) {
        const r2 = Math.max(0, r - 0.004)
        pintarHilo(s, r2)
        if (r2 <= 0) refuerzo.current.delete(s); else { refuerzo.current.set(s, r2); sigue = true }
      }
      // el barrido del radar
      if (e.barrer > 0 && barrido.current) {
        e.barrer -= 1
        const ang = (1 - e.barrer / 120) * Math.PI * 2 - Math.PI / 2
        barrido.current.setAttribute('x2', String(CUBO.x + Math.cos(ang) * 200)); barrido.current.setAttribute('y2', String(CUBO.y + Math.sin(ang) * 96))
        barrido.current.style.opacity = e.barrer > 0 ? '0.9' : '0'
        sigue = true
      }
      // los papeles que viajan de un escritorio a otro
      e.papeles = e.papeles.filter((p) => {
        const k = Math.min(1, (t - p.t0) / 1300)
        const x = p.x0 + (p.x1 - p.x0) * k, y = p.y0 + (p.y1 - p.y0) * k - Math.sin(k * Math.PI) * 60
        p.el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(k * 340).toFixed(0)})`)
        if (k >= 1) { p.el.remove(); const r = raiz.current?.querySelector(`.es-pj--${p.a}`); r?.classList.add('is-recibe'); setTimeout(() => r?.classList.remove('is-recibe'), 900); return false }
        return true
      })
      sigue = sigue || e.papeles.length > 0
      if (sigue && visible.current && !document.hidden) e.marco = requestAnimationFrame(paso)
    }
    andar.current = () => { if (!e.marco && visible.current && !document.hidden && !quieto.current) e.marco = requestAnimationFrame(paso) }
    // fuera de pantalla o con la pestaña oculta, todo quieto (también el tecleo, que es CSS)
    const io = new IntersectionObserver(([x]) => { visible.current = x.isIntersecting; raiz.current?.classList.toggle('is-pausada', !x.isIntersecting); if (x.isIntersecting) andar.current() })
    if (raiz.current) io.observe(raiz.current)
    const vis = () => { raiz.current?.classList.toggle('is-pausada', document.hidden); if (!document.hidden) andar.current() }
    document.addEventListener('visibilitychange', vis)
    const mq = matchMedia('(max-width: 760px)'), alMq = () => { telefono.current = mq.matches }
    mq.addEventListener('change', alMq)
    return () => { io.disconnect(); document.removeEventListener('visibilitychange', vis); mq.removeEventListener('change', alMq); if (e.marco) cancelAnimationFrame(e.marco) }
  }, [])

  useImperativeHandle(ref, () => ({
    entregar: (de, a = 'luffy') => {
      const p0 = PUESTO[de], p1 = PUESTO[a]
      if (!p0 || !p1 || de === a || !capaPapeles.current || quieto.current) return
      // con la pestaña oculta no se apilan papeles
      if (document.hidden || estado.current.papeles.length > 4) return
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.setAttribute('class', 'es-papel')
      g.innerHTML = '<rect x="-7" y="-9" width="14" height="18" rx="1.5" fill="#ECE6D8"/><line x1="-4" y1="-4" x2="4" y2="-4" stroke="#8A6A2A" stroke-width="1.2"/><line x1="-4" y1="0" x2="4" y2="0" stroke="#8A6A2A" stroke-width="1.2"/><line x1="-4" y1="4" x2="2" y2="4" stroke="#8A6A2A" stroke-width="1.2"/>'
      capaPapeles.current.appendChild(g)
      estado.current.papeles.push({ el: g, x0: p0.x - 6, y0: p0.y - 70 * (p0.z ?? 1), x1: p1.x - 6, y1: p1.y - 80 * (p1.z ?? 1), t0: performance.now(), a })
      andar.current()
    },
    fuente: (nombre, ok) => {
      const els = raiz.current?.querySelectorAll(`[data-fuente="${CSS.escape(nombre)}"]`)
      els?.forEach((el) => { el.classList.remove('is-lee', 'is-falla'); void (el as SVGGraphicsElement).getBBox(); el.classList.add(ok ? 'is-lee' : 'is-falla'); setTimeout(() => el.classList.remove('is-lee', 'is-falla'), 1600) })
      const obj = raiz.current?.querySelector(`[data-objeto="${grupoDe(nombre)}"]`)
      obj?.classList.add('is-lee'); setTimeout(() => obj?.classList.remove('is-lee'), 1600)
    },
    viajar: (v) => {
      const f = v.sym ? porSimbolo.get(v.sym.toUpperCase()) : undefined
      const destino = f ?? (v.puerto ? PUERTO[v.puerto] : v.rotulo ? CUBO : undefined)
      if (!destino) return false
      if (quieto.current || document.hidden || !visible.current) {
        // sin viaje: el hilo se refuerza igual y el rótulo aparece donde corresponde
        if (f) { refuerzo.current.set(f.simbolo, 1); pintarHilo(f.simbolo, 1) }
        if (v.rotulo && !document.hidden) mostrarRotulo(v.rotulo, destino.x, destino.y)
        return true
      }
      const e = estado.current
      // una ráfaga (Jev clasifica de a cinco por segundo): el viaje al mismo destino que ya espera en la cola se junta con él
      const igual = e.cola.find((c) => (f ? c.sym === f.simbolo : c.puerto === v.puerto && !c.sym))
      if (igual) { if (v.rotulo) igual.rotulo = v.rotulo; return true }
      if (e.cola.length >= 6) e.cola.shift()
      e.cola.push({ sym: f?.simbolo, puerto: v.puerto, rotulo: v.rotulo, x: destino.x, y: destino.y + (f ? 0 : 0) })
      andar.current()
      return true
    },
    barrer: () => { if (quieto.current) return; estado.current.barrer = 120; andar.current() },
    limpiar: () => { const e = estado.current; e.cola = []; e.papeles.forEach((p) => p.el.remove()); e.papeles = []; rotulo.current?.classList.remove('is-visible') },
  }), [porSimbolo])

  const [fx, fy] = [CUBO.x, CUBO.y]
  const ultimoGlobo = useMemo(() => Object.entries(globos ?? {}).sort((a, b) => (b[1]?.t ?? 0) - (a[1]?.t ?? 0))[0]?.[0], [globos])
  return (
    <svg ref={raiz} className={`es ${repeticion ? 'is-repeticion' : ''}`} viewBox="176 0 920 652" role="group" aria-label="La oficina de Luffy en vivo" data-prueba="escena">
      <defs>
        <linearGradient id="es-muroI" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0E1012" /><stop offset="1" stopColor="#181B1E" /></linearGradient>
        <linearGradient id="es-muroD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#191C1F" /><stop offset="1" stopColor="#0D0F11" /></linearGradient>
        <radialGradient id="es-suelo" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#1B1F22" /><stop offset="1" stopColor="#0E1012" /></radialGradient>
        <radialGradient id="es-pantalla" cx="50%" cy="50%" r="65%"><stop offset="0" stopColor="#0B1F17" /><stop offset="1" stopColor="#050A08" /></radialGradient>
        <radialGradient id="es-oro" cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="#F6E2A6" /><stop offset="0.6" stopColor="#C9A24B" /><stop offset="1" stopColor="#7A5C22" /></radialGradient>
        <linearGradient id="es-mastilI" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#14171A" /><stop offset="1" stopColor="#2B3035" /></linearGradient>
        <linearGradient id="es-mastilD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1A1D20" /><stop offset="1" stopColor="#0C0E10" /></linearGradient>
        <filter id="es-brillo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>

      {/* muros y suelo */}
      <polygon points={`${SUELO[3][0]},${SUELO[3][1]} ${SUELO[0][0]},${SUELO[0][1]} ${SUELO[0][0]},${SUELO[0][1] - ALTO_MURO} ${SUELO[3][0]},${SUELO[3][1] - ALTO_MURO}`} fill="url(#es-muroI)" />
      <polygon points={`${SUELO[0][0]},${SUELO[0][1]} ${SUELO[1][0]},${SUELO[1][1]} ${SUELO[1][0]},${SUELO[1][1] - ALTO_MURO} ${SUELO[0][0]},${SUELO[0][1] - ALTO_MURO}`} fill="url(#es-muroD)" />
      <polyline points={`${SUELO[3][0]},${SUELO[3][1] - ALTO_MURO} ${SUELO[0][0]},${SUELO[0][1] - ALTO_MURO} ${SUELO[1][0]},${SUELO[1][1] - ALTO_MURO}`} fill="none" stroke="rgba(201,162,75,0.45)" strokeWidth="1.2" />
      <polygon points={SUELO.map((p) => p.join(',')).join(' ')} fill="url(#es-suelo)" stroke="rgba(236,230,216,0.08)" />
      <g stroke="rgba(236,230,216,0.04)">{Array.from({ length: 9 }, (_, i) => { const k = (i + 1) / 10; return <line key={`a${i}`} x1={SUELO[0][0] + (SUELO[1][0] - SUELO[0][0]) * k} y1={SUELO[0][1] + (SUELO[1][1] - SUELO[0][1]) * k} x2={SUELO[3][0] + (SUELO[2][0] - SUELO[3][0]) * k} y2={SUELO[3][1] + (SUELO[2][1] - SUELO[3][1]) * k} /> })}{Array.from({ length: 7 }, (_, i) => { const k = (i + 1) / 8; return <line key={`b${i}`} x1={SUELO[0][0] + (SUELO[3][0] - SUELO[0][0]) * k} y1={SUELO[0][1] + (SUELO[3][1] - SUELO[0][1]) * k} x2={SUELO[1][0] + (SUELO[2][0] - SUELO[1][0]) * k} y2={SUELO[1][1] + (SUELO[2][1] - SUELO[1][1]) * k} /> })}</g>

      {/* la pantalla grande con la araña */}
      <g className="es-pantalla">
        <line x1={PANTALLA.x + 60} y1={0} x2={PANTALLA.x + 60} y2={PANTALLA.y} stroke="#3A3F43" strokeWidth="2" />
        <line x1={PANTALLA.x + PANTALLA.w - 60} y1={0} x2={PANTALLA.x + PANTALLA.w - 60} y2={PANTALLA.y} stroke="#3A3F43" strokeWidth="2" />
        <rect x={PANTALLA.x - 6} y={PANTALLA.y - 6} width={PANTALLA.w + 12} height={PANTALLA.h + 12} rx="14" fill="#0A0C0E" stroke="rgba(201,162,75,0.55)" strokeWidth="1.5" />
        <rect x={PANTALLA.x} y={PANTALLA.y} width={PANTALLA.w} height={PANTALLA.h} rx="9" fill="url(#es-pantalla)" />
        <g className="es-tela" stroke="rgba(234,209,137,0.16)" fill="none">
          {[0.33, 0.66, 1].map((k) => <ellipse key={k} cx={fx} cy={fy} rx={190 * k} ry={88 * k} />)}
          {Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return <line key={i} x1={fx} y1={fy} x2={fx + Math.cos(a) * 200} y2={fy + Math.sin(a) * 94} /> })}
        </g>
        <line ref={barrido} className="es-barrido" x1={fx} y1={fy} x2={fx} y2={fy - 90} />
        {/* los puertos: por dónde entra cada fuente a la tela (la araña va ahí cuando lo que leyó no nombra una moneda) */}
        {(Object.keys(PUERTO) as Puerto[]).map((k) => { const q = PUERTO[k]; return (
          <g key={k} className="es-puerto" data-prueba={`puerto-${k}`} {...tocable(onFuente ? () => onFuente(k) : undefined, `Fuentes: ${q.rotulo}`)}>
            <line x1={fx} y1={fy} x2={q.x} y2={q.y} className="es-puerto__hilo" />
            <circle cx={q.x} cy={q.y} r={5} className="es-puerto__p" />
            <text x={q.x + (q.x < fx ? 10 : -10)} y={q.y + 3.5} textAnchor={q.x < fx ? 'start' : 'end'} className="es-mini es-puerto__t">{q.rotulo}</text>
          </g>
        ) })}
        {fichas.map((f) => <line key={`h${f.simbolo}`} ref={(el) => { if (el) hilos.current.set(f.simbolo, el); else hilos.current.delete(f.simbolo) }} className="es-hilo" x1={fx} y1={fy} x2={f.x} y2={f.y} />)}
        <line ref={seda} className="es-seda" x1={fx} y1={fy} x2={fx} y2={fy} />
        {fichas.map((f) => (
          <g key={f.simbolo} className={`es-ficha es-ficha--${f.tipo} ${base.get(f.simbolo)?.apagada ? 'is-apagada' : ''}`} transform={`translate(${f.x} ${f.y})`} data-prueba={`ficha-${f.simbolo}`} {...tocable(onMoneda ? () => onMoneda(f.simbolo) : undefined, `Abrir la ficha de ${f.simbolo}`)}>
            <g className="es-ficha__z">
              <line x1="0" y1="-4" x2="0" y2="2" stroke="rgba(234,209,137,0.6)" />
              {(() => { const t = f.simbolo.slice(0, 7), w = 26 + t.length * 7.6; return <>
                <rect x={-w / 2} y={2} width={w} height={20} rx={5} fill="#0E1411" stroke={COLOR_MONEDA[f.tipo]} strokeOpacity="0.7" />
                <circle cx={-w / 2 + 9} cy={12} r={2.6} fill={COLOR_MONEDA[f.tipo]} />
                <text x={5} y={16} textAnchor="middle" className="es-ticker">{t}</text>
              </> })()}
            </g>
          </g>
        ))}
        {!fichas.length && <text x={fx} y={fy + 70} textAnchor="middle" className="es-mini">sin monedas en seguimiento</text>}
        <g ref={arana} className="es-arana" transform={`translate(${fx} ${fy})`} data-prueba="arana" filter="url(#es-brillo)">
          {[-1, 1].map((s) => [0, 1, 2, 3].map((i) => <path key={`${s}${i}`} className={`es-pata es-pata--${i % 2}`} d={`M0 ${-3 + i * 3} q${s * 9} ${-8 + i * 4} ${s * 15} ${-2 + i * 6}`} fill="none" stroke="#EAD189" strokeWidth="1.6" strokeLinecap="round" />))}
          <ellipse cx="0" cy="4" rx="5.5" ry="7" fill="url(#es-oro)" />
          <circle cx="0" cy="-5" r="4" fill="url(#es-oro)" />
          <circle cx="-1.5" cy="-6" r="0.9" fill="#0F5A3C" /><circle cx="1.5" cy="-6" r="0.9" fill="#0F5A3C" />
        </g>
        <g ref={rotulo} className="es-rotulo-arana" data-prueba="rotulo-arana" aria-live="polite">
          <rect x="0" y="0" width="100" height="20" rx="5" />
          <text x="9" y="13.6" className="es-rotulo-arana__t" />
        </g>
      </g>

      {/* la pizarra del Estratega, en el muro izquierdo */}
      <g className="es-pizarra">
        <polygon points="300,212 382,168 382,226 300,270" fill="#121517" stroke="rgba(201,162,75,0.45)" strokeWidth="1.4" />
        <polyline points="308,256 324,240 338,246 352,222 364,218 376,198" fill="none" stroke="#5FE0A6" strokeWidth="1.8" strokeLinejoin="round" opacity="0.8" />
        <polyline points="308,248 334,238 376,210" fill="none" stroke="#EAD189" strokeWidth="1.1" strokeDasharray="4 4" opacity="0.7" />
        <circle cx="352" cy="222" r="3" fill="#EAD189" />
      </g>
      {/* las fuentes: el servidor (exchanges y datos), la antena (social) y la parabólica (anuncios y gobernanza) */}
      <g className="es-objeto" data-objeto="servidor" data-prueba="objeto-servidor" {...tocable(onFuente ? () => onFuente('servidor') : undefined, 'Fuentes de datos: su salud')}>
        <polygon points="196,214 240,238 240,408 196,384" fill="#16191C" stroke="rgba(236,230,216,0.1)" />
        <polygon points="240,238 286,212 286,382 240,408" fill="#0E1012" />
        <polygon points="196,214 242,188 286,212 240,238" fill="#262B2F" stroke="rgba(201,162,75,0.35)" />
        {Array.from({ length: 8 }, (_, i) => <line key={i} x1={200} y1={246 + i * 19} x2={236} y2={266 + i * 19} stroke="rgba(236,230,216,0.06)" />)}
        {grupos.servidor.slice(0, 8).map((f, i) => <Luz key={f.nombre} x={206 + (i % 2) * 14} y={252 + Math.floor(i / 2) * 36 + (i % 2) * 7.6} f={f} rotulo={false} i={i} />)}
        <circle cx={270} cy={240} r={4} fill={LUZ[peor(grupos.servidor)]} className="es-objeto__luz" />
        <text x={240} y={432} textAnchor="middle" className="es-rotulo">Servidor</text>
      </g>
      {/* la antena (lo social): un mástil de roca pulida sobre el servidor, como él en dos caras (luz y sombra),
          con el filo y dos anillos de oro finos y el emisor con su luz de estado arriba */}
      <g className="es-objeto" data-objeto="antena" data-prueba="objeto-antena" {...tocable(onFuente ? () => onFuente('antena') : undefined, 'Fuentes sociales: su salud')}>
        {/* la base, apoyada en la tapa del servidor */}
        <polygon points="227,206 241,198 255,206 241,214" fill="#262B2F" stroke="rgba(201,162,75,0.4)" strokeWidth="1" />
        <polygon points="227,206 241,214 241,218 227,210" fill="#16191C" />
        <polygon points="241,214 255,206 255,210 241,218" fill="#0E1012" />
        {/* el mástil, afinándose hacia arriba: cara de luz a la izquierda, de sombra a la derecha, el filo en oro */}
        <polygon points="232,206.5 241,211 241,104.2 237.2,102.3" fill="url(#es-mastilI)" />
        <polygon points="241,211 250,206.5 244.8,102.3 241,104.2" fill="url(#es-mastilD)" />
        <line x1="241" y1="211" x2="241" y2="104.2" stroke="rgba(234,209,137,0.55)" strokeWidth="0.9" />
        <line x1="232" y1="206.5" x2="237.2" y2="102.3" stroke="rgba(236,230,216,0.14)" strokeWidth="0.8" />
        {/* el collar a media altura: un tramo más ancho, con la tapa en oro */}
        <polygon points="234.2,160 241,163.6 247.8,160 241,156.4" fill="#2B3035" stroke="rgba(201,162,75,0.6)" strokeWidth="0.9" />
        <polygon points="234.2,160 241,163.6 241,168.6 234.2,165" fill="#1A1D20" />
        <polygon points="241,163.6 247.8,160 247.8,165 241,168.6" fill="#0E1012" />
        {/* los anillos: la mitad de atrás tenue, la de adelante en oro */}
        {[[186, 11.5, 4.4], [134, 8.6, 3.4], [116, 7.4, 2.9]].map(([y, rx, ry]) => (
          <g key={y}>
            <path d={`M${241 - rx} ${y} Q241 ${y - ry * 2} ${241 + rx} ${y}`} fill="none" stroke="rgba(201,162,75,0.28)" strokeWidth="1" />
            <path d={`M${241 - rx} ${y} Q241 ${y + ry * 2} ${241 + rx} ${y}`} fill="none" stroke="#C9A24B" strokeWidth="1.3" />
          </g>
        ))}
        {/* el emisor: una cápsula pulida con la luz de estado */}
        <rect x="237.4" y="90" width="7.2" height="14" rx="3.6" fill="#262B2F" stroke="rgba(234,209,137,0.6)" strokeWidth="0.9" />
        <g className="es-ondas" fill="none" stroke="#5FE0A6" strokeWidth="1.2" strokeLinecap="round">{[11, 19, 27].map((r, i) => <path key={r} className={`es-onda es-onda--${i}`} d={`M${241 - r} ${90 - r * 0.35} Q241 ${90 - r * 1.05} ${241 + r} ${90 - r * 0.35}`} />)}</g>
        <circle cx={241} cy={90} r={4.6} fill={LUZ[peor(grupos.antena)]} className="es-objeto__luz" />
        <circle cx={239.6} cy={88.6} r={1.3} fill="#F2FFF9" opacity="0.55" />
        {grupos.antena.map((f, i) => <Luz key={f.nombre} x={262} y={116 + i * 14} f={f} i={i} />)}
      </g>
      <g className="es-objeto" data-objeto="parabolica" data-prueba="objeto-parabolica" {...tocable(onFuente ? () => onFuente('parabolica') : undefined, 'Anuncios y votaciones: su salud')}>
        <ellipse cx={1010} cy={388} rx={24} ry={9} fill="#15181B" />
        <line x1={1010} y1={386} x2={1006} y2={346} stroke="#5C605D" strokeWidth="3" />
        <path className="es-plato" d="M972 330 Q1004 372 1046 318 Q1010 316 972 330 Z" fill="#23282C" stroke="#8E918C" strokeWidth="1.4" />
        <line x1={1009} y1={334} x2={1022} y2={308} stroke="#8E918C" strokeWidth="1.4" />
        <circle cx={1022} cy={306} r={4.5} fill={LUZ[peor(grupos.parabolica)]} className="es-objeto__luz" />
        {grupos.parabolica.slice(0, 6).map((f, i) => <Luz key={f.nombre} x={1040} y={346 + i * 13} f={f} i={i} />)}
        <text x={1010} y={436} textAnchor="middle" className="es-rotulo">Anuncios</text>
      </g>

      {/* el cable del Crawler a la pantalla */}
      <path d={`M${PUESTO.crawler.x + 18} ${PUESTO.crawler.y - 34} C ${PUESTO.crawler.x + 40} ${PUESTO.crawler.y - 120}, ${CUBO.x + 60} ${PANTALLA.y + PANTALLA.h + 40}, ${CUBO.x + 40} ${PANTALLA.y + PANTALLA.h}`} fill="none" stroke="rgba(95,224,166,0.35)" strokeWidth="2" strokeDasharray="3 4" className="es-cable" />

      {/* los puestos, de atrás hacia adelante: el personaje, la mesa y, encima, monitor y manos */}
      {(['crawler', 'cuant', 'jev', 'investigador', 'estratega', 'luffy'] as IdAgente[]).map((id) => {
        const p = PUESTO[id], z = p.z ?? 1, k = 1.5 * z
        return (
          <g key={id} className={`es-puesto es-puesto--${id} ${trabajando[id] ? 'is-trabajando' : ''}`} data-prueba={`agente-${id}`} data-trabajando={trabajando[id] ? 'si' : 'no'} {...tocable(onAgente ? () => onAgente(id) : undefined, `${NOMBRE[id]}: su día`)}>
            <ellipse cx={p.x} cy={p.y + 26 * z} rx={72 * z} ry={18 * z} fill="rgba(0,0,0,0.38)" className="es-puesto__sombra" />
            <Personaje id={id} x={p.x - 2 * z} y={p.y - (id === 'luffy' ? 30 : 14) * z} k={k} />
            <Escritorio x={p.x} y={p.y} z={z} ancho={id === 'luffy' ? 1.25 : 1} />
            {id === 'luffy' && <Monitor x={p.x - 52 * z} y={p.y - 30 * z} z={z * 0.9} />}
            <Monitor x={p.x + 18 * z} y={p.y - 34 * z} z={z} />
            <Manos id={id} x={p.x - 2 * z} y={p.y - (id === 'luffy' ? 8 : 4) * z} k={k * 0.75} />
            <text x={p.x + (id === 'luffy' ? 30 : 0)} y={p.y + (id === 'luffy' ? 62 : 50) * z} className="es-rotulo" textAnchor="middle">{NOMBRE[id]}</text>
            {id === 'jev' && <g className="es-posts">{[0, 1, 2].map((i) => <rect key={i} className={`es-post es-post--${i}`} x={p.x - 34 + i * 13} y={p.y - 110} width={11} height={8} rx={1.5} />)}</g>}
          </g>
        )
      })}
      <g ref={capaPapeles} />
      {/* los globos, encima de todo: lo que cada uno está haciendo, en llano */}
      <g className="es-globos">{CAPA_GLOBO.map((id) => { const g = globos?.[id]; return g ? <Globo key={`${id}${g.t}`} id={id} texto={g.texto} reciente={id === ultimoGlobo} /> : null })}</g>
      {repeticion && <g className="es-marca-rep"><rect x={190} y={8} width={120} height={22} rx={11} /><text x={250} y={23} textAnchor="middle">REPETICIÓN</text></g>}
    </svg>
  )
})

export const NOMBRE: Record<IdAgente, string> = { luffy: 'Luffy', cuant: 'Cuant', investigador: 'Investigador', estratega: 'Estratega', jev: 'Jev', crawler: 'Crawler' }
