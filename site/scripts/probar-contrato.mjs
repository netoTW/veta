/* Prueba de contrato (ESPECIFICACION-LANZAMIENTO.md §8, contrato §23).

   Con las exportaciones reales del motor (base_contenido/fixtures-contrato) servidas en
   un VETA de pruebas, recorre las pantallas de cliente de cada registro y comprueba:

   1. VALOR · cada cifra marcada con data-cifra se lee del REGISTRO por su ruta y se
      formatea con una implementación escrita aquí mismo desde la tabla de §23 —no con
      el formateador de la web—: valor, unidad, redondeo y signo tienen que coincidir.
   2. FORMA · todo número visible, marcado o no (prosa del motor incluida), cumple §23:
      coma decimal, miles y unidad con espacio fino duro, «−», fechas «26 sep 2026».

   Uso: node scripts/probar-contrato.mjs   Sale con 1 si hay una sola discrepancia. */
import puppeteer from 'puppeteer-core'
import { arrancarFixtures } from './servir-fixtures.mjs'

/* ---------- §23, reescrito desde la tabla del contrato ---------- */
const F = ' '
const miles = (e) => e.replace(/\B(?=(\d{3})+(?!\d))/g, F)
const numero = (v, dec) => { const [e, d] = Math.abs(v).toFixed(dec).split('.'); return (v < 0 ? '−' : '') + miles(e) + (d ? ',' + d : '') }
function segun23(v, u, c) {
  if (u === 'USD') return c === 'precio' ? numero(v, v >= 100 ? 0 : v >= 1 ? 2 : v >= 0.01 ? 4 : 6) + F + 'USD' : numero(v, 0) + F + 'USD'
  if (u === '%') { const s = numero(v, 1) + F + '%'; return c === 'variacion' && v > 0 ? '+' + s : s }
  if (u === '×') return numero(v, 2) + '×'
  if (u === 'p') return 'p' + numero(v, 0)
  const s = numero(v, 0); return c === 'variacion' && v > 0 ? '+' + s : s
}
/* Lo que §23 no admite en una pantalla de cliente. */
const FORMA = [
  ['decimal o miles con punto', /(?<![\d.\w])\d+\.\d+(?![\d.])/g],
  ['% sin espacio fino duro', /\d(?:%|[  ]%)/g],
  ['USD sin espacio fino duro', /\d(?:USD|[  ]USD)/g],
  ['miles con coma', /\d{1,3}(?:,\d{3}){2,}(?!\d)/g],
  ['negativo con guion', /(?:^|[\s(])-\d/g],
  ['fecha ISO', /\b\d{4}-\d{2}-\d{2}\b/g],
]

const leerRuta = (o, ruta) => ruta.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o)

const f = await arrancarFixtures()
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const discrepancias = []
const porPantalla = []
const publicables = f.fixtures.filter((x) => !x.registro.solo_admin && !x.registro.conflicto_interes?.hay)

for (const [perfil, cookie] of [['visitante', ''], ['base', f.cuentas.base]]) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 1000 })
  await p.goto(f.base + '/', { waitUntil: 'domcontentloaded' })
  if (cookie) await p.setCookie(...cookie.split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: f.base })))
  const pantallas = [['/analisis', null], ...publicables.map((x) => [`/analisis/${x.registro.id}`, x.registro])]
  for (const [ruta, reg] of pantallas) {
    await p.goto(f.base + ruta, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
    await new Promise((x) => setTimeout(x, 1200))
    // Se abren los plegados: lo que el cliente puede ver con un clic también cuenta.
    await p.$$eval('details', (ds) => ds.forEach((d) => { d.open = true })).catch(() => {})
    await new Promise((x) => setTimeout(x, 400))
    const marcadas = await p.$$eval('[data-cifra]', (es) => es.map((e) => ({ campo: e.dataset.cifra, valor: e.dataset.valor, unidad: e.dataset.unidad, contexto: e.dataset.contexto, texto: e.textContent })))
    let valor = 0
    for (const m of marcadas) {
      // En la lista hay varios registros: se busca el que tiene ese valor en esa ruta.
      const candidatos = reg ? [reg] : publicables.map((x) => x.registro)
      const crudo = candidatos.map((r) => leerRuta(r, m.campo)).find((v) => typeof v === 'number' && String(v) === m.valor)
      if (crudo === undefined) { discrepancias.push(`${perfil} ${ruta} · ${m.campo}: el valor pintado (${m.valor}) no está en el registro`); continue }
      const esperado = segun23(crudo, m.unidad, m.contexto)
      valor++
      if (m.texto !== esperado) discrepancias.push(`${perfil} ${ruta} · ${m.campo}: «${m.texto}» y §23 dice «${esperado}»`)
    }
    const texto = await p.evaluate(() => document.body.innerText)
    let forma = 0
    for (const [nombre, re] of FORMA) for (const x of texto.matchAll(re)) {
      const i = x.index ?? 0
      forma++
      discrepancias.push(`${perfil} ${ruta} · forma (${nombre}): …${texto.slice(Math.max(0, i - 40), i + 30).replace(/\n/g, ' ')}…`)
    }
    const numeros = (texto.match(/\d[\d .,]*/g) || []).length
    porPantalla.push([perfil, ruta, valor, numeros, forma])
  }
}
await b.close(); await f.parar()

console.log(`\nPRUEBA DE CONTRATO · ${publicables.length} registros del motor (${f.fixtures.length} en fixtures-contrato)`)
console.log('  perfil     pantalla                                  cifras por valor · números vistos · fallos de forma')
for (const [perfil, ruta, v, n, fo] of porPantalla) console.log(`  ${perfil.padEnd(10)} ${ruta.padEnd(42)} ${String(v).padStart(4)} · ${String(n).padStart(5)} · ${fo}`)
for (const d of discrepancias.slice(0, 60)) console.log('  ✗ ' + d)
if (discrepancias.length > 60) console.log(`  … y ${discrepancias.length - 60} más`)
console.log(`  TOTAL de discrepancias: ${discrepancias.length}\n`)
process.exit(discrepancias.length ? 1 : 0)
