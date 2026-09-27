/* Audita el texto que ve un cliente buscando voseo y vocabulario interno.
   Uso: node scripts/auditar-lenguaje.mjs   (con el servidor en modo preview)
   Devuelve 0 palabras si la web cumple las reglas de CLAUDE.md, y sale con 1 si no:
   es uno de los invariantes que frenan un despliegue (npm run invariantes). */
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>[l.slice(0,l.indexOf('=')).trim(),l.slice(l.indexOf('=')+1).trim()]))
const PROHIBIDAS = /\b(escéptico|verificador|redactor|umbral|observable|criterio|§|corrida|scanner|sos|tenés|podés|querés|elegís|decidís|pedí|entrá|probá|escribí|tocá|votá|elegí|marcás|mirás|acá)\b/gi
/* Texto de máquina que se cuela en pantallas de cliente: nombres de campo en
   snake_case, cadenas de llamada a una fuente, URL sueltas y jerga de índice.
   Es la familia que sacó "revenue_holders_30d" y "binance:spot/klines · equal-weight". */
/* §6 (A6.3): lo que no hay no se enseña, y lo que se corrigió no se le cuenta al cliente.
   Lo único que puede decir un informe es «sin verificar» y «No entra en este informe: …». */
// «dato no disponible» sí puede salir: es el hueco de una cifra retirada dentro de su frase (§20.3).
const INCOMPLETO = /\b(ausentes?|parcial(es)?|retirad[oa]s?|corregid[oa]s?|(?<!dato )no disponibles?)\b/gi
/* Nada puede prometer rentabilidad (CLAUDE.md, ESPECIFICACION-SENALES.md B1.4): en toda la web. */
const PROMESAS = /\b(garantiz\w*|ganar[áa]s|vas a ganar|rentabilidad asegurada|retorno asegurado|sin riesgo|duplic\w* tu|triplic\w* tu|retorno esperado|rentabilidad esperada|dinero f[áa]cil)\b/gi
const MAQUINA = /\b[a-z]+(?:_[a-z0-9]+){1,}\b|\b(?:binance|defillama|coingecko|okx|arkham):[\w\/]+|dataType=|equal-weight|long-only|https?:\/\/[^\s)]+/g
/* Lo que sí puede aparecer: palabras compuestas nuestras y direcciones públicas. */
const PERDONADAS = /^(veta_|utm_|no_|sin_)|^(e_?mail|on_?chain)$|vetalab\.io|bls\.gov|federalreserve\.gov|whop\.com/i
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'] })
const p = await b.newPage(); await p.setViewport({width:1440,height:1000})
await p.goto('http://localhost:5310/gemas',{waitUntil:'networkidle0'})
await p.evaluate(async (pw)=>{await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'pro@veta.local',password:pw}),credentials:'same-origin'})}, env.VETA_DEMO_PASSWORD)
// El detalle de TODO lo publicado, no de uno fijo: un texto del motor que se cuela en un informe
// que nadie abrió en la prueba es igual de visible para el cliente.
const publicados = await p.evaluate(async () => {
  const a = await fetch('/api/contenido/analisis').then((r) => r.json()).catch(() => [])
  const g = await fetch('/api/contenido/gemas').then((r) => r.json()).catch(() => ({ gemas: [] }))
  return [...a.map((x) => '/analisis/' + x.id), ...(g.gemas ?? []).map((x) => '/gemas/' + x.id)]
})
const rutas = [...publicados, '/','/gemas','/seguimiento','/analisis','/watchlist','/analizar','/votacion','/cuenta',
  // Las páginas públicas y las nuevas: son las que más texto de venta llevan.
  '/metodologia','/nosotros','/precios','/noticias','/gracias','/terminos','/privacidad','/contacto','/entrar','/registro','/recuperar']
let total = 0
for (const r of rutas) {
  await p.goto('http://localhost:5310'+r,{waitUntil:'networkidle0'}); await new Promise(x=>setTimeout(x,1800))
  const t = await p.evaluate(()=>document.body.innerText)
  // La regla de §6 es para informes y sus listas: en una noticia, «se había retirado» es castellano.
  const esInforme = /^\/(analisis|gemas|analizar|seguimiento)(\/|$)/.test(r)
  const hits = [...new Set([...(t.match(PROHIBIDAS)||[]), ...(t.match(PROMESAS)||[]), ...(esInforme ? (t.match(INCOMPLETO)||[]) : [])].map(s=>s.toLowerCase()))]
  for (const m of new Set(t.match(MAQUINA)||[])) if (!PERDONADAS.test(m)) hits.push(m.slice(0,48))
  total += hits.length
  console.log('  '+(hits.length?'⚠ ':'✓ ')+r.padEnd(38)+(hits.join(', ')||'limpio'))
  for (const h of hits) { const i = t.toLowerCase().indexOf(h); console.log('      …'+t.slice(Math.max(0,i-90), i+90).replace(/\n/g,' ')+'…') }
}
// Los correos salientes: el mismo texto de cliente, y nadie los mira nunca.
import { readdirSync as _ls, readFileSync as _leer } from 'node:fs'
try {
  const dir = 'server/correo-saliente'
  const ficheros = _ls(dir).filter((f) => f.endsWith('.txt')).slice(-12)
  console.log('  ---- correos (' + ficheros.length + ')')
  for (const f of ficheros) {
    const t = _leer(dir + '/' + f, 'utf8')
    const hits = [...new Set((t.match(PROHIBIDAS) || []).map((x) => x.toLowerCase()))]
    total += hits.length
    console.log('  ' + (hits.length ? '⚠ ' : '✓ ') + f.slice(0, 44).padEnd(46) + (hits.join(', ') || 'limpio'))
  }
} catch (e) { console.log('  ---- correos: sin carpeta (' + e.message.slice(0, 40) + ')') }
console.log('  ---- palabras distintas encontradas:', total)
await b.close()
process.exit(total ? 1 : 0)
