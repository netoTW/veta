/* La ficha gratis (ESPECIFICACION-LANZAMIENTO.md §4, contrato §21).

   node scripts/probar-ficha.mjs local [capturas]
     Contra la vista previa (:5310, motor simulado). A4.2 · la 6.ª consulta de un visitante
     desde la misma IP y la 16.ª de un gratis reciben 429 con su texto. A4.3 · cada rol ve
     su llamado al análisis completo (captura). A4.4 · ninguna ficha escribe en `solicitud`.

   node scripts/probar-ficha.mjs produccion [capturas]
     Contra www.vetalab.io con la cuenta Base de prueba (cookie en VETA_COOKIE_PRUEBA).
     A4.1 · las 20 monedas del banco del motor y dos contratos de fuera: ficha completa,
     cada dato «medido» o «estimado» con fuente, lo no disponible sólo en la línea final,
     nunca en blanco ni 503; tiempo de cada una. A4.5 · la respuesta no trae nada de admin.
     A4.6 · la moneda con tenencia declarada no existe para el cliente. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer-core'

const [modo = 'local', OUT = null] = process.argv.slice(2)
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
async function pagina(base, cookie) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
  await p.goto(base + '/', { waitUntil: 'domcontentloaded' })
  if (cookie) await p.setCookie(...cookie.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: base })))
  return p
}
const ficha = (base, cookie, cuerpo, ip) => fetch(`${base}/api/analizar/ficha`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...(ip ? { 'X-Vercel-Forwarded-For': ip } : {}) }, body: JSON.stringify(cuerpo) })

if (modo === 'local') {
  const { BASE, env, entrar } = await import('./sesiones.mjs')
  const Database = createRequire(import.meta.url)('better-sqlite3')
  const db = new Database(env.VETA_DB ?? 'server/data/veta.sqlite')
  const solicitudesAntes = db.prepare('SELECT COUNT(*) n FROM solicitud').get().n
  console.log('\nFICHA · local')
  // A4.2 · visitante por IP (la IP la pone Vercel en X-Forwarded-For; aquí se simula una propia de la prueba)
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
  const cods = []
  for (let i = 0; i < 6; i++) { const r = await ficha(BASE, '', { simbolo: 'CELO' }, ip); cods.push(r.status); if (r.status === 429) { const j = await r.json(); if (j.tipo === 'rafaga') { i--; cods.pop(); await new Promise((x) => setTimeout(x, (j.reintentar_en + 0.2) * 1000)); continue } console.log(`    429 visitante: «${j.texto}»`) } await new Promise((x) => setTimeout(x, 5200)) }
  ok(cods.slice(0, 5).every((c) => c === 200) && cods[5] === 429, `A4.2 visitante: 5 fichas y la 6.ª es 429 (${cods.join(' ')})`)
  const rafaga = await ficha(BASE, '', { simbolo: 'CELO' }, `198.51.100.${Math.floor(Math.random() * 200) + 1}`).then(() => ficha(BASE, '', { simbolo: 'CELO' }, ''))
  // A4.2 · gratis por usuario: 15 al día (una cuenta nueva para empezar de cero)
  const email = `prueba-ficha-${Date.now()}@veta.local`
  await fetch(`${BASE}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: 'Prueba-ficha-1234', name: 'Prueba ficha' }) })
  const gratis = await entrar(email).catch(async () => { const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: 'Prueba-ficha-1234' }) }); return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') })
  const cg = []
  for (let i = 0; i < 16; i++) { const r = await ficha(BASE, gratis, { simbolo: 'CELO' }); cg.push(r.status); if (r.status === 429 && i === 15) console.log(`    429 gratis: «${(await r.json()).texto}»`); await new Promise((x) => setTimeout(x, 3100)) }
  ok(cg.slice(0, 15).every((c) => c === 200) && cg[15] === 429, `A4.2 gratis: 15 fichas y la 16.ª es 429 (${cg.filter((c) => c === 200).length}×200, última ${cg[15]})`)
  // A4.3 · el llamado de cada rol
  // Otra cuenta gratis: la de arriba ya gastó su límite del día.
  const email2 = `prueba-ficha-b-${Date.now()}@veta.local`
  const alta2 = await fetch(`${BASE}/api/auth/sign-up/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: email2, password: 'Prueba-ficha-1234', name: 'Prueba ficha B' }) })
  const gratis2 = alta2.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
  const cuentas = { visitante: '', gratis: gratis2, base: await entrar('base@veta.local'), pro: await entrar('pro@veta.local') }
  const ESPERA = { visitante: /Crea tu cuenta y pide el análisis completo/i, gratis: /Pasa a Base: 2 análisis completos al mes/i, base: /Pedir el análisis completo|Te quedan 0 este mes/i, pro: /Pedir el análisis completo|Te quedan 0 este mes/i }
  for (const [rol, cookie] of Object.entries(cuentas)) {
    const p = await pagina(BASE, cookie)
    await p.goto(`${BASE}/analizar?m=CELO`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 2500))
    const t = await p.evaluate(() => document.body.innerText)
    if (OUT) { await p.$eval('.an-ficha', (e) => e.scrollIntoView({ block: 'start' })).catch(() => {}); await p.screenshot({ path: `${OUT}/ficha-${rol}.png`, fullPage: true }) }
    ok(/Esto es la foto\./.test(t) && ESPERA[rol].test(t), `A4.3 ${rol}: ficha y su llamado${ESPERA[rol].test(t) ? '' : ` (texto: ${t.match(/Has usado[^.]*\.|Un momento[^.]*\./)?.[0] ?? 'sin el llamado'})`}`)
  }
  const solicitudesDespues = db.prepare('SELECT COUNT(*) n FROM solicitud').get().n
  ok(solicitudesDespues === solicitudesAntes, `A4.4 ninguna ficha escribe en solicitud (${solicitudesAntes} → ${solicitudesDespues})`)
  void rafaga
} else {
  const BASE = 'https://www.vetalab.io'
  const cookie = process.env.VETA_COOKIE_PRUEBA ?? ''
  if (!cookie) { console.error('falta VETA_COOKIE_PRUEBA (la cuenta Base de prueba)'); process.exit(1) }
  // El banco del motor (su §E): 17 por ticker o nombre y 3 por contrato; más dos contratos de fuera del universo.
  const BANCO = [
    { consulta: 'BTC' }, { consulta: 'SOL' }, { consulta: 'HYPE' }, { consulta: 'SUI' }, { consulta: 'AAVE' }, { consulta: 'uniswap' },
    { consulta: 'GMX' }, { consulta: 'JOE' }, { consulta: 'ENA' }, { consulta: '0x940181a94A35A4569E4529A3CDfB74e38FD98631' },
    { consulta: '0x532f27101965dd16442E59d40670FaF5eBB142E4' }, { consulta: 'CAKE' }, { consulta: 'LSK' }, { consulta: 'JUP' },
    { consulta: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' }, { consulta: 'USELESS' }, { consulta: 'KMNO' }, { consulta: 'TIA' }, { consulta: 'APT' }, { consulta: 'KAS' },
    { consulta: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', fuera: 'EVM' }, { consulta: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', fuera: 'Solana' },
  ]
  console.log(`\nFICHA · producción · ${BANCO.length} monedas`)
  const PROHIBIDO_ADMIN = /"(hhi|adv_30d|derivados_por_venue|por_venue|costo|fuentes_internas|solo_admin)"/
  const filas = []
  for (const m of BANCO) {
    const t0 = Date.now()
    const r = await ficha(BASE, cookie, { consulta: m.consulta })
    const ms = Date.now() - t0
    const txt = await r.text()
    let f = null; try { f = JSON.parse(txt).ficha } catch { /* no es JSON */ }
    const datos = f ? Object.values(f.bloques).flatMap((bq) => bq.datos) : []
    const bienFormados = datos.every((d) => (d.estado === 'no_disponible') === (d.valor === null) && (d.estado === 'no_disponible' || (d.fuente && d.medido_en)))
    const conValor = datos.filter((d) => d.estado !== 'no_disponible').length
    const admin = PROHIBIDO_ADMIN.test(txt)
    filas.push({ m: m.consulta.slice(0, 14), estado: r.status, ms, sim: f?.simbolo ?? '—', datos: datos.length, conValor, bienFormados, admin })
    ok(r.status === 200 && !!f && bienFormados && !admin, `A4.1/A4.5 ${m.consulta.slice(0, 14).padEnd(14)} ${r.status} · ${f?.simbolo ?? '—'} · ${conValor}/${datos.length} con valor · ${ms} ms${admin ? ' · TRAE CAMPOS DE ADMIN' : ''}`)
    await new Promise((x) => setTimeout(x, 2100))
  }
  // Capturas de la pantalla, en la misma cuenta.
  if (OUT) {
    const p = await pagina(BASE, cookie)
    for (const q of ['BTC', 'ENA', 'JUP', 'KAS']) {
      await p.goto(`${BASE}/analizar?m=${q}`, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => {}); await new Promise((x) => setTimeout(x, 4000))
      const t = await p.evaluate(() => document.body.innerText)
      ok(/Esto es la foto\.|te damos la foto/.test(t) && !/no disponible|ausente/i.test(t), `A4.1 pantalla ${q}: ficha pintada, sin «no disponible» fuera de la línea final`)
      await p.screenshot({ path: `${OUT}/prod-ficha-${q}.png`, fullPage: true })
      await new Promise((x) => setTimeout(x, 2100))
    }
  }
  // A4.6 · tenencia declarada
  for (const q of ['SYN', 'synapse-2', '0x0f2d719407fdbeff09d87557abb7232601fd9f29']) {
    const r = await ficha(BASE, cookie, { consulta: q }); const t = await r.text()
    ok(r.status === 404 && !/synapse|"SYN"/i.test(t), `A4.6 «${q}»: ${r.status} y sin rastro de la moneda`)
    await new Promise((x) => setTimeout(x, 2100))
  }
  const tiempos = filas.filter((x) => x.estado === 200).map((x) => x.ms).sort((a, b) => a - b)
  console.log(`  tiempos: mediana ${tiempos[Math.floor(tiempos.length / 2)]} ms · p95 ${tiempos[Math.ceil(tiempos.length * 0.95) - 1]} ms · máx ${tiempos.at(-1)} ms`)
}
await b.close()
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
