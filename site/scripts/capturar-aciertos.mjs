/* Capturas de lo de la v2.6 (uso local): la tabla de aciertos del radar (con un modo abierto), los
   escritorios de la oficina (y la hoja del Investigador) y el chip de calidad del mapa del terminal.
     node scripts/capturar-aciertos.mjs [carpeta] [moneda] */
import { chromium } from 'playwright'
import { BASE, entrar, env } from './sesiones.mjs'
const OUT = process.argv[2] ?? '../recursos/capturas/v26', SYM = process.argv[3] ?? 'WAL'
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const cookie = await entrar(env.VETA_ADMIN_EMAIL)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const errores = []
for (const [nombre, ancho, alto, movil] of [['1440', 1440, 1000, false], ['390', 390, 844, true]]) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2, isMobile: movil, hasTouch: movil, serviceWorkers: 'block' })
  await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE } }))
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(`${nombre}: ${m.text()}`) })
  p.on('pageerror', (e) => errores.push(`${nombre}: ${e}`))

  await p.goto(`${BASE}/luffy/radar`, { waitUntil: 'domcontentloaded' })
  await p.locator('[data-prueba="pestana-aciertos"]').click()
  await p.waitForSelector('[data-prueba="aciertos-fila"]', { timeout: 30000 }); await espera(400)
  await p.screenshot({ path: `${OUT}/aciertos-${nombre}.png`, fullPage: true })
  await p.locator('[data-prueba="aciertos-fila"]').first().click(); await espera(500)
  await p.screenshot({ path: `${OUT}/aciertos-abierto-${nombre}.png`, fullPage: true })

  await p.goto(`${BASE}/luffy/oficina`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-prueba="tarjetas-agentes"]', { timeout: 30000 }); await espera(1500)
  await p.locator('[data-prueba="tarjetas-agentes"]').screenshot({ path: `${OUT}/escritorios-${nombre}.png` })
  await p.locator('[data-prueba="tarjeta-investigador"] .lf-ag__abrir').click(); await espera(1500)
  await p.screenshot({ path: `${OUT}/hoja-investigador-${nombre}.png` })

  await p.goto(`${BASE}/luffy/terminal/${SYM}`, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-prueba="grafico-precio2"] canvas, [data-prueba="sec-movimiento"] .t2-falta', { timeout: 30000 })
  for (let y = 0; y < 12; y++) { await p.evaluate(() => window.scrollBy(0, 900)); await espera(250) }
  await p.evaluate(() => window.scrollTo(0, 0)); await espera(600)
  // la barra de arriba y la cabecera de la ficha son fijas: en una captura por sección taparían lo de arriba
  await p.addStyleTag({ content: '.lf-top, .lf-ficha__cab, .t2-cab { position: static !important; }' })
  await p.locator('[data-prueba="sec-movimiento"]').screenshot({ path: `${OUT}/${SYM}-movimiento-${nombre}.png` })
  await p.locator('[data-prueba="sec-redes"]').screenshot({ path: `${OUT}/${SYM}-redes-${nombre}.png` }).catch(() => {})
  await ctx.close()
}
await b.close()
console.log('errores de consola:', errores.length, errores.slice(0, 8))
