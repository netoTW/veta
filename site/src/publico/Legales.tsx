import { Link } from 'react-router-dom'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'

/* ============================================================================
   Términos, privacidad y contacto.

   Borrador funcional, pendiente de revisión legal. El aviso de que VETA no es
   asesoría de inversión abre los términos, porque es lo único que un lector
   tiene que entender sí o sí.
   ========================================================================== */

const CONTACTO = 'contacto@vetalab.io'

function Legal({ eyebrow, titulo, lead, children }: { eyebrow: string; titulo: React.ReactNode; lead?: string; children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main className="pub" id="top">
        <div className="pub__col pub__col--legal">
          <header className="pub__cab">
            <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />{eyebrow}</p>
            <h1 className="display pub__titulo pub__titulo--legal">{titulo}</h1>
            {lead && <p className="lead pub__lead">{lead}</p>}
          </header>
          <div className="lg">{children}</div>
          <nav className="lg__otras" aria-label="Otras páginas">
            <Link to="/terminos">Términos</Link>
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/contacto">Contacto</Link>
          </nav>
        </div>
      </main>
      <Footer />
    </>
  )
}

export function Terminos() {
  return (
    <Legal eyebrow="Términos del servicio" titulo={<>Qué es VETA, y qué <em>no</em> es.</>}>
      <p className="lg__clave">
        VETA entrega información y análisis. <b>No es asesoría de inversión ni una recomendación de compra o venta.</b>{' '}
        No conocemos tu situación, tus objetivos ni tu tolerancia a la pérdida, y nada de lo que publicamos está
        personalizado. Las decisiones que tomes con esta información son tuyas y de nadie más.
      </p>

      <h2>Qué es este servicio</h2>
      <p>Información y análisis sobre criptoactivos: datos con su fuente, comparaciones, escenarios y seguimiento de lo publicado.</p>

      <h2>Planes y cobro</h2>
      <p>Hay un plan gratuito y dos de pago, con el precio publicado en la página de planes. Mientras no haya cobro automático, los planes se activan a mano tras escribirnos. Se cancelan escribiendo al mismo correo, sin permanencia.</p>

      <h2>Cupos</h2>
      <p>Los planes de pago incluyen un número de análisis a pedido por ciclo. Se reinician cada ciclo y no se acumulan. Un análisis que no termina o que no pasa nuestro control de calidad no consume cupo.</p>

      <h2>Tu cuenta</h2>
      <p>Eres responsable de tu contraseña y de lo que ocurra con tu cuenta. Podemos suspender una cuenta que comparta credenciales, revenda el contenido o intente extraerlo de forma automatizada.</p>

      <h2>Qué puedes hacer con el contenido</h2>
      <p>Leerlo, guardarlo y usarlo para tus decisiones. No republicarlo ni revenderlo como propio.</p>

      <h2>Disponibilidad y cambios</h2>
      <p>Trabajamos para que el servicio esté disponible, pero no garantizamos funcionamiento ininterrumpido ni la disponibilidad permanente de fuentes de datos de terceros. Si cambiamos estos términos de forma relevante, se avisa en la plataforma antes de que entren en vigor.</p>

      <h2>Ley aplicable</h2>
      <p>Estos términos se rigen por la ley chilena.</p>
    </Legal>
  )
}

export function Privacidad() {
  return (
    <Legal eyebrow="Privacidad" titulo={<>Lo mínimo para que el servicio funcione. <em>Nada más</em>.</>}>
      <h2>Qué guardamos</h2>
      <p>Tu correo, tu nombre si lo escribes, la fecha de alta y la del último acceso, tu plan y tu consumo de análisis. Nada más.</p>

      <h2>Qué no guardamos</h2>
      <p>No pedimos ni guardamos datos de pago, ni documentos de identidad, ni direcciones de billetera. Tu contraseña se guarda cifrada y nadie puede leerla, tampoco nosotros.</p>

      <h2>Para qué lo usamos</h2>
      <p>Para darte acceso, aplicar tu plan, avisarte cuando un análisis que pediste está listo y recuperar tu contraseña si la pierdes. No vendemos tus datos ni los cedemos a terceros con fines comerciales.</p>

      <h2>Con quién se comparte lo mínimo</h2>
      <p>El servicio se apoya en proveedores de alojamiento, base de datos y envío de correo, que tratan los datos sólo para prestar ese servicio.</p>

      <h2>Cookies</h2>
      <p>Sólo la cookie de sesión, la que mantiene tu sesión abierta. No hay cookies de publicidad ni de seguimiento de terceros.</p>

      <h2>Tus derechos</h2>
      <p>Puedes pedir una copia de tus datos, corregirlos o borrar tu cuenta escribiendo a <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. Al borrar la cuenta se elimina tu información personal.</p>

      <h2>Cuánto tiempo</h2>
      <p>Mientras tengas cuenta. Si la borras, se elimina, salvo el registro mínimo que haga falta conservar por obligación legal o contable.</p>
    </Legal>
  )
}

export function Contacto() {
  return (
    <Legal eyebrow="Contacto" titulo={<>Escríbenos.</>} lead="Para dudas sobre un análisis, para activar o cancelar un plan, y para cualquier asunto de datos personales.">
      <p className="lg__correo"><a href={`mailto:${CONTACTO}`}>{CONTACTO}</a></p>
      <p>Respondemos en español. VETA, operado desde Chile.</p>
      <div className="pub__acciones">
        <Link to="/analizar" className="btn">Analiza tu moneda</Link>
        <Link to="/precios" className="btn btn--ghost">Ver los planes</Link>
      </div>
    </Legal>
  )
}
