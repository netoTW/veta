/* Capturas del terminal v2 (uso local): node scripts/capturar-terminal2.mjs [carpeta] [monedas separadas por coma] */
import { chromium } from 'playwright'
import { BASE, entrar, env } from './sesiones.mjs'
const OUT = process.argv[2] ?? '../recursos/capturas/terminal2', MONEDAS = (process.argv[3] ?? 'WAL,KMNO').split(',')
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const cookie = await entrar(env.VETA_ADMIN_EMAIL)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errores = []
for (const [nombre, ancho, alto, movil] of [['1440', 1440, 1000, false], ['390', 390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, isMobile: movil, hasTouch: movil })
  await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE } }))
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`${nombre}: ${m.text()}`) })
  p.on('pageerror', (e) => errores.push(`${nombre}: ${e}`))
  for (const sym of MONEDAS) {
    await p.goto(`${BASE}/luffy/t2/${sym}`, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('[data-prueba="grafico-precio2"] canvas, [data-prueba="sec-movimiento"] .t2-falta', { timeout: 30000 })
    // bajar despacio para que carguen los gráficos de abajo
    for (let y = 0; y < 12; y++) { await p.mouse.wheel(0, 900); await espera(250) }
    await p.evaluate(() => window.scrollTo(0, 0)); await espera(600)
    await p.screenshot({ path: `${OUT}/${sym}-${nombre}.png`, fullPage: true })
    if (sym === MONEDAS[0]) {
      await p.locator('[data-prueba="ver-derivados"]').click(); await espera(1200)
      await p.locator('[data-prueba="sec-movimiento"]').screenshot({ path: `${OUT}/${sym}-movimiento-derivados-${nombre}.png` })
    }
  }
  await ctx.close()
}
await b.close()
console.log('errores de consola:', errores.length, errores.slice(0, 8))
