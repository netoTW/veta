/* Audita el texto que ve un cliente buscando voseo y vocabulario interno.
   Uso: node scripts/auditar-lenguaje.mjs   (con el servidor en modo preview)
   Devuelve 0 palabras si la web cumple las reglas de CLAUDE.md. */
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const PROHIBIDAS = /\b(escéptico|verificador|redactor|umbral|observable|criterio|§|corrida|scanner|sos|tenés|podés|querés|elegís|decidís|pedí|entrá|probá|escribí|tocá|votá|elegí|marcás|mirás|acá)\b/gi
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'] })
const p = await b.newPage(); await p.setViewport({width:1440,height:1000})
await p.goto('http://localhost:5310/gemas',{waitUntil:'networkidle0'})
await p.evaluate(async (pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'pro@veta.local',password:pw}),credentials:'same-origin'})}, env.VETA_DEMO_PASSWORD)
const rutas = ['/','/gemas','/gemas/RAY-20260912-012647','/seguimiento','/analisis','/analisis/MORPHO-20260918-053222','/watchlist','/analizar','/votacion','/cuenta']
let total = 0
for (const r of rutas) {
  await p.goto('http://localhost:5310'+r,{waitUntil:'networkidle0'}); await new Promise(x=>setTimeout(x,1800))
  const t = await p.evaluate(()=>document.body.innerText)
  const hits = [...new Set((t.match(PROHIBIDAS)||[]).map(s=>s.toLowerCase()))]
  total += hits.length
  console.log('  '+(hits.length?'⚠ ':'✓ ')+r.padEnd(38)+(hits.join(', ')||'limpio'))
  for (const h of hits) { const i = t.toLowerCase().indexOf(h); console.log('      …'+t.slice(Math.max(0,i-90), i+90).replace(/\n/g,' ')+'…') }
}
console.log('  ---- palabras distintas encontradas:', total)
await b.close()
