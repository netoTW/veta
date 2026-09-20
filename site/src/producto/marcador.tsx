import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api, useDatos, ErrorApi } from '../lib/datos'
import { useSesion } from '../lib/sesion'
import { puede } from '../lib/acceso'
import { dias, fecha, fechaHora, pct } from '../lib/formato'
import type { BenchmarkDef } from '../lib/contrato'

/* ============================================================================
   El benchmark, en primer plano.

   Cada gema se mide todos los días contra dos rivales definidos y congelados
   ANTES de publicar la primera gema: B1, comprar al azar entre las monedas
   que el scanner consideró elegibles ese día (canasta equal-weight); B2, una
   regla técnica simple sobre la misma moneda (cruce de medias 20/50, sólo
   comprado). El veredicto llega al cierre del horizonte, que no se mueve;
   mientras tanto es un marcador vivo: "va ganando / va perdiendo". Un
   benchmark no medible se dice con su motivo, nunca se muestra como cero.
   Nada se calcula: los tres retornos vienen del motor; acá se comparan y se
   cuentan.
   ========================================================================== */

export type Lado = 'gana' | 'pierde' | 'sin_medir'
export interface LadoBenchmark { lado: Lado; valor?: number | null; motivo_codigo?: string; motivo_texto?: string; fuente?: string }
export interface MarcadorGema {
  gema_id: string; simbolo: string; fecha?: string; estado_tesis?: string; dias_al_cierre: number
  retorno_gema?: number | null; b1: LadoBenchmark; b2: LadoBenchmark; cerrada: boolean
}
export interface Marcador {
  fecha: string | null; vivas: number; cerradas: number
  b1: { gana: number; pierde: number; sin_medir: number }; b2: { gana: number; pierde: number; sin_medir: number }
  gemas: MarcadorGema[]; definicion: BenchmarkDef
}
export interface Prediccion { gema_id: string; simbolo: string; prediccion: 'gana' | 'no_gana'; fecha: string; va: Lado; cerrada: boolean; acierto_por_ahora: boolean | null; retorno_gema_al_marcar: number | null; b1_al_marcar: number | null; dias_al_cierre_al_marcar: number | null }
export interface Predicciones { predicciones: Prediccion[]; marcador: { total: number; acertando: number; fallando: number; sin_medir: number; veta: { total: number; acertando: number } } }

export const useMarcador = () => useDatos<Marcador>('/api/contenido/marcador')
export function usePredicciones(activo: boolean) {
  const [d, setD] = useState<Predicciones | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { if (activo) api<Predicciones>('/api/prediccion').then(setD, () => setD(null)) }, [activo, tick])
  return { d, recargar: () => setTick((t) => t + 1) }
}

const LADO_LABEL: Record<Lado, string> = { gana: 'la gema va ganando', pierde: 'la gema va perdiendo', sin_medir: 'sin medir' }
const MOTIVO: Record<string, string> = {
  sin_universo_guardado: 'no quedó guardado el universo de esa corrida', sin_dias_transcurridos: 'todavía no hay días transcurridos',
  serie_incompleta: 'la serie de precios está incompleta', medicion_desactivada: 'la medición está desactivada', otro: 'sin medir',
}

/* ---------- una celda del marcador ---------- */
function Celda({ k, lado, valor, motivo, principal = false }: { k: ReactNode; lado?: Lado; valor?: number | null; motivo?: string; principal?: boolean }) {
  const medible = lado !== 'sin_medir' && typeof valor === 'number'
  // Lo que no se puede medir no se enseña: la celda desaparece en vez de anunciar el hueco.
  if (!medible && !principal) return null
  return (
    <div className={`mk__celda ${lado ? `mk__celda--${lado}` : ''} ${principal ? 'mk__celda--gema' : ''}`}>
      <span className="mk__k mono">{k}</span>
      {medible || principal ? <span className="mk__v num">{pct(valor ?? null, 1, true)}</span> : <span className="mk__v mk__v--nm">sin medir</span>}
      {lado && lado !== 'sin_medir' && <span className={`mk__lado mono mk__lado--${lado}`}>{LADO_LABEL[lado]}</span>}
      {lado === 'sin_medir' && <span className="mk__motivo">{motivo || 'sin medir'}</span>}
    </div>
  )
}

/* ---------- el marcador de una gema: arriba, visible ---------- */
export function MarcadorDeGema({ gemaId, horizonteDias }: { gemaId: string; horizonteDias?: number }) {
  const st = useMarcador()
  const [abierto, setAbierto] = useState(false)
  if (st.estado !== 'ok') return null
  const g = st.datos.gemas.find((x) => x.gema_id === gemaId)
  if (!g || g.retorno_gema === undefined) return null
  const desde = g.fecha ? fecha(g.fecha) : ''
  return (
    <section className="mk mk--gema" aria-label="Marcador contra los benchmarks">
      <div className="mk__cab">
        <span className="mk__titulo">Contra los benchmarks <span className="mk__vivo mono">{g.cerrada ? 'cerrado' : 'marcador vivo'}</span></span>
        <span className="mk__plazo mono">{g.cerrada ? 'horizonte cerrado' : <>quedan <b className="num">{dias(g.dias_al_cierre)}</b>{horizonteDias ? ` de ${horizonteDias}` : ''} · veredicto al cierre</>}{desde ? ` · medido ${desde}` : ''}</span>
      </div>
      <div className="mk__grid">
        <Celda k={<>la gema · {g.simbolo}</>} valor={g.retorno_gema} principal />
        <Celda k="B1 · la canasta" lado={g.b1.lado} valor={g.b1.valor} motivo={MOTIVO[g.b1.motivo_codigo ?? ''] ?? g.b1.motivo_texto} />
        <Celda k="B2 · la regla técnica" lado={g.b2.lado} valor={g.b2.valor} motivo={MOTIVO[g.b2.motivo_codigo ?? ''] ?? g.b2.motivo_texto} />
      </div>
      <button type="button" className="mk__como mono" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>{abierto ? '− ' : '+ '}Cómo se mide, y por qué casi nadie lo hace</button>
      {abierto && <ComoSeMide def={st.datos.definicion} />}
    </section>
  )
}

/* ---------- la explicación, en llano, donde se ve el marcador ---------- */
export function ComoSeMide({ def, compacto = false }: { def: BenchmarkDef; compacto?: boolean }) {
  return (
    <div className={`mk__explica ${compacto ? 'mk__explica--compacta' : ''}`}>
      <p>Cada gema se compara contra <b>comprar al azar entre las monedas que el scanner consideró elegibles ese día</b> (una canasta a partes iguales, B1) y contra <b>una regla técnica simple sobre la misma moneda</b> (comprada mientras la media de 20 días está sobre la de 50, B2). Los tres retornos se miden sobre el cierre diario.</p>
      <p>Las dos definiciones se congelaron el <b>{fecha(def.congelado_en)}</b>, antes de publicar la primera gema, y no se pueden cambiar. Por eso es difícil y por eso casi nadie lo hace: cualquiera publica picks; medirlos contra un rival elegido antes de ver el resultado deja el marcador fuera del alcance de quien lo publica.</p>
      {!compacto && (
        <dl className="mk__def">
          <dt>B1</dt><dd>{def.b1.nombre}: {def.b1.universo}.</dd>
          <dt>B2</dt><dd>{def.b2.nombre}: {def.b2.regla}; {def.b2.posicion}.</dd>
          <dt>Medición</dt><dd>{def.medicion?.precio ?? 'cierre diario'}. Un benchmark que no se puede medir un día se dice con su motivo; nunca se muestra como cero.</dd>
          <dt>Veredicto</dt><dd>Al cierre del horizonte de cada gema, que se fijó al publicar y no se mueve. Mientras tanto es un marcador vivo.</dd>
        </dl>
      )}
    </div>
  )
}

/* ---------- el agregado: cómo van todas. Gratis para todos: es la razón para creer ---------- */
export function MarcadorAgregado({ visitante = false }: { visitante?: boolean }) {
  const st = useMarcador()
  const [abierto, setAbierto] = useState(false)
  if (st.estado !== 'ok') return null
  const m = st.datos
  const total = m.b1.gana + m.b1.pierde
  const veredicto = m.b1.gana > m.b1.pierde ? 'gana' : m.b1.pierde > m.b1.gana ? 'pierde' : total ? 'parejo' : 'sin_medir'
  const frase = veredicto === 'gana' ? 'VETA va ganando' : veredicto === 'pierde' ? 'VETA va perdiendo' : veredicto === 'parejo' ? 'VETA va parejo' : 'Todavía sin medir'
  return (
    <section className={`mk mk--agregado mk--${veredicto}`} aria-label="Marcador agregado">
      <div className="mk__cab">
        <span className="mk__titulo">{m.vivas} {m.vivas === 1 ? 'tesis viva' : 'tesis vivas'}, medidas contra dos benchmarks congelados de antemano <span className="mk__vivo mono">marcador vivo{m.fecha ? ` · ${fecha(m.fecha)}` : ''}</span></span>
      </div>
      <div className="mk__agg">
        <div className="mk__frase"><b>{frase}</b><span>contra la canasta, hoy</span></div>
        <div className="mk__cuentas">
          <div className="mk__cuenta"><span className="mk__k mono">B1 · la canasta</span><Cuentas c={m.b1} /></div>
          <div className="mk__cuenta"><span className="mk__k mono">B2 · la regla técnica</span><Cuentas c={m.b2} /></div>
        </div>
      </div>
      {!visitante && m.gemas.length > 0 && (
        <ul className="mk__lista">
          {m.gemas.map((g) => (
            <li key={g.gema_id}>
              <Link to={`/gemas/${g.gema_id}`} className="mk__sym">{g.simbolo}</Link>
              {typeof g.retorno_gema === 'number' && <span className="num mk__ret">{pct(g.retorno_gema, 1, true)}</span>}
              <span className={`mk__lado mono mk__lado--${g.b1.lado}`}>vs canasta: {LADO_LABEL[g.b1.lado].replace('la gema ', '')}</span>
              <span className={`mk__lado mono mk__lado--${g.b2.lado}`}>vs regla: {LADO_LABEL[g.b2.lado].replace('la gema ', '')}</span>
              <span className="mono mk__dias">{g.cerrada ? 'cerrada' : `quedan ${dias(g.dias_al_cierre)}`}</span>
            </li>
          ))}
        </ul>
      )}
      {visitante && m.gemas.length > 0 && (
        <p className="mk__nota">{m.gemas.map((g) => `${g.simbolo} ${LADO_LABEL[g.b1.lado].replace('la gema ', '')} contra la canasta`).join(' · ')}. El detalle de cada tesis es contenido del plan Base; el marcador no: es evidencia de método.</p>
      )}
      <button type="button" className="mk__como mono" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>{abierto ? '− ' : '+ '}Cómo se mide, y por qué casi nadie lo hace</button>
      {abierto && <ComoSeMide def={m.definicion} compacto={visitante} />}
    </section>
  )
}

function Cuentas({ c }: { c: { gana: number; pierde: number; sin_medir: number } }) {
  return (
    <span className="mk__c">
      <span className="mk__c--gana"><b className="num">{c.gana}</b> ganando</span>
      <span className="mk__c--pierde"><b className="num">{c.pierde}</b> perdiendo</span>
      <span className="mk__c--nm"><b className="num">{c.sin_medir}</b> sin medir</span>
    </span>
  )
}

/* ---------- la predicción del usuario: una vez, con fecha, sin cambios ---------- */
export function PrediccionGema({ gemaId, simbolo }: { gemaId: string; simbolo: string }) {
  const { yo, rol } = useSesion()
  const activo = !!yo?.usuario && puede(rol, 'gemas.informe')
  const { d, recargar } = usePredicciones(activo)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!activo) {
    return (
      <div className="mk__pred mk__pred--puerta">
        <span className="mk__k mono">Tu predicción</span>
        <p>¿Le gana a la canasta al cierre? Con una cuenta marcas una vez, con fecha, y después ves tu acierto frente al de VETA.</p>
        {!yo?.usuario && <Link to={`/entrar?volver=/gemas/${gemaId}`} className="btn btn--ghost">Entrar para predecir</Link>}
      </div>
    )
  }
  const mia = d?.predicciones.find((p) => p.gema_id === gemaId)
  const marcar = async (prediccion: 'gana' | 'no_gana') => {
    setOcupado(prediccion); setError(null)
    try { await api(`/api/prediccion/${gemaId}`, { cuerpo: { prediccion } }); recargar() } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } finally { setOcupado(null) }
  }
  if (mia) {
    const va = mia.acierto_por_ahora
    return (
      <div className={`mk__pred mk__pred--marcada ${va === true ? 'is-acierta' : va === false ? 'is-falla' : ''}`}>
        <span className="mk__k mono">Tu predicción · marcada el {fechaHora(mia.fecha)} · no se cambia</span>
        <p className="mk__pred__que"><b>{mia.prediccion === 'gana' ? `${simbolo} le gana a la canasta` : `${simbolo} no le gana a la canasta`}</b> al cierre del horizonte.</p>
        <p className="mk__pred__estado">
          {mia.cerrada ? (va === null ? 'Cerró sin medición: no cuenta.' : va ? 'Acertaste.' : 'No acertaste.')
            : va === null ? 'Por ahora no se puede medir: el marcador dirá.' : va ? 'Por ahora vas acertando. El veredicto es al cierre.' : 'Por ahora no vas acertando. El veredicto es al cierre.'}
        </p>
        {mia.retorno_gema_al_marcar !== null && <span className="mono mk__pred__meta">al marcar: gema {pct(mia.retorno_gema_al_marcar, 1, true)}{mia.b1_al_marcar !== null ? ` · canasta ${pct(mia.b1_al_marcar, 1, true)}` : ''}{mia.dias_al_cierre_al_marcar !== null ? ` · quedaban ${dias(mia.dias_al_cierre_al_marcar)}` : ''}</span>}
      </div>
    )
  }
  return (
    <div className="mk__pred">
      <span className="mk__k mono">Tu predicción · una sola vez, con fecha</span>
      <p>¿{simbolo} le gana a la canasta al cierre del horizonte? Marcas una vez y no se cambia: después ves tu acierto frente al de VETA.</p>
      <div className="mk__pred__botones">
        <button type="button" className="btn btn--esmeralda" disabled={!!ocupado} onClick={() => marcar('gana')}>{ocupado === 'gana' ? '…' : 'Creo que le gana'}</button>
        <button type="button" className="btn btn--ghost" disabled={!!ocupado} onClick={() => marcar('no_gana')}>{ocupado === 'no_gana' ? '…' : 'Creo que no le gana'}</button>
      </div>
      {error && <p className="auth__error" role="alert">{error}</p>}
    </div>
  )
}

/* ---------- el marcador personal: cuántas acertás, contra VETA ---------- */
export function MarcadorPersonal({ compacto = false }: { compacto?: boolean }) {
  const { yo, rol } = useSesion()
  const activo = !!yo?.usuario && puede(rol, 'gemas.informe')
  const { d } = usePredicciones(activo)
  if (!activo || !d) return null
  const m = d.marcador
  if (!m.total && compacto) return null
  return (
    <section className="mk mk--personal" aria-label="Tus predicciones">
      <div className="mk__cab"><span className="mk__titulo">Tus predicciones <span className="mk__vivo mono">contra VETA · por ahora</span></span></div>
      <div className="mk__agg">
        <div className="mk__frase"><b className="num">{m.acertando} de {m.total - m.sin_medir}</b><span>acertando por ahora{m.sin_medir ? ` · ${m.sin_medir} sin medir` : ''}</span></div>
        <div className="mk__frase mk__frase--veta"><b className="num">{m.veta.acertando} de {m.veta.total}</b><span>VETA, contra la canasta</span></div>
      </div>
      {!compacto && d.predicciones.length > 0 && (
        <ul className="mk__lista">
          {d.predicciones.map((p) => (
            <li key={p.gema_id}>
              <Link to={`/gemas/${p.gema_id}`} className="mk__sym">{p.simbolo}</Link>
              <span className="mono mk__dias">{p.prediccion === 'gana' ? 'le gana' : 'no le gana'} · {fecha(p.fecha)}</span>
              <span className={`mk__lado mono mk__lado--${p.acierto_por_ahora === null ? 'sin_medir' : p.acierto_por_ahora ? 'gana' : 'pierde'}`}>{p.acierto_por_ahora === null ? 'sin medir' : p.acierto_por_ahora ? 'acertando' : 'fallando'}</span>
            </li>
          ))}
        </ul>
      )}
      {!m.total && <p className="mk__nota">Todavía no marcaste ninguna. En cada gema, arriba del informe.</p>}
    </section>
  )
}
