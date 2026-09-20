import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const OUT='/tmp/qa/antes'; mkdirSync(OUT,{recursive:true})
const BASE='https://www.vetalab.io', CLAVE='Qa-revision-2026-veta'
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox','--hide-scrollbars','--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist'] })
const wait = ms => new Promise(r=>setTimeout(r,ms))
const ctx = await b.createBrowserContext(); const p = await ctx.newPage()

console.log('=== ¿hay puerta de plan para gratis? ===')
await p.setViewport({width:1440,height:900})
await p.goto(`${BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.evaluate(async(e,pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw}),credentials:'same-origin'})}, 'qa-gratis@vetalab.io', CLAVE)
for (const ruta of ['/seguimiento','/watchlist']) {
  await p.goto(`${BASE}${ruta}`,{waitUntil:'networkidle0'}); await wait(1600)
  const r = await p.evaluate(()=>({ puerta: !!document.querySelector('.p-puerta, [class*="puerta"]'), cola: document.body.innerText.replace(/\s+/g,' ').trim().slice(-190) }))
  console.log(`  ${ruta.padEnd(14)} puerta=${r.puerta} · final: …${r.cola}`)
}

console.log('\n=== los planes, escritorio y móvil ===')
for (const [w,h,etiq] of [[1440,900,'escritorio'],[390,844,'movil'],[1024,768,'tableta']]) {
  await p.setViewport({width:w,height:h,deviceScaleFactor:2})
  await p.goto(`${BASE}/precios`,{waitUntil:'networkidle0'}); await wait(1800)
  const r = await p.evaluate(()=>{
    const cols=[...document.querySelectorAll('.planes__col')].map(c=>{
      const n=c.querySelector('.planes__nombre'), pr=c.querySelector('.planes__precio')
      return { nombre: n?.textContent?.trim(), izqN: n?Math.round(n.getBoundingClientRect().left):null, izqP: pr?Math.round(pr.getBoundingClientRect().left):null, arribaP: pr?Math.round(pr.getBoundingClientRect().top):null }
    })
    return { cols, desborde: document.documentElement.scrollWidth>window.innerWidth+1 }
  })
  console.log(`  ${etiq}: desborde=${r.desborde}`)
  for (const c of r.cols) console.log(`     ${String(c.nombre).padEnd(8)} nombre x=${c.izqN} · precio x=${c.izqP} · precio y=${c.arribaP}`)
  await p.screenshot({ path: `${OUT}/precios-${etiq}.png` })
}
await ctx.close(); await b.close()
