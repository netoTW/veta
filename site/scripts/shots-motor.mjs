/* Motor real: capturas de verificación contra el servicio HTTP (VETA_MOTOR=http).
   Uso: node scripts/shots-motor.mjs <carpeta-salida> */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2] ?? 'recursos/capturas/motor'
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
  if (sel) { const el = await p.$(sel); if (!el) { console.log('SIN', sel); return } await p.evaluate(() => { document.querySelector('.p-top').style.visibility = 'hidden' }); await el.screenshot({ path: `${OUT}/${name}.png` }); await p.evaluate(() => { document.querySelector('.p-top').style.visibility = '' }) }
  else await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log(name)
}
async function api(method, path, body) {
  return p.evaluate(async (method, path, body) => { const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); return { status: r.status, json: await r.json().catch(() => null) } }, method, path, body)
}
async function entrar(email, password) { await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' }); const r = await api('POST', '/api/auth/sign-in/email', { email, password }); if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`) }
const salir = () => api('POST', '/api/auth/sign-out', {})
async function ir(path, ms = 1500) { await p.goto(`${URL}${path}`, { waitUntil: 'networkidle0' }); await wait(ms) }

if (process.argv[3] === 'recap') { // MODE_RECAP
  await entrar('base@veta.local', DEMO); await ir('/analizar?m=ORCA', 1800)
  await p.click('.an-decidir__btn'); await wait(300); await p.click('.an-confirma .btn--esmeralda'); await p.waitForSelector('.an-espera', { timeout: 15000 }); await wait(3500)
  await p.evaluate(() => document.querySelectorAll('.an-toast__x').forEach((b) => b.click())); await wait(300); await shot('05-en-cola', { full: false })
  await salir(); await b.close(); process.exit(0)
}
await salir().catch(() => {})
await ir('/analizar', 1500); await shot('01-universo-350', { full: false })
for (const sym of ['RAY', 'ORCA', 'SSV', 'CAP']) { await ir(`/analizar?m=${sym}`, 1800); await shot(`02-determinista-${sym}`) }
await ir('/analizar?m=DODO', 1800); await shot('03-sin-datos-DODO', { full: false })
await ir('/analizar', 800); await p.type('#an-q', 'ZZZZ', { delay: 30 }); await p.keyboard.press('Enter'); await wait(1500); await shot('04-inexistente', { full: false })

await entrar('base@veta.local', DEMO)
await ir('/analizar?m=ORCA', 1800)
await p.click('.an-decidir__btn'); await wait(300); await p.click('.an-confirma .btn--esmeralda'); await p.waitForSelector('.an-espera', { timeout: 15000 }); await wait(3500)
await shot('05-en-cola', { full: false })
await ir('/gemas', 1500); await shot('06-barra-en-cola', { full: false })
await salir()

await entrar(ADMIN.email, ADMIN.password)
await ir('/admin/consumo', 1800); await shot('07-admin-cola', { full: false }); await shot('08-admin-consumo-completo')
await salir()
console.log('errores:', errors.filter((e) => !/favicon|404|402|409/.test(e)).slice(0, 10))
await b.close()
