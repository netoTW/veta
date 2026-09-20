import { ROLES, type Rol } from '../../lib/acceso'
import { SesionContext, useSesion } from '../../lib/sesion'
import { TierIcon } from '../../ui/TierIcon'
import { Loader } from '../../ui/Loader'
import { EmptyState } from '../../ui/EmptyState'
import { Puerta, TierBadge, EstadoTesisBadge, PlanBadge } from '../piezas'

/* ============================================================================
   /piezas — laboratorio (no enlazado). Cada pieza aislada sobre roca, para
   fotografiarla quieta y criticarla. `data-pieza` es lo que recorta el
   script scripts/shots-piezas.mjs.
   ========================================================================== */

function Pieza({ id, titulo, children, ancho }: { id: string; titulo: string; children: React.ReactNode; ancho?: number }) {
  return (
    <section className="lab__pieza" data-pieza={id} style={ancho ? { width: ancho } : undefined}>
      <span className="lab__titulo mono">{titulo}</span>
      <div className="lab__cuerpo">{children}</div>
    </section>
  )
}

const ROL_LABEL_CORTO: Record<Rol, string> = { visitante: 'gratis', base: 'base', pro: 'pro', admin: 'admin' }

export function Piezas() {
  const sesion = useSesion()
  return (
    <div className="lab">
      <Pieza id="tiers-24" titulo="iconos de tier · 24 px (lista)">
        <div className="lab__fila">
          {(['bajo', 'medio', 'alto'] as const).map((t) => <span key={t} className="lab__item"><TierIcon tier={t} size={24} /><span className="mono">{t}</span></span>)}
        </div>
      </Pieza>
      <Pieza id="tiers-40" titulo="iconos de tier · 40 px (tarjeta)">
        <div className="lab__fila">
          {(['bajo', 'medio', 'alto'] as const).map((t) => <span key={t} className="lab__item"><TierIcon tier={t} size={40} data-hover={t === 'alto' ? '' : undefined} /><span className="mono">{t}</span></span>)}
        </div>
      </Pieza>
      <Pieza id="tiers-120" titulo="iconos de tier · 120 px (ampliado)">
        <div className="lab__fila lab__fila--ancha">
          {(['bajo', 'medio', 'alto'] as const).map((t) => <span key={t} className="lab__item"><TierIcon tier={t} size={120} data-hover={t === 'alto' ? '' : undefined} /><span className="mono">{t}</span></span>)}
        </div>
      </Pieza>
      <Pieza id="tier-badges" titulo="badge de tier (como en cabecera de tarjeta)">
        <div className="lab__fila"><TierBadge tier="BAJO" /><TierBadge tier="MEDIO" /><span data-hover><TierBadge tier="ALTO" /></span></div>
      </Pieza>

      <Pieza id="planes" titulo="estado de plan · los cuatro">
        <div className="lab__fila">
          {ROLES.map((r) => <span key={r} className="lab__item"><PlanBadge rol={r} /><span className="mono">{ROL_LABEL_CORTO[r]}</span></span>)}
        </div>
      </Pieza>
      {ROLES.map((r) => (
        <Pieza key={r} id={`top-${r}`} titulo={`barra superior · ${ROL_LABEL_CORTO[r]}`}>
          <div className="p-shell lab__shell" data-rol={r}>
            <header className="p-top lab__top">
              <div className="shell p-top__inner">
                <span className="p-top__logo"><img src="/img/logo-mark.webp" alt="" width={460} height={345} /><span className="wordmark">Veta</span></span>
                <nav className="p-top__links mono"><a className="is-active">Gemas</a><a>Seguimiento</a><a>Análisis</a><a>Watchlist</a></nav>
                <div className="p-top__right"><PlanBadge rol={r} /></div>
              </div>
            </header>
          </div>
        </Pieza>
      ))}

      <SesionContext.Provider value={{ ...sesion, rol: 'visitante' }}>
        <Pieza id="puerta" titulo="puerta de acceso · visitante">
          <Puerta seccion="seguimiento" que="El seguimiento diario de las gemas publicadas es contenido del plan Base." />
        </Pieza>
        <Pieza id="puerta-pro" titulo="puerta de acceso · sección pro">
          <Puerta seccion="alertas" que="Las alertas en tiempo real de invalidación son del plan Pro." />
        </Pieza>
        <Pieza id="puerta-compacta" titulo="puerta compacta (dentro de tarjeta)" ancho={560}>
          <Puerta seccion="gemas.informe" que="La tesis, las dos varas, los escenarios y el riesgo de esta gema." compacta />
        </Pieza>
      </SesionContext.Provider>

      <Pieza id="vacios" titulo="estados vacíos · vacío / sin datos / error">
        <div className="lab__grid3">
          <EmptyState kind="vacio" title="Todavía no hay tesis en seguimiento." detail="Cuando se publique una gema, aparece aquí con su condición de invalidación." />
          <EmptyState kind="sin-datos" title="Buscamos y no encontramos veta." detail="Sin comparables no hay magnitud, y una magnitud sin respaldo no se publica." />
          <EmptyState kind="error" title="No se pudieron cargar los datos." detail="404 /datos/gemas.json" />
        </div>
      </Pieza>

      <Pieza id="botones" titulo="botones · primario / ghost / esmeralda / deshabilitado">
        <div className="lab__fila">
          <button type="button" className="btn" data-hover>Ver planes</button>
          <button type="button" className="btn btn--ghost">Entrar</button>
          <button type="button" className="btn btn--esmeralda">Pedir análisis</button>
          <button type="button" className="btn btn--ghost" disabled>Exportar gemas</button>
        </div>
      </Pieza>

      <Pieza id="estados" titulo="estado de tesis · chips">
        <div className="lab__fila">
          <EstadoTesisBadge estado="INTACTA" /><EstadoTesisBadge estado="DEBILITANDOSE" /><EstadoTesisBadge estado="ROTA" /><EstadoTesisBadge estado="CERRADA" />
        </div>
        <div className="lab__fila" style={{ marginTop: 14 }}>
          <span className="p-chip p-chip--oro mono">objetada</span>
          <span className="p-chip p-chip--rojo mono">origen bloqueado</span>
          <span className="p-chip p-chip--esm mono">verificada</span>
          <span className="p-chip p-chip--mudo mono">próxima fase</span>
        </div>
      </Pieza>

      <Pieza id="loader" titulo="loader · determinado 62 % / indeterminado">
        <div className="lab__fila lab__fila--ancha">
          <Loader progress={0.62} size={110} label="Analizando ETH" />
          <Loader size={110} label="Analizando" />
        </div>
      </Pieza>

      <Pieza id="tarjeta" titulo="tarjeta · reposo (y hover en la captura siguiente)" ancho={620}>
        <article className="p-card" data-hover>
          <header className="p-card__head">
            <span className="p-card__sym">RAY</span>
            <span className="p-card__nombre">Raydium · solana</span>
            <span className="p-card__meta mono"><span>publicada 12 sep 2026</span></span>
          </header>
          <div className="p-card__head" style={{ marginBottom: 0 }}>
            <TierBadge tier="ALTO" />
            <EstadoTesisBadge estado="INTACTA" />
          </div>
        </article>
      </Pieza>
      <Pieza id="separadores" titulo="separadores · cabecera de sección y de grupo">
        <div className="p-seccion__head"><h2 className="p-seccion__titulo">Las dos varas</h2></div>
        <div className="p-grupo__head" style={{ marginTop: 18 }}><span className="p-estado p-estado--vigilando mono"><span className="p-estado__dot" aria-hidden="true" />Vigilando</span><span className="num">6</span><span className="p-grupo__rule" aria-hidden="true" /></div>
      </Pieza>
    </div>
  )
}
