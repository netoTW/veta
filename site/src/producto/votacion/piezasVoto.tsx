import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { fecha, fechaHora, num, pct, usd } from '../../lib/formato'

/* ============================================================================
   Votación semanal — piezas.

   La candidata es una piedra cerrada: todavía nadie la analizó. Lo que se ve
   en su superficie es la señal que el scanner detectó: la veta de esmeralda
   asoma por una grieta cuando hubo volumen o liquidez anómalos; el hilo de
   oro cruza la roca cuando hay ingresos reales; la piedra recién partida es
   un token muy joven. La más votada se ilumina en vivo. Nada de esto es un
   veredicto: el tier lo pone el análisis, después.
   ========================================================================== */

export interface Disparador { disparador: string; detalle: string; valor: number | null; fuente: string }
export interface Candidata {
  simbolo: string; nombre: string; carril: string; puntaje: number
  disparadores: Disparador[]; flags_riesgo: string[]; metricas: Record<string, unknown>; razon: string; votos: number
}
export interface Velada { n_disparadores: number; carril: string; n_flags: number }
export interface InformeGanadora { id: string; tipo: string; fecha_publicacion: string; tier: string }
export interface Votacion {
  id: number; semana: string; estado: 'abierta' | 'cerrada'; abre: string; cierra: string; cerrada_en: string | null
  n_candidatas: number; total_votos: number; ganadora: string | null; ganadora_nombre: string | null
  cola_estado: 'pendiente' | 'lanzado'; lanzado_en: string | null; informe: InformeGanadora | null
  candidatas?: Candidata[]; mi_voto?: { simbolo: string; fecha: string } | null; veladas?: Velada[]
}
export interface Embudo { bajadas: number | null; excluidas: number | null; elegibles: number | null; con_disparador: number | null; generado: string | null }
export interface RespuestaVotacion { activa: Votacion | null; historico: Votacion[]; embudo: Embudo; puede_votar: boolean }

/* ---------- firma mineral: qué señal detectó el scanner ---------- */
export type Firma = 'triple' | 'doble' | 'oro' | 'esmeralda' | 'joven'
const esVol = (d: string) => /volumen|tvl|liquidez/i.test(d)
const esRev = (d: string) => /revenue|ingres/i.test(d)
const esCaja = (d: string) => /caja/i.test(d)
const esJoven = (d: string) => /joven/i.test(d)

export function firmaDe(disparadores: Disparador[]): Firma {
  const ds = disparadores.map((d) => d.disparador)
  const vol = ds.some(esVol), rev = ds.some(esRev), caja = ds.some(esCaja), joven = ds.some(esJoven)
  if (vol && rev && caja) return 'triple'
  if (vol && rev) return 'doble'
  if (joven && !rev) return 'joven'
  if (rev) return 'oro'
  if (vol) return 'esmeralda'
  return joven ? 'joven' : 'esmeralda'
}
/** Para las veladas sólo sabemos cuántas señales hubo y el carril. */
export function firmaVelada(v: Velada): Firma {
  if (v.carril === 'B') return 'joven'
  return v.n_disparadores >= 3 ? 'triple' : v.n_disparadores === 2 ? 'doble' : 'esmeralda'
}
export const SENAL_LLANA: Record<string, string> = {
  'volumen anómalo': 'Volumen fuera de lo normal',
  'revenue alto frente a su capitalización': 'Ingresos altos para lo que vale',
  'el token participa de la caja': 'El token cobra parte de la caja',
  'token muy joven': 'Token muy joven',
  'TVL relevante para su antigüedad': 'Mucho capital depositado para su edad',
}
export const senalLlana = (d: string) => SENAL_LLANA[d] ?? d
/** Qué material lleva la señal: la caja y los ingresos son oro; el movimiento, esmeralda. */
export const materialDe = (d: string): 'oro' | 'esmeralda' | 'hueso' => (esRev(d) || esCaja(d) ? 'oro' : esJoven(d) ? 'hueso' : 'esmeralda')

/* ---------- la piedra ---------- */
export function Piedra({ firma, size = 200, className = '', lit = false, velada = false }: { firma: Firma; size?: number; className?: string; lit?: boolean; velada?: boolean }) {
  const src = `/img/voto/${firma}-${size <= 64 ? 96 : 480}.webp`
  return (
    <span className={`vt-piedra ${lit ? 'is-lit' : ''} ${velada ? 'is-velada' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="vt-piedra__luz" />
      <img src={src} alt="" width={size} height={size} draggable={false} decoding="async" loading={size > 100 ? 'eager' : 'lazy'} />
      <span className="vt-piedra__brillo" />
    </span>
  )
}

/* ---------- cuenta regresiva viva ---------- */
export function useAhora(paso = 1000) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setT(Date.now()), paso); return () => clearInterval(id) }, [paso])
  return t
}
const dos = (n: number) => String(n).padStart(2, '0')
export function partesRestantes(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60, total: s }
}
export function fechaCierre(iso: string) {
  const d = new Date(iso)
  const t = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '')
  return `${t.charAt(0).toUpperCase()}${t.slice(1)} · ${dos(d.getHours())}:${dos(d.getMinutes())}`
}

/** La mecha: un hilo de oro que se consume de la apertura al cierre. */
export function Mecha({ abre, cierra, estado, cerradaEn, compacta = false }: { abre: string; cierra: string; estado: 'abierta' | 'cerrada'; cerradaEn?: string | null; compacta?: boolean }) {
  const ahora = useAhora(1000)
  const a = Date.parse(abre), c = Date.parse(cierra)
  const cerrada = estado === 'cerrada'
  const fin = cerrada ? Date.parse(cerradaEn ?? cierra) : ahora
  const avance = Math.min(1, Math.max(0, (fin - a) / Math.max(1, c - a)))
  const r = partesRestantes(c - ahora)
  const vencida = !cerrada && r.total === 0
  const urgente = !cerrada && !vencida && r.total < 6 * 3600
  return (
    <div className={`vt-mecha ${compacta ? 'vt-mecha--compacta' : ''} ${cerrada ? 'is-cerrada' : ''} ${urgente ? 'is-urgente' : ''} ${vencida ? 'is-vencida' : ''}`} role="timer" aria-live="off">
      <div className="vt-mecha__cab">
        <span className="vt-mecha__k mono">{cerrada ? 'Cerró' : vencida ? 'Cerrando' : 'Cierra'}</span>
        <span className="vt-mecha__cuando">{cerrada ? fechaHora(cerradaEn ?? cierra) : fechaCierre(cierra)}</span>
        {!cerrada && !vencida && (
          <span className="vt-mecha__resta mono" aria-label={`faltan ${r.d} días ${r.h} horas ${r.m} minutos`}>
            {r.d > 0 && <><b>{r.d}</b><i>d</i></>}
            <b>{dos(r.h)}</b><i>h</i><b>{dos(r.m)}</b><i>m</i><b className="vt-mecha__seg">{dos(r.s)}</b><i>s</i>
          </span>
        )}
        {vencida && <span className="vt-mecha__resta mono"><b>00</b><i>h</i><b>00</b><i>m</i><b className="vt-mecha__seg">00</b><i>s</i></span>}
      </div>
      <div className="vt-mecha__hilo" aria-hidden="true">
        <span className="vt-mecha__quemado" style={{ width: `${avance * 100}%` }} />
        <span className="vt-mecha__brasa" style={{ left: `${avance * 100}%` }} />
      </div>
      {!compacta && (
        <div className="vt-mecha__pie mono">
          <span>abrió {fecha(abre)}</span>
          <span>{cerrada ? 'recuento hecho' : vencida ? 'se cerró el plazo · el recuento es manual' : 'un voto por socio · no se cambia'}</span>
        </div>
      )}
    </div>
  )
}

/* ---------- el embudo: cuánto se descartó para llegar a la lista ---------- */
export function EmbudoStrip({ e, n }: { e: Embudo; n: number }) {
  if (!e.bajadas) return null
  const pasos: { v: number | null; k: string; tono?: string }[] = [
    { v: e.bajadas, k: 'monedas revisadas' },
    { v: e.excluidas, k: 'descartadas de entrada' },
    { v: e.elegibles, k: 'elegibles' },
    { v: e.con_disparador, k: 'con una señal real' },
    { v: n, k: 'en votación', tono: 'oro' },
  ]
  return (
    <ol className="vt-embudo" aria-label="De cuántas monedas sale esta lista">
      {pasos.map((p, i) => (
        <li key={p.k} className={`vt-embudo__paso ${p.tono ? `is-${p.tono}` : ''}`} style={{ ['--i' as string]: i }}>
          <b className="mono">{p.v === null ? '—' : num(p.v)}</b>
          <span>{p.k}</span>
        </li>
      ))}
      {e.generado && <li className="vt-embudo__fecha mono">revisión del {fecha(e.generado)}</li>}
    </ol>
  )
}

/* ---------- métricas llanas de una candidata ---------- */
export function MetricasCandidata({ m }: { m: Record<string, unknown> }) {
  const n = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : null)
  const items: { k: string; v: string }[] = []
  if (n('mcap_usd') !== null) items.push({ k: 'Vale', v: usd(n('mcap_usd')) })
  if (n('vol24h_usd') !== null) items.push({ k: 'Movió en 24 h', v: usd(n('vol24h_usd')) })
  if (n('revenue_anual_sobre_mcap') !== null) items.push({ k: 'Ingresos / valor', v: pct((n('revenue_anual_sobre_mcap') as number) * 100, 1) })
  if (n('cambio_7d_pct') !== null) items.push({ k: '7 días', v: pct(n('cambio_7d_pct'), 1, true) })
  if (n('dias_cotizando') !== null) items.push({ k: 'Cotiza hace', v: `${num(n('dias_cotizando'))} d` })
  if (!items.length) return null
  return (
    <dl className="vt-metricas">
      {items.slice(0, 4).map((it) => <div key={it.k}><dt className="mono">{it.k}</dt><dd className="mono">{it.v}</dd></div>)}
    </dl>
  )
}

/* ---------- enlace al informe de la ganadora ---------- */
export function EstadoGanadora({ v, children }: { v: Votacion; children?: ReactNode }) {
  if (v.informe) {
    const href = v.informe.tipo === 'gema' ? `/gemas/${v.informe.id}` : `/analisis/${v.informe.id}`
    return <p className="vt-cola vt-cola--publicado"><span className="vt-cola__dot" aria-hidden="true" /><span>Análisis publicado el {fecha(v.informe.fecha_publicacion)}.</span> <Link to={href} className="vt-cola__ir">Leer el análisis</Link>{children}</p>
  }
  if (v.cola_estado === 'lanzado') return <p className="vt-cola vt-cola--lanzado"><span className="vt-cola__dot" aria-hidden="true" /><span>Análisis en marcha desde el {fecha(v.lanzado_en)}. Se publica cuando pasa la revisión.</span>{children}</p>
  return <p className="vt-cola"><span className="vt-cola__dot" aria-hidden="true" /><span>En cola para análisis.</span>{children}</p>
}
