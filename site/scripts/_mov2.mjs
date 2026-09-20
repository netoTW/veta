import puppeteer from 'puppeteer-core'
const BASE='https://www.vetalab.io', CLAVE='Qa-revision-2026-veta'
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox','--hide-scrollbars'] })
const p = await b.newPage()
const wait = ms => new Promise(r=>setTimeout(r,ms))
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await p.goto(`${BASE}/entrar`,{waitUntil:'domcontentloaded'})
await p.evaluate(async(e,pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e,password:pw}),credentials:'same-origin'})}, 'qa-pro@vetalab.io', CLAVE)
for (const ruta of ['/precios','/contacto','/gemas','/seguimiento','/analisis','/watchlist','/cuenta','/entrar','/registro']) {
  await p.goto(`${BASE}${ruta}`,{waitUntil:'networkidle0'}); await wait(1400)
  const r = await p.evaluate(() => {
    const cortados = [], solapes = []
    const vis = []
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.display==='none'||cs.visibility==='hidden') continue
      const b = el.getBoundingClientRect(); if (b.width<2||b.height<2) continue
      if (!el.children.length && (el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2) && cs.overflow==='visible' && (el.textContent||'').trim())
        cortados.push(`${(el.className||el.tagName).toString().slice(0,26)} ▸ ${(el.textContent||'').trim().slice(0,46)} (${el.scrollWidth}>${el.clientWidth})`)
      if (['A','BUTTON','INPUT'].includes(el.tagName)) vis.push([el, b])
    }
    for (let i=0;i<vis.length;i++) for (let j=i+1;j<vis.length;j++) {
      const [ea,a]=vis[i], [eb,c]=vis[j]
      const x=Math.max(0,Math.min(a.right,c.right)-Math.max(a.left,c.left)), y=Math.max(0,Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top))
      if (x>6&&y>6) solapes.push(`${ea.tagName}.${(ea.className||'').toString().slice(0,18)} × ${eb.tagName}.${(eb.className||'').toString().slice(0,18)}`)
    }
    return { cortados: cortados.slice(0,3), solapes: [...new Set(solapes)].slice(0,3) }
  })
  if (r.cortados.length||r.solapes.length) {
    console.log(`\n  ${ruta}`)
    for (const x of r.cortados) console.log('     cortado:', x)
    for (const x of r.solapes) console.log('     solape:', x)
  }
}
await b.close()
