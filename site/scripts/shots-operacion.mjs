/* Operación: capturas de la bandeja con informes del servidor y de la pestaña Operación.
   Uso: node scripts/shots-operacion.mjs <carpeta-salida> */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2] ?? 'recursos/capturas/operacion'
mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const env = Object.fromEntries(readFileSync(resolve('.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const ADMIN = { email: env.VETA_ADMIN_EMAIL, password: env.VETA_ADMIN_PASSWORD }

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] })
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
async function ir(path, ms = 1800) { await p.goto(`${URL}${path}`, { waitUntil: 'networkidle0' }); await wait(ms) }

await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' })
const r = await api('POST', '/api/auth/sign-in/email', ADMIN); if (r.status !== 200) throw new Error(`login admin: ${r.status}`)
if (process.argv[3] === 'recap') { // MODE_RECAP
  await ir('/admin/operacion', 2500)
  const btn = await p.$('.a-op__lanzar .btn--esmeralda'); await btn.click(); await wait(400); await p.click('.a-op__confirma .btn--esmeralda'); await wait(2500)
  await shot('08b-lanzar-respuesta-servidor', { sel: '.a-op__cola' })
  await ir('/admin/bandeja', 1800); await shot('09-bandeja-servidor', { full: false }); await shot('10-bandeja-completa')
  await api('POST', '/api/auth/sign-out', {}); await b.close(); process.exit(0)
}
await ir('/admin/operacion', 2500)
await shot('01-operacion-arriba', { full: false })
await shot('02-operacion-completa')
await shot('03-servidor-sync', { sel: '.a-op__servidor' })
await shot('04-tanda-progreso', { sel: '.a-op__tanda' })
await shot('05-componentes', { sel: '.a-op__comps' })
await shot('06-alertas', { sel: '.a-op__alertas' })
await shot('07-hits', { sel: '.a-op__hits' })
// el botón de lanzar: la confirmación (sin lanzar)
const btn = await p.$('.a-op__lanzar .btn--esmeralda'); if (btn) { await btn.click(); await wait(400); await shot('08-lanzar-confirmacion', { sel: '.a-op__cola' }); await p.click('.a-op__confirma .btn--ghost') }
await ir('/admin/bandeja', 1800); await shot('09-bandeja-servidor', { full: false }); await shot('10-bandeja-completa')
await api('POST', '/api/auth/sign-out', {})
console.log('errores:', errors.filter((e) => !/favicon|404/.test(e)).slice(0, 10))
await b.close()
