import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AuthEscena, type EstadoEscena } from '../../auth/AuthEscena'
import { controlInicial, type Control } from '../../three/HeroScene'
import { Dato, Advertencias, PlanBadge, Puerta } from '../piezas'
import { fecha, fechaHora, mult, num, precio, usd } from '../../lib/formato'
import { llano, LECTURA_LABEL } from '../../lib/lenguaje'
export { LECTURA_LABEL }
export { llano }

/** Texto del motor sin sus referencias internas: «· motor §4.1», «§8 S7», «(§3)». */
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
export interface Moneda { simbolo: string; nombre: string; id_coingecko?: string; cadena?: string; con_informe: boolean
  /** null = todavía no se sabe, y entonces no se afirma nada. Sólo `false` cierra la puerta. */
  analizable?: boolean | null; motivo_no_analizable?: string }
export interface Candidata extends Moneda { contrato?: string | null; mcap_usd?: number | null; vol24h_usd?: number | null }
export interface Resolucion { consulta: string; interpretada_como: 'ticker' | 'contrato' | 'nombre'; normalizada?: string | null; candidatas: Candidata[]; aproximada?: boolean }

export const useCupo = () => useDatos<{ cupo: Cupo | null; plan_minimo: string; puede_profundo: boolean }>('/api/analizar/cupo')
export const useUniverso = () => useDatos<{ monedas: Moneda[]; motor: string }>('/api/analizar/universo')

/* ---------- vocabulario llano ---------- */
export const ETAPA_LABEL: Record<Etapa, { titulo: string; que: string }> = {
  recolectando: { titulo: 'Trayendo los datos', que: 'precio, futuros, ingresos, quién tiene el token' },
  calculando: { titulo: 'Calculando el riesgo', que: 'cola de caídas, las dos referencias, concentración' },
  esceptico: { titulo: 'Buscando los contraargumentos', que: 'se ataca la lectura antes de darla por buena' },
  redactando: { titulo: 'Redactando', que: 'tesis en una línea, escenarios, qué la invalidaría' },
  verificando: { titulo: 'Comprobando cada cifra', que: 'número por número contra su fuente; si no coincide, no sale' },
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
  if (cupo.ilimitado) return <span className={`an-cupo an-cupo--admin mono ${compacto ? 'an-cupo--compacto' : ''}`} title="Admin: sin límite de análisis">sin límite · admin</span>
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

/* ---------- el informe escrito para quien lo pidió (contrato §9.4) ----------
   Cuando el sistema lo entrega, manda él: va arriba de todo y el registro
   completo queda debajo, para quien quiera comprobar cada cifra. */
export interface Narrado { titular: string; parrafos: string[]; riesgos?: string[]; cierre?: string }
export const narradoDe = (r: unknown): Narrado | null => {
  const n = (r as { narrado?: Narrado } | null)?.narrado
  return n && typeof n.titular === 'string' && Array.isArray(n.parrafos) ? n : null
}

export function InformeNarrado({ n, simbolo }: { n: Narrado; simbolo: string }) {
  return (
    <section className="an-narra" aria-labelledby="an-narra-t">
      <span className="an-narra__k mono">{simbolo} · lo que encontramos</span>
      <h2 id="an-narra-t" className="display an-narra__titular">{llano(n.titular)}</h2>
      <div className="an-narra__cuerpo">
        {n.parrafos.map((t, i) => <p key={i}>{llano(t)}</p>)}
      </div>
      {!!n.riesgos?.length && (
        <div className="an-narra__riesgos">
          <h3 className="display">Lo que podría salir mal</h3>
          <ul>{n.riesgos.map((t, i) => <li key={i}>{llano(t)}</li>)}</ul>
        </div>
      )}
      {n.cierre && <p className="an-narra__cierre">{llano(n.cierre)}</p>}
    </section>
  )
}

/* ---------- qué se acepta en la caja ---------- */
export function FormatoAceptado() {
  return (
    <p className="an-formato body-muted">
      Escribe el <b>ticker</b> solo: <span className="mono">RAY</span>, no <span className="mono">RAYUSDT</span>.
      También vale el <b>nombre</b> de la moneda o una <b>dirección de contrato</b>.
    </p>
  )
}

/* ---------- varias monedas se llaman igual: que elija quien pregunta ----------
   Sólo aparece cuando hay más de una. Con una sola no se pregunta nada. */
export function Candidatas({ r, onElegir, onOtra }: { r: Resolucion; onElegir: (c: Candidata) => void; onOtra: () => void }) {
  return (
    <section className="an-cand" aria-labelledby="an-cand-t">
      <div className="an-cand__head">
        <span className="an-cand__k mono">{r.candidatas.length} coinciden</span>
        <h2 id="an-cand-t" className="display">
          {r.interpretada_como === 'contrato'
            ? <>Ese contrato aparece en más de una moneda</>
            : <>Más de una moneda coincide con <em className="mono">{r.normalizada ?? r.consulta.toUpperCase()}</em></>}
        </h2>
        <p className="an-cand__lead">Elige cuál es la tuya. Mirar no gasta nada.</p>
      </div>
      <ul className="an-cand__lista">
        {r.candidatas.map((c) => (
          <li key={`${c.simbolo}-${c.contrato ?? c.id_coingecko ?? c.nombre}`}>
            <button type="button" className={`an-cand__item ${c.analizable === false ? 'is-corta' : ''}`} onClick={() => onElegir(c)}>
              <b className="mono an-cand__sim">{c.simbolo}</b>
              <span className="an-cand__nom">{c.nombre}</span>
              {c.cadena && <span className="an-cand__cadena mono">{c.cadena}</span>}
              {typeof c.mcap_usd === 'number' && <span className="an-cand__mcap mono">{usd(c.mcap_usd)}</span>}
              {c.contrato && <span className="an-cand__contrato mono">{c.contrato.slice(0, 6)}…{c.contrato.slice(-4)}</span>}
              {c.con_informe && <i className="an-cand__previo mono">análisis previo</i>}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--ghost an-cand__otra" onClick={onOtra}>Ninguna de estas</button>
    </section>
  )
}

/* ---------- lo que escribió no corresponde a ninguna moneda ---------- */
export function SinCoincidencia({ r, onOtra }: { r: Resolucion; onOtra: () => void }) {
  const q = r.consulta.trim()
  return (
    <section className="an-nada" aria-live="polite">
      <span className="an-nada__marca" aria-hidden="true" />
      <h2 className="display">No encontramos <em className="mono">{q.length > 18 ? `${q.slice(0, 8)}…${q.slice(-6)}` : q}</em></h2>
      {r.interpretada_como === 'contrato'
        ? <p>Leímos eso como una dirección de contrato. Todavía no la tenemos asociada a ninguna moneda que cubramos. Prueba con el ticker.</p>
        : r.normalizada
          ? <p>Leímos <span className="mono">{r.consulta.toUpperCase()}</span> como <span className="mono">{r.normalizada}</span>, que es el par de un exchange. Ni así aparece entre las monedas que cubrimos hoy.</p>
          : <p>No está entre las monedas que cubrimos hoy. Cubrimos las que tienen volumen real y datos públicos de los que fiarse.</p>}
      <p className="an-nada__gratis mono">No se gastó nada: buscar es gratis.</p>
      <button type="button" className="btn btn--ghost" onClick={onOtra}>Probar con otra</button>
    </section>
  )
}

/* ---------- se encontró, pero no da para un análisis ----------
   Es un no explicado, no un error, y se dice antes de ofrecer gastar cupo. */
export function NoAnalizable({ moneda, onOtra }: { moneda: Moneda; onOtra: () => void }) {
  return (
    <section className="an-noanal" aria-live="polite">
      <div className="an-noanal__head">
        <b className="mono an-noanal__sim">{moneda.simbolo}</b>
        <span className="an-noanal__nom">{moneda.nombre}</span>
      </div>
      <h2 className="display">Esta moneda no da para un análisis nuestro</h2>
      <p>{llano(moneda.motivo_no_analizable) || 'No publica ingresos ni fondos bloqueados, y sin eso el análisis sería una opinión con formato de informe. Preferimos no cobrártelo.'}</p>
      <p className="an-noanal__gratis mono">No se descontó nada de tu cupo.</p>
      <button type="button" className="btn btn--ghost" onClick={onOtra}>Analizar otra</button>
    </section>
  )
}

/* ---------- fuera del universo, pero se puede analizar (§9.5) ----------
   La lectura instantánea sale de un análisis anterior, así que una moneda que
   nadie analizó todavía no tiene ninguna. Eso no es "no existe": es que aún no
   hay. Se muestra lo que el sistema sí midió y se ofrece el análisis. */
export interface MedidasFuera {
  mcap_usd?: number | null; adv_global_30d_usd?: number | null; dias_precio?: number | null
  revenue_dias_de_historia?: number | null; tvl_usd?: number | null; tenedores_medibles?: boolean | null
  contrato?: string | null; cadena?: string | null
}

export function PuedeAnalizarse({ moneda, medidas }: { moneda: Moneda; medidas: MedidasFuera | null }) {
  const filas: { k: string; v: string }[] = []
  if (typeof medidas?.mcap_usd === 'number') filas.push({ k: 'Capitalización', v: usd(medidas.mcap_usd) })
  if (typeof medidas?.adv_global_30d_usd === 'number') filas.push({ k: 'Se opera al día', v: usd(medidas.adv_global_30d_usd) })
  if (typeof medidas?.dias_precio === 'number') filas.push({ k: 'Historia de precio', v: `${num(medidas.dias_precio)} días` })
  if (typeof medidas?.revenue_dias_de_historia === 'number' && medidas.revenue_dias_de_historia > 0) filas.push({ k: 'Historia de ingresos', v: `${num(medidas.revenue_dias_de_historia)} días` })
  if (typeof medidas?.tvl_usd === 'number') filas.push({ k: 'Fondos bloqueados', v: usd(medidas.tvl_usd) })
  return (
    <section className="an-fuera" aria-labelledby="an-fuera-t">
      <div className="an-fuera__cab">
        <span className="eyebrow mono" data-mat="esmeralda"><span className="eyebrow__mark" aria-hidden="true" />Se puede analizar</span>
        <h2 id="an-fuera-t" className="an-lect__sym display">{moneda.simbolo}<small>{moneda.nombre}{moneda.cadena ? ` · ${moneda.cadena}` : ''}</small></h2>
        <p className="an-fuera__que">Nadie la ha analizado todavía, así que no hay lectura instantánea: esa sale de un análisis anterior. Lo que sí comprobamos es que tiene tamaño, volumen e historia suficientes para analizarla con rigor.</p>
      </div>
      {!!filas.length && (
        <ul className="an-fuera__medidas">
          {filas.map((f) => (
            <li key={f.k}><span className="mono an-fuera__k">{f.k}</span><b className="mono">{f.v}</b></li>
          ))}
        </ul>
      )}
      {medidas?.contrato && <p className="an-fuera__contrato mono">Contrato {medidas.contrato.slice(0, 8)}…{medidas.contrato.slice(-6)}{medidas.cadena ? ` en ${medidas.cadena}` : ''}</p>}
    </section>
  )
}

/* ---------- se encontró, pero no da para un análisis ---------- */
export function NoDaParaAnalisis({ moneda, motivos, onOtra }: { moneda: Moneda; motivos: string[]; onOtra: () => void }) {
  const limpios = motivos.map((m) => llano(m)).filter(Boolean)
  return (
    <section className="an-noanal" aria-live="polite">
      <div className="an-noanal__head">
        <b className="mono an-noanal__sim">{moneda.simbolo}</b>
        <span className="an-noanal__nom">{moneda.nombre}{moneda.cadena ? ` · ${moneda.cadena}` : ''}</span>
      </div>
      <h2 className="display">Esta moneda no da para un análisis nuestro</h2>
      {limpios.length > 1
        ? <ul className="an-noanal__motivos">{limpios.map((m, i) => <li key={i}>{m}</li>)}</ul>
        : <p>{limpios[0] || 'No tiene todavía el tamaño, el volumen o la historia que hacen falta para medir su riesgo con rigor.'}</p>}
      <p className="an-noanal__gratis mono">No se descontó nada de tu cupo.</p>
      <button type="button" className="btn btn--ghost" onClick={onOtra}>Analizar otra</button>
    </section>
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
          <li>Escenarios con rango y horizonte, contra dos referencias</li>
          <li>La lectura contraria, buscada a propósito antes de escribir</li>
          <li>Cada cifra verificada contra su fuente</li>
        </ul>
        <p className="an-decidir__regla">Tarda unos minutos. Puedes irte: te avisamos cuando esté listo. Si falla o no pasa la verificación, no se descuenta.</p>
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
            <p>{cupo && !cupo.ilimitado ? <>Usa <b>1 de tus {cupo.restantes}</b> de este ciclo.</> : <>Sin límite: eres admin. Queda registrado en Consumo.</>} Mientras se hace vas a ver cada etapa. Si no termina, no se descuenta.</p>
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
