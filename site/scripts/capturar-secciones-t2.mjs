/* Capturas por sección del terminal v2 (uso local, para revisar): node scripts/capturar-secciones-t2.mjs carpeta WAL,STONK [1440|390] */
import { chromium } from 'playwright'
import { BASE, entrar, env } from './sesiones.mjs'
const OUT = process.argv[2], MONEDAS = (process.argv[3] ?? 'WAL').split(','), SOLO = process.argv[4]
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const cookie = await entrar(env.VETA_ADMIN_EMAIL)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errores = []
for (const [nombre, ancho, alto, movil] of [['1440', 1440, 1000, false], ['390', 390, 844, true]].filter((x) => !SOLO || x[0] === SOLO)) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: movil ? 2 : 1, isMobile: movil, hasTouch: movil })
  await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE } }))
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`${nombre}: ${m.text()}`) })
  p.on('pageerror', (e) => errores.push(`${nombre}: ${e}`))
  for (const sym of MONEDAS) {
    await p.goto(`${BASE}${process.env.RUTA ?? '/luffy/t2'}/${sym}`, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('[data-prueba="grafico-precio2"] canvas, [data-prueba="sec-movimiento"] .t2-falta', { timeout: 30000 })
    for (let y = 0; y < 14; y++) { await p.evaluate(() => window.scrollBy(0, 800)); await espera(200) }
    await p.evaluate(() => window.scrollTo(0, 0)); await espera(500)
    await p.screenshot({ path: `${OUT}/${sym}-${nombre}-arriba.png` })
    if (!movil) await p.locator('[data-prueba="ver-derivados"]').click().catch(() => {})
    await espera(900)
    for (const s of ['encabezado2', 'sec-estadisticas', 'sec-movimiento', 'sec-fundamento', 'sec-redes', 'sec-onchain', 'sec-oportunidad']) {
      const l = p.locator(`[data-prueba="${s}"]`)
      if (await l.count()) await l.screenshot({ path: `${OUT}/${sym}-${nombre}-${s}.png` }).catch((e) => errores.push(`${s}: ${e.message.slice(0, 80)}`))
    }
  }
  await ctx.close()
}
await b.close()
console.log('errores de consola:', errores.length, errores.slice(0, 8))
