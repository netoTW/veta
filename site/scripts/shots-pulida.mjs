/* Capturas del acabado «roca pulida» (fase 6b §1): portada y /luffy, escritorio y teléfono.
   Uso: node scripts/shots-pulida.mjs <carpeta>   (con la vista previa en :5310, simulador) */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { BASE, env } from './sesiones.mjs'
const OUT = process.argv[2] ?? '../recursos/capturas/pulida'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
async function foto(movil, nombre, ruta, admin, prepara) {
  const ctx = await b.newContext(movil ? { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' } : { viewport: { width: 1440, height: 900 }, locale: 'es-ES' })
  if (admin) await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: env.VETA_ADMIN_EMAIL, password: env.VETA_ADMIN_PASSWORD }, headers: { Origin: BASE } })
  const p = await ctx.newPage()
  await p.goto(`${BASE}${ruta}${ruta.includes('?') ? '&' : '?'}q=medium`, { waitUntil: 'networkidle' }).catch(() => {})
  await espera(movil ? 2500 : 3500)
  if (prepara) await prepara(p)
  await p.screenshot({ path: `${OUT}/${nombre}.png` })
  console.log('  ·', nombre)
  await ctx.close()
}
const STONK = 'c0ffee00-0000-4000-8000-000000000002'
await foto(false, 'd-portada', '/', false)
await foto(true, 'm-portada', '/', false)
await foto(false, 'd-chat', `/luffy/h/${STONK}`, true, async (p) => { await p.waitForSelector('.lf-g canvas', { timeout: 30000 }).catch(() => {}); await espera(800) })
await foto(true, 'm-chat', `/luffy/h/${STONK}`, true, async (p) => { await p.waitForSelector('.lf-g canvas', { timeout: 30000 }).catch(() => {}); await p.evaluate(() => { const l = document.querySelector('.lf-conv__lista'); if (l) l.scrollTop = l.scrollHeight }); await espera(800) })
await foto(true, 'm-chat-pensando', `/luffy/h/${STONK}`, true, async (p) => { await p.fill('.lf-comp textarea', 'muéstrame BTC con funding'); await p.press('.lf-comp textarea', 'Enter'); await p.waitForSelector('.lf-m__paso', { timeout: 15000 }).catch(() => {}); await espera(300) })
await foto(true, 'm-lab-hoja', '/luffy/laboratorio/9f3a2c1e', true, async (p) => { await p.waitForSelector('.lf-g canvas', { timeout: 30000 }).catch(() => {}); await p.click('.lf-lab__fab'); await espera(600) })
await foto(false, 'd-gemas', '/gemas', true)
await b.close()
