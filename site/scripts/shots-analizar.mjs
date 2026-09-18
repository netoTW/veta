/* Analiza tu moneda: capturas del flujo completo contra el simulador.
   Uso: node scripts/shots-analizar.mjs <carpeta-salida>
   Requiere el servidor sirviendo dist en :5310 con VETA_SIM_VELOCIDAD alto (≈12). */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2] ?? 'recursos/capturas/analizar'
mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const env = Object.fromEntries(readFileSync(resolve('.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const ADMIN = { email: env.VETA_ADMIN_EMAIL, password: env.VETA_ADMIN_PASSWORD }
const DEMO = env.VETA_DEMO_PASSWORD

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

async function shot(name, { full = true, sel = null } = {}) {
  if (sel) {
    const el = await p.$(sel); if (!el) { console.log('SIN', sel); return }
    await p.evaluate(() => { document.querySelector('.p-top').style.visibility = 'hidden' })
    await el.screenshot({ path: `${OUT}/${name}.png` })
    await p.evaluate(() => { document.querySelector('.p-top').style.visibility = '' })
  } else await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log(name)
}
async function api(method, path, body) {
  return p.evaluate(async (method, path, body) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
    return { status: r.status, json: await r.json().catch(() => null) }
  }, method, path, body)
}
async function entrar(email, password) {
  await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' })
  const r = await api('POST', '/api/auth/sign-in/email', { email, password })
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`)
}
const salir = () => api('POST', '/api/auth/sign-out', {})
async function ir(path, ms = 1200) { await p.goto(`${URL}${path}`, { waitUntil: 'networkidle0' }); await wait(ms) }
const etapaActual = () => p.evaluate(() => document.querySelector('.an-etapa.is-actual .an-etapa__t')?.textContent ?? document.querySelector('.an-sol')?.className ?? '')
async function esperarEtapa(pred, max = 40000) { const t0 = Date.now(); while (Date.now() - t0 < max) { const e = await etapaActual(); if (pred(e)) return e; await wait(250) } return null }

if (process.argv[3] === 'recap') {
  await entrar('pro@veta.local', DEMO)
  await ir('/analizar?m=RAY', 1800)
  await p.click('.an-decidir__btn'); await wait(300); await p.click('.an-confirma .btn--esmeralda'); await p.waitForSelector('.an-espera', { timeout: 15000 })
  await esperarEtapa((e) => /an-sol--listo/.test(e), 60000); await wait(3600); await shot('12-resultado-listo', { full: false }); await shot('13-resultado-completo')
  await p.setViewport({ width: 400, height: 860, deviceScaleFactor: 2 }); await wait(800); await shot('14-resultado-movil', { full: false })
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await ir('/analizar?m=RAY', 1500); await shot('04-base-determinista', { full: false }); await shot('02-visitante-determinista')
  await salir(); await b.close(); process.exit(0)
}
/* ============================ VISITANTE: la lectura gratis ============================ */
await salir().catch(() => {})
await ir('/analizar', 1500); await shot('01-visitante-busqueda', { full: false })
await p.type('#an-q', 'RAY', { delay: 40 }); await p.keyboard.press('Enter'); await wait(1800)
await shot('02-visitante-determinista')
await shot('03-visitante-puerta', { sel: '.an-decidir' })

/* ============================ BASE: decidir, esperar, resultado ============================ */
await entrar('base@veta.local', DEMO)
await ir('/analizar?m=RAY', 1800)
await shot('04-base-determinista', { full: false })
await shot('05-base-decidir', { sel: '.an-decidir' })
await p.click('.an-decidir__btn'); await wait(500); await shot('06-base-confirmar', { sel: '.an-decidir' })
await p.click('.an-confirma .btn--esmeralda'); await p.waitForSelector('.an-espera', { timeout: 15000 }); await wait(2600)
await shot('07-espera-recolectando', { full: false })
await esperarEtapa((e) => /Calculando/.test(e)); await wait(1200); await shot('08-espera-calculando', { full: false })
await esperarEtapa((e) => /objeciones/.test(e)); await wait(700); await shot('09-espera-esceptico', { full: false })
await esperarEtapa((e) => /Redactando/.test(e)); await wait(1200); await shot('10-espera-redactando', { full: false })
await esperarEtapa((e) => /Verificando/.test(e)); await wait(1000); await shot('11-espera-verificando', { full: false })
await esperarEtapa((e) => /an-sol--listo/.test(e)); await wait(3200); await shot('12-resultado-listo', { full: false })
await shot('13-resultado-completo')
// móvil
await p.setViewport({ width: 400, height: 860, deviceScaleFactor: 2 }); await wait(800); await shot('14-resultado-movil', { full: false })
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

/* ---- bloqueada por la verificación: no consume cupo ---- */
await ir('/analizar?m=DODO', 1800); await shot('15-dodo-determinista', { full: false })
await p.click('.an-decidir__btn'); await wait(300); await p.click('.an-confirma .btn--esmeralda'); await p.waitForSelector('.an-espera', { timeout: 15000 })
await esperarEtapa((e) => /an-sol--bloqueado/.test(e), 60000); await wait(2600); await shot('16-bloqueada', { full: false })

/* ---- segundo análisis en marcha, el usuario se va: barra y aviso ---- */
await ir('/analizar?m=ORCA', 1800)
await p.click('.an-decidir__btn'); await wait(300); await p.click('.an-confirma .btn--esmeralda'); await p.waitForSelector('.an-espera', { timeout: 15000 }); await wait(1500)
await ir('/gemas', 1500); await shot('17-barra-trabajando', { full: false })
await wait(16000); await ir('/gemas', 2500); await shot('18-aviso-listo', { full: false })

/* ---- sin cupo ---- */
await ir('/analizar?m=SSV', 1800); await shot('19-sin-cupo', { sel: '.an-decidir' })
await ir('/analizar', 1500); await shot('20-mis-analisis')
await salir()

/* ============================ ADMIN ============================ */
await entrar(ADMIN.email, ADMIN.password)
await ir('/admin/consumo', 1800); await shot('21-admin-consumo')
await ir('/admin/bandeja', 1500); await shot('22-admin-bandeja-a-pedido', { full: false })
await salir()
console.log('errores:', errors.filter((e) => !/favicon|404|402|409/.test(e)).slice(0, 10))
await b.close()
