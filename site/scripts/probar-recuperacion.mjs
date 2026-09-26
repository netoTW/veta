/* Recuperación de contraseña sin bucles (ESPECIFICACION-LANZAMIENTO.md §1, A1.1).
   Tres entradas (enlace del correo con token falso → ?error, token caducado y ruta directa)
   × dos almacenamientos (normal y sessionStorage que lanza). En cada una mide durante 10 s:
   navegaciones de documento, tareas largas del hilo principal y cuándo aparece el formulario
   (o, con el enlace caducado, el botón para pedir otro).
   Uso: node scripts/probar-recuperacion.mjs [base] [carpeta-capturas]   Sale con 1 si algo falla. */
import puppeteer from 'puppeteer-core'
const BASE = process.argv[2] ?? 'http://localhost:5310'
const OUT = process.argv[3] ?? null
const CASOS = [
  ['enlace del correo (token no válido)', '/api/auth/reset-password/token-de-prueba-caducado?callbackURL=%2Frestablecer'],
  ['token caducado', '/restablecer?error=INVALID_TOKEN'],
  ['ruta directa', '/restablecer'],
]
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const fallos = []
for (const roto of [false, true]) for (const [nombre, ruta] of CASOS) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 900 })
  await p.evaluateOnNewDocument((roto) => {
    window.__largas = []; window.__t0 = performance.now()
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__largas.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true }) } catch {}
    if (roto) Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('bloqueado', 'SecurityError') } })
  }, roto)
  let docs = 0; const js = []
  // Una recarga es una petición de documento nueva; los cambios de URL internos de la app no cuentan.
  p.on('request', (r) => { if (r.resourceType() === 'document' && r.frame() === p.mainFrame()) docs++; if (r.resourceType() === 'script') js.push(r.url().split('/').pop()) })
  const t = Date.now()
  await p.goto(BASE + ruta, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
  let visible = null
  for (let i = 0; i < 100; i++) {
    const hay = await p.evaluate(() => !!document.querySelector('form input[type=password], form input[type=email], .auth__btn')).catch(() => false)
    if (hay) { visible = Date.now() - t; break }
    await new Promise((x) => setTimeout(x, 100))
  }
  await new Promise((x) => setTimeout(x, Math.max(0, 10000 - (Date.now() - t))))
  const largas = await p.evaluate(() => window.__largas).catch(() => ['?'])
  const maxLarga = Math.max(0, ...largas.filter((x) => typeof x === 'number'))
  // La primera petición es la carga; la redirección del enlace del correo es otra, del servidor, y tampoco es recarga.
  const nav = docs - (ruta.startsWith('/api/') ? 2 : 1)
  if (OUT) await p.screenshot({ path: `${OUT}/${roto ? 'sin-storage' : 'normal'}-${nombre.split(' ')[0]}.png` })
  const ok = nav <= 0 && visible !== null && visible < 2000 && maxLarga <= 200
  if (!ok) fallos.push(nombre)
  console.log(`  ${ok ? '✓' : '✗'} ${(roto ? 'sin storage' : 'normal').padEnd(11)} ${nombre.padEnd(36)} recargas en 10 s: ${nav} · formulario a los ${visible ?? '—'} ms · tarea larga máx ${maxLarga} ms (${largas.length})${process.env.DETALLE ? '\n      js: ' + [...new Set(js)].join(' ') : ''}`)
  await ctx.close()
}
await b.close()
console.log(`  TOTAL de fallos: ${fallos.length}`)
process.exit(fallos.length ? 1 : 0)
