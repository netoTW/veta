/* ============================================================================
   Luffy: el puente entre el panel privado /luffy y mugiwara-api (CONTRATO-PANEL.md).

   La web nunca habla directo con Mugiwara. Cada petición a /api/luffy/* se
   reenvía tal cual a `MUGIWARA_API_URL` (127.0.0.1:8800 en el servidor) con la
   cabecera X-Mugiwara-Token, que vive en el entorno y nunca llega al navegador.

   Quién pasa: sólo una sesión con rol admin REAL (sin impersonar). Cualquier
   otro recibe 404, no 403: para quien no es Pablo, esta parte no existe.

   El chat va por SSE y se pasa en streaming de punta a punta: el cuerpo de la
   respuesta de Mugiwara es el cuerpo de la nuestra, sin leerlo entero. Lo mismo
   con el cuerpo de la petición (las imágenes adjuntas pueden pesar).

   Sin token, o con VETA_LUFFY=simulado, responde el simulador (luffySimulado.ts):
   la misma forma del contrato sin red ni gasto. Es lo que corren los invariantes.
   ========================================================================== */
import { Hono } from 'hono'
import { ENV } from './entorno.ts'
import type { Sesion } from './auth.ts'
import type { Rol } from '../src/lib/matriz.ts'
import { luffySimulado } from './luffySimulado.ts'
import { appLuffy } from './luffyApp.ts'

type Vars = { sesion: Sesion | null; rol: Rol; rolReal: Rol; verComo: Rol | null }
export const luffyApp = new Hono<{ Variables: Vars }>()

/* Sólo Pablo. El rol real y sin impersonar: ver como otro no abre esto, y el
   admin que está mirando VETA como un socio tampoco. */
luffyApp.use('*', async (c, next) => {
  const s = c.get('sesion')
  if (!s || s.session.impersonatedBy || c.get('rolReal') !== 'admin') return c.json({ error: 'no_encontrado' }, 404)
  await next()
})

/* La app instalable (manifiesto y service worker): la sirve la web, no Mugiwara, y va antes del
   reenvío para no llegar nunca a mugiwara-api. Detrás del mismo control: sólo Pablo la ve. */
luffyApp.route('/app', appLuffy)

if (ENV.LUFFY === 'simulado') {
  luffyApp.route('/', luffySimulado)
} else {
  luffyApp.all('/*', async (c) => {
    if (!ENV.MUGIWARA_TOKEN) return c.json({ error: 'sin_token', texto: 'la web no tiene MUGIWARA_API_TOKEN en su entorno' }, 503)
    const ruta = c.req.path.replace(/^\/api\/luffy/, '') || '/'
    const q = c.req.url.includes('?') ? c.req.url.slice(c.req.url.indexOf('?')) : ''
    const esChat = ruta === '/chat'
    const conCuerpo = !['GET', 'HEAD'].includes(c.req.method)
    const cabeceras: Record<string, string> = { 'X-Mugiwara-Token': ENV.MUGIWARA_TOKEN, Accept: c.req.header('accept') ?? '*/*' }
    const ct = c.req.header('content-type'); if (ct) cabeceras['Content-Type'] = ct
    /* El turno de un chat puede tardar minutos (agentes, búsquedas): sin tope. Lo demás, un minuto.
       Si el navegador se va, se corta también hacia Mugiwara. */
    const senales = [c.req.raw.signal]
    if (!esChat) senales.push(AbortSignal.timeout(60_000))
    let r: Response
    const t0 = performance.now()
    try {
      r = await fetch(`${ENV.MUGIWARA_URL}${ruta}${q}`, {
        method: c.req.method, headers: cabeceras,
        body: conCuerpo ? c.req.raw.body : undefined,
        // @ts-expect-error -- Node exige duplex para enviar un cuerpo en streaming; el tipo de lib.dom no lo conoce
        duplex: conCuerpo ? 'half' : undefined,
        signal: AbortSignal.any(senales),
      })
    } catch (e) {
      const m = (e as Error).message
      return c.json({ error: 'luffy_caido', texto: `mugiwara-api no responde en ${ENV.MUGIWARA_URL}: ${m}` }, 502)
    }
    const salida = new Headers()
    /* Cuánto tardó mugiwara-api en contestar (hasta las cabeceras): el navegador lo lee y separa
       la red (Vercel → Contabo) de lo que cuesta el servidor de Mugiwara. */
    salida.set('Server-Timing', `mugiwara;dur=${(performance.now() - t0).toFixed(0)}`)
    for (const k of ['content-type', 'content-disposition', 'content-length']) { const v = r.headers.get(k); if (v) salida.set(k, v) }
    if ((r.headers.get('content-type') ?? '').includes('text/event-stream')) {
      salida.delete('content-length')
      salida.set('Cache-Control', 'no-cache')
      salida.set('X-Accel-Buffering', 'no')
    }
    return new Response(r.body, { status: r.status, headers: salida })
  })
}
