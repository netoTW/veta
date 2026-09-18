/* Capturas fijas de la fase de autenticación, permisos reales, bandeja y cuentas.
   Uso: node scripts/shots-auth.mjs <carpeta-salida> [login|producto|admin|all]
   Requiere el servidor en modo preview (npm run preview) en :5310 y las
   cuentas de la semilla (.env: VETA_ADMIN_*, VETA_DEMO_PASSWORD). */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2]; const MODE = process.argv[3] ?? 'all'
mkdirSync(OUT, { recursive: true })
const URL = process.env.URL ?? 'http://localhost:5310'
const env = Object.fromEntries(readFileSync(resolve('.env'), 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const ADMIN = { email: env.VETA_ADMIN_EMAIL, password: env.VETA_ADMIN_PASSWORD }
const DEMO = env.VETA_DEMO_PASSWORD

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox', '--hide-scrollbars', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

async function shot(name, { full = true } = {}) {
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  const h = await p.evaluate(() => document.body.scrollHeight)
  console.log(name, h)
}
async function entrar(email, password) {
  await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' })
  const r = await p.evaluate(async (email, password) => {
    const r = await fetch('/api/auth/sign-in/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }), credentials: 'same-origin' })
    return r.status
  }, email, password)
  if (r !== 200) throw new Error(`login ${email}: ${r}`)
}
async function salir() {
  await p.evaluate(async () => { await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'same-origin' }) })
}
async function ir(path, ms = 900) {
  await p.goto(`${URL}${path}`, { waitUntil: 'networkidle0' })
  await wait(ms)
}
async function api(method, path, body) {
  return p.evaluate(async (method, path, body) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
    return { status: r.status, json: await r.json().catch(() => null) }
  }, method, path, body)
}

/* ============================ LOGIN: el momento ============================ */
if (MODE === 'login' || MODE === 'all') {
  await salir().catch(() => {})
  await ir('/entrar', 3200); await shot('login-01-reposo', { full: false })
  await p.type('#email', 'base@veta.local', { delay: 20 }); await p.type('#pass', 'contraseña-falsa', { delay: 20 }); await wait(1400)
  await shot('login-02-atenta', { full: false })
  await p.click('.auth__btn'); await wait(650); await shot('login-03-error', { full: false })
  await wait(1600)
  // vaciar el campo de forma compatible con React (input controlado)
  await p.$eval('#pass', (el) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await p.click('#pass'); await p.type('#pass', DEMO, { delay: 15 }); await wait(400)
  console.log('pass length', await p.$eval('#pass', (el) => el.value.length))
  await p.click('.auth__btn'); await wait(950); await shot('login-04-exito', { full: false })
  await wait(1500); await shot('login-05-tras-entrar', { full: false })
  await salir()
  await ir('/registro', 2600); await shot('registro', { full: false })
  await ir('/recuperar', 2600); await shot('recuperar', { full: false })
  await p.type('#email', 'base@veta.local', { delay: 15 }); await p.click('.auth__btn'); await wait(1400); await shot('recuperar-enviado', { full: false })
  // el enlace real del correo saliente (local: archivo)
  const dir = resolve('server/correo-saliente')
  const ultimo = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().at(-1)
  const m = ultimo ? readFileSync(resolve(dir, ultimo), 'utf8').match(/https?:\/\/\S+/) : null
  if (m) {
    await p.goto(m[0], { waitUntil: 'networkidle0' }); await wait(2600); await shot('restablecer', { full: false })
    console.log('restablecer desde', m[0].slice(0, 60) + '…')
  }
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ir('/entrar', 2200); await shot('m-login', { full: false })
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
}

/* ===================== PERMISOS REALES POR PLAN ===================== */
if (MODE === 'producto' || MODE === 'all') {
  await salir().catch(() => {})
  await ir('/gemas'); await shot('visitante-gemas')
  await ir('/seguimiento'); await shot('visitante-seguimiento')
  await ir('/gemas/RAY-20260912-012647'); await shot('visitante-gema-ray')
  await entrar('base@veta.local', DEMO)
  await ir('/gemas'); await shot('base-gemas')
  await ir('/gemas/RAY-20260912-012647'); await shot('base-gema-ray')
  await ir('/seguimiento'); await shot('base-seguimiento')
  await ir('/cuenta'); await shot('base-cuenta')
  await salir()
  await entrar('pro@veta.local', DEMO)
  await ir('/gemas'); await shot('pro-gemas')
  await ir('/seguimiento'); await shot('pro-seguimiento')
  await ir('/admin/bandeja'); await shot('pro-admin-bloqueado')
  const exp = await api('GET', '/api/contenido/exportar/gemas'); console.log('pro exportar', exp.status)
  await salir()
}

/* ============================ ADMIN ============================ */
if (MODE === 'admin' || MODE === 'all') {
  await entrar(ADMIN.email, ADMIN.password)
  await ir('/admin/bandeja'); await shot('admin-bandeja')
  await ir('/admin/bandeja/ORCA-20260912-020844', 1400); await shot('admin-bandeja-orca-informe')
  for (const t of ['Advertencias', 'Escéptico', 'Verificador', 'Paquete']) {
    await p.evaluate((t) => { [...document.querySelectorAll('.a-tab')].find((x) => x.textContent.trim() === t)?.click() }, t); await wait(500)
    await shot(`admin-bandeja-orca-${t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`)
  }
  // APROBAR ORCA
  await p.evaluate(() => { [...document.querySelectorAll('.a-tab')].find((x) => x.textContent.trim() === 'Informe')?.click() })
  await p.evaluate(() => { [...document.querySelectorAll('.a-dec .btn')].find((x) => x.textContent.includes('Aprobar'))?.click() }); await wait(1200)
  await shot('admin-accion-aprobar-orca', { full: false })
  // PEDIR MÁS en SSV
  await ir('/admin/bandeja/SSV-20260912-014935', 1200)
  await p.type('.a-dec__motivo textarea', 'Falta la fuente del revenue de 30 d y la concentración top-10 sigue sin calcular: volver a correr con Arkham.', { delay: 5 })
  await p.evaluate(() => { [...document.querySelectorAll('.a-dec .btn')].find((x) => x.textContent.includes('Pedir más'))?.click() }); await wait(1200)
  await shot('admin-accion-pedir-mas-ssv', { full: false })
  // RECHAZAR SSV
  await p.type('.a-dec__motivo textarea', 'Sin comparables no hay magnitud; no se publica como análisis hasta que el set tenga al menos tres.', { delay: 5 })
  await p.evaluate(() => { [...document.querySelectorAll('.a-dec .btn')].find((x) => x.textContent.includes('Rechazar'))?.click() }); await wait(1200)
  await shot('admin-accion-rechazar-ssv', { full: false })
  await ir('/admin/bandeja'); await p.evaluate(() => { [...document.querySelectorAll('.a-filtro')].find((x) => x.textContent.includes('Todos'))?.click() }); await wait(400); await shot('admin-bandeja-todos')
  // cuentas
  await ir('/admin/cuentas'); await shot('admin-cuentas')
  await p.click('.p-cab__acciones .btn'); await wait(300); await shot('admin-cuentas-crear', { full: false })
  const base = await api('GET', '/api/admin/usuarios')
  const u = base.json.usuarios.find((x) => x.email === 'base@veta.local')
  await ir(`/admin/cuentas/${u.id}`); await shot('admin-cuenta-base')
  await ir('/admin/acciones'); await shot('admin-acciones')
  // impersonar
  await api('POST', `/api/admin/usuarios/${u.id}/impersonar`, {})
  await ir('/gemas'); await shot('admin-impersonando-base')
  await api('POST', '/api/auth/admin/stop-impersonating', {})
  await ir('/admin/cuentas', 600)
  await salir()
}

/* ===================== ADMIN · sólo vista (sin decisiones) ===================== */
if (MODE === 'adminvista') {
  await entrar(ADMIN.email, ADMIN.password)
  await ir('/admin/bandeja', 1200); await shot('admin-bandeja')
  await p.evaluate(() => { [...document.querySelectorAll('.a-filtro')].find((x) => x.textContent.includes('Todos'))?.click() }); await wait(400); await shot('admin-bandeja-todos')
  await p.hover('.a-fila'); await wait(600); await shot('admin-bandeja-hover', { full: false })
  await ir('/admin/bandeja/ORCA-20260912-020844', 1400); await shot('admin-bandeja-orca-informe')
  for (const t of ['Advertencias', 'Escéptico', 'Verificador', 'Historial']) {
    await p.evaluate((t) => { [...document.querySelectorAll('.a-tab')].find((x) => x.textContent.trim().startsWith(t))?.click() }, t); await wait(500)
    await shot(`admin-bandeja-orca-${t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}`)
  }
  await ir('/admin/cuentas', 1200); await shot('admin-cuentas')
  await p.click('.a-cab__acciones .btn'); await wait(300); await shot('admin-cuentas-crear', { full: false })
  const base = await api('GET', '/api/admin/usuarios'); const u = base.json.usuarios.find((x) => x.email === 'base@veta.local')
  await ir(`/admin/cuentas/${u.id}`, 1000); await shot('admin-cuenta-base')
  await ir('/admin/acciones', 1000); await shot('admin-acciones')
  await salir()
}

/* ===================== JERARQUÍA: gema, informe en ambos niveles, análisis, watchlist (como pro) ===================== */
if (MODE === 'jerarquia') {
  await entrar('pro@veta.local', DEMO)
  await ir('/gemas', 1200); await shot('gemas')
  await ir('/gemas/RAY-20260912-012647', 1400); await shot('gema-ray-esencial')
  await p.evaluate(() => { [...document.querySelectorAll('.p-nivel__btn')].find((x) => x.textContent.trim() === 'avanzado')?.click() }); await wait(700); await shot('gema-ray-avanzado')
  await ir('/gemas/ORCA-20260912-020844', 1400); await shot('gema-orca-esencial')
  await ir('/analisis', 1200); await shot('analisis')
  await ir('/analisis/SSV-20260912-014935', 1400); await shot('analisis-ssv-esencial')
  await ir('/watchlist', 1200); await shot('watchlist')
  await salir()
}

/* ===================== LIMPIEZA de lenguaje interno: cliente vs admin ===================== */
if (MODE === 'limpieza') {
  await entrar('pro@veta.local', DEMO)
  await ir('/gemas', 1200); await shot('gemas')
  await ir('/gemas/RAY-20260912-012647', 1400); await shot('gema-ray')
  await ir('/gemas/ORCA-20260912-020844', 1400); await shot('gema-orca')
  await ir('/seguimiento', 1200); await shot('seguimiento')
  await salir()
  await entrar(ADMIN.email, ADMIN.password)
  await ir('/admin/bandeja', 1200); await shot('admin-bandeja')
  await ir('/admin/bandeja/RAY-20260912-012647', 1400); await shot('admin-bandeja-ray')
  await salir()
}

/* ===================== CHARTS: heatmap y series, escritorio y móvil ===================== */
if (MODE === 'charts') {
  await entrar('pro@veta.local', DEMO)
  const el = async (sel, name, hoverSel) => {
    const e = await p.$(sel); if (!e) { console.log('no', sel); return }
    await p.evaluate(() => { const t = document.querySelector('.p-top'); if (t) t.style.visibility = 'hidden' })
    await e.evaluate((x) => x.scrollIntoView({ block: 'center' })); await wait(300)
    if (hoverSel) { const h = await p.$(hoverSel); if (h) { await h.hover(); await wait(300) } }
    await e.screenshot({ path: `${OUT}/${name}.png` }); console.log(name)
  }
  await ir('/gemas/RAY-20260912-012647', 1600); await shot('ray-informe-con-charts')
  await el('.ch-heat', 'heatmap-ray'); await el('.ch-heat', 'heatmap-ray-hover', '.ch-heat__svg g:nth-of-type(28)')
  await el('.ch-precio', 'precio-ray'); await el('.ch-precio', 'precio-ray-hover', '.ch-precio .ch__svg')
  await el('.ch-rev', 'revenue-ray', '.ch-rev .ch__barra:nth-of-type(100)'); await el('.ch-tvl', 'tvl-ray'); await el('.ch-conc', 'concentracion-ray')
  await ir('/gemas/ORCA-20260912-020844', 1600); await el('.ch-heat', 'heatmap-orca'); await el('.ch-precio', 'precio-orca'); await el('.ch-conc', 'concentracion-orca')
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await ir('/gemas/RAY-20260912-012647', 1800); await el('.ch-heat', 'm-heatmap-ray'); await el('.ch-precio', 'm-precio-ray'); await el('.ch-rev', 'm-revenue-ray'); await el('.ch-conc', 'm-concentracion-ray')
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await salir()
}

/* ===================== BENCHMARK en primer plano ===================== */
if (MODE === 'benchmark') {
  const el = async (sel, name) => { const e = await p.$(sel); if (!e) { console.log('no', sel); return } await p.evaluate(() => { const t = document.querySelector('.p-top'); if (t) t.style.visibility = 'hidden' }); await e.evaluate((x) => x.scrollIntoView({ block: 'center' })); await wait(300); await e.screenshot({ path: `${OUT}/${name}.png` }); console.log(name) }
  await salir().catch(() => {})
  await ir('/seguimiento', 1200); await shot('visitante-seguimiento'); await el('.mk--agregado', 'visitante-marcador')
  await p.click('.mk--agregado .mk__como'); await wait(300); await el('.mk--agregado', 'visitante-marcador-explicado')
  await ir('/gemas', 1200); await shot('visitante-gemas')
  await entrar('base@veta.local', DEMO)
  await ir('/gemas/ORCA-20260912-020844', 1500); await el('.mk--gema', 'gema-orca-marcador'); await el('.mk__pred', 'gema-orca-prediccion-antes')
  await p.click('.mk__pred .btn--esmeralda'); await wait(900); await el('.mk__pred', 'gema-orca-prediccion-despues')
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(300); await shot('gema-orca-arriba', { full: false })
  await ir('/gemas/RAY-20260912-012647', 1500); await el('.mk--gema', 'gema-ray-marcador'); await p.click('.mk__pred .btn--ghost'); await wait(900); await el('.mk__pred', 'gema-ray-prediccion-despues')
  await ir('/seguimiento', 1400); await shot('base-seguimiento'); await el('.mk--agregado', 'base-marcador-agregado'); await el('.mk--personal', 'base-marcador-personal')
  await ir('/cuenta', 1200); await el('.mk--personal', 'base-cuenta-predicciones')
  await salir()
}

console.log('errores:', errors.length ? errors.slice(0, 8) : 'ninguno')
await b.close()
