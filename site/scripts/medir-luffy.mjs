/* ============================================================================
   Velocidad de /luffy desde un teléfono de gama media con 4G.

     node scripts/medir-luffy.mjs [salida.json]          (contra www.vetalab.io)
     MEDIR_BASE=http://localhost:5310 node scripts/medir-luffy.mjs

   Perfil: 390 × 844, CPU 4 veces más lenta, 4G lento (150 ms de ida y vuelta,
   1,6 Mbit/s de bajada, 750 kbit/s de subida). Entra como admin y mide:
     - tiempo hasta ver /luffy (la lista de hilos);
     - el JavaScript que baja (y si entra algo de la portada: three.js, 3D);
     - la cascada de peticiones;
     - cada /api/luffy/*: total en el navegador y, si el puente la manda, la
       cabecera Server-Timing con lo que tardó mugiwara-api;
     - ir a la terminal, cambiar tres veces de moneda, volver a una ya vista y
       abrir cada vista, navegando dentro de la app (barra inferior y «Más»).
   Repite todo MEDIR_VUELTAS veces (3), cada una en frío, y da la mediana.
   Sólo mira: no confirma nada ni escribe propuestas.
   ========================================================================== */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { env } from './sesiones.mjs'

const BASE = process.env.MEDIR_BASE ?? 'https://www.vetalab.io'
const SALIDA = process.argv[2] ?? ''
const CPU = Number(process.env.MEDIR_CPU ?? 4)
const TOPE = 180_000

const VUELTAS = Number(process.env.MEDIR_VUELTAS ?? 3)
const b = await chromium.launch({ channel: 'chrome', headless: true })
const mediana = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined).sort((a, c) => a - c); return v.length ? v[Math.floor((v.length - 1) / 2)] : null }

async function vuelta(n) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', locale: 'es-CL' })
  { const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, { data: { email: process.env.MEDIR_EMAIL ?? env.VETA_ADMIN_EMAIL, password: process.env.MEDIR_PASSWORD ?? env.VETA_ADMIN_PASSWORD }, headers: { Origin: BASE } }); if (r.status() !== 200) throw new Error(`login: ${r.status()}`) }
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  const reqs = new Map(); let etapa = 'inicio'
  cdp.on('Network.requestWillBeSent', (e) => { if (!reqs.has(e.requestId)) reqs.set(e.requestId, { url: e.request.url, metodo: e.request.method, tipo: e.type, inicio: e.timestamp, etapa }) })
  cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (!r) return; r.estado = e.response.status; const st = Object.entries(e.response.headers).find(([k]) => k.toLowerCase() === 'server-timing')?.[1]; const m = st && /mugiwara;dur=(\d+)/.exec(st); if (m) r.mugiwara = Number(m[1]) })
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (!r) return; r.fin = e.timestamp; r.bytes = e.encodedDataLength })
  cdp.on('Network.loadingFailed', (e) => { const r = reqs.get(e.requestId); if (!r) return; r.fin = e.timestamp; r.fallo = e.canceled ? 'cancelada' : e.errorText })
  const medidas = []
  async function medir(nombre, accion, listo) {
    etapa = nombre; const t0 = Date.now(); let ok = true
    try { await accion(); await listo() } catch (e) { ok = false; console.log(`    ! ${nombre}: ${String(e.message).split('\n')[0]}`) }
    medidas.push({ nombre, segundos: ok ? (Date.now() - t0) / 1000 : null })
  }
  const ver = (sel) => () => p.waitForSelector(sel, { state: 'visible', timeout: TOPE })
  const tocar = (sel) => () => p.click(sel, { timeout: TOPE })
  const mas = (ruta) => async () => { await p.click('.lf-abajo__mas'); await p.click(`.lf-hoja-mas__item[href="${ruta}"]`) }
  const precio = (s) => async () => { await p.waitForFunction((x) => (document.querySelector('.lf-ficha__sym')?.textContent ?? '').startsWith(x), s, { timeout: TOPE }); await p.waitForSelector('[data-prueba="seccion-precio"] canvas', { state: 'visible', timeout: TOPE }) }

  await medir('abrir /luffy en frío', () => p.goto(`${BASE}/luffy`, { waitUntil: 'commit', timeout: TOPE }), ver('.lf-hilo'))
  await p.waitForTimeout(800)
  await medir('ir a la terminal', tocar('.lf-abajo a[href="/luffy/terminal"]'), ver('[data-prueba="grafico-precio2"] canvas'))
  const primera = (await p.locator('.lf-ficha__sym').innerText().catch(() => '')).split(/\s/)[0]
  await p.waitForTimeout(800)
  for (let i = 0; i < 3; i++) {
    let sym = ''
    await medir(`cambiar de moneda ${i + 1}`, async () => { await p.click('.lf-ficha__monedas'); const fila = p.locator('[data-prueba="moneda"]:not(.is-activa)').nth(i + 1); sym = await fila.getAttribute('data-simbolo'); await fila.click() }, () => precio(sym)())
    await p.waitForTimeout(600)
  }
  await medir('volver a una moneda ya vista', async () => { await p.click('.lf-ficha__monedas'); await p.click(`[data-prueba="moneda"][data-simbolo="${primera}"]`) }, precio(primera))
  await medir('ir a la cartera', tocar('.lf-abajo a[href="/luffy/cartera"]'), ver('.lf-kpi'))
  await medir('pasar a la caja', tocar('[data-prueba="pestana-caja"]'), ver('.lf-decis'))
  await medir('ir al radar', tocar('.lf-abajo a[href="/luffy/radar"]'), ver('[data-prueba="candidata"]'))
  await medir('ir a control', mas('/luffy/control'), ver('.lf-tarj'))
  await medir('ir a la oficina', mas('/luffy/oficina'), ver('.lf-tarj'))
  await medir('ir a informes', mas('/luffy/informes'), ver('.lf-inf__sec, .lf-inf__lista'))
  etapa = 'fin'; await p.waitForTimeout(1500)
  await ctx.close()
  console.log(`  vuelta ${n}: ${medidas.map((m) => (m.segundos === null ? '✗' : m.segundos.toFixed(1))).join(' · ')}`)
  return { medidas, reqs: [...reqs.values()] }
}

console.log(`\nLUFFY · velocidad desde un teléfono (CPU ×${CPU}, 4G lento) · ${BASE} · ${VUELTAS} vueltas\n`)
const vueltas = []
for (let n = 1; n <= VUELTAS; n++) vueltas.push(await vuelta(n))
await b.close()

/* ---------- informe ---------- */
const nombres = vueltas[0].medidas.map((m) => m.nombre)
const resumen = nombres.map((nombre) => ({ nombre, mediana_s: mediana(vueltas.map((v) => v.medidas.find((m) => m.nombre === nombre)?.segundos)), vueltas_s: vueltas.map((v) => v.medidas.find((m) => m.nombre === nombre)?.segundos ?? null) }))
console.log('\n  mediana por paso')
for (const r of resumen) console.log(`    ${r.nombre.padEnd(30)} ${r.mediana_s === null ? 'falló' : `${r.mediana_s.toFixed(1)} s`.padStart(7)}   (${r.vueltas_s.map((x) => (x === null ? '✗' : x.toFixed(1))).join(' · ')})`)
const kb = (n) => `${(n / 1024).toFixed(0)} kB`
const js = vueltas[0].reqs.filter((r) => r.etapa === 'abrir /luffy en frío' && r.tipo === 'Script' && r.bytes)
const totalJs = js.reduce((a, r) => a + r.bytes, 0)
const sospechosos = js.filter((r) => /three|portada|hero|Escena|3d|gltf/i.test(r.url))
console.log(`\n  JavaScript al abrir /luffy: ${js.length} archivos · ${kb(totalJs)} por la red`)
for (const r of [...js].sort((a, c) => c.bytes - a.bytes).slice(0, 6)) console.log(`    ${kb(r.bytes).padStart(7)}  ${r.url.replace(BASE, '')}`)
console.log(sospechosos.length ? `  ¡Entra código de la portada!: ${sospechosos.map((r) => r.url.replace(BASE, '')).join(', ')}` : '  Nada de la portada (three.js, 3D) en /luffy.')
const patron = (u) => u.replace(/^https?:\/\/[^/]+\/api\/luffy/, '').replace(/\?.*$/, '').replace(/\/terminal\/(?!universo|plantillas)[A-Z0-9]+/, '/terminal/{activo}').replace(/\/hilos\/[0-9a-f-]{8,}/, '/hilos/{id}').replace(/\/informes\/\d{4}-\d\d-\d\d/, '/informes/{fecha}')
const api = vueltas.flatMap((v) => v.reqs).filter((r) => r.url.includes('/api/luffy/') && r.fin && r.estado)
const grupos = new Map()
for (const r of api) { const k = `${r.metodo} ${patron(r.url)}`; const g = grupos.get(k) ?? []; g.push(r); grupos.set(k, g) }
const tabla = [...grupos].map(([ruta, rs]) => ({ ruta, n: rs.length, total_ms: mediana(rs.map((r) => (r.fin - r.inicio) * 1000)), mugiwara_ms: mediana(rs.map((r) => r.mugiwara)), peor_ms: Math.max(...rs.map((r) => (r.fin - r.inicio) * 1000)) })).sort((a, c) => c.total_ms - a.total_ms)
console.log('\n  /api/luffy/* · mediana por ruta (todas las vueltas)')
console.log(`    ${'ruta'.padEnd(38)} ${'n'.padStart(3)} ${'total'.padStart(7)} ${'mugiwara'.padStart(9)} ${'peor'.padStart(7)}`)
for (const f of tabla) console.log(`    ${f.ruta.slice(0, 38).padEnd(38)} ${String(f.n).padStart(3)} ${`${(f.total_ms / 1000).toFixed(1)} s`.padStart(7)} ${f.mugiwara_ms !== null ? `${(f.mugiwara_ms / 1000).toFixed(1)} s`.padStart(9) : '—'.padStart(9)} ${`${(f.peor_ms / 1000).toFixed(1)} s`.padStart(7)}`)
if (SALIDA) { writeFileSync(SALIDA, JSON.stringify({ base: BASE, cpu: CPU, vueltas: VUELTAS, cuando: new Date().toISOString(), resumen, js: { archivos: js.length, bytes: totalJs, mayores: js.map((r) => ({ url: r.url.replace(BASE, ''), bytes: r.bytes })), portada: sospechosos.map((r) => r.url) }, api: tabla, cascadas: vueltas.map((v) => { const t0 = v.reqs[0]?.inicio ?? 0; return v.reqs.filter((r) => r.fin).map((r) => ({ etapa: r.etapa, url: r.url.replace(BASE, ''), tipo: r.tipo, desde_ms: Math.round((r.inicio - t0) * 1000), dur_ms: Math.round((r.fin - r.inicio) * 1000), bytes: r.bytes ?? 0, mugiwara_ms: r.mugiwara ?? null, estado: r.estado ?? r.fallo })) }) }, null, 1)); console.log(`\n  guardado en ${SALIDA}`) }
