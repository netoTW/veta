/* Un VETA de pruebas servido con las exportaciones reales del motor como único contenido
   (base_contenido/fixtures-contrato). Lo usan la prueba de contrato (§8) y la de datos
   incompletos (§6).

   - Carpeta temporal con los datos de server/datos, pero con los análisis y gemas
     sustituidos por las fixtures; base SQLite temporal (no toca la local).
   - La API en :5320 sirviendo dist/, con el motor simulado y sin sincronizar.
   - Aprueba cada fixture desde la bandeja, como admin: así el cliente la ve
     exactamente como vería un informe publicado. Las de moneda con tenencia
     declarada se aprueban también, y aun así no deben verse (§19).

   Uso como módulo:  const f = await arrancarFixtures(); … ; await f.parar()
   Uso suelto:       node scripts/servir-fixtures.mjs   (queda sirviendo hasta Ctrl-C) */
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { env } from './sesiones.mjs'

export const PUERTO = 5320
export const BASE_FIX = `http://localhost:${PUERTO}`
export const CARPETA_FIX = process.env.VETA_FIXTURES ?? resolve(homedir(), 'Documents/Crypto sistem/gem-pipeline/base_contenido/fixtures-contrato')

export function leerFixtures() {
  return readdirSync(CARPETA_FIX).filter((f) => f.endsWith('.json') && f !== 'indice.json')
    .map((f) => ({ archivo: f, registro: JSON.parse(readFileSync(join(CARPETA_FIX, f), 'utf8')) }))
    .filter((x) => x.registro && typeof x.registro === 'object' && !Array.isArray(x.registro) && x.registro.id)
}

async function entrarEn(base, email, password) {
  const r = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) })
  if (r.status !== 200) throw new Error(`no pude entrar como ${email} en ${base}: ${r.status}`)
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

export async function arrancarFixtures() {
  const tmp = mkdtempSync(join(tmpdir(), 'veta-fixtures-'))
  const datos = join(tmp, 'datos'); const base = join(tmp, 'base_contenido')
  mkdirSync(datos); mkdirSync(base)
  for (const f of readdirSync('server/datos')) if (f.endsWith('.json')) copyFileSync(join('server/datos', f), join(datos, f))
  const fx = leerFixtures()
  writeFileSync(join(datos, 'analisis.json'), JSON.stringify(fx.filter((x) => x.registro.tipo === 'analisis').map((x) => x.registro)))
  writeFileSync(join(datos, 'gemas.json'), JSON.stringify(fx.filter((x) => x.registro.tipo === 'gema').map((x) => x.registro)))
  const conflictos = resolve(homedir(), 'Documents/Crypto sistem/gem-pipeline/config/conflictos_interes.yaml')
  const p = spawn('npx', ['tsx', 'server/index.ts'], {
    detached: true, stdio: 'ignore',
    env: { ...process.env, PORT: String(PUERTO), VETA_SERVIR_DIST: '1', BETTER_AUTH_URL: BASE_FIX, VETA_ORIGENES: BASE_FIX,
      VETA_DB: join(tmp, 'veta.sqlite'), VETA_DATOS: datos, VETA_BASE_CONTENIDO: base, VETA_MOTOR: 'simulado', VETA_SYNC_MINUTOS: '0',
      ...(existsSync(conflictos) ? { VETA_CONFLICTOS: conflictos } : {}) },
  })
  for (let i = 0; i < 90; i++) {
    await new Promise((x) => setTimeout(x, 1000))
    if (await fetch(`${BASE_FIX}/api/contenido/meta`).then((r) => r.ok).catch(() => false)) break
    if (i === 89) throw new Error('el VETA de fixtures no arrancó en 90 s')
  }
  const admin = await entrarEn(BASE_FIX, env.VETA_ADMIN_EMAIL, env.VETA_ADMIN_PASSWORD)
  for (const { registro: r } of fx) {
    const d = await fetch(`${BASE_FIX}/api/admin/bandeja/${encodeURIComponent(r.id)}/decision`, { method: 'POST', headers: { Cookie: admin, 'Content-Type': 'application/json', Origin: BASE_FIX }, body: JSON.stringify({ accion: 'aprobar', tipo: r.tipo, bloqueo_confirmado: true }) })
    if (!d.ok) throw new Error(`no pude aprobar ${r.id}: ${d.status}`)
  }
  const cuentas = {
    visitante: '',
    base: await entrarEn(BASE_FIX, 'base@veta.local', env.VETA_DEMO_PASSWORD),
    pro: await entrarEn(BASE_FIX, 'pro@veta.local', env.VETA_DEMO_PASSWORD),
    admin,
  }
  return {
    base: BASE_FIX, fixtures: fx, cuentas, carpeta: tmp,
    async parar() { try { process.kill(-p.pid) } catch { /* ya terminó */ } await new Promise((x) => setTimeout(x, 500)); rmSync(tmp, { recursive: true, force: true }) },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = await arrancarFixtures()
  console.log(`VETA de fixtures en ${f.base} · ${f.fixtures.length} registros aprobados: ${f.fixtures.map((x) => x.registro.id).join(', ')}`)
  process.on('SIGINT', async () => { await f.parar(); process.exit(0) })
}
