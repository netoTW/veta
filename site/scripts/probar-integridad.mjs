/* Informes con datos incompletos (ESPECIFICACION-LANZAMIENTO.md §6, contrato §20.2). A6.1 a A6.4.

   Sobre el VETA de fixtures (servir-fixtures.mjs), con los registros reales del motor:
   - el de las tres integridades enseña al cliente «sin verificar» y la línea de no
     disponibles, y ninguna mención de lo corregido; admin ve la tabla completa y el aviso;
   - el limpio no tiene el bloque en el DOM;
   - ninguna pantalla de cliente dice «ausente», «parcial», «retirad…», «corregid…» ni «no disponible»;
   - la API no le manda `retiradas` a quien no es admin;
   - el de tenencia declarada no existe para el cliente.

   Uso: node scripts/probar-integridad.mjs [carpeta-capturas]   Sale con 1 si algo falla. */
import puppeteer from 'puppeteer-core'
import { arrancarFixtures } from './servir-fixtures.mjs'

const OUT = process.argv[2] ?? null
const f = await arrancarFixtures()
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }
const porCaso = (pred) => f.fixtures.find((x) => pred(x.registro))?.registro
const tres = porCaso((r) => (r.integridad?.sin_verificar?.length ?? 0) > 0 && (r.integridad?.retiradas?.length ?? 0) > 0 && !r.solo_admin)
const limpio = porCaso((r) => !r.solo_admin && !r.integridad?.sin_verificar?.length && !r.integridad?.no_disponibles?.length && !r.motivo_sin_tesis_cliente)
const declarado = porCaso((r) => r.conflicto_interes?.hay)
console.log(`\nDATOS INCOMPLETOS · fixtures: tres integridades ${tres?.id} · limpio ${limpio?.id} · tenencia ${declarado?.id}`)

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
async function pagina(cookie) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
  await p.goto(f.base + '/', { waitUntil: 'domcontentloaded' })
  if (cookie) await p.setCookie(...cookie.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: f.base })))
  return p
}
const PROHIBIDAS = /\b(ausentes?|parcial|retirad[oa]s?|corregid[oa]s?|no disponibles?)\b/i

const cli = await pagina(f.cuentas.base)
if (tres) {
  await cli.goto(`${f.base}/analisis/${tres.id}`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 1200))
  const bloque = await cli.$eval('.p-sobredatos', (e) => e.innerText).catch(() => '')
  const todo = await cli.evaluate(() => document.body.innerText)
  if (OUT) { await cli.$eval('.p-sobredatos', (e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await cli.screenshot({ path: `${OUT}/cliente-tres-integridades.png` }) }
  ok(/sin verificar:/i.test(bloque) && /No entra en este informe:/.test(bloque), `A6.1 cliente: bloque con «sin verificar» y la línea de no disponibles`)
  const mal = todo.match(PROHIBIDAS)?.[0]
  ok(!mal, `A6.1/A6.3 cliente: ninguna mención de lo corregido ni palabras vetadas${mal ? ` (aparece «${mal}»)` : ''}`)
  const api = await (await fetch(`${f.base}/api/contenido/analisis/${tres.id}`, { headers: { Cookie: f.cuentas.base } })).json()
  ok(api.integridad && !('retiradas' in api.integridad), `A6.4 la API no le manda retiradas al cliente (claves: ${Object.keys(api.integridad ?? {}).join(', ')})`)
  const apiAdmin = await (await fetch(`${f.base}/api/contenido/analisis/${tres.id}`, { headers: { Cookie: f.cuentas.admin } })).json()
  ok((apiAdmin.integridad?.retiradas?.length ?? 0) > 0, `admin sí las recibe (${apiAdmin.integridad?.retiradas?.length ?? 0})`)
  const adm = await pagina(f.cuentas.admin)
  await adm.goto(`${f.base}/admin/bandeja/${tres.id}`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 1000))
  const aviso = await adm.evaluate(() => document.body.innerText)
  ok(/Antes de aprobar: el verificador corrigió \d+ cifras?/.test(aviso), 'A6.4 admin: aviso antes de aprobar')
  // La pestaña se llama «Verificador» seguida del número de reconsultas («Verificador7»).
  const pest = await adm.$$('button')
  for (const x of pest) if (/^Verificador\d*$/.test((await x.evaluate((e) => e.textContent)).trim())) { await x.click(); break }
  await new Promise((x) => setTimeout(x, 600))
  const tabla = await adm.evaluate(() => document.body.innerText)
  if (OUT) await adm.screenshot({ path: `${OUT}/admin-verificador.png` })
  ok(/integridad · retiradas \d+/i.test(tabla) && /\bretirada\b/i.test(tabla), 'A6.4 admin: tabla de integridad con retiradas y motivo interno')
}
if (limpio) {
  await cli.goto(`${f.base}/analisis/${limpio.id}`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 1200))
  ok(!(await cli.$('.p-sobredatos')), `A6.2 informe limpio (${limpio.id}): el bloque no existe en el DOM`)
  const mal = (await cli.evaluate(() => document.body.innerText)).match(PROHIBIDAS)?.[0]
  ok(!mal, `A6.3 informe limpio sin palabras vetadas${mal ? ` (aparece «${mal}»)` : ''}`)
}
if (declarado) {
  const r = await fetch(`${f.base}/api/contenido/analisis/${declarado.id}`, { headers: { Cookie: f.cuentas.base } })
  ok(r.status === 404, `tenencia declarada (${declarado.id}): 404 para el cliente aunque esté aprobado`)
}
await b.close(); await f.parar()
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
