import { Link } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

/* ============================================================================
   Cómo trabajamos. Página pública: aquí se vende el método, no se advierte.
   Cinco pasos, en el orden real en que ocurren. Cada uno dice qué se hace y
   qué queda fuera por hacerlo. Nada de vocabulario de taller.
   ========================================================================== */

const PASOS: { n: string; titulo: string; cuerpo: string; corta: string }[] = [
  {
    n: '01',
    titulo: 'Los datos salen de fuentes públicas, con fecha',
    cuerpo: 'Precio, volumen, comisiones cobradas, fondos bloqueados, reparto del token. Todo de origen público y verificable, y cada número queda guardado junto al momento en que se leyó. Cuando veas una cifra en un informe nuestro, puedes ir a su fuente y comprobarla.',
    corta: 'Si un dato no tiene origen comprobable, no entra.',
  },
  {
    n: '02',
    titulo: 'Cada moneda se mide contra dos varas',
    cuerpo: 'Una moneda sola no dice nada. La comparamos contra las de su tamaño y contra las que hacen su mismo negocio. Ahí aparece lo que importa: si cotiza en línea con lo que factura, si está cara por una razón, o si el mercado todavía no la ha mirado.',
    corta: 'Sin comparación no hay lectura, sólo opinión.',
  },
  {
    n: '03',
    titulo: 'La tesis viene con el número que la tumba',
    cuerpo: 'Toda tesis nuestra se escribe en una línea, y debajo va la condición exacta que la invalidaría: una cifra concreta, con su plazo. Si esa cifra se cruza, la tesis se cae y lo decimos. No hay tesis que se defienda sola.',
    corta: 'Una tesis sin condición de salida es publicidad.',
  },
  {
    n: '04',
    titulo: 'Antes de escribir, la atacamos',
    cuerpo: 'Cada lectura pasa por una revisión que busca a propósito lo contrario: qué explicación alternativa cabe, qué dato falta, qué parte del argumento se sostiene sola. Lo que no sobrevive a esa revisión no llega al informe.',
    corta: 'El mejor argumento en contra se busca en casa.',
  },
  {
    n: '05',
    titulo: 'Cada cifra se compara con su fuente antes de salir',
    cuerpo: 'El último paso recorre el informe número por número y lo contrasta contra el dato de origen. Si uno no coincide, el informe no se publica. Es el control que más análisis frena, y es exactamente por eso que existe.',
    corta: 'Publicamos menos de lo que analizamos. A propósito.',
  },
]

export function Metodologia() {
  return (
    <>
      <Nav />
      <main className="pub" id="top">
        <div className="pub__col">

        <header className="pub__cab">
          <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Cómo trabajamos</p>
          <h1 className="display pub__titulo">Cinco pasos entre una moneda y un informe que <em>firmamos</em>.</h1>
          <p className="lead pub__lead">Todo lo que publicamos pasa por los cinco, en este orden. Lo que se cae en cualquiera de ellos no llega a tus ojos.</p>
        </header>

        <ol className="pub__pasos">
          {PASOS.map((p) => (
            <li key={p.n} className="paso">
              <span className="paso__n mono">{p.n}</span>
              <div className="paso__cuerpo">
                <h2 className="display paso__t">{p.titulo}</h2>
                <p className="paso__p">{p.cuerpo}</p>
                <p className="paso__corta mono">{p.corta}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="pub__cierre">
          <h2 className="display">Lo que no hay, no se muestra.</h2>
          <p>Si un dato no existe, el informe no lo menciona ni deja un hueco con su nombre. Preferimos un informe más corto y entero que uno largo con relleno.</p>
          <div className="pub__acciones">
            <Link to="/analizar" className="btn">Analiza tu moneda</Link>
            <Link to="/precios" className="btn btn--ghost">Ver planes</Link>
          </div>
          <p className="pub__aviso mono">Nada de esto es consejo de inversión. No decimos qué comprar ni prometemos retornos.</p>
        </section>

        </div>
      </main>
      <Footer />
    </>
  )
}
