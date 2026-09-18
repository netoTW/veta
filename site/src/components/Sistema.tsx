import { useEffect, useState } from 'react'
import { Loader } from '../ui/Loader'
import { TierIcon } from '../ui/TierIcon'
import { EmptyState } from '../ui/EmptyState'
import { ChartSample } from '../ui/ChartSample'

/* ============================================================================
   Sistema visual — el documento, vivo.

   Cada pieza que va a usar el producto se muestra acá con su token, para que
   la aprobación estética se haga sobre lo que realmente se despliega. Las
   pantallas de datos (gemas, informes, tablas) NO están: esperan el contrato
   del motor. Esto es la identidad y las piezas que van a necesitar.
   ========================================================================== */

const ROCA = [
  { t: '--roca-0', v: '#070809', u: 'fondo más profundo, hero inferior' },
  { t: '--roca',   v: '#0C0E10', u: 'fondo base de toda la web' },
  { t: '--roca-2', v: '#15181B', u: 'superficies: tarjetas, paneles' },
  { t: '--roca-3', v: '#1F2327', u: 'superficies elevadas, bordes' },
  { t: '--grano',  v: '#2B3035', u: 'hairline fuerte, separadores' },
]
const ESM = [
  { t: '--esmeralda-sombra', v: '#0F5A3C', u: 'fondo de la veta, área bajo curva' },
  { t: '--esmeralda',        v: '#1FA46F', u: 'positivo, tesis, series principales' },
  { t: '--esmeralda-luz',    v: '#5FE0A6', u: 'luz interna: énfasis en texto, hover' },
]
const ORO = [
  { t: '--oro-sombra', v: '#8A6A2A', u: 'hilos en sombra' },
  { t: '--oro',        v: '#C9A24B', u: 'evidencia, destacado, bordes de botón' },
  { t: '--oro-luz',    v: '#EAD189', u: 'punta del hilo, texto de botón' },
]
const TEXTO = [
  { t: '--hueso',    v: '#ECE6D8', u: 'texto principal, wordmark' },
  { t: '--ceniza',   v: '#8E918C', u: 'texto secundario, el ruido' },
  { t: '--ceniza-2', v: '#5C605D', u: 'texto terciario, ejes' },
  { t: '--rojo',     v: '#B5473E', u: 'negativo apagado, error' },
  { t: '--rojo-luz', v: '#D9695F', u: 'negativo en texto pequeño' },
]

function Swatches({ items }: { items: { t: string; v: string; u: string }[] }) {
  return (
    <ul className="swatches">
      {items.map((s) => (
        <li key={s.t} className="swatch">
          <span className="swatch__chip" style={{ background: s.v }} />
          <span className="swatch__token mono">{s.t}</span>
          <span className="swatch__hex num">{s.v}</span>
          <span className="swatch__use">{s.u}</span>
        </li>
      ))}
    </ul>
  )
}

function LoaderDemo() {
  const [p, setP] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setP((v) => (v >= 1 ? 0 : Math.min(1, v + 0.011))), 120)
    return () => window.clearInterval(id)
  }, [])
  return <Loader progress={p} size={110} label="Analizando ETH" />
}

export function Sistema() {
  return (
    <div className="sistema" id="sistema">

      {/* ------------------------------------------------ materiales */}
      <section className="section" id="materiales" data-reveal-group>
        <div className="shell">
          <p className="eyebrow mono" data-reveal data-mat="oro">
            <span className="eyebrow__mark" aria-hidden="true" />
            Sistema visual · 01
            <span className="eyebrow__rule" aria-hidden="true" />
          </p>
          <h2 className="display" data-reveal>Tres materiales, una proporción.</h2>
          <p className="lead body-muted" data-reveal>
            La roca es el 80 % de todo. La esmeralda aparece sólo donde hay algo
            que revelar. El oro nunca es masa: es el hilo por donde entra la luz.
          </p>

          <div className="mat-grid" data-reveal>
            <article className="mat mat--roca">
              <div className="mat__sample mat__sample--roca" />
              <h3 className="display">Roca</h3>
              <p className="body-muted">Negro mate con grano, fracturada. Fondos, superficies, la piedra del hero. Nunca negro puro.</p>
              <Swatches items={ROCA} />
            </article>
            <article className="mat mat--esmeralda">
              <div className="mat__sample mat__sample--esmeralda" />
              <h3 className="display">Esmeralda</h3>
              <p className="body-muted">Translúcida, con luz interna. Lo que el análisis encuentra: la tesis, lo positivo, la veta.</p>
              <Swatches items={ESM} />
            </article>
            <article className="mat mat--oro">
              <div className="mat__sample mat__sample--oro" />
              <h3 className="display">Oro</h3>
              <p className="body-muted">En hilos finos, estilo kintsugi. La evidencia, el destacado, el borde de un botón. Nunca un relleno.</p>
              <Swatches items={ORO} />
            </article>
          </div>

          <div className="mat-texto" data-reveal>
            <h3 className="display">Texto y negativo</h3>
            <Swatches items={TEXTO} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ tipografía */}
      <section className="section" id="tipografia" data-reveal-group>
        <div className="shell">
          <p className="eyebrow mono" data-reveal>
            <span className="eyebrow__mark" aria-hidden="true" />
            Sistema visual · 02
            <span className="eyebrow__rule" aria-hidden="true" />
          </p>
          <h2 className="display" data-reveal>Fina, espaciada, exacta.</h2>

          <div className="type-grid" data-reveal>
            <div className="type-row">
              <span className="type-row__meta mono">Outfit 300 · display<br />títulos, –0.015em</span>
              <p className="display type-row__sample" style={{ fontSize: 'clamp(2rem, 4.4vw, 3.6rem)' }}>
                El valor no se inventa. <em>Se encuentra.</em>
              </p>
            </div>
            <div className="type-row">
              <span className="type-row__meta mono">Outfit 500 · wordmark<br />mayúsculas, +0.42em</span>
              <p className="type-row__sample">
                <span className="wordmark" style={{ fontSize: '1.8rem' }}>Veta</span>
                <br />
                <span className="wordmark__sub" style={{ fontSize: '1rem' }}>Crypto Intelligence</span>
              </p>
            </div>
            <div className="type-row">
              <span className="type-row__meta mono">Geist 400 · cuerpo<br />15–17 px, 1.6</span>
              <p className="type-row__sample lead">
                Un informe VETA no promete. Describe la tesis, tres escenarios con
                probabilidades explícitas, y las métricas de riesgo que las sostienen.
                Lo que no se sabe, se dice.
              </p>
            </div>
            <div className="type-row">
              <span className="type-row__meta mono">JetBrains Mono · números<br />tabulares, etiquetas</span>
              <p className="type-row__sample">
                <span className="num type-row__num">
                  <span className="hi-veta">+18.4 %</span> · <span className="hi-oro">P(base) 0.52</span> · <span className="hi-neg">−31.0 %</span> · MC $4.21B
                </span>
                <br />
                <span className="mono" style={{ color: 'var(--ceniza)' }}>escenario · probabilidad · drawdown · capitalización</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ componentes */}
      <section className="section" id="componentes" data-reveal-group>
        <div className="shell">
          <p className="eyebrow mono" data-reveal data-mat="esmeralda">
            <span className="eyebrow__mark" aria-hidden="true" />
            Sistema visual · 03
            <span className="eyebrow__rule" aria-hidden="true" />
          </p>
          <h2 className="display" data-reveal>Lo que casi nadie cuida.</h2>

          <div className="comp-grid">
            {/* carga */}
            <article className="comp" data-reveal>
              <h3 className="display">Carga: la grieta avanza</h3>
              <p className="body-muted">
                Las esperas duran minutos. En vez de un spinner, una grieta de oro
                recorre la piedra y la veta asoma detrás. Determinado cuando hay
                avance que mostrar; indeterminado si no.
              </p>
              <div className="comp__stage comp__stage--row">
                <LoaderDemo />
                <Loader size={110} label="Analizando" />
              </div>
              <p className="mono comp__note">&lt;Loader progress={'{0.62}'} /&gt; · &lt;Loader /&gt;</p>
            </article>

            {/* tiers */}
            <article className="comp" data-reveal>
              <h3 className="display">Riesgo: cuánta veta se ve</h3>
              <p className="body-muted">
                Misma piedra, distinto grado de veta expuesta. Bajo: veta ancha y
                clara. Medio: parcial. Alto: apenas una grieta de oro.
              </p>
              <div className="comp__stage">
                <ul className="tiers">
                  <li><TierIcon tier="bajo" size={64} /><span className="mono">Bajo</span></li>
                  <li><TierIcon tier="medio" size={64} /><span className="mono">Medio</span></li>
                  <li><TierIcon tier="alto" size={64} /><span className="mono">Alto</span></li>
                </ul>
                <ul className="tiers tiers--small">
                  <li><TierIcon tier="bajo" size={18} /><span className="num">SOL · bajo</span></li>
                  <li><TierIcon tier="medio" size={18} /><span className="num">ARB · medio</span></li>
                  <li><TierIcon tier="alto" size={18} /><span className="num">PEPE · alto</span></li>
                </ul>
              </div>
              <p className="mono comp__note">&lt;TierIcon tier="bajo|medio|alto" size={'{n}'} /&gt;</p>
            </article>

            {/* botones */}
            <article className="comp" data-reveal>
              <h3 className="display">Botones: sin masas de oro</h3>
              <p className="body-muted">
                El primario es una línea de oro, no un relleno. El secundario es una
                hairline. Esmeralda sólo para acciones que revelan.
              </p>
              <div className="comp__stage comp__stage--row">
                <button className="btn">Analiza tu moneda</button>
                <button className="btn btn--ghost">Ver metodología</button>
                <button className="btn btn--esmeralda">Abrir informe</button>
                <button className="btn" disabled>Analizando…</button>
              </div>
            </article>

            {/* estados */}
            <article className="comp comp--wide" data-reveal>
              <h3 className="display">Vacío, sin datos, error</h3>
              <p className="body-muted">
                Tres piedras. Intacta: no hay nada que revelar todavía. Grieta punteada:
                se buscó y no había veta, y eso es un resultado. Partida: algo falló.
              </p>
              <div className="comp__stage comp__stage--states">
                <EmptyState
                  kind="vacio"
                  title="Todavía no hay análisis."
                  detail="Elige una moneda y empezamos a trabajar."
                  action={<button className="btn">Analiza tu moneda</button>}
                />
                <EmptyState
                  kind="sin-datos"
                  title="Sin datos suficientes."
                  detail="No hay liquidez ni historial para sostener una tesis. No inventamos una."
                />
                <EmptyState
                  kind="error"
                  title="El análisis se interrumpió."
                  detail="Error 502 al consultar la fuente on-chain. Nada se guardó a medias."
                  action={<button className="btn btn--ghost">Reintentar</button>}
                />
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ charts */}
      <section className="section" id="charts" data-reveal-group>
        <div className="shell">
          <p className="eyebrow mono" data-reveal>
            <span className="eyebrow__mark" aria-hidden="true" />
            Sistema visual · 04
            <span className="eyebrow__rule" aria-hidden="true" />
          </p>
          <h2 className="display" data-reveal>Charts sobre negro.</h2>
          <p className="lead body-muted" data-reveal>
            Esmeralda es positivo. Oro es lo destacado. Rojo apagado es negativo.
            Ceniza es contexto. Números siempre en mono tabular. Sin 3D, sin
            degradados de fondo: legibilidad y densidad primero.
          </p>
          <div data-reveal>
            <ChartSample />
          </div>
          <ul className="chart-tokens" data-reveal>
            <li><span className="dot dot--esmeralda" /><span className="mono">--chart-pos</span><span className="num">#1FA46F</span></li>
            <li><span className="dot dot--oro" /><span className="mono">--chart-hi</span><span className="num">#C9A24B</span></li>
            <li><span className="dot" style={{ background: '#B5473E' }} /><span className="mono">--chart-neg</span><span className="num">#B5473E</span></li>
            <li><span className="dot" style={{ background: '#8E918C' }} /><span className="mono">--chart-ctx</span><span className="num">#8E918C</span></li>
            <li><span className="dot" style={{ background: '#5FE0A6' }} /><span className="mono">--chart-pos-2</span><span className="num">#5FE0A6</span></li>
            <li><span className="dot" style={{ background: 'rgba(236,230,216,0.08)', border: '1px solid rgba(236,230,216,0.2)' }} /><span className="mono">--chart-grid</span><span className="num">hueso 8 %</span></li>
          </ul>
        </div>
      </section>
    </div>
  )
}
