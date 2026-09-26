/* Matriz de acceso aplicada en el SERVIDOR, ruta por ruta.

   Para cada ruta de la API y cada uno de los cinco perfiles (visitante sin sesión,
   gratis, base, pro, admin) comprueba que el servidor deja pasar exactamente a
   quien la matriz dice, y a nadie más. La expectativa sale de `MATRIZ`
   (src/lib/matriz.ts), no de lo que el servidor contesta hoy.

   Además lee el código del servidor y falla si hay una ruta registrada que no
   está en la tabla de abajo: una ruta nueva no entra sin decidir quién la ve.

   Las rutas que escriben sólo se prueban con quien NO debe pasar: comprobar que
   un permitido pasa exigiría escribir.

   Uso: node scripts/probar-matriz.mjs   (con la vista previa en :5310). Sale con 1 si algo falla. */
import { readFileSync, readdirSync } from 'node:fs'


// La matriz, leída del mismo fichero que usan cliente y servidor.
const fuente = readFileSync('src/lib/matriz.ts', 'utf8')
const MATRIZ = Object.fromEntries([...fuente.matchAll(/'([a-z.]+)':\s*\[([^\]]*)\]/g)].map(([, s, roles]) => [s, roles.match(/'(\w+)'/g).map((r) => r.slice(1, -1))]))
if (Object.keys(MATRIZ).length < 10) { console.error('no pude leer MATRIZ de src/lib/matriz.ts'); process.exit(1) }


import { T } from './rutas-api.mjs'
import { BASE, PERFILES, ROL, cookiesDeTodos } from './sesiones.mjs'


/* ---------- 1. cobertura: toda ruta del código está en la tabla ---------- */
const montajes = {}
const idx = readFileSync('server/index.ts', 'utf8')
for (const [, pref, v] of idx.matchAll(/app\.route\('([^']+)',\s*(\w+)\)/g)) montajes[v] = pref
const registradas = []
for (const [, m, r] of idx.matchAll(/app\.(get|post|put|patch|delete)\('(\/api\/[^']+)'/g)) registradas.push(`${m.toUpperCase()} ${r}`)
for (const f of readdirSync('server').filter((x) => x.endsWith('.ts'))) {
  const s = readFileSync(`server/${f}`, 'utf8')
  for (const [, v, m, r] of s.matchAll(/^\s*(\w+)\.(get|post|put|patch|delete)\(\s*'([^']*)'/gm)) {
    if (v === 'app' || !montajes[v]) continue
    registradas.push(`${m.toUpperCase()} ${(montajes[v] + (r === '/' ? '' : r)).replace(/\/$/, '')}`)
  }
}
const enTabla = new Set(T.map(([m, r]) => `${m} ${r}`))
const sinDecidir = [...new Set(registradas)].filter((x) => !enTabla.has(x))
const fantasmas = [...enTabla].filter((x) => !registradas.includes(x))

/* ---------- 2. sesiones ---------- */
const cookies = await cookiesDeTodos()

/* ---------- 3. la prueba ---------- */
function debePasar(quien, perfil) {
  const rol = ROL[perfil], conSesion = perfil !== 'visitante'
  if (quien === 'todos') return true
  if (quien === 'sesion') return conSesion
  if (quien === 'admin') return rol === 'admin'
  if (quien === 'firma') return false
  const [sec, extra] = quien.slice(4).split('+')
  if (!MATRIZ[sec]) throw new Error(`sección desconocida en la tabla: ${sec}`)
  return MATRIZ[sec].includes(rol) && (extra !== 'sesion' || conSesion)
}
const rellenar = (r) => r.replace(/:(\w+)/g, (_, k) => (k === 'que' ? 'gemas' : k === 'accion' ? 'despublicar' : k === 'plan' ? 'base' : 'no-existe-prueba'))
const fallos = []
let comprobadas = 0, omitidas = 0
for (const [metodo, ruta, quien, modo] of T) {
  for (const perfil of Object.keys(PERFILES)) {
    const debe = debePasar(quien, perfil)
    if (modo === 'externa' || (modo === 'escribe' && debe)) { omitidas++; continue }
    const r = await fetch(BASE + rellenar(ruta), { method: metodo, redirect: 'manual', headers: { Cookie: cookies[perfil], 'Content-Type': 'application/json', Origin: BASE }, body: metodo === 'GET' ? undefined : '{}' })
    const paso = !(r.status === 401 || r.status === 403 || (quien === 'firma' && r.status >= 400))
    comprobadas++
    if (paso !== debe) fallos.push(`${metodo} ${ruta} · ${perfil}: ${debe ? 'debía pasar' : 'NO debía pasar'} y respondió ${r.status}`)
  }
}

console.log(`\nMATRIZ DE ACCESO EN EL SERVIDOR · ${T.length} rutas × 5 perfiles`)
console.log(`  comprobaciones: ${comprobadas} · omitidas (escriben o salen fuera): ${omitidas}`)
if (sinDecidir.length) console.log('  RUTAS SIN DECIDIR (están en el código y no en la tabla):\n    ' + sinDecidir.join('\n    '))
if (fantasmas.length) console.log('  en la tabla pero no en el código:\n    ' + fantasmas.join('\n    '))
for (const f of fallos) console.log('  ✗ ' + f)
const total = fallos.length + sinDecidir.length + fantasmas.length
console.log(`  TOTAL de fallos: ${total}\n`)
process.exit(total ? 1 : 0)
