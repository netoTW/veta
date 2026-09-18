/* Capturas fijas de PIEZAS a 2×, desde /piezas. Uso: node scripts/shots-piezas.mjs <dir> */
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
await p.goto(`${URL}/piezas`, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 900))
for (const el of await p.$$('[data-pieza]')) {
  const id = await el.evaluate((e) => e.dataset.pieza)
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }))
  await new Promise((r) => setTimeout(r, 200))
  const box = await el.boundingBox()
  await el.screenshot({ path: `${OUT}/${id}.png` })
  console.log(id, Math.round(box.width), Math.round(box.height))
  const h = await el.$('[data-hover]')
  if (h) {
    await h.hover(); await new Promise((r) => setTimeout(r, 700))
    await el.screenshot({ path: `${OUT}/${id}-hover.png` }); console.log(id + '-hover')
    await p.mouse.move(0, 0); await new Promise((r) => setTimeout(r, 400))
  }
}
await b.close()
