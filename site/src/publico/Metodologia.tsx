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
    titulo: 'Datos con su fuente y su fecha',
    cuerpo: 'Precio, volumen, comisiones cobradas, fondos bloqueados, reparto del token. Todo de origen público y verificable, y cada número queda guardado junto al momento exacto en que se leyó. Cuando veas una cifra en un informe nuestro, puedes ir a su fuente y comprobarla.',
    corta: 'Si un dato no tiene origen comprobable, no entra.',
  },
  {
    n: '02',
    titulo: 'Varios especialistas, el mismo método',
    cuerpo: 'Cada moneda la miran varios analistas a la vez: el negocio y lo que factura, lo que ocurre en la cadena, y la narrativa que la rodea. Trabajan sobre los mismos datos verificados y responden a las mismas preguntas, moneda tras moneda.',
    corta: 'El método no cambia según la moneda ni según el día.',
  },
  {
    n: '03',
    titulo: 'Dos varas, lado a lado',
    cuerpo: 'Comparamos cada moneda contra las de su tamaño y contra las que hacen su mismo negocio. Las dos varas se muestran juntas y nunca se mezclan en un solo número: un promedio esconde justo lo que hay que ver.',
    corta: 'Dos varas separadas dicen más que una mezclada.',
  },
  {
    n: '04',
    titulo: 'La revisión que busca los puntos débiles',
    cuerpo: 'Antes de escribir nada, la lectura pasa por una revisión que busca a propósito lo contrario: qué explicación alternativa cabe, qué parte del argumento se sostiene sola, por dónde se cae. Lo que no sobrevive a esa revisión no llega al informe.',
    corta: 'El mejor argumento en contra se busca en casa.',
  },
  {
    n: '05',
    titulo: 'La verificación que bloquea lo que no cuadra',
    cuerpo: 'El último paso recorre el informe número por número y lo contrasta contra el dato de origen. Si uno no coincide, el informe no se publica.',
    corta: 'Publicamos menos de lo que analizamos. A propósito.',
  },
  {
    n: '06',
    titulo: 'El marcador, con los errores incluidos',
    cuerpo: 'Cada tesis nace con su condición de invalidación escrita antes de publicar: la cifra exacta que la tumba, con su plazo. Y cada publicación se mide contra un punto de referencia congelado el mismo día que sale, para que la comparación no se mueva después. Publicamos los aciertos y los errores.',
    corta: 'Un método sin marcador es una opinión con buen formato.',
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
          <h1 className="display pub__titulo">Cada moneda pasa por el mismo proceso. <em>Sin excepciones</em>.</h1>
          <p className="lead pub__lead">Seis pasos. Lo que se cae en cualquiera de ellos no llega a tus ojos.</p>
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
          <h2 className="display">Un dato que no existe no cuenta a favor de nadie.</h2>
          <p>Cuando falta un dato, no lo rellenamos con una estimación ni lo dejamos pasar como si no importara. Se dice lo que hay. Lo que no hay, no se muestra.</p>
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
