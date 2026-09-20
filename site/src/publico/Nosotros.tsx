import { Link } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

/* ============================================================================
   Nosotros. Capacidad del equipo, no biografías: sin nombres, sin fotos, sin
   testimonios. Aquí no se habla de riesgo; esta página vende.
   ========================================================================== */

const QUIEN: { que: string; d: string }[] = [
  { que: 'El método lo define el equipo humano', d: 'Qué se mide, contra qué se compara y qué invalida una tesis.' },
  { que: 'Los números los produce el código', d: 'No los escribe un modelo de lenguaje: se calculan y se comprueban contra su fuente.' },
  { que: 'Los agentes investigan y narran', d: 'Buscan, leen, contrastan y escriben.' },
  { que: 'Ningún análisis se publica sin revisión humana', d: 'Esa es la última puerta, siempre.' },
]

export function Nosotros() {
  return (
    <>
      <Nav />
      <main className="pub" id="top">
        <div className="pub__col">

          <header className="pub__cab">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Nosotros</p>
            <h1 className="display pub__titulo">Ocho años operando mercados, aplicados a cada moneda, <em>todos los días</em>.</h1>
            <p className="lead pub__lead">Lo que hace un analista con una moneda por semana, aquí ocurre con cientos, sin que el método cambie.</p>
          </header>

          <section className="pub__bloque" aria-labelledby="ns-quien">
            <h2 id="ns-quien" className="display pub__h2">Quién está detrás</h2>
            <p className="pub__p">VETA la dirige un equipo con más de ocho años operando mercados de verdad: divisas, cripto, derivados y on-chain. Formación en finanzas cuantitativas e ingeniería, y años construyendo sistemas de trading algorítmico propios.</p>
          </section>

          <section className="pub__bloque" aria-labelledby="ns-separa">
            <h2 id="ns-separa" className="display pub__h2">Lo que nos separa</h2>
            <p className="pub__p pub__p--fuerte">Ese criterio no se aplica a mano, a una moneda por semana.</p>
            <p className="pub__p">Lo ejecuta un equipo de agentes de inteligencia artificial especializados. Uno mira el negocio y lo que factura. Otro, lo que ocurre en la cadena. Otro, la narrativa y quién la sostiene. Y uno más tiene un solo trabajo: buscar por dónde se cae la tesis antes de que se publique.</p>
            <p className="pub__p">Todos corren el mismo método sobre cada moneda, todos los días. El método no cambia según la moneda, ni según el día, ni según el ánimo con que se mire.</p>
          </section>

          <section className="pub__bloque" aria-labelledby="ns-hace">
            <h2 id="ns-hace" className="display pub__h2">Quién hace qué</h2>
            <ul className="ns-quien">
              {QUIEN.map((x) => (
                <li key={x.que}><b>{x.que}</b><span>{x.d}</span></li>
              ))}
            </ul>
          </section>

          <section className="pub__bloque" aria-labelledby="ns-produce">
            <h2 id="ns-produce" className="display pub__h2">Qué produce el sistema</h2>
            <ul className="ns-quien">
              <li><b>Una gema cada semana</b><span>Elegida entre mil monedas revisadas y publicada con el informe entero.</span></li>
              <li><b>Análisis de cualquier moneda</b><span>A pedido, con la lectura instantánea gratis para todos.</span></li>
              <li><b>Seguimiento diario</b><span>De cada tesis publicada, contra la cifra que la invalidaría.</span></li>
              <li><b>Una votación semanal</b><span>Los socios Pro eligen qué se analiza a fondo.</span></li>
            </ul>
          </section>

          <section className="pub__cierre">
            <div className="pub__acciones">
              <Link to="/metodologia" className="btn">Cómo trabajamos</Link>
              <Link to="/analizar" className="btn btn--ghost">Analiza tu moneda</Link>
            </div>
          </section>

        </div>
      </main>
      <Footer />
    </>
  )
}
