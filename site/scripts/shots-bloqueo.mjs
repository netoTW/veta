/* Captura del caso "informe bloqueado por el Verificador": no hay ninguno en la
   base de hoy (los tres pasan), así que se SIMULA sobre la copia compilada
   (server/datos/analisis.json) marcando a SSV como bloqueado, se captura la
   bandeja, y al final se recompila la base (npm run datos) para dejarla como
   estaba. Uso: node scripts/shots-bloqueo.mjs <carpeta-salida> */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const env = Object.fromEntries(readFileSync(resolve('.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const ID = 'SSV-20260912-014935'
const F = resolve('server/datos/analisis.json')
const original = readFileSync(F, 'utf8')
const datos = JSON.parse(original)
const ssv = datos.find((r) => r.id === ID)
ssv.verificador.estado = 'bloqueado'
ssv.verificador.motivo_bloqueo = 'SIMULADO PARA LA CAPTURA · el Verificador no pudo confirmar el revenue de 30 d contra DeFiLlama: el número del informe no coincide con la fuente.'
writeFileSync(F, JSON.stringify(datos))

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' })
  await p.evaluate(async (email, password) => { await fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), credentials: 'same-origin' }) }, env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD)
  await p.goto(`${URL}/admin/bandeja`, { waitUntil: 'networkidle0' }); await wait(600)
  await p.evaluate(() => { [...document.querySelectorAll('.a-filtro')].find((x) => x.textContent.includes('Todos'))?.click() }); await wait(300)
  await p.screenshot({ path: `${OUT}/admin-bloqueo-01-bandeja.png`, fullPage: true })
  await p.goto(`${URL}/admin/bandeja/${ID}`, { waitUntil: 'networkidle0' }); await wait(1000)
  await p.evaluate(() => { [...document.querySelectorAll('.a-tab')].find((x) => x.textContent.trim() === 'Verificador')?.click() }); await wait(400)
  await p.screenshot({ path: `${OUT}/admin-bloqueo-02-sin-confirmar.png`, fullPage: false })
  // el servidor también lo rechaza si alguien salta la interfaz
  const r = await p.evaluate(async (id) => { const r = await fetch(`/api/admin/bandeja/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'aprobar' }), credentials: 'same-origin' }); return { status: r.status, json: await r.json() } }, ID)
  console.log('aprobar sin confirmar →', r.status, r.json.error)
  await p.click('.a-dec__check input'); await wait(300)
  await p.screenshot({ path: `${OUT}/admin-bloqueo-03-confirmado.png`, fullPage: false })
  await p.evaluate(() => { [...document.querySelectorAll('.a-dec .btn')].find((x) => x.textContent.includes('Aprobar'))?.click() }); await wait(1300)
  await p.screenshot({ path: `${OUT}/admin-bloqueo-04-aprobado-con-registro.png`, fullPage: false })
  // se despublica para no dejar publicado un caso simulado
  const d = await p.evaluate(async (id) => { const r = await fetch(`/api/admin/bandeja/${id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'despublicar', motivo: 'fin de la simulación del bloqueo para la captura' }), credentials: 'same-origin' }); return r.status }, ID)
  console.log('despublicar →', d)
} finally {
  await b.close()
  writeFileSync(F, original)
  execSync('node scripts/datos.mjs', { stdio: 'inherit' })
}
