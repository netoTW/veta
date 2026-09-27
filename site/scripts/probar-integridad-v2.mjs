/* Integridad v2 (contrato §20.3) conviviendo con la v1 (§20.2).

   Sirve las fixtures del motor más una copia v2 del registro de las tres integridades
   (id propio), con marcas ⟦nd:<cifra_id>⟧ en la lectura, los riesgos y un catalizador,
   `integridad.version: 2`, `no_disponibles` con cifra_id (uno marcado en la prosa, otro no),
   `retiradas` v2 y `reconciliadas`. Comprueba:
   - v2 · el cliente lee «dato no disponible» en su frase, con el motivo; ninguna marca ni
     cifra_id crudos; la frase no se cae; la línea final sólo nombra lo no marcado;
   - v2 · la API no manda `retiradas` ni `reconciliadas` a quien no es admin; admin ve las dos;
   - v1 · el registro viejo se sigue viendo como antes.

   Uso: node scripts/probar-integridad-v2.mjs [capturas]   Sale con 1 si algo falla. */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? null
const ORIGEN = process.env.VETA_FIXTURES ?? join(process.env.HOME, 'Documents/Crypto sistem/gem-pipeline/base_contenido/fixtures-contrato')
const copia = mkdtempSync(join(tmpdir(), 'veta-fix-v2-'))
let v1 = null, v2 = null
for (const f of readdirSync(ORIGEN).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(ORIGEN, f), 'utf8'))
  writeFileSync(join(copia, f), JSON.stringify(d))
  if (d.id && !d.solo_admin && (d.integridad?.retiradas?.length ?? 0) > 0 && !v1) {
    v1 = d.id
    const n = structuredClone(d)
    n.id = d.id + '-V2'
    n.informe_cliente = { ...(n.informe_cliente ?? {}),
      lectura: { ...(n.informe_cliente?.lectura ?? {}), parrafos: ['Los holders cobran ⟦nd:c:dl_revenue_holders_30d⟧ al mes y el Senado tiene ⟦nd:x:3⟧ votos de cloture.'] },
      riesgos: ['Si la votación no llega a ⟦nd:x:3⟧ votos, el catalizador se aplaza.'] }
    n.ficha_esencial.catalizadores = ['Votación de cloture con ⟦nd:x:3⟧ votos a favor.', ...(n.ficha_esencial.catalizadores ?? []).slice(1)]
    n.integridad = {
      version: 2,
      no_disponibles: [
        { cifra_id: 'x:3', que: 'votos de cloture en el Senado', motivo_cliente: 'no pudimos confirmar este dato en su fuente original, así que no lo usamos' },
        { cifra_id: 'c:dl_revenue_holders_30d', que: 'ingresos que llegan a los holders', motivo_cliente: 'la fuente no respondió a tiempo' },
        { cifra_id: 'c:dl_tvl_usd', que: 'fondos depositados', motivo_cliente: 'la fuente no respondió a tiempo' },
      ],
      retiradas: [{ cifra_id: 'x:3', seccion: 'tesis_oportunidad', veredicto: 'no_verificable', motivo_interno: 'sin URL que lo sostenga' }],
      reconciliadas: [{ cifra_id: 'c:dl_revenue_protocolo_30d', valor_anterior: 3521905.94, valor_fuente: 7900000, fuente_url: 'https://defillama.com/protocol/ethena-usde' }],
      sin_verificar: d.integridad?.sin_verificar ?? [],
    }
    v2 = n.id
    writeFileSync(join(copia, f.replace('.json', '-v2.json')), JSON.stringify(n))
  }
}
process.env.VETA_FIXTURES = copia
const { arrancarFixtures } = await import('./servir-fixtures.mjs')
const fx = await arrancarFixtures()
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }
console.log(`\nINTEGRIDAD v2 · v2 ${v2} · v1 ${v1}`)

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
async function ver(cookie, id) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
  await p.goto(fx.base + '/', { waitUntil: 'domcontentloaded' })
  if (cookie) await p.setCookie(...cookie.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: fx.base })))
  await p.goto(`${fx.base}/analisis/${id}`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 1200))
  return p
}
const cli = await ver(fx.cuentas.base, v2)
const texto = await cli.evaluate(() => document.body.innerText)
const huecos = await cli.$$eval('.p-nd', (es) => es.map((e) => ({ t: e.textContent, motivo: e.getAttribute('title') })))
const bloque = await cli.$eval('.p-sobredatos', (e) => e.innerText).catch(() => '')
if (OUT) { await cli.$eval('.p-nd', (e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await cli.screenshot({ path: `${OUT}/v2-cliente.png` }) }
ok(/Los holders cobran dato no disponible al mes y el Senado tiene dato no disponible votos de cloture/.test(texto), 'v2 · la frase sigue y la cifra retirada se lee «dato no disponible»')
ok(huecos.length >= 3 && huecos.every((h) => h.t === 'dato no disponible') && huecos.some((h) => /no pudimos confirmar/i.test(h.motivo ?? '')), `v2 · ${huecos.length} huecos marcados en la prosa, con su motivo al pasar el ratón`)
ok(/Votación de cloture con dato no disponible votos a favor/.test(texto), 'v2 · también en un catalizador (texto sin nota)')
ok(!/⟦|⟧|x:3|c:dl_|dl_revenue|dl_tvl/.test(texto), 'v2 · ninguna marca ni cifra_id crudos en pantalla')
ok(/No entra en este informe: fondos depositados\./.test(bloque) && !/votos de cloture|holders/.test(bloque), `v2 · la línea final sólo nombra lo no marcado en la prosa («${bloque.split('\n').pop()}»)`)
const api = await (await fetch(`${fx.base}/api/contenido/analisis/${v2}`, { headers: { Cookie: fx.cuentas.base } })).json()
ok(api.integridad?.version === 2 && !('retiradas' in api.integridad) && !('reconciliadas' in api.integridad), `v2 · la API del cliente no trae retiradas ni reconciliadas (claves: ${Object.keys(api.integridad ?? {}).join(', ')})`)
const apiAdm = await (await fetch(`${fx.base}/api/contenido/analisis/${v2}`, { headers: { Cookie: fx.cuentas.admin } })).json()
ok(apiAdm.integridad?.retiradas?.length === 1 && apiAdm.integridad?.reconciliadas?.length === 1, 'v2 · admin recibe retiradas y reconciliadas')
const adm = await (await b.createBrowserContext()).newPage(); await adm.setViewport({ width: 1440, height: 1000 })
await adm.goto(fx.base + '/', { waitUntil: 'domcontentloaded' })
await adm.setCookie(...fx.cuentas.admin.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: fx.base })))
await adm.goto(`${fx.base}/admin/bandeja/${v2}`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 800))
for (const x of await adm.$$('button')) if (/^Verificador\d*$/.test((await x.evaluate((e) => e.textContent)).trim())) { await x.click(); break }
await new Promise((x) => setTimeout(x, 600))
const tabla = await adm.evaluate(() => document.body.innerText)
if (OUT) await adm.screenshot({ path: `${OUT}/v2-admin.png` })
ok(/integridad v2/i.test(tabla) && /reconciliada/i.test(tabla) && /no_verificable/i.test(tabla), 'v2 · admin ve la tabla con versión, veredicto y reconciliada')
const viejo = await ver(fx.cuentas.base, v1)
const tv1 = await viejo.evaluate(() => document.body.innerText)
const bv1 = await viejo.$eval('.p-sobredatos', (e) => e.innerText).catch(() => '')
ok(/sin verificar:/i.test(bv1) && /No entra en este informe:/.test(bv1) && !/dato no disponible|⟦/.test(tv1), 'v1 · el registro viejo se ve como antes')
await b.close(); await fx.parar(); rmSync(copia, { recursive: true, force: true })
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
