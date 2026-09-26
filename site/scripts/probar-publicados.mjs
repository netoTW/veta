/* publicados-web.json: la bandeja manda y el motor se entera (ESPECIFICACION-LANZAMIENTO.md §7).

   A7.1 · aprobar y despublicar en la vista previa reescriben el fichero en menos de 1 s,
          con la secuencia + 1 cada vez, y el informe entra y sale.
   A7.2 · un proceso que reescribe el fichero sin parar, matado 30 veces a destiempo,
          nunca deja un fichero a medias: siempre se lee JSON válido.

   Sólo contra la vista previa local (escribe decisiones en la base local).
   Uso: node scripts/probar-publicados.mjs   Sale con 1 si algo falla. */
import { readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { BASE, env, entrar } from './sesiones.mjs'

const RUTA = resolve(env.VETA_BASE_CONTENIDO ?? '../datos-motor/base_contenido', 'publicados-web.json')
const leer = () => JSON.parse(readFileSync(RUTA, 'utf8'))
const fallos = []
const ok = (c, t) => { console.log(`  ${c ? '✓' : '✗'} ${t}`); if (!c) fallos.push(t) }

console.log(`\nPUBLICADOS-WEB · ${RUTA}`)
ok(existsSync(RUTA), 'el fichero existe tras arrancar')
const admin = await entrar(env.VETA_ADMIN_EMAIL)
const pedir = (ruta, cuerpo) => fetch(BASE + ruta, { method: cuerpo ? 'POST' : 'GET', headers: { Cookie: admin, 'Content-Type': 'application/json', Origin: BASE }, body: cuerpo ? JSON.stringify(cuerpo) : undefined }).then((r) => r.json())

// Un informe pendiente de la bandeja, que no esté publicado.
const bandeja = await pedir('/api/admin/bandeja')
const filas = (bandeja.filas ?? bandeja.informes ?? bandeja).filter?.((f) => (f.publicacion?.estado ?? f.estado) === 'pendiente') ?? []
const elegido = filas[0]
ok(!!elegido, `hay un pendiente en la bandeja para probar (${elegido?.id ?? '—'})`)
if (elegido) {
  const id = elegido.id, tipo = elegido.tipo
  for (const [accion, debeEstar] of [['aprobar', true], ['despublicar', false]]) {
    const s0 = leer().secuencia
    const t = Date.now()
    await pedir(`/api/admin/bandeja/${id}/decision`, { accion, tipo })
    let d = leer()
    while (d.secuencia === s0 && Date.now() - t < 1000) { await new Promise((x) => setTimeout(x, 20)); d = leer() }
    const ms = Date.now() - t
    const esta = d.informes.some((i) => i.id === id && i.tipo === tipo)
    ok(d.secuencia === s0 + 1 && ms < 1000 && esta === debeEstar, `${accion}: secuencia ${s0} → ${d.secuencia} en ${ms} ms · ${id} ${esta ? 'está' : 'no está'} en informes`)
  }
}

// A7.2: matar a destiempo al que escribe.
const escritor = `
  import { escribirPublicados } from './server/contenido.ts'
  for (;;) await escribirPublicados('decision')
`
let validas = 0
for (let i = 0; i < 30; i++) {
  // Node directo con el cargador de tsx: matar a npx dejaría vivo al proceso que escribe.
  const p = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', escritor], { stdio: 'ignore', env: { ...process.env, VETA_MOTOR: 'simulado' } })
  await new Promise((x) => setTimeout(x, 1500 + Math.random() * 1500))
  p.kill('SIGKILL')
  await new Promise((x) => setTimeout(x, 100))
  try { const d = leer(); if (Array.isArray(d.informes) && Number.isInteger(d.secuencia)) validas++ } catch { /* a medias */ }
}
ok(validas === 30, `A7.2 · 30 muertes a destiempo del proceso que escribe: ${validas}/30 lecturas válidas`)
console.log(`  TOTAL de fallos: ${fallos.length}\n`)
process.exit(fallos.length ? 1 : 0)
