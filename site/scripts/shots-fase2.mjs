/* Capturas antes/después de la fase 2 (analizar y mis análisis).
   Uso: node scripts/shots-fase2.mjs <carpeta-salida> [antes|despues]
   Requiere el servidor en :5310 con dist construido y las cuentas de la semilla. */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2] ?? '/tmp/veta-shots/fase2/antes'
const MOMENTO = process.argv[3] ?? 'antes'
mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const env = Object.fromEntries(readFileSync(resolve('.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))

/* El motor todavía no marca ninguna moneda como no analizable. Para poder retratar
   ese estado se sustituye fetch en la página y se responde esa única ruta. */
async function fingirResolver(cuerpo) {
  await p.evaluate((c) => {
    const orig = window.__fetchOriginal ?? window.fetch
    window.__fetchOriginal = orig
    window.fetch = (u, o) => (String(u).includes('/api/analizar/resolver')
      ? Promise.resolve(new Response(JSON.stringify(c), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : orig(u, o))
  }, cuerpo)
}

async function shot(nombre) { await p.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: false }); console.log(' ', nombre) }
const api = (metodo, ruta, cuerpo) => p.evaluate(async (metodo, ruta, cuerpo) => {
  const r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, credentials: 'same-origin' })
  return { status: r.status }
}, metodo, ruta, cuerpo)
async function ir(ruta, ms = 1600) { await p.goto(`${URL}${ruta}`, { waitUntil: 'networkidle0' }); await wait(ms) }
async function escribirYEnviar(texto, ms = 2200) {
  await p.click('#an-q', { clickCount: 3 }); await p.type('#an-q', texto, { delay: 25 })
  await p.click('.an-busca__btn'); await wait(ms)
}

await ir('/gemas', 700)
const r = await api('POST', '/api/auth/sign-in/email', { email: 'pro@veta.local', password: env.VETA_DEMO_PASSWORD })
if (r.status !== 200) throw new Error(`login pro: ${r.status}`)

await ir('/analizar', 2400); await shot('01-analizar-entrada')
await escribirYEnviar('pepe'); await shot('02-varias-monedas')
await ir('/analizar', 1800); await escribirYEnviar('ZZZZ'); await shot('03-sin-coincidencia')

if (MOMENTO === 'despues') {
  const falso = { consulta: 'BLUR', interpretada_como: 'ticker', candidatas: [{ simbolo: 'BLUR', nombre: 'Blur', cadena: 'Ethereum', con_informe: false, analizable: false, motivo_no_analizable: 'No publica ingresos del protocolo ni fondos bloqueados verificables. Sin eso, el análisis sería una opinión con formato de informe.' }] }
  await ir('/analizar', 1600); await fingirResolver(falso); await escribirYEnviar('BLUR'); await shot('04-no-analizable')
}

await ir('/cuenta', 2000); await shot('05-cuenta')

/* La cuenta base sí tiene análisis pedidos: es la que muestra la lista con filas. */
await api('POST', '/api/auth/sign-out', {})
await ir('/gemas', 700)
const rb = await api('POST', '/api/auth/sign-in/email', { email: 'base@veta.local', password: env.VETA_DEMO_PASSWORD })
if (rb.status !== 200) throw new Error(`login base: ${rb.status}`)
await ir('/cuenta', 2200)
await p.evaluate(() => document.querySelector('.a-mis')?.scrollIntoView({ block: 'center' })); await wait(700); await shot('06-cuenta-mis-analisis')

/* El informe narrado (contrato §9.4) todavía no lo entrega el sistema: se finge
   sobre un informe real para poder ver cómo queda la pantalla. */
if (MOMENTO === 'despues' && existsSync('/tmp/informe-muestra.json')) {
  const informe = JSON.parse(readFileSync('/tmp/informe-muestra.json', 'utf8'))
  const sol = {
    id: 'muestra', simbolo: informe.simbolo ?? 'RAY', nombre: informe.nombre ?? null, nivel: 'profundo', estado: 'listo',
    etapa: null, avance: 1, detalle: null, etapas_hechas: ['recolectando', 'calculando', 'esceptico', 'redactando', 'verificando'],
    consume_cupo: true, motor: 'motor', creada: '2026-09-19T07:00:00Z', iniciada: '2026-09-19T07:00:20Z', terminada: '2026-09-19T07:06:40Z',
    vista: true, fallo: null, verificador: { estado: 'pasa', motivo_bloqueo: '' }, tier: informe.tier ?? null,
    resultado: { ...informe, narrado: {
      titular: 'Raydium factura de verdad y el token cobra parte de esa caja.',
      parrafos: [
        'El protocolo cobra una comisión por cada intercambio que pasa por sus pozos, y una parte fija de esa comisión se usa para recomprar el token en el mercado abierto. No es una promesa del equipo: se ve en las transacciones, semana a semana.',
        'Frente a protocolos del mismo tamaño y el mismo negocio, cotiza en línea con lo que factura. No está regalado ni está caro; está donde debería estar si la caja se mantiene.',
      ],
      riesgos: [
        'La mayor parte de las comisiones viene de un solo producto. Si pierde cuota frente a otro creador de mercado, la caja se achica rápido.',
        'Cuatro de las diez mayores posiciones no están identificadas, y entre ellas suman una porción capaz de mover el precio al vender.',
      ],
      cierre: 'Lo que habría que ver para cambiar de opinión: que los fondos bloqueados bajen de 843 M USD durante treinta días seguidos.',
    } },
  }
  await ir('/analizar', 1200)
  await p.evaluate((sol) => {
    const orig = window.__fetchOriginal ?? window.fetch
    window.__fetchOriginal = orig
    window.fetch = (u, o) => (String(u).includes('/api/analizar/solicitudes/muestra')
      ? Promise.resolve(new Response(JSON.stringify({ solicitud: sol, cupo: null }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      : orig(u, o))
  }, sol)
  await p.evaluate(() => { history.pushState({}, '', '/analizar/s/muestra'); window.dispatchEvent(new PopStateEvent('popstate')) })
  await wait(3200)
  await shot('07-informe-narrado')
  await p.evaluate(() => document.querySelector('.an-narra')?.scrollIntoView({ block: 'start' })); await wait(600); await shot('08-informe-narrado-detalle')
}

console.log('errores:', errores.filter((e) => !/favicon|404/.test(e)).slice(0, 6))
await b.close()
