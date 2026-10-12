/* ============================================================================
   Recorrido completo de /luffy tocando cada botón (escritorio y 390 px).

     node scripts/recorrer-luffy.mjs [carpeta-capturas]

   Con la vista previa en :5310 (simulador o API real). Toca pestañas, filtros,
   chips, rangos, «ver más», reintentar, monedas, formularios (los abre, no los
   envía) y los botones que piden confirmación (pánico, cancelar la misión): se
   abre la confirmación y se responde «No». Nada que escriba se confirma.
   Falla si una vista se cae entera, si una tarjeta no se pudo dibujar o si hay
   errores en la consola.
   ========================================================================== */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { BASE, env } from './sesiones.mjs'

const OUT = process.argv[2] ?? ''
if (OUT) mkdirSync(OUT, { recursive: true })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const fallos = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fallos.push(m) }
// lo que escribe algo no se toca (o sólo se abre su confirmación, aparte)
const PROHIBIDO = /cancelar|pausar|reanudar|p[aá]nico|aprobar|rechazar|confirmar|borrar|enviar|^s[ií],|mover|modificar|guardar|cambiar con luffy|preguntarle|marcar como vista|atendida|nuevo hilo|anotar|laboratorio/i

const b = await chromium.launch({ channel: 'chrome', headless: true })
for (const movil of [false, true]) {
  const ctx = await b.newContext(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } })
  { const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: env.VETA_ADMIN_EMAIL, password: env.VETA_ADMIN_PASSWORD }, headers: { Origin: BASE } }); if (r.status() !== 200) throw new Error(`login ${r.status()}`) }
  const p = await ctx.newPage()
  const errores = []
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_ABORTED|net::ERR|status of 4\d\d/.test(m.text())) errores.push(m.text().slice(0, 160)) })
  p.on('pageerror', (e) => errores.push(`pageerror: ${e.message.slice(0, 160)}`))
  const sufijo = movil ? '390' : '1440'
  console.log(`\nLUFFY · recorrido ${movil ? 'teléfono (390 px)' : 'escritorio (1440 px)'}`)

  async function tocarTodo(sel, max = 40) {
    let n = 0
    const total = await p.locator(sel).count()
    for (let i = 0; i < Math.min(total, max); i++) {
      const el = p.locator(sel).nth(i)
      if (!(await el.isVisible().catch(() => false))) continue
      const t = ((await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '').trim()
      if (PROHIBIDO.test(t)) continue
      if (await el.isDisabled().catch(() => true)) continue
      await el.click({ timeout: 5000 }).catch(() => {})
      n++; await espera(350)
      // si abrió una hoja con velo en el teléfono, se cierra para seguir
      if (await p.locator('.lf-velo').isVisible().catch(() => false)) { await p.locator('.lf-velo').click({ position: { x: 200, y: 20 } }).catch(() => {}); await espera(200) }
    }
    return n
  }
  async function vista(nombre, ruta, listo, extra) {
    await p.goto(`${BASE}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const llego = await p.waitForSelector(listo, { timeout: 40000 }).then(() => true, () => false)
    await espera(1200)
    const caida = await p.locator('text=Esta pantalla no se pudo dibujar').count()
    ok(llego && !caida, `${nombre}: abre${caida ? ' (¡se cayó entera!)' : ''}`)
    let n = 0
    if (extra) n += await extra()
    // cada pestaña, y en cada una sus segmentos, rangos, chips y «ver más» (sólo botones: los enlaces llevan a otra vista)
    const pestanas = p.locator('.lf-pag__cab .lf-tabs button')
    const np = await pestanas.count()
    for (let k = 0; k < Math.max(1, np); k++) {
      if (np) { await pestanas.nth(k).click().catch(() => {}); n++; await espera(1500) }
      n += await tocarTodo('.lf-seg button, .lf-g__rangos button, button.lf-chip, button.lf-mas, [data-prueba^="reintentar"]')
      if (await p.locator('text=Esta pantalla no se pudo dibujar').count()) { ok(false, `${nombre}: se cayó en la pestaña ${k + 1}`); break }
    }
    const rotas = await p.locator('[data-prueba="tarjeta-rota"]').count()
    ok(rotas === 0, `${nombre}: ${n} botones tocados, ${rotas} tarjetas rotas`)
    if (OUT) await p.screenshot({ path: `${OUT}/${nombre.replace(/\s+/g, '-')}-${sufijo}.png`, fullPage: !movil })
  }

  await vista('chat', '/luffy', '.lf-hilo')
  await vista('terminal', '/luffy/terminal/WAL', '[data-prueba="seccion-precio"] canvas', async () => {
    let n = 0
    if (movil) { await p.click('.lf-ficha__monedas'); await espera(400) }
    n += await tocarTodo('.lf-term__filtros .lf-chip', 8)
    if (movil && !(await p.locator('.lf-term__lista.is-open').isVisible())) { await p.click('.lf-ficha__monedas'); await espera(400) }
    await p.locator('.lf-term__filtros .lf-chip', { hasText: /todo/i }).first().click().catch(() => {})
    await espera(600)
    if (movil && !(await p.locator('.lf-term__lista.is-open').isVisible())) { await p.click('.lf-ficha__monedas'); await espera(400) }
    for (let i = 0; i < 4; i++) { const f = p.locator('[data-prueba="moneda"]').nth(i); if (await f.isVisible().catch(() => false)) { await f.click(); n++; await p.waitForSelector('[data-prueba="seccion-precio"] canvas', { timeout: 40000 }).catch(() => {}); await espera(500); if (movil && i < 3) { await p.click('.lf-ficha__monedas'); await espera(300) } } }
    if (movil && (await p.locator('.lf-term__lista.is-open').isVisible())) { await p.locator('.lf-velo').click({ position: { x: 200, y: 20 } }).catch(() => {}) }
    await p.mouse.wheel(0, 2500); await espera(1500)
    ok((await p.locator('.lf-ficha__graficos canvas').count()) > 0, 'terminal: los gráficos de abajo se montan al bajar')
    return n
  })
  await vista('cartera', '/luffy/cartera', '.lf-kpi', async () => {
    let n = 0
    for (const t of ['declarar', 'orden']) { const bt = p.locator(t === 'declarar' ? '[data-prueba="declarar"]' : '.lf-acc-fila .lf-chip', { hasText: t === 'orden' ? /orden nueva/i : undefined }).first(); if (await bt.isVisible().catch(() => false)) { await bt.click(); n++; await espera(400); await bt.click().catch(() => {}); await espera(300) } }
    return n
  })
  await vista('caja', '/luffy/cartera', '.lf-kpi', async () => {
    await p.click('[data-prueba="pestana-caja"]'); await p.waitForSelector('.lf-decis', { timeout: 30000 }).catch(() => {})
    let n = 1
    for (const [abre, pregunta, nombreBoton] of [[/^p[aá]nico$/i, /cierra todas/i, 'Pánico'], [/cancelar la misi[oó]n/i, /deja de operar/i, 'Cancelar la misión']]) {
      const bt = p.locator('button', { hasText: abre }).first()
      if (!(await bt.isVisible().catch(() => false))) continue
      await bt.click(); await espera(300)
      ok(await p.locator('.lf-prop__pregunta', { hasText: pregunta }).isVisible().catch(() => false), `caja: «${nombreBoton}» pide confirmación y se responde «No»`)
      await p.locator('button', { hasText: /^No$/ }).first().click(); n++; await espera(300)
    }
    return n
  })
  await vista('radar', '/luffy/radar', '[data-prueba="candidata"], .lf-cand')
  await vista('control', '/luffy/control', '.lf-tarj')
  await vista('oficina', '/luffy/oficina', '.lf-tarj')
  await vista('informes', '/luffy/informes', '.lf-inf__sec, .lf-inf__lista')
  await vista('laboratorio', '/luffy/laboratorio', '.lf-lab, .lf-g')
  await vista('tableros', '/luffy/tableros', '[data-prueba="tablero"], .empty, h1')

  const es = [...new Set(errores)]
  ok(es.length === 0, `sin errores de consola${es.length ? `: ${es.slice(0, 4).join(' | ')}` : ''}`)
  await ctx.close()
}
await b.close()
console.log(`\n  RECORRIDO · fallos: ${fallos.length}${OUT ? ` · capturas en ${OUT}` : ''}\n`)
process.exit(fallos.length ? 1 : 0)
