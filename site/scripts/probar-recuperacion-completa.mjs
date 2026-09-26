/* Recuperación de contraseña de punta a punta (ESPECIFICACION-LANZAMIENTO.md §1, A1.2).

   Contra la vista previa local, con VETA_CORREO=archivo (los correos quedan en
   server/correo-saliente): crea una cuenta de prueba, pide el enlace, lo saca del
   correo, lo abre en Chrome, elige una contraseña nueva en la pantalla real y
   comprueba que la nueva entra y la vieja ya no.

   Uso: node scripts/probar-recuperacion-completa.mjs   Sale con 1 si algo falla. */
import { readdirSync, readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import puppeteer from 'puppeteer-core'

const BASE = 'http://localhost:5310'
const DIR = 'server/correo-saliente'
const email = `prueba-recuperacion-${Date.now()}@veta.local`
const vieja = randomBytes(12).toString('base64url'), nueva = randomBytes(12).toString('base64url')
const post = (ruta, cuerpo) => fetch(BASE + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify(cuerpo) })
const pasos = []
const paso = (ok, texto) => { pasos.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${texto}`); return ok }

console.log(`\nRECUPERACIÓN DE PUNTA A PUNTA · ${email}`)
paso((await post('/api/auth/sign-up/email', { email, password: vieja, name: 'Prueba recuperación' })).status === 200, 'cuenta creada')
const antes = new Set(readdirSync(DIR))
paso((await post('/api/auth/request-password-reset', { email, redirectTo: '/restablecer' })).status === 200, 'enlace pedido')
let enlace = null
for (let i = 0; i < 20 && !enlace; i++) {
  await new Promise((x) => setTimeout(x, 300))
  const f = readdirSync(DIR).find((x) => !antes.has(x) && x.includes(email))
  if (f) enlace = readFileSync(`${DIR}/${f}`, 'utf8').match(/https?:\/\/\S+reset-password\/\S+/)?.[0]?.replace(/[)>"'.,]+$/, '') ?? null
}
paso(!!enlace, 'el correo trae el enlace')

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] })
const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: 1440, height: 900 })
if (enlace) {
  await p.goto(enlace.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle0' })
  paso(/\/restablecer\?token=/.test(p.url()), `el enlace lleva a la pantalla de contraseña nueva (${new URL(p.url()).pathname})`)
  await p.type('#pass', nueva); await p.type('#pass2', nueva)
  await p.click('button[type=submit]')
  await p.waitForFunction(() => location.pathname === '/entrar', { timeout: 10000 }).catch(() => {})
  paso(p.url().includes('/entrar?ok=restablecida'), `guardada y de vuelta a entrar (${new URL(p.url()).pathname}${new URL(p.url()).search})`)
}
await b.close()
paso((await post('/api/auth/sign-in/email', { email, password: nueva })).status === 200, 'la contraseña nueva entra')
paso((await post('/api/auth/sign-in/email', { email, password: vieja })).status === 401, 'la vieja ya no entra')
const fallos = pasos.filter((x) => !x).length
console.log(`  TOTAL de fallos: ${fallos}\n`)
process.exit(fallos ? 1 : 0)
