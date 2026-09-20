import puppeteer from 'puppeteer-core'
import { mkdirSync, writeFileSync } from 'node:fs'
const OUT='/tmp/qa'; mkdirSync(OUT,{recursive:true})
const BASE = 'https://www.vetalab.io'
const CLAVE = 'Qa-revision-2026-veta'
const ROLES = [
  { rol: 'visitante', email: null },
  { rol: 'gratis', email: 'qa-gratis@vetalab.io' },
  { rol: 'base', email: 'qa-base@vetalab.io' },
  { rol: 'pro', email: 'qa-pro@vetalab.io' },
  { rol: 'admin', email: 'qa-admin@vetalab.io' },
]
const PUBLICAS = ['/', '/precios', '/metodologia', '/nosotros', '/terminos', '/privacidad', '/contacto', '/entrar', '/registro', '/recuperar']
const PRODUCTO = ['/gemas', '/seguimiento', '/analisis', '/watchlist', '/votacion', '/analizar', '/cuenta']
const ADMIN = ['/admin/bandeja', '/admin/cuentas', '/admin/votacion', '/admin/consumo', '/admin/operacion', '/admin/contenido', '/admin/acciones']
const RUTAS = [...PUBLICAS, ...PRODUCTO, ...ADMIN]

const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox','--hide-scrollbars','--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist'] })
const filas = []
for (const { rol, email } of ROLES) {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage(); await p.setViewport({ width: 1440, height: 900 })
  const wait = ms => new Promise(r=>setTimeout(r,ms))
  if (email) {
    await p.goto(`${BASE}/entrar`, { waitUntil: 'domcontentloaded' })
    const st = await p.evaluate(async (e,pw)=>{const r=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw}),credentials:'same-origin'});return r.status}, email, CLAVE)
    if (st !== 200) { console.error(`  login ${rol}: ${st}`); }
  }
  for (const ruta of RUTAS) {
    const errores = [], malas = []
    const onErr = e => errores.push(String(e).slice(0,100))
    const onRes = r => { if (r.status() >= 400 && !/favicon/.test(r.url())) malas.push(`${r.status()} ${r.url().replace(BASE,'')}`) }
    p.on('pageerror', onErr); p.on('response', onRes)
    const t0 = Date.now()
    try { await p.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle0', timeout: 30000 }) } catch { malas.push('TIMEOUT de carga') }
    await wait(ruta === '/' ? 2200 : 1400)
    const ms = Date.now() - t0
    const r = await p.evaluate(() => {
      const t = (document.body.innerText || '').trim()
      const vacio = t.length < 60
      const mensaje = document.querySelector('.p-vacio, .p-empty, [class*="vacio"], [class*="empty"]')?.textContent?.trim().slice(0,70) ?? null
      const puerta = /sólo para admin|Hay que entrar|es del plan|Entrar|Crear cuenta/i.test(t) ? 'puerta' : null
      return { largo: t.length, vacio, mensaje, puerta, h1: document.querySelector('h1')?.textContent?.replace(/\s+/g,' ').trim().slice(0,44) ?? null }
    })
    p.off('pageerror', onErr); p.off('response', onRes)
    filas.push({ rol, ruta, ms, ...r, errores: errores.slice(0,2), malas: [...new Set(malas)].slice(0,2) })
  }
  await ctx.close()
  console.error(`  ${rol} listo`)
}
writeFileSync(`${OUT}/recorrido.json`, JSON.stringify(filas, null, 1))
/* resumen */
const problemas = filas.filter(f => f.errores.length || f.malas.length || f.vacio || f.ms > 3000)
console.log(`\nrutas probadas: ${filas.length} · con algo que mirar: ${problemas.length}\n`)
console.log('ROL        RUTA                  ms    QUÉ PASA')
for (const f of problemas) {
  const q = [f.malas.length?`HTTP ${f.malas.join('; ')}`:null, f.errores.length?`JS ${f.errores[0]}`:null, f.vacio?'PANTALLA CASI VACÍA':null, f.ms>3000?`LENTA ${f.ms}ms`:null].filter(Boolean).join(' · ')
  console.log(`${f.rol.padEnd(10)} ${f.ruta.padEnd(21)} ${String(f.ms).padStart(5)} ${q}`)
}
await b.close()
