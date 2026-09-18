import { Hero3D } from './Hero3D'
import { HeroMobile } from './HeroMobile'

export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero__art" aria-hidden="true">
        {/* Poster: instantáneo mientras el 3D carga, y base en gamas sin WebGL. */}
        <picture>
          <source media="(max-width: 720px)" srcSet="/img/hero-poster-m.webp" />
          <img
            src="/img/hero-poster-1440.webp"
            srcSet="/img/hero-poster-960.webp 960w, /img/hero-poster-1440.webp 1440w, /img/hero-poster.webp 2048w"
            sizes="100vw"
            alt=""
            width={2048}
            height={1152}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <Hero3D />
        <HeroMobile />
        <span className="hero__veil" />
      </div>

      <div className="shell hero__inner" data-reveal-group>
        <p className="eyebrow mono" data-reveal data-mat="oro">
          <span className="eyebrow__mark" aria-hidden="true" />
          VETA — Crypto Intelligence
        </p>

        <h1 id="hero-title" className="display hero__title" data-reveal>
          El valor no se inventa.<br />
          <em>Se encuentra.</em>
        </h1>

        <p className="lead hero__lead" data-reveal>
          Research cripto riguroso: tesis, escenarios y métricas de riesgo
          para cada moneda. Lo que hay y lo que no, sin humo.
        </p>

        {/* Los tres materiales se enseñan acá, una vez, y rigen todo el sitio. */}
        <ul className="hero__legend mono" data-reveal>
          <li><span className="dot dot--roca" aria-hidden="true" />el ruido</li>
          <li><span className="dot dot--oro" aria-hidden="true" />la evidencia</li>
          <li><span className="dot dot--esmeralda" aria-hidden="true" />la tesis</li>
        </ul>

        <div className="hero__actions" data-reveal>
          <a href="#sistema" className="btn">Analiza tu moneda</a>
          <a href="#sistema" className="btn btn--ghost">Cómo trabajamos</a>
        </div>
      </div>

      <div className="hero__foot shell mono" aria-hidden="true">
        <span>Tesis · Escenarios · Riesgo · Sin promesas</span>
        <span className="hero__scroll">Scroll ↓</span>
      </div>
    </section>
  )
}
