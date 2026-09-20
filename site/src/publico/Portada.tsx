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

/* Las cuatro piezas del producto, cada una con su captura real. Las imágenes vienen en
   dos tamaños: 900 para pantallas normales y 1800 para las de mucha densidad. */
const PIEZAS: { n: string; k: string; t: string; d: string; plan: string; img: string; alt: string; pie: string }[] = [
  {
    n: '1', k: 'Gemas', t: 'Una gema cada semana, elegida entre mil',
    d: 'Revisamos mil monedas y nos quedamos con las pocas que dan una señal real. De ésas sale la gema: la que, con nuestro método, tiene el mejor potencial. Se publica con el informe entero, su tesis, sus escenarios y la cifra exacta que la invalidaría.',
    plan: 'Los socios Pro la ven seis horas antes que nadie',
    img: 'gemas', alt: 'Lista de gemas publicadas, cada una con su tier y su estado.',
    pie: 'Las gemas publicadas, con su tier y su estado',
  },
  {
    n: '2', k: 'Votación', t: 'Los socios Pro eligen qué se analiza a fondo',
    d: 'De las monedas que dieron señal, cuatro o cinco entran a votación. Un voto por semana, con su nombre, y no se cambia. El análisis que salga se publica para todos.',
    plan: 'Ver la lista y votar es del plan Pro',
    img: 'votacion', alt: 'La votación de la semana: el embudo de mil monedas a cinco candidatas, el tiempo que queda y las piedras de cada una.',
    pie: 'La votación de la semana, con el embudo y las candidatas',
  },
  {
    n: '3', k: 'Analiza tu moneda', t: 'Y si la tuya no está, la analizamos',
    d: 'No sólo miramos las nuestras. Escribe un ticker y ves la lectura al instante, gratis y sin cuenta: qué mueve el precio, cuánto cae en un día malo, quién lo tiene, si el token cobra y si se puede salir. Si quieres el informe completo de esa moneda, lo pides y lo hacemos.',
    plan: 'La lectura es gratis siempre · el informe completo va con el plan',
    img: 'analizar', alt: 'La lectura instantánea de una moneda, con sus cinco señales.',
    pie: 'La lectura instantánea, gratis y sin cuenta',
  },
  {
    n: '4', k: 'Seguimiento', t: 'Lo publicado no se abandona',
    d: 'Cada día se vuelve a medir la cifra que invalidaría cada tesis, contra la fuente que el informe declara, y se compara contra un punto de referencia congelado el día que se publicó. Si una tesis se cae, lo decimos nosotros primero.',
    plan: 'Los avisos de invalidación son del plan Pro',
    img: 'seguimiento', alt: 'El seguimiento diario de lo publicado, medido contra el punto de referencia.',
    pie: 'El seguimiento diario contra el punto de referencia',
  },
]

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

        <section className="pz pz--producto" aria-labelledby="pz-producto">
          <div className="pz__col">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />El producto</p>
            <h2 id="pz-producto" className="display pz__t">No esperamos a que preguntes por una moneda.</h2>
            <p className="pz__lead">Cada semana revisamos mil monedas, publicamos las que pasan el método entero y seguimos cada tesis todos los días.</p>
          </div>
          {PIEZAS.map((x) => (
            <article key={x.img} className="pz__col pieza">
              <p className="pieza__k mono">{x.n} · {x.k}</p>
              <h3 className="display pieza__t">{x.t}</h3>
              <p className="pieza__d">{x.d}</p>
              <p className="pieza__plan mono">{x.plan}</p>
              <figure className="pieza__fig">
                <img
                  src={`/img/producto/${x.img}-900.webp`}
                  srcSet={`/img/producto/${x.img}-900.webp 900w, /img/producto/${x.img}-1800.webp 1800w`}
                  sizes="(max-width: 980px) calc(100vw - 40px), 900px"
                  width={900} height={562} alt={x.alt} loading="lazy" decoding="async"
                />
                <figcaption className="mono">{x.pie}</figcaption>
              </figure>
            </article>
          ))}
          <div className="pz__col">
            <div className="pz__acciones">
              <Link to="/gemas" className="btn">Ver las gemas publicadas</Link>
              <Link to="/analizar" className="btn btn--ghost">Analiza tu moneda</Link>
            </div>
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
                {!!estadoEconomicoLlano(gema.estado_economico ?? '', !!gema.captura_verificada) && (
                  <p className="pz__gema-titular">{estadoEconomicoLlano(gema.estado_economico ?? '', !!gema.captura_verificada)}.</p>
                )}
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
