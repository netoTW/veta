import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { api } from '../lib/datos'

/* ============================================================================
   Planes. Precios y cupos vienen del servidor, no del código del cliente:
   van a moverse cuando se mida el costo real de un análisis.
   Mientras no haya cobro automático, el botón abre un correo. No hay carrito
   fingido: eso se nota y resta.
   ========================================================================== */

interface Plan { clave: string; nombre: string; precio_usd: number; analisis_mes: number }
interface Catalogo { contacto: string | null; cobro_automatico: boolean; planes: Plan[] }

/** Una fila por prestación. `v` dice qué pone cada plan; 'cupo' lo rellena el servidor. */
const FILAS: { que: string; v: [string, string, string] }[] = [
  { que: 'Lectura instantánea de cualquier moneda', v: ['sí', 'sí', 'sí'] },
  { que: 'Titular y tier de cada gema', v: ['sí', 'sí', 'sí'] },
  { que: 'El informe completo: tesis, escenarios y riesgo', v: ['—', 'sí', 'sí'] },
  { que: 'Análisis profundos al mes', v: ['cupo', 'cupo', 'cupo'] },
  { que: 'Seguimiento diario y watchlist', v: ['—', 'sí', 'sí'] },
  { que: 'Avisos cuando una tesis se invalida', v: ['—', '—', 'sí'] },
  { que: 'Acceso anticipado a las gemas nuevas', v: ['—', '—', 'sí'] },
  { que: 'Voto de la moneda de la semana', v: ['—', '—', 'sí'] },
  { que: 'Exportar en CSV y JSON', v: ['—', '—', 'sí'] },
]

const PREGUNTAS: { p: string; r: string }[] = [
  { p: '¿Qué es un análisis profundo?', r: 'El informe entero de una moneda que tú eliges: la tesis en una línea, el número que la invalidaría, los escenarios con su plazo y el riesgo. Tarda unos minutos y te avisamos cuando está.' },
  { p: '¿Y si un análisis no termina?', r: 'No se descuenta. El cupo sólo se consume cuando el informe termina y pasa nuestro control de calidad.' },
  { p: '¿El cupo se acumula de un mes a otro?', r: 'No. Se reinicia cada ciclo. Lo que no usas, no se guarda.' },
  { p: '¿Cómo se cancela?', r: 'Escribiendo al mismo correo con el que activaste el plan. Sin permanencia y sin llamadas.' },
]

export function Precios() {
  const [cat, setCat] = useState<Catalogo | null>(null)
  useEffect(() => { api<Catalogo>('/api/planes').then(setCat, () => setCat(null)) }, [])

  const plan = (k: string) => cat?.planes.find((p) => p.clave === k) ?? null
  const orden = ['gratis', 'base', 'pro']
  const celda = (v: string, i: number) => {
    if (v !== 'cupo') return v
    const n = plan(orden[i])?.analisis_mes
    return typeof n === 'number' ? (n > 0 ? String(n) : '—') : '—'
  }
  const precio = (k: string) => {
    const p = plan(k)
    if (!p) return '—'
    return p.precio_usd > 0 ? `${p.precio_usd} USD` : '0'
  }
  const correo = (k: string) => {
    const c = cat?.contacto
    if (!c) return '/entrar'
    const asunto = encodeURIComponent(`Quiero el plan ${k === 'pro' ? 'Pro' : 'Base'}`)
    const cuerpo = encodeURIComponent(`Hola. Quiero activar el plan ${k === 'pro' ? 'Pro' : 'Base'} en VETA.\n\nMi correo de la cuenta es: `)
    return `mailto:${c}?subject=${asunto}&body=${cuerpo}`
  }

  return (
    <>
      <Nav />
      <main className="pub" id="top">
        <div className="pub__col">

          <header className="pub__cab">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Planes</p>
            <h1 className="display pub__titulo">Tres formas de tenernos <em>trabajando</em> para ti.</h1>
            <p className="lead pub__lead">La lectura instantánea de cualquier moneda es gratis siempre, sin cuenta. Los planes abren el informe entero y ponen a nuestro equipo a analizar las monedas que tú elijas.</p>
          </header>

          <section className="planes" aria-label="Planes y precios">
            <div className="planes__cab">
              <span />
              {orden.map((k) => (
                <div key={k} className={`planes__col ${k === 'base' ? 'is-destacada' : ''}`}>
                  {k === 'base' && <span className="planes__sello mono">El más elegido</span>}
                  <b className="display planes__nombre">{plan(k)?.nombre ?? '—'}</b>
                  <span className="planes__precio mono">{precio(k)}</span>
                  {k !== 'gratis' && <span className="planes__mes mono">al mes</span>}
                </div>
              ))}
            </div>

            <div className="tabla-scroll">
              <table className="planes__tabla">
                <caption className="vh">Qué incluye cada plan</caption>
                <thead>
                  <tr><th scope="col">Prestación</th>{orden.map((k) => <th key={k} scope="col">{plan(k)?.nombre ?? k}</th>)}</tr>
                </thead>
                <tbody>
                  {FILAS.map((f) => (
                    <tr key={f.que}>
                      <th scope="row">{f.que}</th>
                      {f.v.map((v, i) => {
                        const t = celda(v, i)
                        return <td key={i} className={t === 'sí' ? 'es-si' : t === '—' ? 'es-no' : 'es-num mono'}>{t}</td>
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="planes__acciones">
              <Link to="/analizar" className="btn btn--ghost">Probar la lectura gratis</Link>
              <a href={correo('base')} className="btn">Quiero el plan Base</a>
              <a href={correo('pro')} className="btn btn--esmeralda">Quiero el plan Pro</a>
            </div>
            {cat && !cat.cobro_automatico && (
              <p className="planes__nota mono">El plan lo activamos a mano, el mismo día. Escríbenos y lo dejamos andando.</p>
            )}
          </section>

          <section className="pub__faq" aria-labelledby="faq-t">
            <h2 id="faq-t" className="display">Lo que todos preguntan</h2>
            <dl>
              {PREGUNTAS.map((x) => (
                <div key={x.p}>
                  <dt>{x.p}</dt>
                  <dd>{x.r}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="pub__cierre">
            <h2 className="display">Empieza por la lectura gratis.</h2>
            <p>Escribe un ticker y mira lo que sale. Si te convence, el plan está a un correo de distancia.</p>
            <div className="pub__acciones">
              <Link to="/analizar" className="btn">Analiza tu moneda</Link>
              <Link to="/metodologia" className="btn btn--ghost">Cómo trabajamos</Link>
            </div>
            <p className="pub__aviso mono">Nada de esto es consejo de inversión. No decimos qué comprar ni prometemos retornos.</p>
          </section>

        </div>
      </main>
      <Footer />
    </>
  )
}
