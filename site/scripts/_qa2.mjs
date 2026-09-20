import puppeteer from 'puppeteer-core'
const BASE='https://www.vetalab.io', CLAVE='Qa-revision-2026-veta'
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox','--hide-scrollbars','--use-gl=angle','--use-angle=metal','--ignore-gpu-blocklist'] })
const wait = ms => new Promise(r=>setTimeout(r,ms))

console.log('=== qué ve un visitante y un gratis donde no hay mensaje ===')
for (const [rol, email] of [['visitante',null],['gratis','qa-gratis@vetalab.io']]) {
  const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({width:1440,height:900})
  if (email) { await p.goto(`${BASE}/entrar`,{waitUntil:'domcontentloaded'}); await p.evaluate(async(e,pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw}),credentials:'same-origin'})}, email, CLAVE) }
  for (const ruta of ['/seguimiento','/watchlist','/analisis']) {
    await p.goto(`${BASE}${ruta}`,{waitUntil:'networkidle0'}); await wait(1500)
    const t = await p.evaluate(()=>document.body.innerText.replace(/\s+/g,' ').trim())
    console.log(`  ${rol.padEnd(10)} ${ruta.padEnd(14)} ${t.slice(0,150)}`)
  }
  await ctx.close()
}

console.log('\n=== tiempos reales (navigation timing, sin esperas mías) ===')
const ctx = await b.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({width:1440,height:900})
await p.goto(`${BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.evaluate(async(e,pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw}),credentials:'same-origin'})}, 'qa-pro@vetalab.io', CLAVE)
const rutas = ['/','/precios','/metodologia','/nosotros','/gemas','/seguimiento','/analisis','/watchlist','/votacion','/analizar','/cuenta']
const lento = []
for (const ruta of rutas) {
  await p.goto(`${BASE}${ruta}`,{waitUntil:'networkidle0'})
  const m = await p.evaluate(()=>{
    const n = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByType('paint').find(x=>x.name==='first-contentful-paint')?.startTime ?? null
    return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: fcp?Math.round(fcp):null }
  })
  const marca = (m.fcp ?? m.load) > 3000 ? '  ← MÁS DE 3 s' : ''
  if (marca) lento.push(ruta)
  console.log(`  ${ruta.padEnd(14)} primera pintura ${String(m.fcp).padStart(5)} ms · carga ${String(m.load).padStart(5)} ms${marca}`)
}
console.log('  lentas:', lento.length?lento.join(', '):'ninguna')
await ctx.close(); await b.close()
