import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AuthEscena, type EstadoEscena } from '../../auth/AuthEscena'
import { controlInicial, type Control } from '../../three/HeroScene'
import { Dato, Advertencias, PlanBadge, Puerta } from '../piezas'
import { fecha, fechaHora, mult, num, precio, usd } from '../../lib/formato'
import { sinReferencias } from '../../lib/lenguaje'

/** Texto del motor sin sus referencias internas: «· motor §4.1», «§8 S7», «(§3)». */
export const llano = (t: string) => sinReferencias(t).replace(/\s*·\s*motor\s*§[\d.]+/g, '').replace(/\s*§[\d.]+(\s*S\d+)?/g, '').replace(/\s{2,}/g, ' ').trim()
import { useDatos } from '../../lib/datos'
import type { Advertencia, Tier } from '../../lib/contrato'

/* ============================================================================
   Analiza tu moneda — piezas.

   El determinista es la lectura estructural, gratis: cinco bloques, cada
   uno con su lectura en una palabra, su frase y sus cifras. El profundo es
   el análisis completo; mientras se hace, la roca del hero muestra el
   avance REAL que reporta el sistema, etapa por etapa, y al final se abre
   según el riesgo. Nada de esto dice "es gema": eso lo decide la mesa.
   ========================================================================== */

export type Etapa = 'recolectando' | 'calculando' | 'esceptico' | 'redactando' | 'verificando'
export const ETAPAS: Etapa[] = ['recolectando', 'calculando', 'esceptico', 'redactando', 'verificando']
export type EstadoSolicitud = 'en_cola' | 'en_curso' | 'listo' | 'fallido' | 'bloqueado'
export interface Cifra { k: string; v: number | string | null; unidad?: string }
export interface Bloque { lectura: string; texto: string; fuente: string | null; cifras: Cifra[]; condiciones?: { nombre: string; cumple: boolean; detalle: string }[] }
export interface Lectura {
  nivel: 'determinista'; origen_motor: string; simbolo: string; nombre: string; cadena: string | null; fecha_datos: string; precio_usd: number | null
  demanda: Bloque; riesgo_cola: Bloque; concentracion: Bloque; tokenomics: Bloque; liquidez: Bloque
  advertencias: Advertencia[]; fuentes: { campo: string; fuente: string; timestamp: string; calidad: string }[]
}
export interface Cupo { plan: string; ilimitado: boolean; incluidos: number; usados: number; restantes: number | null; periodo: string; fecha_reinicio: string }
export interface Solicitud {
  id: string; simbolo: string; nombre: string | null; nivel: 'determinista' | 'profundo'; estado: EstadoSolicitud; etapa: Etapa | null; avance: number | null; detalle: string | null
  etapas_hechas: Etapa[]; consume_cupo: boolean; motor: string; creada: string; iniciada: string | null; terminada: string | null; vista: boolean
  fallo: { codigo: string; texto: string } | null; verificador: { estado: string; motivo_bloqueo: string } | null; resultado: Record<string, unknown> | null; tier: Tier | null
  enviada?: boolean; posicion_cola?: number | null
}
export interface Moneda { simbolo: string; nombre: string; id_coingecko?: string; cadena?: string; con_informe: boolean }

export const useCupo = () => useDatos<{ cupo: Cupo | null; plan_minimo: string; puede_profundo: boolean }>('/api/analizar/cupo')
export const useUniverso = () => useDatos<{ monedas: Moneda[]; motor: string }>('/api/analizar/universo')

/* ---------- vocabulario llano ---------- */
export const ETAPA_LABEL: Record<Etapa, { titulo: string; que: string }> = {
  recolectando: { titulo: 'Trayendo los datos', que: 'precio, futuros, ingresos, quién tiene el token' },
  calculando: { titulo: 'Calculando el riesgo', que: 'cola de caídas, las dos varas, concentración' },
  esceptico: { titulo: 'Buscando objeciones', que: 'el escéptico ataca la lectura antes de que se escriba' },
  redactando: { titulo: 'Redactando', que: 'tesis en una línea, escenarios, qué la invalidaría' },
  verificando: { titulo: 'Verificando cifras', que: 'cada número contra su fuente; si no coincide, no sale' },
}
export const LECTURA_LABEL: Record<string, { t: string; tono: 'esm' | 'oro' | 'rojo' | 'mudo' | 'hueso' }> = {
  demanda_real: { t: 'Demanda real', tono: 'esm' }, apalancamiento: { t: 'Castillo de apalancamiento', tono: 'rojo' }, mixta: { t: 'Mixta', tono: 'oro' },
  contenida: { t: 'Cola contenida', tono: 'esm' }, alta: { t: 'Cola alta', tono: 'oro' }, extrema: { t: 'Cola extrema', tono: 'rojo' },
  dispersa: { t: 'Dispersa', tono: 'esm' }, concentrada: { t: 'Concentrada', tono: 'oro' }, muy_concentrada: { t: 'Muy concentrada', tono: 'rojo' },
  captura_verificada: { t: 'El token cobra, verificado', tono: 'esm' }, captura_declarada: { t: 'Cobra, sin verificar', tono: 'oro' }, sin_captura: { t: 'No cobra', tono: 'rojo' },
  profunda: { t: 'Profunda', tono: 'esm' }, suficiente: { t: 'Suficiente', tono: 'oro' }, fina: { t: 'Fina', tono: 'rojo' },
  sin_dato: { t: 'Sin dato', tono: 'mudo' },
}
export const BLOQUES: { k: keyof Pick<Lectura, 'demanda' | 'riesgo_cola' | 'concentracion' | 'tokenomics' | 'liquidez'>; titulo: string; pregunta: string }[] = [
  { k: 'demanda', titulo: 'Demanda', pregunta: '¿La mueve compra real o apalancamiento?' },
  { k: 'riesgo_cola', titulo: 'Riesgo de cola', pregunta: '¿Cuánto cae en un día malo?' },
  { k: 'concentracion', titulo: 'Concentración', pregunta: '¿Quién tiene el token?' },
  { k: 'tokenomics', titulo: 'Tokenomics', pregunta: '¿El token cobra parte de la caja?' },
  { k: 'liquidez', titulo: 'Liquidez', pregunta: '¿Se puede entrar y salir?' },
]
export function formatoCifra(c: Cifra): string | null {
  if (c.v === null || c.v === undefined) return null
  if (typeof c.v === 'string') return c.v
  if (c.unidad === '%') return `${num(c.v, 1)}\u00a0%`
  if (c.unidad === 'USD') return usd(c.v)
  if (c.unidad === '×') return mult(c.v)
  if (c.unidad === 'p') return `p${num(c.v)}`
  return num(c.v, Number.isInteger(c.v) ? 0 : 2)
}

/* ---------- el contador de cupo ---------- */
export function CupoChip({ cupo, compacto = false }: { cupo: Cupo | null; compacto?: boolean }) {
  if (!cupo) return null
  if (cupo.ilimitado) return <span className={`an-cupo an-cupo--admin mono ${compacto ? 'an-cupo--compacto' : ''}`} title="Admin: sin cupo">sin cupo · admin</span>
  const r = cupo.restantes ?? 0
  return (
    <span className={`an-cupo mono ${compacto ? 'an-cupo--compacto' : ''} ${r === 0 ? 'is-agotado' : ''}`} title={`Se reinicia ${fechaHora(cupo.fecha_reinicio)}`}>
      <span className="an-cupo__k">{compacto ? 'análisis' : 'análisis profundos'}</span>
      <b>{r}</b><i>/ {cupo.incluidos}</i>
      {!compacto && <span className="an-cupo__reinicio">se reinicia {fecha(cupo.fecha_reinicio)}</span>}
    </span>
  )
}

/* ---------- la lectura determinista ---------- */
export function BloqueLectura({ titulo, pregunta, b }: { titulo: string; pregunta: string; b: Bloque }) {
  const l = LECTURA_LABEL[b.lectura] ?? { t: b.lectura, tono: 'mudo' as const }
  const cifras = b.cifras.map((c) => ({ ...c, f: formatoCifra(c) })).filter((c) => c.f !== null)
  return (
    <section className={`an-bloque an-bloque--${l.tono}`}>
      <div className="an-bloque__cab">
        <div><h3 className="an-bloque__t display">{titulo}</h3><span className="an-bloque__q">{pregunta}</span></div>
        <span className={`an-lectura an-lectura--${l.tono} mono`}><span className="an-lectura__gema" aria-hidden="true" />{l.t}</span>
      </div>
      <p className="an-bloque__texto">{llano(b.texto)}</p>
      {cifras.length > 0 && <div className="p-datos an-bloque__cifras">{cifras.map((c) => <Dato key={c.k} k={c.k} v={c.f} tono={l.tono === 'esm' ? undefined : l.tono === 'rojo' ? 'neg' : l.tono === 'oro' ? 'oro' : 'mudo'} />)}</div>}
      {b.lectura !== 'sin_dato' && b.condiciones && b.condiciones.some((c) => c.cumple) && (
        <ul className="an-cond" aria-label="Señales de apalancamiento">{b.condiciones.filter((c) => c.cumple).map((c) => <li key={c.nombre} className="is-cumple"><span className="an-cond__gema" aria-hidden="true" />{c.nombre}</li>)}</ul>
      )}
      {b.fuente && !/\.py|\.ts/.test(b.fuente) && <span className="an-bloque__fuente mono">{llano(b.fuente)}</span>}
    </section>
  )
}

export function LecturaDeterminista({ l }: { l: Lectura }) {
  return (
    <div className="an-lect">
      <div className="an-lect__cab">
        <div>
          <span className="eyebrow mono" data-mat="esmeralda"><span className="eyebrow__mark" aria-hidden="true" />Lectura estructural · gratis</span>
          <h2 className="an-lect__sym display">{l.simbolo}<small>{l.nombre}{l.cadena ? ` · ${l.cadena}` : ''}</small></h2>
          <p className="an-lect__nota">Lo que dicen los datos, sin tesis, sin escenarios y sin veredicto. Cinco preguntas, cinco respuestas.</p>
        </div>
        <div className="an-lect__precio">
          {l.precio_usd !== null && <Dato k="precio de referencia" v={precio(l.precio_usd)} sub={<>datos del {fechaHora(l.fecha_datos)}</>} />}
          {l.precio_usd === null && <Dato k="datos" v={fecha(l.fecha_datos)} tono="mudo" sub="última pasada" />}
        </div>
      </div>
      <div className="an-bloques">
        {BLOQUES.map((b) => <BloqueLectura key={b.k} titulo={b.titulo} pregunta={b.pregunta} b={l[b.k]} />)}
      </div>
      {l.advertencias.length > 0 && <div className="an-lect__advs"><Advertencias items={l.advertencias} /></div>}
    </div>
  )
}

/* ---------- la moneda existe pero todavía no tiene datos ---------- */
export function SinDatosAun({ moneda, texto }: { moneda: Moneda; texto: string }) {
  return (
    <div className="an-lect an-lect--sin">
      <div className="an-lect__cab">
        <div>
          <span className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Cubierta · sin datos todavía</span>
          <h2 className="an-lect__sym display">{moneda.simbolo}<small>{moneda.nombre}{moneda.cadena ? ` · ${moneda.cadena}` : ''}</small></h2>
          <p className="an-lect__nota">{llano(texto)}</p>
        </div>
      </div>
      <p className="an-sin__que">Está en el universo que cubrimos, pero la lectura estructural sale de un análisis previo y de esta moneda todavía no hay ninguno. El análisis profundo lo crea: después de ése, la lectura gratis queda disponible para cualquiera.</p>
    </div>
  )
}

/* ---------- decidir gastar cupo ---------- */
export function Decidir({ simbolo, cupo, puedeProfundo, onPedir, ocupado, error }: { simbolo: string; cupo: Cupo | null; puedeProfundo: boolean; onPedir: () => void; ocupado: boolean; error: string | null }) {
  const [confirmando, setConfirmando] = useState(false)
  const agotado = !!cupo && !cupo.ilimitado && (cupo.restantes ?? 0) <= 0
  return (
    <section className={`an-decidir ${agotado ? 'is-agotado' : ''}`} aria-labelledby="an-decidir-t">
      <span className="an-decidir__linea" aria-hidden="true" />
      <div className="an-decidir__texto">
        <span className="an-decidir__k mono">Análisis profundo</span>
        <h3 id="an-decidir-t" className="display">Lo que la lectura no dice: la tesis, y quién la ataca</h3>
        <ul className="an-decidir__lista">
          <li>Una tesis en una línea y qué la invalidaría, con número</li>
          <li>Escenarios con rango y horizonte, contra dos varas</li>
          <li>La lectura contraria: objeciones antes de escribir</li>
          <li>Cada cifra verificada contra su fuente</li>
        </ul>
        <p className="an-decidir__regla">Tarda unos minutos. Podés irte: te avisamos cuando esté listo. Si falla o no pasa la verificación, no se descuenta.</p>
      </div>
      <div className="an-decidir__accion">
        {!puedeProfundo ? (
          <Puerta seccion="analiza.profundo" que={`El análisis profundo de ${simbolo} es del plan Base: dos al mes. Pro tiene seis.`} compacta />
        ) : agotado ? (
          <div className="an-agotado">
            <CupoChip cupo={cupo} />
            <p>Usaste los {cupo!.incluidos} de este ciclo. Se reinician el <b>{fechaHora(cupo!.fecha_reinicio)}</b>; no se acumulan.</p>
            {cupo!.plan === 'base'
              ? <p className="an-agotado__plan"><PlanBadge rol="pro" compacto /><span>seis al mes</span><Link to="/cuenta#plan" className="btn">Pasar a Pro</Link></p>
              : <p className="an-agotado__plan"><span className="mono body-muted">Tu cupo ya es el mayor.</span></p>}
          </div>
        ) : !confirmando ? (
          <>
            <CupoChip cupo={cupo} />
            <button type="button" className="btn an-decidir__btn" onClick={() => setConfirmando(true)}>Pedir el análisis profundo{cupo && !cupo.ilimitado ? ' · usa 1' : ''}</button>
          </>
        ) : (
          <div className="an-confirma">
            <p>{cupo && !cupo.ilimitado ? <>Usa <b>1 de tus {cupo.restantes}</b> de este ciclo.</> : <>Sin cupo: sos admin.</>} Mientras se hace vas a ver cada etapa. Si no termina, no se descuenta.</p>
            {error && <p className="an-confirma__error">{error}</p>}
            <div className="an-confirma__botones">
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>Todavía no</button>
              <button type="button" className="btn btn--esmeralda" onClick={onPedir} disabled={ocupado}>{ocupado ? 'Pidiendo…' : `Analizar ${simbolo}`}</button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

/* ---------- la espera: la roca obedece al progreso real ---------- */
const estadoEscenaDe = (s: Solicitud): EstadoEscena => (s.estado === 'listo' ? 'exito' : s.estado === 'fallido' || s.estado === 'bloqueado' ? 'error' : s.estado === 'en_cola' ? 'atenta' : 'enviando')

export function EscenaAnalisis({ s }: { s: Solicitud }) {
  const control = useRef<Control>(controlInicial())
  const etapaPrev = useRef<string | null>(null)
  const set = (p: Partial<Control>) => Object.assign(control.current, p)
  useEffect(() => {
    const av = s.avance ?? 0
    const nueva = s.etapa !== etapaPrev.current
    etapaPrev.current = s.etapa
    if (s.estado === 'en_cola') { set({ u: 0.16, open: 0, tint: 0, dolly: 0 }); return }
    if (s.estado === 'en_curso') {
      const base: Record<Etapa, [number, number]> = { recolectando: [0.16, 0.14], calculando: [0.34, 0.12], esceptico: [0.5, 0.06], redactando: [0.62, 0.14], verificando: [0.8, 0.1] }
      const [a, b] = base[s.etapa ?? 'recolectando']
      set({ u: a + av * b, open: 0, dolly: s.etapa === 'verificando' ? 0.1 : 0 })
      if (nueva) set({ shake: s.etapa === 'esceptico' ? 0.8 : 0.35 })
      // el escéptico objeta: la veta se enrojece a golpes y se calma
      if (s.etapa === 'esceptico') { set({ tint: nueva ? 0.9 : 0.45 }); const t = setTimeout(() => set({ tint: 0.25 }), 900); return () => clearTimeout(t) }
      set({ tint: 0 })
      return
    }
    if (s.estado === 'listo') {
      const tier = (s.tier ?? 'MEDIO').toUpperCase()
      if (tier === 'BAJO') set({ u: 1, open: 1, dolly: 1, tint: 0, shake: 0.6 })
      else if (tier === 'ALTO') set({ u: 1, open: 0.14, dolly: 0.2, tint: 0.45, shake: 0.5 })
      else set({ u: 0.94, open: 0.5, dolly: 0.35, tint: 0, shake: 0.45 })
      return
    }
    if (s.estado === 'bloqueado') { set({ u: 0.72, open: 0, tint: 1, shake: 1, dolly: 0 }); const t = setTimeout(() => set({ tint: 0.6 }), 1300); return () => clearTimeout(t) }
    if (s.estado === 'fallido') { set({ u: 0.06, open: 0, tint: 1, shake: 1, dolly: 0 }); const t = setTimeout(() => set({ tint: 0.5 }), 1300); return () => clearTimeout(t) }
  }, [s.estado, s.etapa, s.avance, s.tier])
  return (
    <div className={`an-escena an-escena--${s.estado} ${s.tier ? `an-escena--${s.tier.toLowerCase()}` : ''}`}>
      <AuthEscena control={control} estado={estadoEscenaDe(s)} />
    </div>
  )
}

/** Tiempo transcurrido, vivo. */
export function Transcurrido({ desde, hasta }: { desde: string | null; hasta: string | null }) {
  const [t, setT] = useState(Date.now())
  useEffect(() => { if (hasta) return; const id = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(id) }, [hasta])
  if (!desde) return null
  const seg = Math.max(0, Math.floor(((hasta ? Date.parse(hasta) : t) - Date.parse(desde)) / 1000))
  return <span className="an-tiempo mono">{Math.floor(seg / 60)}<i>m</i>{String(seg % 60).padStart(2, '0')}<i>s</i></span>
}

export function Etapas({ s }: { s: Solicitud }) {
  const hechas = new Set(s.etapas_hechas)
  return (
    <ol className="an-etapas" aria-label="Etapas del análisis">
      {ETAPAS.map((e, i) => {
        const hecha = hechas.has(e) || s.estado === 'listo'
        const actual = s.estado === 'en_curso' && s.etapa === e
        const rota = (s.estado === 'fallido' || s.estado === 'bloqueado') && s.etapa === e
        return (
          <li key={e} className={`an-etapa ${hecha && !rota ? 'is-hecha' : ''} ${actual ? 'is-actual' : ''} ${rota ? 'is-rota' : ''}`} style={{ ['--i' as string]: i }}>
            <span className="an-etapa__gema" aria-hidden="true" />
            <div className="an-etapa__cuerpo">
              <span className="an-etapa__t">{ETAPA_LABEL[e].titulo}</span>
              <span className="an-etapa__q">{actual && s.detalle ? s.detalle : ETAPA_LABEL[e].que}</span>
              {actual && s.avance !== null && <span className="an-etapa__barra" aria-hidden="true"><span style={{ width: `${Math.round(s.avance * 100)}%` }} /></span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- aviso en el navegador ---------- */
export function BotonAviso() {
  const [estado, setEstado] = useState<NotificationPermission | 'no'>(() => (typeof Notification === 'undefined' ? 'no' : Notification.permission))
  if (estado === 'no') return null
  if (estado === 'granted') return <span className="an-aviso__ok mono"><span className="an-aviso__gema" aria-hidden="true" />Te avisamos también en el navegador</span>
  if (estado === 'denied') return null
  return <button type="button" className="an-aviso__btn mono" onClick={async () => setEstado(await Notification.requestPermission())}>Avisarme también en el navegador</button>
}

export function Nota({ children, tono = 'oro' }: { children: ReactNode; tono?: 'oro' | 'esm' | 'rojo' | 'mudo' }) {
  return <p className={`an-nota an-nota--${tono}`}><span className="an-nota__gema" aria-hidden="true" />{children}</p>
}
