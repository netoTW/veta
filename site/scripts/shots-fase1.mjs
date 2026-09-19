/* Capturas antes/después de la limpieza de la fase 1.
   Uso: node scripts/shots-fase1.mjs <carpeta-salida>
   Requiere el servidor en modo preview (:5310) y las cuentas de la semilla. */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2] ?? 'recursos/capturas/fase1/antes'
mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const env = Object.fromEntries(readFileSync(resolve('.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const DEMO = env.VETA_DEMO_PASSWORD

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []
p.on('pageerror', (e) => errores.push(String(e)))

async function shot(nombre, { full = true, sel = null } = {}) {
  if (sel) {
    const el = await p.$(sel); if (!el) { console.log('  SIN', sel, '→', nombre); return }
    await p.evaluate(() => { const t = document.querySelector('.p-top'); if (t) t.style.visibility = 'hidden' })
    await el.screenshot({ path: `${OUT}/${nombre}.png` })
    await p.evaluate(() => { const t = document.querySelector('.p-top'); if (t) t.style.visibility = '' })
  } else await p.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: full })
  console.log(' ', nombre)
}
const api = (metodo, ruta, cuerpo) => p.evaluate(async (metodo, ruta, cuerpo) => {
  const r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, credentials: 'same-origin' })
  return { status: r.status }
}, metodo, ruta, cuerpo)
async function ir(ruta, ms = 1500) { await p.goto(`${URL}${ruta}`, { waitUntil: 'networkidle0' }); await wait(ms) }
/** Lleva a la vista la sección que se quiere retratar. */
async function verSeccion(sel) { await p.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel); await wait(500) }

/* ---------- público ---------- */
await ir('/gemas', 600)                       // hay que estar en el origen para llamar a la API
await api('POST', '/api/auth/sign-out', {})
await ir('/', 2600); await shot('01-portada-nav', { full: false })

/* ---------- con sesión pro ---------- */
await ir('/gemas', 800)
const r = await api('POST', '/api/auth/sign-in/email', { email: 'pro@veta.local', password: DEMO })
if (r.status !== 200) throw new Error(`login pro: ${r.status}`)

await ir('/gemas', 1800); await shot('02-gemas', { full: false })

const ID = 'RAY-20260912-012647'
await ir(`/gemas/${ID}`, 2600)
await shot('03-informe-completo')
await verSeccion('#esceptico'); await shot('04-informe-esceptico', { sel: '#esceptico' })
await p.evaluate(() => { document.querySelectorAll('.p-advs__sev[aria-expanded="false"]').forEach((b) => b.click()) })
await wait(600); await verSeccion('.p-advs'); await shot('05-informe-advertencias', { sel: '.p-advs' })
await verSeccion('.p-ficha'); await shot('06-informe-ficha', { sel: '.p-ficha' })

await ir('/seguimiento', 2200); await shot('07-seguimiento')
await ir('/watchlist', 2000); await shot('08-watchlist', { full: false })
await ir('/analisis', 2000); await shot('09-analisis', { full: false })
await ir('/analizar', 2000); await shot('10-analizar', { full: false })
await ir('/votacion', 2200); await shot('11-votacion', { full: false })
await ir('/cuenta', 1800); await shot('12-cuenta', { full: false })
await api('POST', '/api/auth/sign-out', {})
await ir('/entrar', 3000); await shot('13-entrar', { full: false })

console.log('errores:', errores.filter((e) => !/favicon|404/.test(e)).slice(0, 6))
await b.close()
