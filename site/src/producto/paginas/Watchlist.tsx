import { Cabecera } from '../Shell'
import { Cargando, Puerta } from '../piezas'
import { useWatchlist } from '../../lib/datos'
import { useRol, puede } from '../../lib/acceso'
import { fecha, num } from '../../lib/formato'
import { prosaDeCliente } from '../../lib/lenguaje'
import { Link } from 'react-router-dom'
import type { Watch } from '../../lib/contrato'

/* ============================================================================
   Watchlist / Radar — cada fila con el escenario que la activaría y el
   observable que se vigila, con su fuente. Tres estados del motor:
     VIGILANDO  moneda analizada que no fue gema, con un gatillo concreto
     RADAR      proyecto sin token todavía; el gatillo es que aparezca cotizando
     CERRADO    salió de la lista, con su motivo
   ========================================================================== */

const ESTADOS = ['VIGILANDO', 'RADAR', 'CERRADO'] as const
const ESTADO_LABEL: Record<string, string> = { VIGILANDO: 'Vigilando', RADAR: 'Radar', CERRADO: 'Cerradas' }
const ESTADO_DESC: Record<string, string> = {
  VIGILANDO: 'Monedas ya analizadas que todavía no tienen tesis. Cada una vigila una señal concreta: si se cumple, volvemos a analizarla.',
  RADAR: 'Proyectos con producto y tracción que aún no emiten token. El gatillo es que el token aparezca cotizando.',
  CERRADO: 'Salieron de la lista. El motivo queda escrito: es parte del historial.',
}

/** El gatillo, en llano, a partir del tipo estructurado (no del texto). */
function gatilloLlano(w: Watch): string {
  switch (w.observable_tipo) {
    case 'token_listado': return `Que ${w.simbolo} aparezca cotizando con un identificador de mercado.`
    case 'revenue_holders_30d': return `Que el revenue a holders de 30 días pase de ${w.valor_al_anotar ?? 0} a positivo.`
    default: return w.observable_tipo ? `Gatillo: ${prosaDeCliente(w.observable_tipo)}` : 'Sin gatillo estructurado.'
  }
}

/** Textos que se repiten en 3 o más filas son plantilla del motor, no contenido propio: no se muestran. */
function plantillas(rows: Watch[]) {
  const cuenta = (k: 'escenario_que_la_activaria' | 'observable') => {
    const c = new Map<string, number>()
    for (const r of rows) c.set(r[k], (c.get(r[k]) ?? 0) + 1)
    return new Set([...c.entries()].filter(([, n]) => n >= 3).map(([t]) => t))
  }
  return { escenario: cuenta('escenario_que_la_activaria'), observable: cuenta('observable') }
}

function Fila({ w, pl }: { w: Watch; pl: ReturnType<typeof plantillas> }) {
  const { rol } = useRol()
  const cerrada = w.estado === 'CERRADO'
  const escenarioPropio = !pl.escenario.has(w.escenario_que_la_activaria)
  const observablePropio = !pl.observable.has(w.observable)
  const slug = String(w.observable_param?.slug ?? w.observable_param?.simbolo ?? '')
  return (
    <div className={`p-watch ${cerrada ? 'p-watch--cerrado' : ''}`}>
      <div className="p-watch__sym">
        <strong>{w.simbolo}</strong>
        <span className="mono">alta {fecha(w.fecha_alta)}{w.tier_actual ? ` · tier ${w.tier_actual}` : ''}</span>
        {w.origen_bloqueado && puede(rol, 'ledger.bloqueados') && (
          <span className="p-chip p-chip--rojo mono" title="El análisis de origen no se publicó">origen bloqueado</span>
        )}
        {w.origen_bloqueado && !puede(rol, 'ledger.bloqueados') && (
          <span className="p-chip p-chip--mudo mono">análisis de origen no publicado</span>
        )}
      </div>
      <div>
        <span className="p-watch__k">{escenarioPropio ? 'Escenario que la activaría' : 'Por qué está aquí'}</span>
        {escenarioPropio
          ? <p className="p-watch__txt">{prosaDeCliente(w.escenario_que_la_activaria)}</p>
          : <p className="p-watch__hueco">Sin escenario propio todavía: sólo el gatillo.</p>}
      </div>
      <div>
        <span className="p-watch__k">Gatillo</span>
        <p className="p-watch__gatillo">{observablePropio ? prosaDeCliente(w.observable) : gatilloLlano(w)}</p>
        <p className="p-watch__fuente">
          {w.fuente_a_vigilar}
          {slug && <> · {slug}</>}
          {w.valor_al_anotar !== null && <> · al anotar {num(w.valor_al_anotar)}</>}
        </p>
      </div>
      <div>
        {cerrada ? (
          <>
            <span className="p-watch__k">Motivo de cierre</span>
            <p className="p-watch__txt p-watch__txt--mudo">{prosaDeCliente(w.motivo_cierre)}</p>
          </>
        ) : (
          <>
            <span className="p-watch__k">Origen</span>
            <p className="p-watch__txt p-watch__txt--mudo">{w.analisis_origen ? (w.origen_bloqueado ? 'análisis no publicado' : <Link to={`/analisis/${w.analisis_origen}`}>ver el análisis</Link>) : 'radar: todavía sin análisis'}</p>
          </>
        )}
      </div>
    </div>
  )
}

export function Watchlist() {
  const { rol } = useRol()
  const abierto = puede(rol, 'watchlist')
  const st = useWatchlist(abierto)
  if (!abierto) {
    return (
      <>
        <Cabecera eyebrow="Watchlist y radar" titulo={<>Lo que se vigila, y por qué.</>} lead="Ninguna fila es una recomendación. Es un gatillo escrito de antemano: qué tendría que pasar, en qué fuente, para volver a mirar." />
        <div className="shell"><Puerta seccion="watchlist" que="La watchlist y el radar con sus gatillos son contenido del plan Base." /></div>
      </>
    )
  }
  return (
    <Cargando st={st}>
      {(rows) => {
        const pl = plantillas(rows)
        const grupos = ESTADOS.map((e) => ({ e, items: rows.filter((r) => r.estado === e) }))
        const otros = rows.filter((r) => !(ESTADOS as readonly string[]).includes(r.estado))
        return (
          <>
            <Cabecera
              eyebrow={<>Watchlist y radar · {rows.length} filas</>}
              titulo={<>Lo que se vigila, y por qué.</>}
              lead="Ninguna fila es una recomendación. Es un gatillo escrito de antemano: qué tendría que pasar, en qué fuente, para volver a mirar."
            />
            <div className="shell">
              <Puerta seccion="watchlist" que="La watchlist y el radar con sus gatillos son contenido del plan Base.">
                {grupos.map(({ e, items }) => (
                  <section key={e} className="p-grupo" aria-label={ESTADO_LABEL[e]}>
                    <div className="p-grupo__head">
                      <span className={`p-estado mono ${e === 'VIGILANDO' ? 'p-estado--intacta' : e === 'RADAR' ? 'p-estado--debilitandose' : 'p-estado--cerrada'}`}>
                        <span className="p-estado__dot" aria-hidden="true" />{ESTADO_LABEL[e]}
                      </span>
                      <span className="num">{items.length}</span>
                      <span className="p-grupo__rule" aria-hidden="true" />
                    </div>
                    <p className="p-nota" style={{ marginBottom: 6 }}>{ESTADO_DESC[e]}</p>
                    {items.length ? items.map((w) => <Fila key={w.id} w={w} pl={pl} />) : <p className="p-nota">Ninguna.</p>}
                  </section>
                ))}
                {otros.length > 0 && (
                  <section className="p-grupo"><div className="p-grupo__head"><span className="mono">Otros estados</span></div>{otros.map((w) => <Fila key={w.id} w={w} pl={pl} />)}</section>
                )}
              </Puerta>
            </div>
          </>
        )
      }}
    </Cargando>
  )
}
