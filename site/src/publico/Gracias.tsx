import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { useSesion } from '../lib/sesion'

/* ============================================================================
   Vuelta del pago.

   Whop cobra y avisa por su cuenta, y ese aviso puede tardar unos segundos más
   que el navegador en volver. Por eso esta página no afirma nada hasta ver el
   plan nuevo: pregunta cada dos segundos y medio durante un minuto y medio.

   No pide cerrar sesión ni recargar: el servidor lee el plan de la base en cada
   petición, así que en cuanto el aviso entra, aquí se ve.
   ========================================================================== */

const NOMBRE: Record<string, string> = { gratis: 'Gratis', base: 'Base', pro: 'Pro' }
const CADA_MS = 2500
const HASTA_MS = 90_000

export function Gracias() {
  const { yo, cargando, recargar } = useSesion()
  const [buscado] = useSearchParams()
  const plan = yo?.usuario?.plan ?? null
  /* Qué plan se fue a pagar: lo trae la vuelta del checkout. Sin él no se puede
     distinguir una subida de Base a Pro de un plan que ya estaba puesto. */
  const esperado = buscado.get('plan')
  const [rendido, setRendido] = useState(false)

  const listo = !!plan && plan !== 'gratis' && (!esperado || plan === esperado)

  useEffect(() => {
    if (cargando || listo || rendido) return
    const hasta = Date.now() + HASTA_MS
    const t = setInterval(() => {
      if (Date.now() > hasta) { setRendido(true); return }
      void recargar()
    }, CADA_MS)
    return () => clearInterval(t)
  }, [cargando, listo, rendido, recargar])

  return (
    <>
      <Nav />
      <main className="pub" id="top">
        <div className="pub__col pub__col--legal">
          <header className="pub__cab">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />Pago recibido</p>

            {listo ? (
              <>
                <h1 className="display pub__titulo">Ya estás <em>dentro</em>.</h1>
                <p className="lead pub__lead">
                  Tu plan {NOMBRE[plan!] ?? plan} está activo. Tienes abierto el informe completo de cada moneda
                  y tus análisis a pedido del mes.
                </p>
              </>
            ) : !yo?.usuario ? (
              <>
                <h1 className="display pub__titulo">Gracias. <em>Revisa tu correo.</em></h1>
                <p className="lead pub__lead">
                  Te creamos la cuenta con el correo del pago y te enviamos un enlace para que elijas tu contraseña.
                  Vale una hora. En cuanto la elijas, entras con el plan puesto.
                </p>
              </>
            ) : rendido ? (
              <>
                <h1 className="display pub__titulo">El pago entró. <em>El plan tarda un poco más.</em></h1>
                <p className="lead pub__lead">
                  A veces el aviso del cobro se demora. Vuelve a esta página en un minuto; si sigue igual,
                  escríbenos a contacto@vetalab.io con el correo del pago y lo dejamos andando.
                </p>
              </>
            ) : (
              <>
                <h1 className="display pub__titulo">Gracias. <em>Activando tu plan…</em></h1>
                <p className="lead pub__lead">
                  Estamos confirmando el cobro. Tarda unos segundos y esta página se actualiza sola.
                </p>
              </>
            )}
          </header>

          <div className="pub__acciones">
            {listo
              ? <><Link to="/gemas" className="btn">Ver las gemas</Link><Link to="/analizar" className="btn btn--ghost">Analiza tu moneda</Link></>
              : !yo?.usuario
                ? <Link to="/entrar" className="btn btn--ghost">Ya elegí mi contraseña</Link>
                : <Link to="/cuenta" className="btn btn--ghost">Ver mi cuenta</Link>}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
