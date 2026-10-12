/* ============================================================================
   /luffy como app instalable (PWA).

     node scripts/probar-app.mjs [carpeta-capturas]

   Con la vista previa en :5310 (la build de producción: el service worker no se
   registra en desarrollo). Comprueba:
     - quien no es admin no ve nada: manifiesto y service worker dan 404, la
       página no lleva manifiesto ni ícono de app, y el título no nombra a Luffy;
     - para el admin, Chrome la da por instalable (sin errores de instalación),
       con nombre, íconos y pantalla completa;
     - el service worker controla /luffy y guarda la carcasa;
     - sin red, /luffy abre al instante con lo guardado y avisa que no hay conexión;
     - sin red y sin nada guardado, la pantalla sin conexión.
   ========================================================================== */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { BASE, PERFILES, env } from './sesiones.mjs'

const OUT = process.argv[2] ?? ''
if (OUT) mkdirSync(OUT, { recursive: true })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const fallos = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fallos.push(m) }
const b = await chromium.launch({ channel: 'chrome', headless: true })
async function contexto(email, pw, movil = false) {
  const ctx = await b.newContext(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } })
  if (email) { const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password: pw }, headers: { Origin: BASE } }); if (r.status() !== 200) throw new Error(`login ${email}: ${r.status()}`) }
  return ctx
}

console.log('\nAPP · quien no es admin no ve nada')
for (const [perfil, email] of [['visitante', null], ['pro', PERFILES.pro]]) {
  const ctx = await contexto(email, env.VETA_DEMO_PASSWORD)
  const m = await ctx.request.get(`${BASE}/api/luffy/app/manifest.webmanifest`), s = await ctx.request.get(`${BASE}/api/luffy/app/sw.js`)
  ok(m.status() === 404 && s.status() === 404, `${perfil}: manifiesto y service worker dan 404 (${m.status()}/${s.status()})`)
  const p = await ctx.newPage(); await p.goto(`${BASE}/luffy`, { waitUntil: 'networkidle' }); await espera(400)
  const cab = await p.evaluate(async () => ({ manifiesto: !!document.querySelector('link[rel="manifest"]'), icono: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), titulo: document.title, sw: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0, guardado: localStorage.getItem('veta.yo.admin') }))
  ok(!cab.manifiesto && !/gema/.test(cab.icono ?? '') && !/luffy/i.test(cab.titulo) && cab.sw === 0 && !cab.guardado, `${perfil}: sin manifiesto, sin ícono de la app, título «${cab.titulo}», sin service worker`)
  await ctx.close()
}

console.log('\nAPP · Pablo: instalable, con service worker y sin conexión')
{
  const ctx = await contexto(env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD)
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await p.goto(`${BASE}/luffy`, { waitUntil: 'networkidle' })
  await p.waitForSelector('.lf-hilo', { timeout: 30000 })
  const man = await cdp.send('Page.getAppManifest')
  const errsMan = (man.errors ?? []).filter((e) => !e.critical === false || e.critical)
  const json = man.data ? JSON.parse(man.data) : {}
  ok(!!man.url && /api\/luffy\/app\/manifest/.test(man.url) && !errsMan.length, `manifiesto leído por Chrome sin errores (${man.errors?.length ?? 0} avisos)`)
  ok(json.name === 'Luffy' && json.display === 'standalone' && json.start_url === '/luffy' && (json.icons ?? []).some((i) => i.purpose === 'maskable'), 'nombre Luffy, pantalla completa, arranca en /luffy, ícono adaptable')
  const icono = await ctx.request.get(`${BASE}/img/app/gema-512.png`)
  ok(icono.status() === 200 && /image\/png/.test(icono.headers()['content-type'] ?? ''), 'el ícono de 512 se sirve')
  await p.evaluate(() => navigator.serviceWorker.ready)
  await p.reload({ waitUntil: 'networkidle' })
  const control = await p.evaluate(() => !!navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL)
  ok(!!control && /api\/luffy\/app\/sw\.js/.test(control), 'el service worker controla /luffy')
  const inst = await cdp.send('Page.getInstallabilityErrors')
  // «in-incognito» es del contexto de prueba (Playwright abre ventanas privadas, donde Chrome nunca ofrece instalar)
  const errsInst = (inst.installabilityErrors ?? []).map((e) => e.errorId).filter((e) => e !== 'in-incognito')
  ok(errsInst.length === 0, `Chrome la da por instalable${errsInst.length ? `: ${errsInst.join(', ')}` : ' (salvo la ventana privada de la prueba)'}`)
  // el panel precalienta sus vistas unos segundos después de cargar: se espera a que queden guardadas
  for (let i = 0; i < 30; i++) { const n = await p.evaluate(async () => { let t = 0; for (const k of await caches.keys()) if (k.startsWith('luffy-estaticos')) t += (await (await caches.open(k)).keys()).length; return t }); if (n >= 30) break; await espera(700) }
  const cajas = await p.evaluate(async () => { const ks = await caches.keys(); const out = {}; for (const k of ks) out[k] = (await (await caches.open(k)).keys()).length; return out })
  ok(Object.keys(cajas).some((k) => k.startsWith('luffy-carcasa')) && Object.entries(cajas).some(([k, n]) => k.startsWith('luffy-estaticos') && n > 3), `carcasa y archivos guardados (${Object.entries(cajas).map(([k, n]) => `${k.replace(/-\d+$/, '')}: ${n}`).join(', ')})`)
  const head = await p.evaluate(() => ({ capaz: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content'), icono: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'), vp: document.querySelector('meta[name="viewport"]')?.getAttribute('content'), titulo: document.title }))
  ok(head.capaz === 'yes' && head.icono === '/img/app/gema-180.png' && /viewport-fit=cover/.test(head.vp ?? '') && head.titulo === 'Luffy', 'iPhone: «Agregar a inicio» con la gema, a pantalla completa, título Luffy')

  // con red se abre el radar una vez: sus datos quedan guardados en el teléfono
  await p.goto(`${BASE}/luffy/radar`, { waitUntil: 'networkidle' }); await p.waitForSelector('[data-prueba="candidata"]', { timeout: 30000 }).catch(() => {}); await espera(800)
  // sin red: la carcasa sale de lo guardado y avisa
  await ctx.setOffline(true)
  const t0 = Date.now()
  await p.goto(`${BASE}/luffy/radar`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  const abrio = await p.waitForSelector('.lf-top', { timeout: 8000 }).then(() => true, () => false)
  ok(abrio, `sin red, /luffy/radar abre con lo guardado (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  ok(await p.waitForSelector('[data-prueba="candidata"]', { timeout: 8000 }).then(() => true, () => false), 'sin red, las candidatas que llegaron la última vez siguen a la vista')
  ok(!(await p.locator('text=/Failed to fetch|TypeError/').count()), 'sin red, ningún error crudo: dice «Sin conexión»')
  ok(await p.waitForSelector('.lf-sinred', { state: 'visible', timeout: 5000 }).then(() => true, () => false), 'sin red, avisa «Sin conexión»')
  if (OUT) await p.screenshot({ path: `${OUT}/sin-red-carcasa-1280.png` })
  // sin red y sin nada guardado: la pantalla sin conexión
  await p.evaluate(async () => { for (const k of await caches.keys()) if (k.startsWith('luffy-carcasa')) await caches.delete(k) })
  await p.goto(`${BASE}/luffy`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  const pantalla = await p.waitForSelector('text=Luffy vuelve con la red.', { timeout: 8000 }).then(() => true, () => false)
  ok(pantalla, 'sin red y sin carcasa guardada, la pantalla sin conexión')
  if (OUT) await p.screenshot({ path: `${OUT}/sin-conexion-1280.png` })
  await ctx.setOffline(false)
  await ctx.close()
}
{
  // la pantalla sin conexión en el teléfono
  const ctx = await contexto(env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD, true)
  const p = await ctx.newPage()
  await p.goto(`${BASE}/luffy`, { waitUntil: 'networkidle' }); await p.evaluate(() => navigator.serviceWorker.ready); await p.reload({ waitUntil: 'networkidle' })
  await espera(1500)
  await p.evaluate(async () => { for (const k of await caches.keys()) if (k.startsWith('luffy-carcasa')) await caches.delete(k) })
  await ctx.setOffline(true)
  await p.goto(`${BASE}/luffy`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  ok(await p.waitForSelector('text=Luffy vuelve con la red.', { timeout: 8000 }).then(() => true, () => false), 'la pantalla sin conexión también en el teléfono')
  if (OUT) await p.screenshot({ path: `${OUT}/sin-conexion-390.png` })
  await ctx.setOffline(false)
  // la pantalla sin conexión se recarga sola al volver la red: se deja terminar antes de seguir
  await espera(2500)
  // la terminal a 390 px, como se ve abierta desde el ícono
  await p.goto(`${BASE}/luffy/terminal/WAL`, { waitUntil: 'networkidle' }); await p.waitForSelector('[data-prueba="seccion-precio"] canvas', { timeout: 40000 }).catch(() => {}); await espera(800)
  if (OUT) await p.screenshot({ path: `${OUT}/como-app-390.png` })
  await ctx.close()
}
await b.close()
console.log(`\n  APP · fallos: ${fallos.length}${OUT ? ` · capturas en ${OUT}` : ''}\n`)
process.exit(fallos.length ? 1 : 0)
