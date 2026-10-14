/* ============================================================================
   El terminal v2 (/luffy/terminal), con el simulador (VETA_LUFFY=simulado o
   VETA_TERMINAL2=simulado), sobre la vista previa en :5310.

     node scripts/probar-terminal2.mjs [carpeta-capturas]

   Casos guiados de PROMPT-TERMINAL-v2-veta.md:
     - la ficha de WAL con sus seis secciones y el encabezado;
     - cambiar de moneda con el teclado (↓ ↑);
     - apagar y prender cada capa (el gráfico de precio cambia y vuelve);
     - abrir los derivados en detalle (cuatro paneles, cada uno con su eje);
     - abrir una sección en el laboratorio;
     - una moneda sin perpetuo: lo de derivados en su lugar, con el motivo;
     - una que no se opera en BingX, marcada en la lista;
     - a 390 px: sin desborde, la lista en hoja y los controles fijos;
     - sin errores de consola.
   ========================================================================== */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { BASE, entrar, env } from './sesiones.mjs'

const OUT = process.argv[2] ?? ''
if (OUT) mkdirSync(OUT, { recursive: true })
const espera = (ms) => new Promise((r) => setTimeout(r, ms))
const fallos = [], errores = []
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); if (!c) fallos.push(m) }
const cookie = await entrar(env.VETA_ADMIN_EMAIL)
const b = await chromium.launch({ channel: 'chrome', headless: true })
async function pagina(movil) {
  // sin el service worker de la app: si no, p.route no ve los pedidos (la ficha pendiente se arma así)
  const ctx = await b.newContext({ serviceWorkers: 'block', ...(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 1000 } }) })
  await ctx.addCookies(cookie.split('; ').map((c) => { const i = c.indexOf('='); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE } }))
  const p = await ctx.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
  p.on('pageerror', (e) => errores.push(String(e)))
  return { ctx, p }
}
const precioCargado = (p) => p.waitForSelector('[data-prueba="grafico-precio2"] canvas', { timeout: 30000 })
const enRuta = (p, re) => p.waitForFunction((r) => new RegExp(r).test(location.pathname), re.source, { timeout: 8000 }).then(() => true, () => false)
const lienzo = (p) => p.locator('[data-prueba="grafico-precio2"] .t2-g__lienzo').screenshot()

console.log('\nTERMINAL v2 · escritorio')
{
  const { ctx, p } = await pagina(false)
  await p.goto(`${BASE}/luffy/terminal/WAL`, { waitUntil: 'domcontentloaded' })
  await precioCargado(p)
  ok(/WAL/.test(await p.locator('[data-prueba="encabezado2"] h1').innerText()), 'abre la ficha de WAL')
  ok((await p.locator('[data-prueba="cifras-cab"] .t2-cifra').count()) >= 10, 'el encabezado trae su grilla de cifras')
  for (const s of ['estadisticas', 'movimiento', 'fundamento', 'redes', 'onchain', 'oportunidad']) ok(await p.locator(`[data-prueba="sec-${s}"]`).count() === 1, `sección ${s}`)
  const calidad = await p.locator('[data-prueba="calidad-mapa"]').innerText()
  ok(/CORTOS v2: 1,35 veces mejor que el azar \(entre 1,17 y 1,54\)/.test(calidad) && /LARGOS v2: no se distingue del azar \(1,01; entre 0,91 y 1,13\)/.test(calidad), `el mapa de liquidaciones dice su calidad por lado tal como llega (calidad.lados), sin suavizar (${calidad.replace(/\s+/g, ' ')})`)
  ok((await p.locator('[data-prueba="lectura2"]').innerText()).startsWith('Lectura por código'), 'la lectura por código')

  // las capas: cada una cambia el gráfico de precio y, al volver a prenderla, queda como estaba
  for (const capa of ['posiciones', 'gatillos', 'catalizadores', 'radar', 'liquidaciones']) {
    const b0 = await lienzo(p)
    const boton = p.locator(`[data-prueba="controles2"] [data-capa="${capa}"]`)
    await boton.click(); await espera(250)
    const apagada = (await boton.getAttribute('aria-pressed')) === 'false', b1 = await lienzo(p)
    await boton.click(); await espera(250)
    const b2 = await lienzo(p)
    ok(apagada && !b0.equals(b1) && (await boton.getAttribute('aria-pressed')) === 'true' && b0.length > 0 && Math.abs(b2.length - b0.length) < b0.length * 0.02, `la capa ${capa} se apaga (el gráfico cambia) y se vuelve a prender`)
  }

  // comparar contra BTC agrega su línea a la leyenda
  await p.locator('[data-prueba="comparar2"]').selectOption('btc'); await espera(600)
  ok(/BTC, llevado al precio/.test(await p.locator('[data-prueba="grafico-precio2"] .t2-g__ley').innerText()), 'comparar contra BTC dibuja su línea')
  await p.locator('[data-prueba="comparar2"]').selectOption('nada'); await espera(300)

  // la cruz: con el ratón sobre el gráfico, la leyenda muestra la fecha de esa vela
  const caja = await p.locator('[data-prueba="grafico-precio2"] .t2-g__lienzo').boundingBox()
  await p.mouse.move(caja.x + caja.width * 0.4, caja.y + caja.height * 0.5); await espera(200)
  const fecha = await p.locator('[data-prueba="grafico-precio2"] .t2-g__fecha').innerText()
  const fechaFlujo = await p.locator('[data-prueba="grafico-flujo2"] .t2-g__fecha').innerText()
  ok(fecha !== 'último' && fecha === fechaFlujo, `la cruz se comparte entre gráficos (${fecha} · ${fechaFlujo})`)

  // los derivados en detalle
  await p.locator('[data-prueba="ver-derivados"]').click()
  await p.waitForSelector('[data-prueba="derivados2"]')
  await espera(500)
  ok((await p.locator('[data-prueba^="derivado-"] canvas').count()) >= 4 && (await p.locator('[data-prueba^="derivado-"]').count()) === 4, 'los derivados en detalle: cuatro paneles, cada uno con su gráfico')
  const fund = await p.locator('[data-prueba="derivado-funding"] .t2-g__ley').innerText()
  ok(/Funding por intervalo\s+[−-]?\d/.test(fund) && !/\b0,5\b/.test(fund), `el funding trae su valor real por intervalo (${fund.replace(/\s+/g, ' ').slice(0, 60)})`)
  if (OUT) await p.locator('[data-prueba="sec-movimiento"]').screenshot({ path: `${OUT}/t2-movimiento-derivados.png` })

  // cambiar de moneda con el teclado
  const antes = p.url()
  // sin foco en un campo (el selector de comparar se quedaría con las flechas)
  await p.evaluate(() => (document.activeElement)?.blur?.())
  await p.keyboard.press('ArrowDown')
  await p.waitForFunction((a) => location.href !== a, antes, { timeout: 8000 }).catch(() => {})
  const despues = p.url().split('/').pop()
  const h1 = await p.waitForFunction((d) => document.querySelector('[data-prueba="encabezado2"] h1')?.textContent === d, despues, { timeout: 8000 }).then(() => true, () => false)
  ok(p.url() !== antes && h1, `↓ pasa a la siguiente moneda (${despues})`)
  // la ficha nueva vuelve a enganchar el teclado después de pintarse: se le da ese momento (con la máquina cargada,
  // en los invariantes, una flecha inmediata a veces llegaba antes)
  await p.evaluate(() => (document.activeElement)?.blur?.()); await espera(400)
  await p.keyboard.press('ArrowUp')
  ok(await enRuta(p, /\/luffy\/terminal\/WAL$/), '↑ vuelve a la anterior')

  // la que no se opera en BingX va marcada en la lista
  ok(/NO SE OPERA EN BINGX/.test(await p.locator('[data-prueba="moneda2"][data-simbolo="HYPE"]').innerText()), 'una moneda que no se opera en BingX va marcada')

  // una moneda sin perpetuo: los derivados en su lugar, con el motivo
  await p.goto(`${BASE}/luffy/terminal/KMNO`, { waitUntil: 'domcontentloaded' }); await precioCargado(p)
  const futSpot = p.locator('[data-prueba="cifras-mov"] [data-cifra="fut_spot"]')
  ok(/sin perpetuo/i.test(await futSpot.innerText()) && (await futSpot.getAttribute('class')).includes('is-falta'), 'sin perpetuo: la cifra de futuros queda en su lugar con el motivo')
  ok(/sin perpetuo/i.test(await p.locator('[data-prueba="sec-movimiento"] .t2-sec__lado').innerText()), 'sin perpetuo: el mapa de liquidaciones dice por qué no está')
  await p.locator('[data-prueba="ver-derivados"]').click(); await espera(300)
  ok(/sin perpetuo/i.test(await p.locator('[data-prueba="sec-movimiento"] .t2-deriv .t2-falta').innerText()), 'sin perpetuo: los derivados en detalle dicen el motivo')
  if (OUT) await p.screenshot({ path: `${OUT}/t2-kmno.png`, fullPage: true })

  // una sección en el laboratorio
  await p.goto(`${BASE}/luffy/terminal/WAL`, { waitUntil: 'domcontentloaded' }); await precioCargado(p)
  await p.locator('[data-prueba="lab2-movimiento"]').click()
  ok(await enRuta(p, /\/luffy\/laboratorio\/[^/]+$/), 'una sección se abre en el laboratorio')

  // una ficha parcial (pendiente) se muestra igual y se completa sola
  let veces = 0
  await p.route(/\/api\/luffy\/terminal\/v2\/SYN\?/, async (r) => {
    const res = await r.fetch(), f = await res.json()
    if (veces++ === 0) { f.pendiente = true; f.reintentar_en_s = 1; f.estadisticas = { cifras: [] }; f.no_disponibles = [...(f.no_disponibles ?? []), { seccion: 'estadisticas', motivo: 'la vitrina la está calculando' }] }
    await r.fulfill({ response: res, json: f })
  })
  await p.goto(`${BASE}/luffy/terminal/SYN`, { waitUntil: 'domcontentloaded' }); await precioCargado(p)
  const parcial = await p.locator('[data-prueba="encabezado2"]').innerText()
  ok(/CALCULANDO LA FICHA/.test(parcial) && /calculando/i.test(await p.locator('[data-prueba="sec-estadisticas"]').innerText()), 'una ficha pendiente se muestra igual, con lo que falta en su lugar')
  const completa = await p.waitForFunction(() => !/CALCULANDO LA FICHA/.test(document.querySelector('[data-prueba="encabezado2"]')?.textContent ?? '') && document.querySelectorAll('[data-prueba="sec-estadisticas"] .t2-cifra').length > 3, null, { timeout: 12000 }).then(() => true, () => false)
  ok(completa && veces >= 2, `y se refresca sola cuando está completa (${veces} pedidos)`)
  await p.unroute(/\/api\/luffy\/terminal\/v2\/SYN\?/)

  // «Terminal» es el v2; la dirección provisoria lleva a la de siempre y el anterior queda en /luffy/terminal1
  await p.goto(`${BASE}/luffy/t2/WAL`, { waitUntil: 'domcontentloaded' })
  ok(await enRuta(p, /\/luffy\/terminal\/WAL$/), '/luffy/t2 lleva a /luffy/terminal')
  ok((await p.locator('a[href="/luffy/terminal"]').first().count()) > 0, 'el menú «Terminal» apunta al v2')
  await p.goto(`${BASE}/luffy/terminal1/WAL`, { waitUntil: 'domcontentloaded' })
  ok(await p.waitForSelector('[data-prueba="terminal-anterior"]', { timeout: 15000 }).then(() => true, () => false), 'el terminal anterior sigue en /luffy/terminal1, con el enlace al nuevo')
  await ctx.close()
}

console.log('\nTERMINAL v2 · teléfono (390 px)')
{
  const { ctx, p } = await pagina(true)
  await p.goto(`${BASE}/luffy/terminal/WAL`, { waitUntil: 'domcontentloaded' }); await precioCargado(p)
  for (let y = 0; y < 10; y++) { await p.mouse.wheel(0, 900); await espera(150) }
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth)
  ok(ancho <= 392, `sin desborde horizontal (${ancho} px)`)
  const ctrl = p.locator('[data-prueba="controles2"]')
  ok((await ctrl.evaluate((el) => getComputedStyle(el).position)) === 'sticky', 'los controles comunes quedan fijos arriba de los gráficos')
  const tabla = await p.locator('[data-prueba="escenarios2"]').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, o: getComputedStyle(el).overflowX }))
  ok(tabla.o === 'auto' && tabla.sw > tabla.cw, 'la tabla de escenarios tiene su propio scroll')
  // la cruz con el dedo: un arrastre horizontal la mueve en todos los gráficos, a la misma fecha, sin mover la página
  {
    const el = p.locator('[data-prueba="grafico-precio2"] .t2-g__lienzo'); await el.scrollIntoViewIfNeeded(); await espera(200)
    const bb = await el.boundingBox(), cdp = await ctx.newCDPSession(p), y = bb.y + bb.height / 2, sy = await p.evaluate(() => scrollY)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x + 80, y }] })
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x + 80 + i * 14, y }] }); await espera(60) }
    await espera(200)
    const f1 = await p.locator('[data-prueba="grafico-precio2"] .t2-g__fecha').innerText(), f2 = await p.locator('[data-prueba="grafico-flujo2"] .t2-g__fecha').innerText()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    ok(f1 !== 'último' && f1 === f2 && sy === await p.evaluate(() => scrollY), `la cruz con el dedo, en todos los gráficos a la misma fecha (${f1} · ${f2})`)
  }
  await p.evaluate(() => window.scrollTo(0, 0)); await espera(200)
  await p.locator('.t2-cab__monedas').click(); await espera(500)
  ok(await p.locator('.t2-lista.is-open').count() === 1, 'la lista de monedas se abre en hoja')
  await p.locator('[data-prueba="moneda2"][data-simbolo="STONK"]').click()
  const fue = await enRuta(p, /\/luffy\/terminal\/STONK$/)
  await espera(400)
  ok(fue && await p.locator('.t2-lista.is-open').count() === 0, 'elegir una moneda cierra la hoja y la abre')
  if (OUT) await p.screenshot({ path: `${OUT}/t2-telefono.png`, fullPage: true })
  await ctx.close()
}
await b.close()
ok(errores.length === 0, `sin errores de consola${errores.length ? `: ${errores.slice(0, 3).join(' | ')}` : ''}`)
console.log(`\n  TERMINAL v2 · fallos: ${fallos.length}`)
process.exit(fallos.length ? 1 : 0)
