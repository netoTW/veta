/* Combustible · sólo admin (ESPECIFICACION-LANZAMIENTO.md §10).
   A10.1 · el panel sale en admin y no existe para ningún otro rol, ni en el DOM ni en la API.
   A10.2 · con hay_combustible: false, el panel enseña el motivo.
   Sobre el VETA de fixtures, con una copia de las fixtures donde una trae combustible vacío.
   Uso: node scripts/probar-combustible.mjs [capturas]   Sale con 1 si algo falla. */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? null
const ORIGEN = process.env.VETA_FIXTURES ?? join(process.env.HOME, 'Documents/Crypto sistem/gem-pipeline/base_contenido/fixtures-contrato')
const copia = mkdtempSync(join(tmpdir(), 'veta-fix-comb-'))
let vacio = null
for (const f of readdirSync(ORIGEN).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(ORIGEN, f), 'utf8'))
  if (!vacio && d.id && !d.solo_admin && d.combustible && !d.motivo_sin_tesis_cliente) {
    d.combustible = { ...d.combustible, hay_combustible: false, motivo_ausencia: 'sin perpetuo en los mercados consultados (prueba)' }
    vacio = d.id
  }
  writeFileSync(join(copia, f), JSON.stringify(d))
}
process.env.VETA_FIXTURES = copia
const { arrancarFixtures } = await import('./servir-fixtures.mjs')
const f = await arrancarFixtures()
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }
const conComb = f.fixtures.find((x) => !x.registro.solo_admin && x.registro.combustible?.hay_combustible)?.registro
console.log(`\nCOMBUSTIBLE · con combustible ${conComb?.id} · sin combustible ${vacio}`)

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
async function ver(cookie, id) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
  await p.goto(f.base + '/', { waitUntil: 'domcontentloaded' })
  if (cookie) await p.setCookie(...cookie.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: f.base })))
  await p.goto(`${f.base}/analisis/${id}`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 1200))
  return p
}
const adm = await ver(f.cuentas.admin, conComb.id)
const panel = await adm.$eval('.a-comb', (e) => e.innerText).catch(() => '')
if (OUT) { await adm.$eval('.a-comb', (e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await adm.screenshot({ path: `${OUT}/combustible-admin.png` }) }
ok(/combustible · sólo admin/i.test(panel) && /nocional largo/i.test(panel), 'A10.1 admin ve el panel con los nocionales')
for (const [perfil, cookie] of [['visitante', ''], ['base', f.cuentas.base], ['pro', f.cuentas.pro]]) {
  const p = await ver(cookie, conComb.id)
  const enDom = !!(await p.$('.a-comb')) || /combustible/i.test(await p.evaluate(() => document.body.innerText))
  const detalle = await (await fetch(`${f.base}/api/contenido/analisis/${conComb.id}`, { headers: cookie ? { Cookie: cookie } : {} })).text()
  const lista = await (await fetch(`${f.base}/api/contenido/analisis`, { headers: cookie ? { Cookie: cookie } : {} })).text()
  ok(!enDom && !/combustible/i.test(detalle) && !/combustible/i.test(lista), `A10.1 ${perfil}: ni en el DOM ni en la API (detalle y lista)`)
}
const sin = await ver(f.cuentas.admin, vacio)
const t = await sin.$eval('.a-comb', (e) => e.innerText).catch(() => '')
ok(/sin combustible medible/i.test(t) && /sin perpetuo en los mercados consultados/.test(t), 'A10.2 hay_combustible: false → el panel enseña el motivo')
await b.close(); await f.parar(); rmSync(copia, { recursive: true, force: true })
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
