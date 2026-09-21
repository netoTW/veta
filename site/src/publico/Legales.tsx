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

      <h2>Quién presta el servicio</h2>
      <p>VETA es un proyecto operado por una persona natural con domicilio en Chile. El canal de contacto para cualquier asunto —comercial, técnico o de datos personales— es <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.</p>

      <h2>Qué es este servicio</h2>
      <p>Información y análisis sobre criptoactivos: datos con su fuente, comparaciones, escenarios y seguimiento de lo publicado.</p>

      <h2>Planes y cobro</h2>
      <p>Hay un plan gratuito y dos de pago, con el precio publicado en la página de planes, en dólares estadounidenses y por mes. El cobro lo procesa <b>Whop</b>, que es quien recibe y guarda los datos de pago: VETA no ve ni almacena tu tarjeta.</p>
      <p>La suscripción se renueva sola cada mes hasta que la canceles. El plan queda activo en cuanto Whop confirma el pago. Si el cobro de una renovación no entra, el acceso sigue mientras Whop reintenta, y sólo baja a Gratis cuando la suscripción queda definitivamente inactiva.</p>

      <h2>Cancelación y reembolsos</h2>
      <p>Puedes cancelar cuando quieras desde tu panel de Whop, sin permanencia y sin llamadas. Al cancelar conservas el acceso hasta el final del ciclo que ya pagaste, y ese día vuelves al plan Gratis. No se cobra nada después.</p>
      <p>Como la contratación es a distancia, tienes <b>diez días corridos</b> desde la contratación para retractarte y pedir la devolución de lo pagado, según el artículo 3 bis de la Ley 19.496 sobre protección de los derechos de los consumidores. Escríbenos y lo tramitamos. Fuera de ese plazo, la cancelación evita los cobros siguientes pero no devuelve el ciclo en curso.</p>

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
      <h2>Quién responde por tus datos</h2>
      <p>El responsable del tratamiento es la persona natural con domicilio en Chile que opera VETA. Para cualquier asunto de datos personales, escribe a <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>.</p>

      <h2>Qué guardamos</h2>
      <p>Tu correo, tu nombre si lo escribes, la fecha de alta y la del último acceso, tu plan y tu consumo de análisis. Si contratas un plan, guardamos además el identificador que Whop asigna a tu suscripción y la fecha en que se renueva.</p>

      <h2>Qué no guardamos</h2>
      <p>No pedimos ni guardamos datos de pago, ni documentos de identidad, ni direcciones de billetera. Tu tarjeta la trata Whop y nunca pasa por nuestros servidores. Tu contraseña se guarda cifrada y nadie puede leerla, tampoco nosotros.</p>

      <h2>Para qué lo usamos</h2>
      <p>Para darte acceso, aplicar tu plan, avisarte cuando un análisis que pediste está listo y recuperar tu contraseña si la pierdes. No vendemos tus datos ni los cedemos a terceros con fines comerciales.</p>

      <h2>Con quién se comparte lo mínimo</h2>
      <p>Con <b>Whop</b>, que procesa el cobro y para ello recibe tu correo; con el proveedor de envío de correo, que entrega los mensajes de la cuenta; y con los proveedores de alojamiento y base de datos donde corre el servicio. Cada uno trata los datos sólo para prestar ese servicio, y ninguno los usa por su cuenta.</p>

      <h2>Dónde están</h2>
      <p>El servicio corre en servidores de Alemania y la base de datos está en Estados Unidos, así que tus datos se transfieren fuera de Chile para poder prestarte el servicio.</p>

      <h2>Cookies y lo que queda en tu navegador</h2>
      <p>Una cookie de sesión, la que mantiene tu sesión abierta. No hay cookies de publicidad ni de seguimiento de terceros, y no te seguimos por otros sitios.</p>
      <p>Si llegas desde un enlace de campaña, tu navegador guarda durante <b>30 días</b> de qué campaña viniste, para saber qué funciona. Es un dato de origen, no un perfil: se queda en tu navegador hasta que se usa o caduca, y lo borras vaciando los datos del sitio.</p>

      <h2>Tus derechos</h2>
      <p>Puedes pedir una copia de tus datos, corregirlos o borrar tu cuenta escribiendo a <a href={`mailto:${CONTACTO}`}>{CONTACTO}</a>. Al borrar la cuenta se elimina tu información personal.</p>

      <h2>Cuánto tiempo</h2>
      <p>Mientras tengas cuenta. Si la borras, se elimina, salvo el registro mínimo que haga falta conservar por obligación legal o contable.</p>
    </Legal>
  )
}

export function Contacto() {
  return (
    <Legal eyebrow="Contacto" titulo={<>Escríbenos.</>} lead="Para dudas sobre un análisis, para un reembolso y para cualquier asunto de datos personales. Cancelar el plan se hace desde tu panel de Whop, cuando quieras.">
      <p className="lg__correo"><a href={`mailto:${CONTACTO}`}>{CONTACTO}</a></p>
      <p>Respondemos en español. VETA, operado desde Chile.</p>
      <div className="pub__acciones">
        <Link to="/analizar" className="btn">Analiza tu moneda</Link>
        <Link to="/precios" className="btn btn--ghost">Ver los planes</Link>
      </div>
    </Legal>
  )
}
