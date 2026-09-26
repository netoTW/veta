/* Ninguna recarga ni redirección automática fuera de la guardia única
   (src/lib/guardaNavegacion.ts). Hace de regla de lint: oxlint no tiene
   no-restricted-syntax, y esto no puede depender de acordarse.

   Falla si en src/ aparece, fuera de la guardia:
   - location.reload / assign / replace, location.href = …, window.location = …
     (salvo en una línea marcada «nav-por-clic»: la dispara un botón, no la página);
   - una función de useNavigate() llamada dentro de un useEffect
     (se usa useNavegarUnaVez, que no repite la misma ruta en diez segundos).

   Uso: node scripts/revisar-navegacion.mjs [fichero…]   Sale con 1 si encuentra algo. */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const GUARDIA = 'src/lib/guardaNavegacion.ts'
const ficheros = process.argv.length > 2 ? process.argv.slice(2) : (function recorrer(d) {
  return readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? recorrer(p) : /\.(tsx?|jsx?)$/.test(f) ? [p] : [] })
})('src')

const LOCATION = /\blocation\.(reload|assign|replace)\s*\(|\blocation\.href\s*=[^=]|\bwindow\.location\s*=[^=]/
const hallazgos = []
for (const f of ficheros) {
  if (f === GUARDIA) continue
  const s = readFileSync(f, 'utf8')
  s.split('\n').forEach((l, i) => { if (LOCATION.test(l) && !l.includes('nav-por-clic') && !/^\s*(\/\/|\*)/.test(l)) hallazgos.push(`${f}:${i + 1}  ${l.trim().slice(0, 100)}`) })
  // navigate() dentro de un efecto
  const navs = [...s.matchAll(/const\s+(\w+)\s*=\s*useNavigate\(\)/g)].map((m) => m[1])
  if (!navs.length) continue
  let i = 0
  while ((i = s.indexOf('useEffect(', i)) !== -1) {
    let prof = 0, j = i + 'useEffect'.length
    for (; j < s.length; j++) { if (s[j] === '(') prof++; else if (s[j] === ')' && --prof === 0) break }
    const cuerpo = s.slice(i, j)
    for (const n of navs) if (new RegExp(`\\b${n}\\(`).test(cuerpo)) hallazgos.push(`${f}:${s.slice(0, i).split('\n').length}  ${n}() dentro de useEffect: usa useNavegarUnaVez`)
    i = j
  }
}
console.log(`\nNAVEGACIONES AUTOMÁTICAS · ${ficheros.length} ficheros`)
for (const h of hallazgos) console.log('  ✗ ' + h)
console.log(`  TOTAL: ${hallazgos.length}\n`)
process.exit(hallazgos.length ? 1 : 0)
