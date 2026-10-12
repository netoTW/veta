/* /luffy: quién lo ve y el caso guiado (PROMPT-FASE-6a-veta.md §5), con Playwright.

   1. Acceso: /api/luffy/* responde 404 a todo el que no sea admin, en lectura y en escritura;
      /luffy en el navegador dice «esta página no existe» a un suscriptor pro.
   2. Admin, con el simulador del contrato: chat con el gráfico interactivo dentro del
      mensaje, un turno en streaming con el paso visible, el caso guiado (abrir el gráfico
      de ingresos de STONK desde el mensaje, agregar la mediana de su categoría y la
      posición de Pablo, guardarlo en un tablero y verlo en Tableros), y las tres
      pantallas en escritorio y en teléfono (390 px, sin desborde).
   3. Capturas en la carpeta que se pase (opcional): node scripts/probar-luffy.mjs [carpeta]

   Con la vista previa en :5310. Contra mugiwara-api real (sin simulador) sólo mira y no
   guarda nada. Sale con 1 si algo falla. */
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
import { BASE, PERFILES, cookiesDeTodos, env } from './sesiones.mjs'

const OUT = process.argv[2] ?? ''
if (OUT) mkdirSync(OUT, { recursive: true })
const fallos = []
const ok = (cond, que) => { console.log(`  ${cond ? '✓' : '✗'} ${que}`); if (!cond) fallos.push(que) }
const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- 1. acceso por API ---------- */
console.log('\nLUFFY · acceso a /api/luffy/*')
const cookies = await cookiesDeTodos()
for (const perfil of Object.keys(PERFILES)) {
  const h = { Cookie: cookies[perfil], Origin: BASE, 'Content-Type': 'application/json' }
  const lee = await fetch(`${BASE}/api/luffy/hilos`, { headers: h })
  const escribe = await fetch(`${BASE}/api/luffy/chat`, { method: 'POST', headers: h, body: '{}' })
  const tablero = await fetch(`${BASE}/api/luffy/tableros`, { method: 'POST', headers: h, body: '{}' })
  if (perfil === 'admin') ok(lee.status === 200, `admin lee /hilos (${lee.status})`)
  else ok(lee.status === 404 && escribe.status === 404 && tablero.status === 404, `${perfil}: 404 en lectura y escritura (${lee.status}/${escribe.status}/${tablero.status})`)
}
const salud = await fetch(`${BASE}/api/luffy/salud`, { headers: { Cookie: cookies.admin } }).then((r) => r.json()).catch(() => ({}))
const SIM = salud.version === 'simulado'
console.log(`  backend: ${SIM ? 'simulador del contrato' : `mugiwara-api ${salud.version ?? '?'}`}`)
const hilos = await fetch(`${BASE}/api/luffy/hilos?limite=40`, { headers: { Cookie: cookies.admin } }).then((r) => r.json())
let hiloStonk = SIM ? 'c0ffee00-0000-4000-8000-000000000002' : null, specStonk = SIM ? '9f3a2c1e' : null
if (!SIM) {
  for (const h of hilos) {
    const d = await fetch(`${BASE}/api/luffy/hilos/${h.id}?n=80`, { headers: { Cookie: cookies.admin } }).then((r) => r.json()).catch(() => null)
    const g = d?.mensajes?.flatMap((m) => m.graficos ?? []).find((x) => x.spec_id)
    if (g) { hiloStonk = h.id; specStonk = g.spec_id; break }
  }
}

/* ---------- 2. navegador ---------- */
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] })
const errores = []
async function contexto(movil) {
  const ctx = await b.newContext(movil ? { ...devices['iPhone 14'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES' } : { viewport: { width: 1440, height: 900 }, locale: 'es-ES' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errores.push(`PAGEERROR ${String(e.message).slice(0, 160)}`))
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|404 \(Not Found\)/.test(m.text())) errores.push(m.text().slice(0, 160)) })
  return { ctx, p }
}
async function entrar(ctx, email, pw) { const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email, password: pw }, headers: { Origin: BASE } }); if (r.status() !== 200) throw new Error(`login ${email}: ${r.status()}`) }
async function foto(p, nombre, full = false) { if (OUT) { await p.screenshot({ path: `${OUT}/${nombre}.png`, fullPage: full }); console.log(`    · ${nombre}.png`) } }
// ni el documento ni las zonas que se desplazan por dentro (la conversación, el laboratorio) pueden desbordar de lado
const sinDesborde = async (p) => p.evaluate(() => {
  const W = window.innerWidth + 2
  if (document.documentElement.scrollWidth > W) return false
  // nada de lo que se lee puede terminar más allá del borde: párrafos, cabeceras, gráficos, tarjetas
  return [...document.querySelectorAll('.lf-md p, .lf-md li, .lf-conv__cab, .lf-m__cuerpo, .lf-g, .lf-prop, .lf-tabj, .lf-ctrl__sec')].every((e) => e.getBoundingClientRect().right <= W)
})

console.log('\nLUFFY · un suscriptor pro no ve nada')
{
  const { ctx, p } = await contexto(false)
  await entrar(ctx, 'pro@veta.local', env.VETA_DEMO_PASSWORD)
  for (const r of ['/luffy', '/luffy/laboratorio', '/luffy/tableros']) {
    await p.goto(`${BASE}${r}`, { waitUntil: 'networkidle' }); await espera(500)
    const t = await p.evaluate(() => document.body.innerText)
    ok(/esta página no existe/i.test(t) && !/luffy|mugiwara|hilos|tablero/i.test(t), `${r}: «no existe», sin nombrar nada`)
  }
  await foto(p, '00-pro-no-existe')
  await ctx.close()
}

console.log('\nLUFFY · admin, escritorio')
{
  const { ctx, p } = await contexto(false)
  await entrar(ctx, env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD)
  await p.goto(`${BASE}/luffy`, { waitUntil: 'networkidle' })
  await p.waitForSelector('.lf-hilo', { timeout: 20000 })
  ok((await p.locator('.lf-hilo').count()) >= 1, 'la lista de hilos carga')
  await espera(800); await foto(p, '01-chat')
  if (hiloStonk) {
    await p.goto(`${BASE}/luffy/h/${hiloStonk}`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.lf-g canvas', { timeout: 30000 })
    ok(true, 'el gráfico del mensaje se dibuja interactivo (canvas)')
    const leyendas = await p.locator('.lf-g__ley').count()
    ok(leyendas >= 1, `leyendas de panel visibles (${leyendas})`)
    await espera(900); await foto(p, '02-chat-stonk')
    if (SIM) {
      ok((await p.locator('.lf-prop .btn--esmeralda').count()) >= 1, 'la propuesta de orden trae Confirmar')
      // un turno en streaming: el paso en curso y luego la respuesta
      await p.fill('.lf-comp textarea', 'muéstrame BTC con volumen y funding')
      await p.press('.lf-comp textarea', 'Enter')
      await p.waitForSelector('.lf-m__paso', { timeout: 15000 })
      ok(true, 'el paso en curso se ve mientras Luffy trabaja')
      await espera(400); await foto(p, '03-chat-streaming')
      await p.waitForSelector('.lf-m.is-vivo .lf-m__meta, .lf-m--luffy:last-of-type .lf-m__meta', { timeout: 40000 })
      await p.waitForFunction(() => !document.querySelector('.lf-m.is-vivo'), null, { timeout: 40000 })
      await p.waitForSelector('.lf-m--luffy:last-of-type .lf-g canvas', { timeout: 30000 })
      ok(true, 'el turno cerró y el gráfico nuevo quedó dentro del mensaje')
      await espera(900); await foto(p, '04-chat-respuesta')
    }
    // ---------- caso guiado ----------
    console.log('\nLUFFY · caso guiado: STONK desde el mensaje → categoría → posición → tablero')
    await p.goto(`${BASE}/luffy/h/${hiloStonk}`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.lf-g canvas', { timeout: 30000 })
    await p.locator('.lf-g a:has-text("Abrir en el laboratorio")').first().click()
    await p.waitForURL(/\/luffy\/laboratorio\//, { timeout: 15000 })
    ok(p.url().includes(`/luffy/laboratorio/${specStonk}`), `abre el laboratorio con el spec del mensaje (${specStonk})`)
    await p.waitForSelector('.lf-lab__lienzo .lf-g canvas', { timeout: 30000 })
    await espera(600); await foto(p, '05-lab-abierto')
    if (SIM) {
      await p.click('[data-prueba="categoria"]')
      await p.waitForFunction(() => /mediana de/i.test(document.querySelector('.lf-lab__lienzo .lf-g__capa')?.textContent ?? ''), null, { timeout: 20000 })
      ok(true, 'la mediana de la categoría entra como serie (leyenda)')
      for (const k of ['entradas', 'salidas', 'stop']) await p.click(`[data-prueba="pos-${k}"]`)
      await p.waitForFunction(() => /compra/i.test(document.querySelector('.lf-lab__lienzo .lf-g__marcas')?.textContent ?? ''), null, { timeout: 20000 })
      const marcas = await p.locator('.lf-lab__lienzo .lf-g__marcas').innerText()
      ok(/compra/i.test(marcas) && /venta/i.test(marcas) && /stop/i.test(marcas), `la posición de Pablo queda encima: ${marcas.replace(/\n/g, ' · ').slice(0, 90)}`)
      await espera(900); await foto(p, '06-lab-categoria-posicion')
      const NOMBRE = 'STONK · ingresos contra su categoría (prueba)'
      await p.fill('[data-prueba="nombre-tablero"]', NOMBRE)
      await p.click('[data-prueba="guardar-tablero"]')
      await p.waitForSelector('.lf-lab__msg', { timeout: 15000 })
      ok(/guardado/i.test(await p.locator('.lf-lab__msg').innerText()), 'guardado en un tablero')
      await p.goto(`${BASE}/luffy/tableros`, { waitUntil: 'networkidle' })
      await p.waitForSelector('[data-prueba="tablero"]', { timeout: 20000 })
      ok((await p.locator(`[data-prueba="tablero"][data-nombre="${NOMBRE}"]`).count()) >= 1, 'el tablero nuevo aparece en Tableros')
      await p.waitForSelector('[data-prueba="tablero"] canvas', { timeout: 30000 })
      await espera(1200); await foto(p, '07-tableros', true)
    } else {
      await p.goto(`${BASE}/luffy/tableros`, { waitUntil: 'networkidle' }); await espera(1500); await foto(p, '07-tableros', true)
    }
  } else {
    // sin un gráfico con spec_id en los hilos (API real recién desplegada): el laboratorio se abre de cero con datos reales
    console.log('  · ningún hilo trae todavía un gráfico con spec_id: el caso guiado se corre sólo con el simulador')
    await p.goto(`${BASE}/luffy/laboratorio`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.lf-lab__lienzo .lf-g canvas', { timeout: 60000 })
    ok(true, 'el laboratorio abre un gráfico nuevo con datos reales')
    await p.selectOption('.lf-ctrl select[aria-label="Origen de las posiciones"]', 'ambos')
    // sólo los que no estén ya encendidos (el selector enciende entradas, salidas y stop)
    for (const k of ['entradas', 'salidas', 'stop', 'stops_historial', 'pnl']) { const chip = p.locator(`[data-prueba="pos-${k}"]`); if (!(await chip.getAttribute('class'))?.includes('is-on')) await chip.click() }
    await espera(1500); await p.waitForLoadState('networkidle'); await espera(1200)
    const marcas = await p.locator('.lf-lab__lienzo .lf-g__marcas').innerText().catch(() => '')
    const nota = await p.locator('.lf-lab__lienzo .lf-g__nota').innerText().catch(() => '')
    if (!marcas && /posiciones \(/.test(nota)) console.log(`  · mugiwara-api no entregó las posiciones (no es del front): ${nota.slice(0, 140)}`)
    else ok(/compra/i.test(marcas) && /stop/i.test(marcas), `la posición de la caja queda encima con datos reales: ${marcas.replace(/\n/g, ' · ').slice(0, 100)}`)
    await foto(p, '05-lab-real')
    await p.goto(`${BASE}/luffy/tableros`, { waitUntil: 'networkidle' }); await espera(2500); await foto(p, '07-tableros', true)
  }
  await ctx.close()
}

/* ---------- 6b: terminal, cartera y stop desde el gráfico (simulador) ---------- */
if (SIM) {
  console.log('\nLUFFY · 6b · terminal: WAL, teclado y derivados al laboratorio')
  const { ctx, p } = await contexto(false)
  await entrar(ctx, env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD)
  await p.goto(`${BASE}/luffy/terminal/WAL`, { waitUntil: 'networkidle' })
  await p.waitForSelector('[data-prueba="seccion-precio"] canvas', { timeout: 40000 })
  ok((await p.locator('.lf-ficha__sym').innerText()).startsWith('WAL'), 'la ficha de WAL abre con sus gráficos')
  ok((await p.locator('.lf-ficha__graficos canvas').count()) >= 3, `secciones dibujadas: ${await p.locator('.lf-ficha__graficos canvas').count()} lienzos`)
  await foto(p, '10-terminal-wal', true)
  await p.keyboard.press('ArrowDown'); await p.waitForURL((u) => /\/luffy\/terminal\/[A-Z0-9]+$/.test(u.pathname) && !u.pathname.endsWith('/WAL'), { timeout: 10000 })
  const otra = p.url().split('/').pop()
  await p.waitForFunction((s) => (document.querySelector('.lf-ficha__sym')?.textContent ?? '').startsWith(s), otra, { timeout: 15000 })
  await p.waitForSelector('[data-prueba="seccion-precio"] canvas', { timeout: 40000 })
  ok(true, `↓ cambia de moneda sin recargar (${otra})`)
  await p.keyboard.press('ArrowUp'); await p.waitForURL(/\/luffy\/terminal\/WAL$/, { timeout: 10000 })
  await p.waitForSelector('[data-prueba="seccion-precio"] canvas', { timeout: 40000 })
  // el stop se arrastra en el gráfico y genera una propuesta, que se cancela
  const asa = p.locator('[data-prueba="asa-stop"]')
  await asa.waitFor({ timeout: 15000 })
  const caja = await asa.boundingBox()
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2); await p.mouse.down(); await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2 - 40, { steps: 8 }); await p.mouse.up()
  await p.waitForSelector('.lf-ficha__prop .lf-prop', { timeout: 15000 })
  const bloque = await p.locator('.lf-ficha__prop .lf-prop__bloque').innerText()
  ok(/MOVER STOP/i.test(bloque), `arrastrar el stop crea la propuesta: ${bloque.split('\n')[1]?.slice(0, 60)}`)
  await foto(p, '11-terminal-stop-propuesta')
  await p.click('.lf-ficha__prop .lf-prop__cancelar')
  await p.waitForFunction(() => /cancelada/i.test(document.querySelector('.lf-ficha__prop .lf-prop__estado')?.textContent ?? ''), null, { timeout: 15000 })
  ok(true, 'la propuesta de mover el stop se cancela')
  await p.click('[data-prueba="lab-derivados"]'); await p.waitForURL(/\/luffy\/laboratorio\//, { timeout: 15000 })
  await p.waitForSelector('.lf-lab__lienzo .lf-g canvas', { timeout: 40000 })
  ok(/apalancado|funding/i.test(await p.locator('.lf-lab__lienzo .lf-g__titulo').innerText()), 'derivados se abre en el laboratorio para editarlo')
  await foto(p, '12-lab-derivados')
  console.log('\nLUFFY · 6b · cartera: declarar STONK y verla')
  await p.goto(`${BASE}/luffy/cartera`, { waitUntil: 'networkidle' })
  await p.waitForSelector('[data-prueba="posicion"]', { timeout: 20000 })
  await p.click('[data-prueba="declarar"]')
  await p.fill('[data-prueba="form-declarar"] input[required]:nth-of-type(1)', 'STONK')
  const inputs = p.locator('[data-prueba="form-declarar"] input')
  await inputs.nth(0).fill('STONK'); await inputs.nth(1).fill('146'); await inputs.nth(2).fill('0,1031')
  await p.click('[data-prueba="form-declarar"] button[type="submit"]')
  await p.waitForSelector('.lf-pag .lf-prop', { timeout: 15000 })
  ok(/DECLARACI/i.test(await p.locator('.lf-pag .lf-prop__bloque').innerText()), 'declarar crea la propuesta y pide confirmación')
  await p.click('.lf-pag .lf-prop .btn--esmeralda'); await p.click('.lf-pag .lf-prop .btn--esmeralda')
  await p.waitForFunction(() => /ejecutada/i.test(document.querySelector('.lf-pag .lf-prop__estado')?.textContent ?? ''), null, { timeout: 15000 })
  await p.waitForFunction(() => [...document.querySelectorAll('[data-prueba="posicion"][data-activo="STONK"]')].some((e) => /declarada/.test(e.textContent ?? '')), null, { timeout: 15000 })
  ok(true, 'STONK aparece en la cartera como declarada')
  await foto(p, '13-cartera-declarada', true)
  await ctx.close()
}

console.log('\nLUFFY · admin, teléfono (390 px)')
{
  const { ctx, p } = await contexto(true)
  await entrar(ctx, env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD)
  const rutas = [['m01-chat', hiloStonk ? `/luffy/h/${hiloStonk}` : '/luffy'], ['m03-lab', specStonk ? `/luffy/laboratorio/${specStonk}` : '/luffy/laboratorio'], ['m05-tableros', '/luffy/tableros'], ['m06-terminal', '/luffy/terminal/WAL'], ['m07-cartera', '/luffy/cartera'], ['m08-radar', '/luffy/radar'], ['m09-control', '/luffy/control'], ['m10-oficina', '/luffy/oficina'], ['m11-informes', '/luffy/informes']]
  for (const [nombre, r] of rutas) {
    await p.goto(`${BASE}${r}`, { waitUntil: 'networkidle' })
    await p.waitForSelector('.lf-g canvas, .lf-hilo, [data-prueba="tablero"], [data-prueba="posicion"], [data-prueba="candidata"], [data-prueba="gatillo"], .lf-ev, .lf-inf__sec', { timeout: 30000 }).catch(() => {})
    await espera(1200)
    ok(await sinDesborde(p), `${r}: sin desborde horizontal a 390 px`)
    await foto(p, nombre)
    if (nombre === 'm01-chat') { await p.click('.lf-conv__hilos'); await espera(500); await foto(p, 'm02-chat-hilos'); ok(await p.locator('.lf-hilos.is-open').isVisible(), 'el cajón de hilos se abre en el teléfono'); await p.click('.lf-velo', { position: { x: 375, y: 500 } }); await espera(300) }
    if (nombre === 'm06-terminal') { await p.click('.lf-ficha__monedas'); await espera(500); ok(await p.locator('.lf-term__lista.is-open').isVisible(), 'la hoja de monedas se abre en el teléfono'); await foto(p, 'm06b-terminal-monedas'); await p.click('.lf-velo', { position: { x: 200, y: 30 } }); await espera(300) }
    if (nombre === 'm03-lab') { await p.click('.lf-lab__fab'); await espera(500); ok(await p.locator('.lf-lab__ctrl.is-open').isVisible(), 'la hoja de ajustes se abre en el teléfono'); await foto(p, 'm04-lab-ajustes'); await p.click('.lf-lab__cerrar'); await espera(300) }
  }
  await ctx.close()
}
await b.close()
const errs = [...new Set(errores)]
ok(errs.length === 0, `sin errores de consola${errs.length ? `: ${errs.slice(0, 4).join(' | ')}` : ''}`)
console.log(`\n  LUFFY · fallos: ${fallos.length}${OUT ? ` · capturas en ${OUT}` : ''}\n`)
process.exit(fallos.length ? 1 : 0)
