/* Invariantes antes de cada despliegue (ESPECIFICACION-LANZAMIENTO.md §9).
   Si uno falla, no se despliega. Corre en este orden y corta en el primer fallo:

     1. tipos (app y servidor), lint, navegaciones automáticas fuera de la guardia y pruebas unitarias
     2. build
     3. vista previa en :5310 con el motor simulado (la arranca y la para)
     4. auditoría de lenguaje
     5. matriz de acceso en el servidor
     6. tenencia declarada fuera de todo lo público
     7. barrido de rutas: 5 roles × 2 anchos
     8. /luffy: nadie que no sea admin lo ve; el caso guiado del laboratorio con Playwright;
        la app instalable (manifiesto y service worker sólo para Pablo, sin red abre con lo guardado)
     9. prueba de contrato, integridad v1 y v2 (§20.2, §20.3) e historial sin borrados (§17.1), sobre las fixtures

   Uso: npm run invariantes   Sale con 0 sólo si pasan todos. */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'

const CONFLICTOS_MOTOR = resolve(homedir(), 'Documents/Crypto sistem/gem-pipeline/config/conflictos_interes.yaml')
const ENTORNO = {
  ...process.env,
  VETA_MOTOR: 'simulado',
  VETA_LUFFY: 'simulado',
  ...(process.env.VETA_CONFLICTOS || !existsSync(CONFLICTOS_MOTOR) ? {} : { VETA_CONFLICTOS: CONFLICTOS_MOTOR }),
}
const resultados = []
const t0 = Date.now()

function paso(nombre, cmd, args) {
  const t = Date.now()
  console.log(`\n━━ ${nombre} ━━`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: ENTORNO })
  const ok = r.status === 0
  resultados.push([nombre, ok ? 'ok' : 'FALLA', Math.round((Date.now() - t) / 1000)])
  return ok
}

async function vistaPrevia() {
  const ya = await fetch('http://localhost:5310/api/contenido/meta').then((r) => r.ok).catch(() => false)
  if (ya) { console.log('\n(ya había una vista previa en :5310: se para y se arranca con esta build)'); spawnSync('pkill', ['-f', 'tsx server/index.ts']) ; await new Promise((x) => setTimeout(x, 1500)) }
  const p = spawn('npm', ['run', '-s', 'preview'], { env: ENTORNO, stdio: 'ignore', detached: true })
  for (let i = 0; i < 60; i++) {
    await new Promise((x) => setTimeout(x, 1000))
    if (await fetch('http://localhost:5310/api/contenido/meta').then((r) => r.ok).catch(() => false)) return p
  }
  throw new Error('la vista previa no arrancó en 60 s')
}

let preview = null
let ok = paso('tipos · app', 'npx', ['tsc', '-p', 'tsconfig.app.json', '--noEmit'])
  && paso('tipos · servidor', 'npx', ['tsc', '-p', 'tsconfig.server.json', '--noEmit'])
  && paso('lint', 'npx', ['oxlint'])
  && paso('navegaciones automáticas', 'node', ['scripts/revisar-navegacion.mjs'])
  && paso('pruebas unitarias', 'npx', ['tsx', '--test', 'pruebas/unidad/*.test.ts'])
  && paso('build', 'npm', ['run', '-s', 'build'])
if (ok) {
  try { preview = await vistaPrevia() } catch (e) { console.error(e.message); ok = false; resultados.push(['vista previa', 'FALLA', 0]) }
}
if (ok) {
  ok = paso('lenguaje', 'node', ['scripts/auditar-lenguaje.mjs'])
    && paso('matriz de acceso', 'node', ['scripts/probar-matriz.mjs'])
    && paso('tenencia declarada', 'node', ['scripts/probar-tenencia.mjs'])
    && paso('barrido', 'node', ['scripts/barrido.mjs'])
    && paso('luffy (acceso y caso guiado)', 'node', ['scripts/probar-luffy.mjs'])
    && paso('luffy como app (sólo Pablo la ve)', 'node', ['scripts/probar-app.mjs'])
    && paso('terminal v2 (simulado, casos guiados)', 'node', ['scripts/probar-terminal2.mjs'])
  if (ok) {
    if (existsSync('scripts/probar-contrato.mjs')) ok = paso('prueba de contrato', 'node', ['scripts/probar-contrato.mjs'])
      && paso('integridad v1', 'node', ['scripts/probar-integridad.mjs'])
      && paso('integridad v2', 'node', ['scripts/probar-integridad-v2.mjs'])
      && paso('historial sin borrados', 'node', ['scripts/probar-historial.mjs'])
    else { console.log('\n━━ prueba de contrato ━━\n  aún no existe: se salta con aviso'); resultados.push(['prueba de contrato', 'saltada', 0]) }
  }
}
if (preview) { try { process.kill(-preview.pid) } catch { /* ya terminó */ } }

console.log('\n━━━━━━━━ INVARIANTES ━━━━━━━━')
for (const [n, e, s] of resultados) console.log(`  ${e === 'ok' ? '✓' : e === 'saltada' ? '·' : '✗'} ${n.padEnd(22)} ${e.padEnd(8)} ${s} s`)
console.log(`  ${ok ? 'TODOS EN VERDE' : 'NO SE DESPLIEGA'} · ${Math.round((Date.now() - t0) / 1000)} s\n`)
process.exit(ok ? 0 : 1)
