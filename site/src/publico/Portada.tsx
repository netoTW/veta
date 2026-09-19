import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Hero } from '../components/Hero'
import { Footer } from '../components/Footer'
import { Probar } from './Probar'
import { useLenis, useReveals } from '../lib/motion'
import { api } from '../lib/datos'
import { fecha } from '../lib/formato'
import { estadoEconomicoLlano } from '../lib/lenguaje'

/* ============================================================================
   Portada. Seis bloques: el hero, la promesa, la caja para probar, un informe
   real recortado, el método y los planes.

   El bloque del informe sale de lo que ya está publicado. Si no hay nada
   aprobado, no aparece: no se enseña un ejemplo inventado.
   ========================================================================== */

/* Lo que un visitante recibe: sin prosa, sólo identidad y estado. `recorte` no es
   contenido, es la marca de cuánto se sirve. Con eso se arma el ejemplo. */
interface GemaPublica {
  id: string; simbolo: string; nombre: string; cadena?: string | null; tier?: string | null
  fecha_publicacion?: string | null; estado_economico?: string | null; captura_verificada?: boolean | null
}

const PASOS = [
  { n: '01', t: 'Datos con fuente', d: 'Cada cifra queda guardada junto al momento en que se leyó.' },
  { n: '02', t: 'Dos varas', d: 'Se compara contra las de su tamaño y las de su mismo negocio.' },
  { n: '03', t: 'La tesis y su límite', d: 'Con el número exacto que la invalidaría, y su plazo.' },
  { n: '04', t: 'La lectura contraria', d: 'Se ataca a propósito antes de escribirla.' },
  { n: '05', t: 'Cifra contra fuente', d: 'Si una no coincide, el informe no sale.' },
]

export function Portada() {
  useLenis()
  useReveals()
  const [gema, setGema] = useState<GemaPublica | null>(null)

  useEffect(() => {
    api<{ gemas: GemaPublica[] }>('/api/contenido/gemas')
      .then((d) => setGema(d.gemas?.[0] ?? null), () => setGema(null))
  }, [])

  return (
    <>
      <a className="skip-link" href="#probar">Saltar al contenido</a>
      <Nav />
      <main>
        <Hero haySeccionDebajo />

        <section className="pz pz--promesa" aria-labelledby="pz-promesa">
          <div className="pz__col">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Qué hacemos</p>
            <h2 id="pz-promesa" className="display pz__t">Ponemos un equipo a analizar una moneda, y te damos el informe entero.</h2>
            <p className="pz__lead">Tesis en una línea con el número que la invalidaría. Escenarios con su rango y su plazo. Riesgo en palabras normales. Y cada cifra comprobada contra su fuente antes de salir.</p>
          </div>
        </section>

        <section className="pz pz--probar" id="probar" aria-labelledby="pz-probar">
          <div className="pz__col">
            <p className="eyebrow mono" data-mat="esmeralda"><span className="eyebrow__mark" aria-hidden="true" />Pruébalo aquí mismo</p>
            <h2 id="pz-probar" className="display pz__t">Escribe un ticker y mira lo que sale.</h2>
            <Probar />
          </div>
        </section>

        {gema && (
          <section className="pz pz--informe" aria-labelledby="pz-informe">
            <div className="pz__col">
              <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Un informe de verdad</p>
              <h2 id="pz-informe" className="display pz__t">Así se ve uno publicado.</h2>
              <article className="pz__gema">
                <header>
                  <b className="mono pz__gema-sym">{gema.simbolo}</b>
                  <span className="pz__gema-nom">{gema.nombre}{gema.cadena ? ` · ${gema.cadena}` : ''}</span>
                  {gema.tier && <span className={`mono pz__gema-tier is-${gema.tier.toLowerCase()}`}>riesgo {gema.tier.toLowerCase()}</span>}
                  {gema.fecha_publicacion && <span className="mono pz__gema-fecha">{fecha(gema.fecha_publicacion)}</span>}
                </header>
                <p className="pz__gema-titular">{estadoEconomicoLlano(gema.estado_economico ?? '', !!gema.captura_verificada)}.</p>
                <ul className="pz__gema-velado" aria-hidden="true">
                  <li /><li /><li /><li />
                </ul>
                <p className="pz__gema-velo mono">Tesis, escenarios y riesgo: en los planes</p>
              </article>
              <Link to="/gemas" className="btn btn--ghost">Ver las gemas publicadas</Link>
            </div>
          </section>
        )}

        <section className="pz pz--metodo" aria-labelledby="pz-metodo">
          <div className="pz__col">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Cómo trabajamos</p>
            <h2 id="pz-metodo" className="display pz__t">Cinco pasos, y lo que se cae en cualquiera no se publica.</h2>
            <ol className="pz__pasos">
              {PASOS.map((p) => (
                <li key={p.n}>
                  <span className="mono pz__paso-n">{p.n}</span>
                  <b className="display">{p.t}</b>
                  <span className="pz__paso-d">{p.d}</span>
                </li>
              ))}
            </ol>
            <Link to="/metodologia" className="btn btn--ghost">El método entero</Link>
          </div>
        </section>

        <section className="pz pz--planes" aria-labelledby="pz-planes">
          <div className="pz__col">
            <p className="eyebrow mono" data-mat="esmeralda"><span className="eyebrow__mark" aria-hidden="true" />Planes</p>
            <h2 id="pz-planes" className="display pz__t">La lectura es gratis siempre. El informe entero, desde 30 USD al mes.</h2>
            <div className="pz__acciones">
              <Link to="/precios" className="btn">Ver los tres planes</Link>
              <Link to="/analizar" className="btn btn--ghost">Analiza tu moneda</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
