/* Votación semanal: siembra por endpoints reales y capturas fijas.
   Uso: node scripts/shots-votacion.mjs <carpeta-salida> [sembrar|capturar|all]
   Requiere el servidor sirviendo dist en :5310 y las cuentas de la semilla. */
import puppeteer from 'puppeteer-core'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = process.argv[2] ?? 'recursos/capturas/votacion'; const MODE = process.argv[3] ?? 'all'
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

async function shot(name, { full = true, sel = null } = {}) {
  if (sel) {
    const el = await p.$(sel); if (!el) { console.log('SIN', sel); return }
    await p.evaluate(() => { document.querySelector('.p-top').style.visibility = 'hidden' })
    await el.screenshot({ path: `${OUT}/${name}.png` })
    await p.evaluate(() => { document.querySelector('.p-top').style.visibility = '' })
  }
  else await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full })
  console.log(name)
}
async function api(method, path, body) {
  return p.evaluate(async (method, path, body) => {
    const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
    return { status: r.status, json: await r.json().catch(() => null) }
  }, method, path, body)
}
async function entrar(email, password) {
  await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' })
  const r = await api('POST', '/api/auth/sign-in/email', { email, password })
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`)
}
const salir = () => api('POST', '/api/auth/sign-out', {})
async function ir(path, ms = 1200) { await p.goto(`${URL}${path}`, { waitUntil: 'networkidle0' }); await wait(ms) }

/* ============================ SIEMBRA ============================ */
const SOCIOS = ['ana', 'bruno', 'carla', 'diego', 'elena', 'fede'].map((n) => ({ email: `${n}@veta.local`, name: n[0].toUpperCase() + n.slice(1), password: DEMO }))
if (MODE === 'sembrar' || MODE === 'all') {
  await sembrar()
}
async function sembrar() {
  await p.goto(`${URL}/gemas`, { waitUntil: 'networkidle0' })
  // socios pro: se registran como cualquiera y el admin les pone plan pro
  for (const s of SOCIOS) {
    const r = await api('POST', '/api/auth/sign-up/email', { email: s.email, password: s.password, name: s.name })
    console.log('alta', s.email, r.status)
    await salir()
  }
  await entrar(ADMIN.email, ADMIN.password)
  const lista = await api('GET', '/api/admin/usuarios')
  const usuarios = lista.json?.usuarios ?? lista.json ?? []
  for (const s of SOCIOS) {
    const u = usuarios.find((x) => x.email === s.email)
    if (u) { const r = await api('PATCH', `/api/admin/usuarios/${u.id}/plan`, { plan: 'pro' }); console.log('plan pro', s.email, r.status) }
  }
  // votación anterior (semana 36): RAY ganó y su análisis ya está publicado
  const w36 = await api('POST', '/api/admin/votacion', { semana: '2026-W36', abre: '2026-08-31T12:00:00.000Z', cierra: new Date(Date.now() + 3600e3).toISOString(), simbolos: ['RAY', 'DODO', 'SOLV', 'PENDLE', 'CAP'] })
  console.log('w36', w36.status, w36.json)
  const id36 = w36.json?.id
  await salir()
  const votos36 = { ana: 'RAY', bruno: 'RAY', carla: 'DODO', diego: 'RAY', elena: 'SOLV', fede: 'RAY' }
  for (const s of SOCIOS) { await entrar(s.email, s.password); const r = await api('POST', `/api/votacion/${id36}/voto`, { simbolo: votos36[s.email.split('@')[0]] }); console.log('voto36', s.email, r.status); await salir() }
  await entrar('pro@veta.local', DEMO); console.log('voto36 pro', (await api('POST', `/api/votacion/${id36}/voto`, { simbolo: 'DODO' })).status); await salir()
  await entrar(ADMIN.email, ADMIN.password)
  console.log('cerrar36', (await api('POST', `/api/admin/votacion/${id36}/cerrar`, {})).json)
  console.log('lanzar36', (await api('POST', `/api/admin/votacion/${id36}/lanzar`, {})).status)
  // votación activa (semana 38): cierra el domingo 20 a las 21:00
  const w38 = await api('POST', '/api/admin/votacion', { semana: '2026-W38', cierra: '2026-09-20T21:00:00-03:00', simbolos: ['DODO', 'REZ', 'STG', 'PENDLE', 'CAP'] })
  console.log('w38', w38.status, w38.json)
  const id38 = w38.json?.id
  await salir()
  const votos38 = { ana: 'REZ', bruno: 'DODO', carla: 'REZ', diego: 'PENDLE', elena: 'REZ', fede: 'DODO' }
  for (const s of SOCIOS) { await entrar(s.email, s.password); const r = await api('POST', `/api/votacion/${id38}/voto`, { simbolo: votos38[s.email.split('@')[0]] }); console.log('voto38', s.email, r.status); await salir() }
}

if (MODE === 'sembrar36') {
  await entrar(ADMIN.email, ADMIN.password)
  const w36 = await api('POST', '/api/admin/votacion', { semana: '2026-W36', abre: '2026-08-31T12:00:00.000Z', cierra: new Date(Date.now() + 3600e3).toISOString(), simbolos: ['RAY', 'DODO', 'SOLV', 'PENDLE', 'CAP'] })
  console.log('w36', w36.status, w36.json); const id36 = w36.json?.id; await salir()
  const votos36 = { ana: 'RAY', bruno: 'RAY', carla: 'DODO', diego: 'RAY', elena: 'SOLV', fede: 'RAY' }
  for (const s of SOCIOS) { await entrar(s.email, s.password); const r = await api('POST', `/api/votacion/${id36}/voto`, { simbolo: votos36[s.email.split('@')[0]] }); console.log('voto36', s.email, r.status); await salir() }
  await entrar('pro@veta.local', DEMO); console.log('voto36 pro', (await api('POST', `/api/votacion/${id36}/voto`, { simbolo: 'DODO' })).status); await salir()
  await entrar(ADMIN.email, ADMIN.password)
  console.log('cerrar36', (await api('POST', `/api/admin/votacion/${id36}/cerrar`, {})).json)
  console.log('lanzar36', (await api('POST', `/api/admin/votacion/${id36}/lanzar`, {})).status)
  await salir()
}

/* ============================ CAPTURAS ============================ */
if (MODE === 'recap') {
  await entrar('pro@veta.local', DEMO); await ir('/votacion', 1500)
  await p.evaluate(() => document.querySelector('.vt-cierre__ganadora')?.scrollIntoView({ block: 'center' })); await wait(2600); await shot('pro-08-cierre', { sel: '.vt-cierre' })
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(300); await shot('pro-09-pagina-completa')
  await p.setViewport({ width: 400, height: 860, deviceScaleFactor: 2 }); await ir('/votacion', 1500)
  await p.evaluate(() => document.querySelector('.vt-cierre__ganadora')?.scrollIntoView({ block: 'center' })); await wait(2400); await p.evaluate(() => window.scrollTo(0, 0)); await wait(300); await shot('pro-10-movil')
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 }); await salir()
  await entrar('base@veta.local', DEMO); await ir('/votacion', 1500)
  await p.evaluate(() => document.querySelector('.vt-cierre__ganadora')?.scrollIntoView({ block: 'center' })); await wait(2600); await shot('base-03-cierre', { sel: '.vt-cierre' })
  await salir()
}
if (MODE === 'capturar' || MODE === 'all') {
  // PRO: la lista, el voto, el cierre
  await entrar('pro@veta.local', DEMO)
  await ir('/votacion', 1800)
  await shot('pro-01-lista', { full: false })
  await shot('pro-02-mesa', { sel: '.vt-activa' })
  const botones = await p.$$('.vt-cand__btn')
  await botones[2].hover(); await wait(800); await shot('pro-03-hover', { sel: '.vt-mesa' })
  await botones[1].click(); await wait(700); await shot('pro-04-elegida', { sel: '.vt-activa' })
  await p.click('.vt-confirma__ok'); await wait(650); await shot('pro-05-sello-onda', { sel: '.vt-mesa' })
  await wait(700); await shot('pro-06-sello', { sel: '.vt-mesa' })
  await wait(2600); await shot('pro-07-votado', { sel: '.vt-activa' })
  await p.evaluate(() => document.querySelector('.vt-cierre')?.scrollIntoView({ block: 'start' })); await wait(2600)
  await shot('pro-08-cierre', { sel: '.vt-cierre' })
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(300); await shot('pro-09-pagina-completa')
  await p.setViewport({ width: 400, height: 860, deviceScaleFactor: 2 }); await ir('/votacion', 1500)
  await p.evaluate(() => document.querySelector('.vt-cierre__ganadora')?.scrollIntoView({ block: 'center' })); await wait(2400); await p.evaluate(() => window.scrollTo(0, 0)); await wait(300); await shot('pro-10-movil')
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await salir()
  // BASE: la mesa velada
  await entrar('base@veta.local', DEMO); await ir('/votacion', 1500)
  await shot('base-01-velada', { full: false }); await shot('base-02-puerta', { sel: '.vt-activa' })
  await p.evaluate(() => document.querySelector('.vt-cierre')?.scrollIntoView({ block: 'start' })); await wait(2400); await shot('base-03-cierre', { sel: '.vt-cierre' })
  await salir()
  // VISITANTE
  await ir('/votacion', 1500); await shot('visitante-01', { full: false })
  // ADMIN
  await entrar(ADMIN.email, ADMIN.password); await ir('/admin/votacion', 1800)
  await shot('admin-01-recuento', { full: false }); await shot('admin-02-pagina')
  await p.click('.a-vot__ver'); await wait(400); await shot('admin-03-cerrada-detalle', { sel: '.a-vot__cerrada' })
  await p.click('.a-vot__acciones .btn'); await wait(400); await shot('admin-04-cerrar-confirma', { sel: '.a-vot__activa' })
  await salir()
}
console.log('errores:', errors.filter((e) => !/favicon|404/.test(e)).slice(0, 10))
await b.close()
