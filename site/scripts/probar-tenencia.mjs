/* Tenencia declarada: ninguna moneda con posición del operador aparece en nada que
   vea un cliente (decisión de Pablo, 26-sep-2026).

   Lee la lista del motor (config/conflictos_interes.yaml) y, con los cuatro perfiles
   que no son admin, recorre:
   - toda ruta de lectura de la API (tabla de scripts/rutas-api.mjs), más el detalle de
     cada informe de una moneda declarada y las búsquedas por símbolo, id y contrato;
   - toda pantalla de cliente, más el detalle de esos informes.
   Falla si aparece el símbolo, el nombre, el id de CoinGecko o un contrato.

   Para no aprobar por no mirar, comprueba también que admin SÍ la ve: si ni admin la
   encuentra, la prueba no demostraría nada y también falla.

   Uso: node scripts/probar-tenencia.mjs   (con la vista previa en :5310). Sale con 1 si algo falla. */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'
import { T } from './rutas-api.mjs'
import { BASE, env, PERFILES, cookiesDeTodos } from './sesiones.mjs'

const RUTA = process.env.VETA_CONFLICTOS ?? resolve(env.VETA_BASE_CONTENIDO ?? '../datos-motor/base_contenido', '..', 'config', 'conflictos_interes.yaml')
if (!existsSync(RUTA)) { console.error(`\nTENENCIA · no existe la lista ${RUTA}: sin lista no se puede comprobar nada.\n`); process.exit(1) }

// Lectura independiente de la del servidor (server/tenencia.ts): dos lecturas que coinciden valen más que una.
const monedas = []
for (const linea of readFileSync(RUTA, 'utf8').split('\n')) {
  const raiz = linea.match(/^([A-Za-z0-9._-]+):\s*$/)
  if (raiz) { monedas.push({ simbolo: raiz[1].toUpperCase(), ids: [], contratos: [] }); continue }
  const m = monedas.at(-1); if (!m) continue
  const id = linea.match(/^\s+id_coingecko:\s*["']?([^"'\s]+)/); if (id) m.ids.push(id[1])
  const ct = linea.match(/^\s+-\s*["']?(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})["']?\s*$/); if (ct) m.contratos.push(ct[1])
}
if (!monedas.length) { console.error('\nTENENCIA · la lista está vacía: nada que comprobar.\n'); process.exit(1) }

// El nombre y los informes de cada moneda, de los datos que sirve la web.
const datos = env.VETA_DATOS ?? 'server/datos'
const registros = ['analisis', 'gemas', 'watchlist'].flatMap((f) => { try { return JSON.parse(readFileSync(`${datos}/${f}.json`, 'utf8')) } catch { return [] } })
for (const m of monedas) {
  const propios = registros.filter((r) => String(r.simbolo ?? '').toUpperCase() === m.simbolo)
  m.nombre = propios.find((r) => r.nombre)?.nombre ?? null
  m.informes = propios.filter((r) => r.tipo === 'analisis' || r.tipo === 'gema').map((r) => ({ id: r.id, tipo: r.tipo }))
}
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const patron = new RegExp(monedas.flatMap((m) => [`\\b${escapar(m.simbolo)}\\b`, m.nombre && `\\b${escapar(m.nombre)}\\b`, ...m.ids.map(escapar), ...m.contratos.map(escapar)].filter(Boolean)).join('|'), 'gi')
const encontrar = (t) => [...new Set((t.match(patron) || []).map((x) => x.toLowerCase()))]
// Un id de CoinGecko como «synapse-2» contiene el nombre: se reporta una vez.

const cookies = await cookiesDeTodos()
const clientes = Object.keys(PERFILES).filter((p) => p !== 'admin')
const fallos = []
let respuestas = 0, pantallas = 0

/* ---------- API ---------- */
const lecturas = T.filter(([m, , , modo]) => m === 'GET' && modo === 'lee').map(([, r]) => r).filter((r) => !r.startsWith('/api/admin'))
const concretas = []
for (const r of lecturas) {
  if (!r.includes(':')) { concretas.push(r); continue }
  if (r === '/api/contenido/exportar/:que') { for (const q of ['gemas', 'seguimiento', 'watchlist', 'analisis']) concretas.push(`/api/contenido/exportar/${q}`); continue }
  for (const m of monedas) for (const i of m.informes) concretas.push(r.replace(':id', i.id))
}
const busquedas = monedas.flatMap((m) => [m.simbolo, m.nombre, ...m.ids, ...m.contratos].filter(Boolean))
async function mirar(perfil, metodo, ruta, cuerpo) {
  const r = await fetch(BASE + ruta, { method: metodo, redirect: 'manual', headers: { Cookie: cookies[perfil], 'Content-Type': 'application/json', Origin: BASE }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  respuestas++
  // Repetir lo que escribió quien busca no revela nada: el eco de la consulta no cuenta.
  let t = (await r.text()).replace(/"(consulta|normalizada)":"[^"]*"/g, '')
  const q = cuerpo?.consulta ?? cuerpo?.simbolo
  // El eco de lo tecleado (la web lo devuelve en mayúsculas como «moneda» sin datos) tampoco.
  if (q) t = t.replace(new RegExp(`"${escapar(q)}"`, 'gi'), '""')
  return { estado: r.status, hallado: encontrar(t) }
}
for (const perfil of clientes) {
  for (const ruta of concretas) {
    if (/:\w+/.test(ruta)) continue
    const { estado, hallado } = await mirar(perfil, 'GET', ruta)
    if (hallado.length) fallos.push(`API ${perfil} GET ${ruta} (${estado}): ${hallado.join(', ')}`)
  }
  for (const q of busquedas) {
    for (const [ruta, cuerpo] of [['/api/analizar/resolver', { consulta: q }], ['/api/analizar/determinista', { simbolo: q }]]) {
      const { estado, hallado } = await mirar(perfil, 'POST', ruta, cuerpo)
      if (hallado.length) fallos.push(`API ${perfil} POST ${ruta} «${q}» (${estado}): ${hallado.join(', ')}`)
    }
  }
}
// Sensibilidad: admin tiene que verla en algún sitio.
let adminLaVe = false
for (const ruta of concretas) if (!/:\w+/.test(ruta) && (await mirar('admin', 'GET', ruta)).hallado.length) { adminLaVe = true; break }
if (!adminLaVe) fallos.push('admin tampoco la ve en ninguna ruta: la prueba no está mirando donde debe (¿datos locales sin la moneda?)')

/* ---------- pantallas ---------- */
const PANTALLAS = ['/', '/metodologia', '/nosotros', '/precios', '/noticias', '/gemas', '/seguimiento', '/analisis', '/watchlist', '/analizar', '/votacion', '/cuenta', '/piezas',
  ...monedas.flatMap((m) => m.informes.map((i) => `/${i.tipo === 'gema' ? 'gemas' : 'analisis'}/${i.id}`))]
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
for (const perfil of clientes) {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 1000 })
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  if (cookies[perfil]) await p.setCookie(...cookies[perfil].split('; ').map((c) => ({ name: c.slice(0, c.indexOf('=')), value: c.slice(c.indexOf('=') + 1), url: BASE })))
  for (const ruta of PANTALLAS) {
    await p.goto(BASE + ruta, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {})
    await new Promise((x) => setTimeout(x, 800))
    // En el detalle, el identificador que viene en la propia URL no cuenta: se quita antes de buscar.
    const t = (await p.evaluate(() => document.body.innerText)).split(ruta.split('/').pop()).join('')
    pantallas++
    const hallado = encontrar(t)
    if (hallado.length) fallos.push(`pantalla ${perfil} ${ruta}: ${hallado.join(', ')}`)
  }
  await ctx.close()
}
await b.close()

console.log(`\nTENENCIA DECLARADA · ${monedas.map((m) => `${m.simbolo}${m.nombre ? ' (' + m.nombre + ')' : ''}`).join(', ')} · lista ${RUTA}`)
console.log(`  perfiles: ${clientes.join(', ')} · respuestas de API: ${respuestas} · pantallas: ${pantallas} · admin la ve: ${adminLaVe ? 'sí' : 'NO'}`)
for (const f of fallos) console.log('  ✗ ' + f)
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
