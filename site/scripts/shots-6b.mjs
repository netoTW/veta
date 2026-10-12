/* Capturas de las vistas de la fase 6b (simulador), escritorio y 390 px. Uso: node scripts/shots-6b.mjs <carpeta> */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { BASE, env } from './sesiones.mjs'
const OUT = process.argv[2] ?? '../recursos/capturas/6b'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const errores = []
async function ctx(movil) { const c = await b.newContext(movil ? { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' } : { viewport: { width: 1440, height: 900 }, locale: 'es-ES' }); await c.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: env.VETA_ADMIN_EMAIL, password: env.VETA_ADMIN_PASSWORD }, headers: { Origin: BASE } }); const p = await c.newPage(); p.on('pageerror', (e) => errores.push(String(e.message).slice(0, 160))); p.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errores.push(m.text().slice(0, 160)) }); return { c, p } }
const VISTAS = [
  ['terminal', '/luffy/terminal/WAL', async (p) => { await p.waitForSelector('.lf-ficha__graficos canvas', { timeout: 40000 }); await espera(2500) }],
  ['cartera', '/luffy/cartera', async (p) => { await p.waitForSelector('.lf-kpi', { timeout: 20000 }); await p.waitForSelector('[data-prueba="orden"]', { timeout: 20000 }); await espera(1500) }],
  ['caja', '/luffy/cartera', async (p) => { await p.click('[data-prueba="pestana-caja"]'); await p.waitForSelector('.lf-decis', { timeout: 20000 }); await espera(1500) }],
  ['radar', '/luffy/radar', async (p) => { await p.waitForSelector('[data-prueba="candidata"]', { timeout: 20000 }); await espera(600) }],
  ['modos', '/luffy/radar', async (p) => { await p.click('.lf-tabs button:nth-child(2)'); await p.waitForSelector('[data-prueba="modo"]', { timeout: 20000 }); await espera(400) }],
  ['control', '/luffy/control', async (p) => { await p.waitForSelector('[data-prueba="gatillo"]', { timeout: 20000 }); await espera(400) }],
  ['gasto', '/luffy/control', async (p) => { await p.click('.lf-tabs button:nth-child(3)'); await p.waitForSelector('.lf-gasto canvas', { timeout: 20000 }); await espera(900) }],
  ['oficina', '/luffy/oficina', async (p) => { await p.waitForSelector('.lf-ev', { timeout: 20000 }); await espera(5000) }],
  ['informes', '/luffy/informes', async (p) => { await p.waitForSelector('.lf-ficha__graficos canvas', { timeout: 40000 }); await espera(1500) }],
]
for (const movil of [false, true]) {
  const { c, p } = await ctx(movil)
  for (const [nombre, ruta, prepara] of VISTAS) {
    await p.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' })
    try { await prepara(p) } catch (e) { console.log('  !', nombre, String(e.message).slice(0, 80)) }
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)
    await p.screenshot({ path: `${OUT}/${movil ? 'm' : 'd'}-${nombre}.png`, fullPage: !movil })
    console.log('  ·', `${movil ? 'm' : 'd'}-${nombre}`, desborde ? '¡DESBORDA!' : '')
  }
  if (movil) { await p.goto(`${BASE}/luffy/terminal/WAL`, { waitUntil: 'networkidle' }); await p.click('.lf-ficha__monedas'); await espera(600); await p.screenshot({ path: `${OUT}/m-terminal-monedas.png` }); await p.click('.lf-velo', { position: { x: 200, y: 40 } }); await p.click('.lf-abajo__mas'); await espera(500); await p.screenshot({ path: `${OUT}/m-mas.png` }); console.log('  · m-terminal-monedas, m-mas') }
  await c.close()
}
await b.close()
console.log('errores:', [...new Set(errores)].slice(0, 6))
