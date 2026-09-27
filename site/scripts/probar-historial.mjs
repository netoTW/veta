/* Historial sin borrados (contrato §17.1, ESPECIFICACION-SENALES.md D1 y B2.1).

   Sobre el VETA de fixtures, con tres gemas sintéticas hechas de un registro real:
     VIVA      publicada después del lanzamiento, en seguimiento
     RETIRADA  publicada después del lanzamiento y retirada: tiene que QUEDARSE, con el
               resultado congelado, la fecha y el motivo
     ARCHIVO   publicada antes del lanzamiento: calibración, fuera del historial público
   Comprueba la API de seguimiento y del marcador, la pantalla /seguimiento y el invariante:
   filas del historial == gemas en gema_publica desde el lanzamiento (sin tenencia declarada).

   Uso: node scripts/probar-historial.mjs [capturas]   Sale con 1 si algo falla. */
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] ?? null
const LANZAMIENTO = process.env.VETA_LANZAMIENTO ?? '2026-09-27'
const ORIGEN = process.env.VETA_FIXTURES ?? join(process.env.HOME, 'Documents/Crypto sistem/gem-pipeline/base_contenido/fixtures-contrato')
const copia = mkdtempSync(join(tmpdir(), 'veta-fix-hist-'))
const base = readdirSync(ORIGEN).filter((x) => x.endsWith('.json') && x !== 'indice.json').map((f) => JSON.parse(readFileSync(join(ORIGEN, f), 'utf8'))).find((d) => d.id && !d.solo_admin && !d.conflicto_interes?.hay)
const gema = (id, extra = {}) => ({ ...structuredClone(base), id, tipo: 'gema', simbolo: id.split('-')[0], nombre: id.split('-')[0], estado_seguimiento: 'activo', ...extra })
const G = {
  viva: gema('VIVA-20260928-000001'),
  retirada: gema('RETIRADA-20260928-000002', { estado_seguimiento: 'retirado', retirada_en: '2026-10-03', motivo_retiro: 'La regla de invalidación no tenía margen sobre el valor de hoy.' }),
  archivo: gema('ARCHIVO-20260919-000003'),
}
for (const g of Object.values(G)) writeFileSync(join(copia, `${g.id}.json`), JSON.stringify(g))
process.env.VETA_FIXTURES = copia
const { arrancarFixtures } = await import('./servir-fixtures.mjs')
const f = await arrancarFixtures()
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }

// El seguimiento del motor: la retirada conserva su última fila (la del día del retiro).
const fila = (g, fecha, retorno, dias) => ({ id: `${g.id}:${fecha}`, tipo: 'seguimiento_diario', version_motor: 'x', version_registro: 1, escrito_en: fecha, gema_id: g.id, fecha, precio: 1, retorno_desde_publicacion: retorno, estado_tesis: 'INTACTA', invalidacion_activada: false, invalidacion_fecha: '', catalizador_estado: 'pendiente', dias_al_cierre: dias, benchmark_canasta: 0.01, benchmark_regla_simple: 0.0, nota: '' })
const seg = { ultimo: [fila(G.viva, '2026-10-05', 0.084, 40), fila(G.retirada, '2026-10-03', -0.121, 30), fila(G.archivo, '2026-10-05', 0.2, 20)], historial: [] }
writeFileSync(join(f.carpeta, 'datos', 'seguimiento.json'), JSON.stringify(seg))
// Lo que el público vio y cuándo: gema_publica (la web lo marca cuando ocurre).
const Database = createRequire(import.meta.url)('better-sqlite3')
const db = new Database(join(f.carpeta, 'veta.sqlite'))
const ins = db.prepare('INSERT INTO gema_publica (informe_id, desde, reclasificada_en) VALUES (?, ?, NULL) ON CONFLICT(informe_id) DO NOTHING')
ins.run(G.viva.id, '2026-09-28T10:00:00Z'); ins.run(G.retirada.id, '2026-09-28T11:00:00Z'); ins.run(G.archivo.id, '2026-09-19T10:00:00Z')
const enPublica = db.prepare('SELECT COUNT(*) n FROM gema_publica WHERE substr(desde, 1, 10) >= ?').get(LANZAMIENTO).n
db.close()
console.log(`\nHISTORIAL · lanzamiento ${LANZAMIENTO} · esperando a que la memoria se refresque (≤ 60 s)…`)
await new Promise((x) => setTimeout(x, 62_000))

const get = async (ruta, cookie) => (await fetch(`${f.base}${ruta}`, { headers: cookie ? { Cookie: cookie } : {} })).json()
const s = await get('/api/contenido/seguimiento', f.cuentas.pro)
const ids = (s.ultimo ?? []).map((x) => x.gema_id)
const ret = (s.ultimo ?? []).find((x) => x.gema_id === G.retirada.id)
ok(ids.includes(G.viva.id) && ids.includes(G.retirada.id), 'la viva y la retirada están en el seguimiento público')
ok(ret?.retirada_en === '2026-10-03' && /margen/.test(ret?.motivo_retiro ?? '') && ret?.retorno_desde_publicacion === -0.121, 'la retirada trae su fecha, su motivo y su resultado congelado (−12,1 %)')
ok(!ids.includes(G.archivo.id), 'la de antes del lanzamiento queda archivada (fuera del historial público)')
const m = await get('/api/contenido/marcador', '')
const mr = (m.gemas ?? []).find((x) => x.gema_id === G.retirada.id)
console.log('    marcador de la retirada:', JSON.stringify(mr)); ok(mr?.cerrada === true && mr?.retirada?.en === '2026-10-03' && !(m.gemas ?? []).some((x) => x.gema_id === G.archivo.id), `marcador público: la retirada cuenta como cerrada; ${m.vivas} viva(s), ${m.cerradas} cerrada(s)`)
ok((m.gemas ?? []).length === enPublica, `B2.1 · filas del historial (${(m.gemas ?? []).length}) == gemas publicadas desde el lanzamiento (${enPublica})`)

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
await p.goto(f.base + '/', { waitUntil: 'domcontentloaded' })
await p.setCookie(...f.cuentas.pro.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: f.base })))
await p.goto(`${f.base}/seguimiento`, { waitUntil: 'networkidle0' }); await new Promise((x) => setTimeout(x, 1500))
const t = await p.evaluate(() => document.body.innerText)
if (OUT) { await p.$eval('.p-seg__card--retirada', (e) => e.scrollIntoView({ block: 'center' })).catch(() => {}); await p.screenshot({ path: `${OUT}/historial-retirada.png` }) }
ok(/Retirada del seguimiento el 3 oct 2026/i.test(t) && /congelado el día del retiro/.test(t) && !/Registro sin gema/.test(t), 'pantalla /seguimiento: la retirada se ve con su fecha y su resultado congelado')
ok(!/ARCHIVO/.test(t), 'pantalla /seguimiento: la archivada no aparece')
await b.close(); await f.parar(); rmSync(copia, { recursive: true, force: true })
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
