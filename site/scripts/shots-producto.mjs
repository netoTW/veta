/* Capturas fijas de las pantallas de producto, por rol.
   Uso: node scripts/shots-producto.mjs <carpeta-salida> */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errors = []
p.on('pageerror', (e) => errors.push(e.message))
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const shots = [
  ['gemas', '/gemas', ['visitante', 'base']],
  ['gema-ray', '/gemas/RAY-20260912-012647', ['visitante', 'base']],
  ['gema-orca', '/gemas/ORCA-20260912-020844', ['base']],
  ['seguimiento', '/seguimiento', ['visitante', 'base', 'pro']],
  ['analisis', '/analisis', ['visitante']],
  ['analisis-ssv', '/analisis/SSV-20260912-014935', ['visitante']],
  ['watchlist', '/watchlist', ['visitante', 'base', 'admin']],
]
for (const [name, path, roles] of shots) {
  for (const rol of roles) {
    await p.goto(`${URL}${path}?rol=${rol}`, { waitUntil: 'networkidle0' })
    await wait(600)
    await p.screenshot({ path: `${OUT}/${name}-${rol}.png`, fullPage: true })
    const h = await p.evaluate(() => document.body.scrollHeight)
    console.log(name, rol, 'alto', h)
  }
}
// avanzado en el detalle de ORCA
await p.goto(`${URL}/gemas/ORCA-20260912-020844?rol=base`, { waitUntil: 'networkidle0' })
await wait(400)
await p.evaluate(() => { const b = [...document.querySelectorAll('.p-nivel__btn')].find((x) => x.textContent.trim() === 'avanzado'); b && b.click() })
await wait(400)
await p.screenshot({ path: `${OUT}/gema-orca-avanzado.png`, fullPage: true })
// móvil
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
for (const [name, path, rol] of [['m-gemas', '/gemas', 'base'], ['m-gema-ray', '/gemas/RAY-20260912-012647', 'base'], ['m-seguimiento', '/seguimiento', 'base'], ['m-watchlist', '/watchlist', 'base']]) {
  await p.goto(`${URL}${path}?rol=${rol}`, { waitUntil: 'networkidle0' }); await wait(500)
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  console.log(name, 'alto', await p.evaluate(() => document.body.scrollHeight))
}
console.log('errores:', errors.length ? errors : 'ninguno')
await b.close()
