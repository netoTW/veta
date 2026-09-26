/* Registro y cambio de plan de punta a punta (ESPECIFICACION-LANZAMIENTO.md §13).

   Una API local con base temporal y un secreto de webhook de prueba. Registro desde la
   pantalla /registro, en Chrome; después, avisos de Whop firmados igual que los manda
   Whop (webhook-id, webhook-timestamp, webhook-signature): pago de Base, activación de
   Pro, baja. En cada paso, lo que el servidor deja ver a ese rol según la matriz.
   Además: un aviso repetido no se aplica dos veces y uno sin firma se rechaza.

   Uso: node scripts/probar-planes.mjs [capturas]   Sale con 1 si algo falla. */
import { spawn } from 'node:child_process'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? null
const PUERTO = 5330, BASE = `http://localhost:${PUERTO}`
const SECRETO = 'whsec_' + randomBytes(24).toString('base64')
const PLAN = { base: 'plan_prueba_base', pro: 'plan_prueba_pro' }
const tmp = mkdtempSync(join(tmpdir(), 'veta-planes-'))
const api = spawn('npx', ['tsx', 'server/index.ts'], { detached: true, stdio: 'ignore', env: {
  ...process.env, PORT: String(PUERTO), VETA_SERVIR_DIST: '1', BETTER_AUTH_URL: BASE, VETA_ORIGENES: BASE, VETA_DB: join(tmp, 'veta.sqlite'),
  VETA_MOTOR: 'simulado', VETA_SYNC_MINUTOS: '0', VETA_WHOP_WEBHOOK_SECRETO: SECRETO, VETA_WHOP_PLAN_BASE: PLAN.base, VETA_WHOP_PLAN_PRO: PLAN.pro } })
for (let i = 0; i < 90; i++) { await new Promise((x) => setTimeout(x, 1000)); if (await fetch(`${BASE}/api/contenido/meta`).then((r) => r.ok).catch(() => false)) break }

const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }
const email = `prueba-planes-${Date.now()}@veta.local`, clave = 'Prueba-planes-' + randomBytes(4).toString('hex')

/* ---------- registro desde la pantalla ---------- */
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
await p.goto(`${BASE}/registro`, { waitUntil: 'networkidle0' })
const campos = await p.$$('form input')
const tipos = await Promise.all(campos.map((c) => c.evaluate((e) => `${e.type}|${e.id}|${e.name}|${e.autocomplete}`)))
for (let i = 0; i < campos.length; i++) {
  const t = tipos[i]
  if (/email/.test(t)) await campos[i].type(email)
  else if (/password/.test(t)) await campos[i].type(clave)
  else if (/text/.test(t) && !/checkbox/.test(t)) await campos[i].type('Prueba planes')
  else if (/checkbox/.test(t)) await campos[i].click()
}
await p.click('form button[type=submit]')
await p.waitForFunction(() => !location.pathname.startsWith('/registro'), { timeout: 15000 }).catch(() => {})
await new Promise((x) => setTimeout(x, 1500))
const yo = async () => (await p.evaluate(async () => (await fetch('/api/yo')).json()))
let y = await yo()
ok(y.usuario?.email === email && y.rol === 'visitante', `registro desde /registro: cuenta creada y con sesión (rol ${y.rol}, plan ${y.usuario?.plan})`)
const acceso = async () => Object.fromEntries(await Promise.all(['/api/contenido/seguimiento', '/api/contenido/watchlist', '/api/contenido/alertas', '/api/contenido/exportar/gemas'].map(async (r) => [r.split('/').pop(), await p.evaluate(async (u) => (await fetch(u)).status, r)])))
const esperado = {
  gratis: { seguimiento: 401, watchlist: 401, alertas: 401, gemas: 401 },
  base: { seguimiento: 200, watchlist: 200, alertas: 403, gemas: 403 },
  pro: { seguimiento: 200, watchlist: 200, alertas: 200, gemas: 200 },
}
const comprobar = async (plan) => { const a = await acceso(); ok(JSON.stringify(a) === JSON.stringify(esperado[plan]), `  ${plan}: la matriz en el servidor ${JSON.stringify(a)}`) }
await comprobar('gratis')

/* ---------- avisos de Whop, firmados ---------- */
const membresia = 'mem_prueba_' + randomBytes(4).toString('hex')
let t = Math.floor(Date.now() / 1000)
async function aviso(tipo, data, { firmar = true, id = 'msg_' + randomBytes(6).toString('hex') } = {}) {
  t += 5
  const cuerpo = JSON.stringify({ id, type: tipo, timestamp: new Date(t * 1000).toISOString(), data })
  const clave = Buffer.from(SECRETO.replace(/^whsec_/, ''), 'base64')
  const firma = createHmac('sha256', clave).update(`${id}.${t}.${cuerpo}`).digest('base64')
  const r = await fetch(`${BASE}/api/pagos/whop`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': String(t), 'webhook-signature': firmar ? `v1,${firma}` : 'v1,falsa' }, body: cuerpo })
  return { status: r.status, id }
}
const espera = () => new Promise((x) => setTimeout(x, 11000)) // planVigente recuerda 10 s
let r = await aviso('payment.succeeded', { id: 'pay_' + randomBytes(4).toString('hex'), membership_id: membresia, plan_id: PLAN.base, user: { email } })
await espera(); y = await yo()
ok(r.status === 200 && y.rol === 'base', `subida a Base por payment.succeeded (${r.status} → rol ${y.rol})`)
await comprobar('base')
if (OUT) { await p.goto(`${BASE}/cuenta`, { waitUntil: 'networkidle0' }); await p.screenshot({ path: `${OUT}/planes-base.png` }) }
const repetido = await aviso('membership.activated', { id: membresia, plan_id: PLAN.pro, user: { email } })
await espera(); y = await yo()
ok(repetido.status === 200 && y.rol === 'pro', `subida a Pro por membership.activated (${repetido.status} → rol ${y.rol})`)
await comprobar('pro')
const otraVez = await aviso('membership.activated', { id: membresia, plan_id: PLAN.pro, user: { email } }, { id: repetido.id })
ok(otraVez.status === 200, `el mismo aviso otra vez se acepta sin aplicarse dos veces (${otraVez.status})`)
const sinFirma = await aviso('membership.deactivated', { id: membresia, user: { email } }, { firmar: false })
await espera(); y = await yo()
ok(sinFirma.status === 401 && y.rol === 'pro', `un aviso sin firma válida se rechaza y no toca el plan (${sinFirma.status}, sigue ${y.rol})`)
r = await aviso('membership.deactivated', { id: membresia, user: { email } })
await espera(); y = await yo()
ok(r.status === 200 && y.rol === 'visitante' && y.usuario?.plan === 'gratis', `baja por membership.deactivated (${r.status} → plan ${y.usuario?.plan})`)
await comprobar('gratis')
if (OUT) { await p.goto(`${BASE}/cuenta`, { waitUntil: 'networkidle0' }); await p.screenshot({ path: `${OUT}/planes-baja.png` }) }

await b.close()
try { process.kill(-api.pid) } catch { /* ya terminó */ }
await new Promise((x) => setTimeout(x, 500)); rmSync(tmp, { recursive: true, force: true })
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
