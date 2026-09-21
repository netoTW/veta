/* Recorre el sitio entero con los cinco roles, en escritorio y en móvil, y
   comprueba lo que no se puede comprobar mirando: pantallas en blanco, errores
   de consola, peticiones fallidas, el aviso de que no es consejo de inversión
   en toda pantalla de producto, y que ninguna página se desplace de lado.

   Uso: node scripts/barrido.mjs   (con la vista previa en :5310)
   Sale con la lista de problemas; 0 es lo que hay que ver antes de desplegar. */
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const BASE = 'http://localhost:5310'
const PUB = ['/','/metodologia','/nosotros','/precios','/noticias','/gracias','/terminos','/privacidad','/contacto','/entrar','/registro','/recuperar']
const PROD = ['/gemas','/seguimiento','/analisis','/watchlist','/analizar','/votacion','/cuenta','/piezas']
const ADM = ['/admin/bandeja','/admin/cuentas','/admin/enlaces','/admin/consumo','/admin/operacion','/admin/contenido','/admin/acciones','/admin/votacion']
const CUENTAS = { visitante:null, gratis:'gratis@veta.local', base:'base@veta.local', pro:'pro@veta.local', admin:env.VETA_ADMIN_EMAIL }

const ANCHOS = [[1440,1000,'escritorio'],[390,844,'móvil']]
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'] })
const problemas = []
const vistas = []
for (const [rol, email] of Object.entries(CUENTAS)) {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil:'domcontentloaded' })
  if (email) {
    const pw = email === env.VETA_ADMIN_EMAIL ? env.VETA_ADMIN_PASSWORD : env.VETA_DEMO_PASSWORD
    const ok = await p.evaluate(async (e,w)=>{ const r = await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:w}),credentials:'same-origin'}); return r.status }, email, pw)
    if (ok !== 200) { problemas.push([rol,'(login)','no pudo entrar: HTTP '+ok]); await ctx.close(); continue }
  }
  const rutas = [...PUB, ...PROD, ...(rol==='admin'?ADM:[])]
  for (const [w,h,comoSeLlama] of ANCHOS) {
  await p.setViewport({width:w,height:h})
  for (const r of rutas) {
    const errores = [], fallos = []
    const onC = (m)=>{ if (m.type()==='error') errores.push(m.text().slice(0,140)) }
    const onF = (req)=>{ const s = req.response()?.status(); if (s && s>=400) fallos.push(`${s} ${req.url().replace(BASE,'').slice(0,60)}`) }
    p.on('console', onC); p.on('requestfinished', onF); p.on('pageerror', (e)=>errores.push('PAGEERROR '+String(e.message).slice(0,140)))
    try {
      await p.goto(BASE + r, { waitUntil:'networkidle0', timeout: 25000 })
      await new Promise(x=>setTimeout(x,900))
      const texto = (await p.evaluate(()=>document.body.innerText)).trim()
      vistas.push([rol, r+' '+comoSeLlama, texto.length])
      // el aviso legal, en toda pantalla de producto o informe
      if (/^\/(gemas|analisis|seguimiento|watchlist|noticias|votacion)/.test(r) && !/consejo de inversión/i.test(texto)) problemas.push([rol, r+' '+comoSeLlama, 'SIN el aviso de que no es consejo de inversión'])
      // nada puede desbordar a lo ancho en móvil
      if (w === 390) {
        const d = await p.evaluate(() => {
          const W = window.innerWidth
          if (document.documentElement.scrollWidth <= W + 2) return null
          const culpables = []
          for (const el of document.querySelectorAll('*')) {
            const c = getComputedStyle(el)
            if (c.overflowX === 'auto' || c.overflowX === 'scroll' || c.overflowX === 'hidden') continue
            let dentroDeScroll = false
            for (let a = el.parentElement; a; a = a.parentElement) {
              const ca = getComputedStyle(a)
              if (ca.overflowX === 'auto' || ca.overflowX === 'scroll' || ca.overflowX === 'hidden') { dentroDeScroll = true; break }
            }
            if (dentroDeScroll) continue
            const b = el.getBoundingClientRect()
            if (b.width > 0 && b.right > W + 2) culpables.push(`<${el.tagName.toLowerCase()} class="${String(el.className).slice(0,40)}"> sobra ${Math.round(b.right - W)}px`)
          }
          return culpables[culpables.length - 1] || '(sólo dentro de contenedores que ya se desplazan)'
        })
        if (d) problemas.push([rol, r+' móvil', 'desborda: ' + d])
      }
      if (texto.length < 40) problemas.push([rol, r, 'PANTALLA CASI VACÍA ('+texto.length+' caracteres)'])
      for (const e of [...new Set(errores)]) problemas.push([rol, r, 'consola: '+e])
      for (const f of [...new Set(fallos)]) if (!/40[13] \/api\/(contenido|admin|prediccion)/.test(f)) problemas.push([rol, r, 'petición: '+f])
    } catch (e) { problemas.push([rol, r, 'NO CARGÓ: '+String(e.message).slice(0,90)]) }
    p.off('console', onC); p.off('requestfinished', onF)
  }
  }
  console.log(`  ${rol.padEnd(10)} visitadas ${rutas.length*2} · sesión ${email ? 'sí' : 'no'} · rol efectivo ${await p.evaluate(async()=>(await fetch('/api/yo').then(r=>r.json())).rol)}`)
  await ctx.close()
}
await b.close()
console.log('\nBARRIDO · '+Object.keys(CUENTAS).length+' roles\n')
if (!problemas.length) console.log('  sin problemas')
for (const [rol, r, q] of problemas) console.log(`  ${rol.padEnd(10)} ${r.padEnd(22)} ${q}`)
console.log(`\n  páginas medidas: ${vistas.length} · texto más corto: ${Math.min(...vistas.map(v=>v[2]))} caracteres en ${(vistas.sort((a,b)=>a[2]-b[2])[0]||[]).slice(0,2).join(' ')}`)
console.log(`  TOTAL de problemas: ${problemas.length}\n`)
