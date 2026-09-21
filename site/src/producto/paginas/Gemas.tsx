import { Link } from 'react-router-dom'
import { Cabecera, Exportar } from '../Shell'
import { Cargando, Puerta, TierBadge, Adv, Advertencias } from '../piezas'
import { Cifras, Prosa, RiesgoLlano } from '../cifras'
import { estadoEconomicoLlano } from '../../lib/lenguaje'
import { MarcadorAgregado } from '../marcador'
import { useGemasTodo, type GemaAnticipada } from '../../lib/datos'
import { useRol, puede } from '../../lib/acceso'
import { fecha, fechaHora, precio, conUnidad, CAMPO_LABEL, DIRECCION_LABEL } from '../../lib/formato'
import type { Informe, Tier } from '../../lib/contrato'

/* ============================================================================
   Gemas — listado agrupado por tier. La tarjeta es la ficha esencial del
   contrato: tesis en una línea, precio y fecha de referencia, riesgo
   resumido, catalizadores, qué la invalidaría. Las advertencias que cambian
   la decisión se cuentan y se listan aquí mismo: son parte del valor.
   ========================================================================== */

const TIERS: Tier[] = ['BAJO', 'MEDIO', 'ALTO']
const TIER_DESC: Record<Tier, string> = {
  BAJO: 'Cumple las condiciones de riesgo bajo.',
  MEDIO: 'Incumple alguna condición sin extremos.',
  ALTO: 'Incumple varias condiciones o hay datos ausentes que cuentan en contra.',
}

function TarjetaGema({ g }: { g: Informe }) {
  const { rol } = useRol()
  const f = g.ficha_esencial
  // El servidor manda el titular solo (sin ficha) cuando el plan no abre el informe.
  const abierta = puede(rol, 'gemas.informe') && !!f && g.recorte !== 'titular'
  const inv = g.invalidacion
  return (
    <article className="p-card p-gema">
      <header className="p-card__head">
        <span className="p-card__sym">{g.simbolo}</span>
        <span className="p-card__nombre">{g.nombre} · {g.cadena}</span>
        <span className="p-card__meta mono">
          <span>publicada {fecha(g.fecha_publicacion)}</span>
        </span>
      </header>
      <div className="p-card__head" style={{ marginBottom: 0 }}>
        <TierBadge tier={g.tier} />
        <span className="mono" style={{ color: 'var(--ceniza-2)' }}>{estadoEconomicoLlano(g.estado_economico, g.captura_verificada)}</span>
      </div>

      {abierta && f ? (
        <>
          <Prosa inf={g} campo="ficha_esencial.tesis_una_linea" texto={f.tesis_una_linea} className="p-gema__tesis" />
          <Cifras inf={g} card max={4} />
          <div className="p-gema__grid">
            <div className="p-gema__bloque p-gema__bloque--ancho">
              <span className="mono">Catalizadores · {f.catalizadores.length}</span>
              <ul style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {f.catalizadores.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
            <div className="p-gema__bloque p-gema__bloque--ancho">
              <span className="mono" style={{ color: 'var(--rojo-luz)' }}>Qué la invalidaría</span>
              {inv?.evaluable
                ? <span><span className="num" style={{ color: 'var(--hueso)' }}>{CAMPO_LABEL[inv.campo] ?? inv.campo} {DIRECCION_LABEL[inv.direccion] ?? inv.direccion} {conUnidad(inv.umbral, inv.unidad)}</span>{inv.ventana_dias ? <span style={{ color: 'var(--ceniza-2)' }}> · ventana {inv.ventana_dias} días</span> : null}</span>
                : f.que_la_invalidaria}
            </div>
            <div className="p-gema__bloque p-gema__bloque--ancho">
              <span className="mono">Precio de referencia</span>
              <span className="num" style={{ color: 'var(--hueso)', fontSize: '1.05rem' }}>{precio(f.precio_y_fecha_referencia.precio_usd)}</span>
              <span style={{ color: 'var(--ceniza-2)' }}> · {fecha(f.precio_y_fecha_referencia.fecha)}</span>
              <RiesgoLlano inf={g} compacto />
            </div>
          </div>
          <Advertencias items={f.advertencias} compacta />
        </>
      ) : (
        <Puerta seccion="gemas.informe" que="La tesis, las dos referencias, los escenarios y el riesgo de esta gema." compacta />
      )}

      <footer className="p-gema__pie mono">
        <span style={{ color: 'var(--ceniza-2)' }}>{g.id}</span>
        <Link to={`/gemas/${g.id}`} className="p-gema__ir">{abierta ? 'Abrir informe →' : 'Ver ficha →'}</Link>
      </footer>
    </article>
  )
}

/** Gemas ya aprobadas que este plan todavía no ve: el pro las tiene antes (acceso anticipado). */
function Anticipadas({ lista }: { lista: GemaAnticipada[] }) {
  const { rol } = useRol()
  if (!lista.length) return null
  return (
    <section className="p-anticipadas" aria-label="Gemas nuevas">
      <div className="p-grupo__head">
        <span className="mono" style={{ color: 'var(--oro-luz)' }}>Gemas nuevas · acceso anticipado del plan Pro</span>
        <span className="p-grupo__rule" aria-hidden="true" />
      </div>
      <ul className="p-anticipadas__lista">
        {lista.map((a) => (
          <li key={a.id} className="p-card p-anticipada">
            <span className="p-card__sym">{a.simbolo}</span>
            <span className="p-card__nombre">{a.nombre}</span>
            <TierBadge tier={a.tier as Tier} />
            <span className="mono p-anticipada__cuando">disponible para tu plan el {fechaHora(a.disponible_desde)}</span>
            {rol === 'visitante' ? <Link to="/entrar" className="btn btn--ghost">Entrar</Link> : <Link to="/cuenta#plan" className="btn btn--ghost">Ver el plan Pro</Link>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function Gemas() {
  const st = useGemasTodo()
  const { rol } = useRol()
  return (
    <Cargando st={st}>
      {({ gemas, anticipadas }) => {
        const porTier = TIERS.map((t) => ({ tier: t, items: gemas.filter((g) => g.tier === t) }))
        return (
          <>
            <Cabecera
              eyebrow={<>Gemas · {gemas.length} publicadas</>}
              titulo={<>Lo que encontramos.</>}
              lead="Cada gema es un informe con tesis, dos referencias, escenarios y riesgo. Se agrupan por tier de riesgo; el tier no es una recomendación, es cuántas condiciones incumple."
              acciones={<Exportar que="gemas" />}
            />
            <div className="shell">
              {!puede(rol, 'gemas.informe') && <MarcadorAgregado visitante />}
              <Anticipadas lista={anticipadas} />
              {porTier.map(({ tier, items }) => (
                <section key={tier} className="p-grupo" aria-label={`Tier ${tier}`}>
                  <div className="p-grupo__head">
                    <TierBadge tier={tier} size={26} />
                    <span className="num">{items.length}</span>
                    <span className="p-grupo__rule" aria-hidden="true" />
                    <span className="mono p-grupo__desc">{TIER_DESC[tier]}</span>
                  </div>
                  {items.length ? (
                    <div className="p-gemas">{items.map((g) => <TarjetaGema key={g.id} g={g} />)}</div>
                  ) : (
                    <p className="p-vacio p-vacio--linea">Sin gemas en riesgo {tier.toLowerCase()} hoy. No se rellena con nada.</p>
                  )}
                </section>
              ))}
              <ul className="p-adv" style={{ listStyle: 'none', padding: 0, color: 'var(--ceniza)', fontSize: '0.84rem' }}>
                <Adv>Todo número lleva su fuente y su fecha. VETA no calcula nada por su cuenta.</Adv>
              </ul>
            </div>
          </>
        )
      }}
    </Cargando>
  )
}
