/* Capturas del sitio: hero a lo largo del ciclo, styleguide completo y móvil.
   Uso: node scripts/shots.mjs <carpeta-salida> [hero|sistema|movil|all] */
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2]
const MODE = process.argv[3] ?? 'all'
const URL = process.env.URL ?? 'http://localhost:5310/'
mkdirSync(OUT, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--hide-scrollbars', '--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
})

if (MODE === 'hero' || MODE === 'all') {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()) })
  await p.goto(URL, { waitUntil: 'networkidle0' })
  await wait(1800)
  await p.mouse.move(1000, 480)
  // El ciclo dura 21 s. Fases: ceniza (0–5.9), grieta (5.7–8.2), apertura (8–11), sostén (11–17), cierre (17–21).
  const marks = [1.5, 4.5, 7.2, 9.5, 13.5, 19.0]
  let t0 = await p.evaluate(() => window.__cycle?.t ?? 0)
  const start = Date.now() - t0 * 1000
  const files = []
  for (const m of marks) {
    const target = start + m * 1000
    const d = target - Date.now()
    if (d > 0) await wait(d)
    const c = await p.evaluate(() => window.__cycle)
    const f = `${OUT}/hero-${m.toFixed(1).replace('.', '_')}.png`
    await p.screenshot({ path: f })
    files.push({ f, c })
    console.log('hero', m, JSON.stringify(c))
  }
  const tiles = await Promise.all(files.map(({ f }) => sharp(f).resize(720, 450).toBuffer()))
  await sharp({ create: { width: 720 * 3 + 20, height: 450 * 2 + 10, channels: 4, background: { r: 60, g: 60, b: 60, alpha: 255 } } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % 3) * 730, top: Math.floor(i / 3) * 460 })))
    .png().toFile(`${OUT}/hero-hoja.png`)
  console.log('errores:', errors.length ? errors : 'ninguno')
  await p.close()
}

if (MODE === 'grieta') {
  // Capturas fijas de la grieta a 2× para revisar la hendidura de cerca.
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  const errors = []
  p.on('pageerror', (e) => errors.push(e.message))
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await p.goto(URL + '?q=high', { waitUntil: 'networkidle0' })
  await wait(1800)
  await p.mouse.move(700, 450)
  const t0 = await p.evaluate(() => window.__cycle?.t ?? 0)
  const start = Date.now() - t0 * 1000
  // Fase de grieta: 5.46–9.03 s. Mitad de propagación y grieta completa (antes de abrir).
  for (const m of [6.9, 8.85]) {
    const d = start + m * 1000 - Date.now()
    if (d > 0) await wait(d)
    const c = await p.evaluate(() => window.__cycle)
    const f = `${OUT}/grieta-${m.toFixed(2).replace('.', '_')}.png`
    await p.screenshot({ path: f })
    // Recorte de la piedra a tamaño real (2×): 1:1 píxeles.
    await sharp(f).extract({ left: 1700, top: 320, width: 900, height: 1100 }).png().toFile(f.replace('.png', '-zoom.png'))
    // Recorte cerrado sobre la grieta, ampliado ×2 (la piedra ocupa 1:1 a 2×; esto es 4× del CSS).
    await sharp(f).extract({ left: 2050, top: 420, width: 420, height: 720 }).resize(840, 1440, { kernel: 'lanczos3' }).png().toFile(f.replace('.png', '-macro.png'))
    console.log('grieta', m, JSON.stringify(c))
  }
  console.log('errores:', errors.length ? errors : 'ninguno')
  await p.close()
}

if (MODE === 'sistema' || MODE === 'all') {
  const p = await b.newPage()
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await p.goto(URL + '#sistema', { waitUntil: 'networkidle0' })
  await wait(800)
  // Forzar reveals: scroll completo lento.
  const h = await p.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < h; y += 600) { await p.evaluate((y) => window.scrollTo(0, y), y); await wait(120) }
  await wait(1200)
  await p.evaluate(() => window.scrollTo(0, 0))
  await wait(400)
  await p.screenshot({ path: `${OUT}/sistema-full.png`, fullPage: true })
  const meta = await sharp(`${OUT}/sistema-full.png`).metadata()
  console.log('sistema-full', meta.width, meta.height)
  // Recortes por sección para revisión a tamaño legible.
  const ids = ['materiales', 'tipografia', 'componentes', 'charts']
  for (const id of ids) {
    const r = await p.evaluate((id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect(); return { top: b.top + window.scrollY, height: b.height } }, id)
    const top = Math.max(0, Math.round(r.top)), height = Math.min(Math.round(r.height), meta.height - top)
    await sharp(`${OUT}/sistema-full.png`).extract({ left: 0, top, width: 1440, height }).resize(1100).png().toFile(`${OUT}/sec-${id}.png`)
    console.log('sec', id, top, height)
  }
  await p.close()
}

if (MODE === 'movil' || MODE === 'all') {
  const p = await b.newPage()
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await p.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  await p.goto(URL, { waitUntil: 'networkidle0' })
  await wait(2500)
  const tier = await p.evaluate(() => ({ herom: !!document.querySelector('.herom.is-live'), hero3d: !!document.querySelector('.hero3d') }))
  console.log('movil tier', JSON.stringify(tier))
  await p.screenshot({ path: `${OUT}/movil-a.png` })
  await wait(9000)
  await p.screenshot({ path: `${OUT}/movil-b.png` })
  const tiles = await Promise.all(['a', 'b'].map((k) => sharp(`${OUT}/movil-${k}.png`).resize(390, 844).toBuffer()))
  await sharp({ create: { width: 800, height: 844, channels: 4, background: { r: 60, g: 60, b: 60, alpha: 255 } } })
    .composite(tiles.map((t, i) => ({ input: t, left: i * 410, top: 0 }))).png().toFile(`${OUT}/movil-hoja.png`)
  await p.close()
}

await b.close()
