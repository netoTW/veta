/* Capturas de la oficina viva (uso local): node scripts/capturar-oficina.mjs <carpeta> [video] */
import { chromium } from 'playwright'
import { BASE, entrar, env } from './sesiones.mjs'
const OUT = process.argv[2] ?? '../recursos/capturas/oficina-viva', VIDEO = process.argv[3] === 'video'
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const cookie = await entrar(env.VETA_ADMIN_EMAIL)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errores = []
async function ctxDe(ancho, alto, movil) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, isMobile: movil, hasTouch: movil, ...(VIDEO ? { recordVideo: { dir: `${OUT}/video`, size: { width: ancho, height: alto } } } : {}) })
  await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE } }))
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  p.on('pageerror', (e) => errores.push(String(e)))
  return { ctx, p }
}
for (const [nombre, ancho, alto, movil] of [['1440', 1440, 1000, false], ['390', 390, 844, true]]) {
  const { ctx, p } = await ctxDe(ancho, alto, movil)
  await p.goto(`${BASE}/luffy/oficina`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-prueba="escena"]', { timeout: 30000 })
  await espera(VIDEO ? 25000 : 9000)
  const sala = p.locator('.lf-ofi2__sala')
  await p.evaluate(() => { const el = document.querySelector('.lf-ofi2__sala'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84) }); await espera(300)
  await p.screenshot({ path: `${OUT}/sala-${nombre}.png` })
  await p.screenshot({ path: `${OUT}/pagina-${nombre}.png`, fullPage: !movil })
  // tocar a Luffy: su día
  await p.locator('[data-prueba="tarjeta-luffy"] .lf-ag__abrir').click()
  await p.waitForSelector('[data-prueba="hoja-luffy"]')
  await espera(3500)
  await p.screenshot({ path: `${OUT}/hoja-luffy-${nombre}.png` })
  const turnos = await p.locator('[data-prueba="repetir-turno"]:not([disabled])').count()
  console.log(nombre, 'turnos para repetir', turnos)
  // abrir los pasos del primer turno
  await p.locator('.lf-linea__abrir').first().click().catch(() => {})
  await espera(400)
  await p.screenshot({ path: `${OUT}/hoja-luffy-pasos-${nombre}.png` })
  await p.keyboard.press('Escape')
  for (const a of ['jev', 'crawler']) {
    await p.locator(`[data-prueba="tarjeta-${a}"] .lf-ag__abrir`).click(); await p.waitForSelector(`[data-prueba="hoja-${a}"]`); await espera(600)
    await p.screenshot({ path: `${OUT}/hoja-${a}-${nombre}.png` }); await p.keyboard.press('Escape')
  }
  await p.locator('[data-prueba="objeto-parabolica"] .es-plato').click({ force: true }); await p.waitForSelector('[data-prueba="hoja-fuentes"]'); await espera(600)
  await p.screenshot({ path: `${OUT}/hoja-fuentes-${nombre}.png` }); await p.keyboard.press('Escape')
  // repetir el primer turno
  if (turnos) {
    await p.locator('[data-prueba="elegir-turno"]').click(); await p.waitForSelector('[data-prueba="hoja-luffy"]'); await espera(400)
    await p.locator('[data-prueba="repetir-turno"]:not([disabled])').first().click()
    await p.waitForSelector('[data-prueba="repeticion"]')
    await espera(VIDEO ? 20000 : 3500)
    await p.evaluate(() => { const el = document.querySelector('.lf-ofi2__sala'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84) }); await espera(300)
    await p.screenshot({ path: `${OUT}/repeticion-${nombre}.png` })
    console.log(nombre, 'paso', await p.locator('[data-prueba="rep-paso"]').innerText())
  }
  await ctx.close()
}
await b.close()
console.log('errores de consola:', errores.length, errores.slice(0, 6))
