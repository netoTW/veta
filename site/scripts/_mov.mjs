import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
mkdirSync('/tmp/qa/movil',{recursive:true})
const BASE='https://www.vetalab.io', CLAVE='Qa-revision-2026-veta'
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox','--hide-scrollbars','--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist'] })
const p = await b.newPage()
const wait = ms => new Promise(r=>setTimeout(r,ms))
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.goto(`${BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.evaluate(async(e,pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw}),credentials:'same-origin'})}, 'qa-pro@vetalab.io', CLAVE)
const rutas = ['/','/precios','/metodologia','/nosotros','/terminos','/privacidad','/contacto','/gemas','/seguimiento','/analisis','/watchlist','/votacion','/analizar','/cuenta','/entrar','/registro','/recuperar']
console.log('RUTA            DESBORDE  TEXTO CORTADO  TOCABLE<40px  SOLAPES')
for (const ruta of rutas) {
  await p.goto(`${BASE}${ruta}`,{waitUntil:'networkidle0'}); await wait(ruta==='/'?2400:1300)
  const r = await p.evaluate(() => {
    const desborde = document.documentElement.scrollWidth > window.innerWidth + 1
    let cortado = 0, chicos = 0, solapes = 0
    const vis = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      const b = el.getBoundingClientRect()
      if (b.width < 2 || b.height < 2) continue
      // texto que se sale de su caja
      if (!el.children.length && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) && cs.overflow === 'visible' && (el.textContent||'').trim()) cortado++
      // objetivos táctiles pequeños
      if (['A','BUTTON'].includes(el.tagName) && (b.height < 40 || b.width < 40)) chicos++
      if (['A','BUTTON','INPUT'].includes(el.tagName)) vis.push(b)
    }
    for (let i=0;i<vis.length;i++) for (let j=i+1;j<vis.length;j++) {
      const a=vis[i], c=vis[j]
      const x = Math.max(0, Math.min(a.right,c.right)-Math.max(a.left,c.left))
      const y = Math.max(0, Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top))
      if (x>6 && y>6) solapes++
    }
    return { desborde, cortado, chicos, solapes }
  })
  const mal = r.desborde || r.cortado>0 || r.solapes>0
  console.log(`${ruta.padEnd(15)} ${String(r.desborde).padEnd(9)} ${String(r.cortado).padEnd(14)} ${String(r.chicos).padEnd(13)} ${r.solapes}${mal?'   ← MIRAR':''}`)
  if (mal) await p.screenshot({ path: `/tmp/qa/movil${ruta.replace(/\//g,'_')||'_portada'}.png`, fullPage: true })
}
await b.close()
