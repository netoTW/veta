/* Tiempos de respuesta de las rutas de contenido (ESPECIFICACION-LANZAMIENTO.md §3).

   node scripts/medir.mjs [--base URL] [--n 50] [--cookie "a=b; c=d"] [--frio SEGUNDOS] [--salida fichero.json]

   - Pide cada ruta N veces en serie y da p50, p95 y máximo, más el tamaño.
   - Con --frio, antes de la tanda espera ese tiempo sin tráfico propio y mide
     aparte la PRIMERA petición de cada ruta (la que pagaba abrir conexión).
   - «neto» = p95 de la ruta − p95 de /api/contenido/meta, que no toca la base:
     así la red de quien mide no se le cuenta a la aplicación.

   Objetivos (A3.1 en el VPS contra localhost, A3.2 desde fuera):
     en el VPS:    p95 ≤ 50 ms en cada ruta, con y sin sesión, y la primera tras 10 min
     desde fuera:  p95 de cada ruta ≤ p95 de /meta + 250 ms
     tamaño:       /api/contenido/analisis ≤ 40 KB sin comprimir */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('base', 'http://localhost:8790')
const N = Number(arg('n', 50))
const COOKIE = arg('cookie', '')
const FRIO = Number(arg('frio', 0))
const SALIDA = arg('salida', null)
const RUTAS = ['/api/contenido/meta', '/api/contenido/analisis', '/api/contenido/gemas', '/api/contenido/seguimiento', '/api/contenido/noticias', '/api/contenido/marcador']

async function una(ruta) {
  const t = performance.now()
  const r = await fetch(BASE + ruta, { headers: COOKIE ? { Cookie: COOKIE } : {} })
  const cuerpo = await r.arrayBuffer()
  return { ms: performance.now() - t, estado: r.status, bytes: cuerpo.byteLength }
}
const pct = (xs, p) => { const o = [...xs].sort((a, b) => a - b); return o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)] }

const primera = {}
if (FRIO) {
  console.log(`esperando ${FRIO} s sin tráfico propio…`)
  await new Promise((x) => setTimeout(x, FRIO * 1000))
  for (const r of RUTAS) primera[r] = await una(r)
}
const res = {}
for (const r of RUTAS) {
  await una(r) // una de calentamiento que no cuenta
  const ms = []; let estado = 0, bytes = 0
  for (let i = 0; i < N; i++) { const x = await una(r); ms.push(x.ms); estado = x.estado; bytes = x.bytes }
  res[r] = { estado, bytes, p50: Math.round(pct(ms, 50)), p95: Math.round(pct(ms, 95)), max: Math.round(Math.max(...ms)), primera: primera[r] ? Math.round(primera[r].ms) : null }
}
const suelo = res['/api/contenido/meta'].p95
console.log(`\nTIEMPOS · ${BASE} · ${N} peticiones por ruta${COOKIE ? ' · con sesión' : ' · sin sesión'}${FRIO ? ` · primera tras ${FRIO} s` : ''}`)
console.log('  ruta                          estado     KB   p50   p95   máx  neto' + (FRIO ? '  primera' : ''))
for (const [r, x] of Object.entries(res)) {
  console.log(`  ${r.padEnd(30)} ${String(x.estado).padStart(5)} ${(x.bytes / 1024).toFixed(1).padStart(6)} ${String(x.p50).padStart(5)} ${String(x.p95).padStart(5)} ${String(x.max).padStart(5)} ${String(x.p95 - suelo).padStart(5)}` + (FRIO ? ` ${String(x.primera).padStart(8)}` : ''))
}
if (SALIDA) {
  mkdirSync(dirname(SALIDA), { recursive: true })
  writeFileSync(SALIDA, JSON.stringify({ base: BASE, n: N, con_sesion: !!COOKIE, frio_s: FRIO, medido_en: new Date().toISOString(), rutas: res }, null, 2))
  console.log(`\n  guardado en ${SALIDA}`)
}
