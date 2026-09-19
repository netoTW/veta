/* ============================================================================
   Qué patrones del taller siguen apareciendo en la prosa del sistema de
   análisis, con cuántas veces y un ejemplo real de cada uno.

   Lo que sale de aquí va a PATRONES-PROSA-MOTOR.md, que es la lista que se le
   pasa al motor para el Narrador. Los patrones se leen del propio filtro, así
   que la lista nunca se desincroniza del código.

   Uso:  npx tsx scripts/patrones-prosa.ts [--md]
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { FAMILIAS_INTERNAS, TRADUCCIONES, VOSEO, REPAROS } from '../src/lib/lenguaje.ts'

const BASE = process.env.VETA_BASE_CONTENIDO ?? '../datos-motor/base_contenido'
const ARCHIVOS = ['gema.jsonl', 'analisis.jsonl']

type Informe = Record<string, unknown>
const informes: Informe[] = []
for (const f of ARCHIVOS) {
  const ruta = resolve(BASE, f)
  if (!existsSync(ruta)) continue
  for (const l of readFileSync(ruta, 'utf8').split('\n')) if (l.trim()) informes.push(JSON.parse(l))
}

/** Todo texto del informe que un cliente puede llegar a leer. */
function textosDeCliente(inf: Informe): { campo: string; texto: string }[] {
  const out: { campo: string; texto: string }[] = []
  const push = (campo: string, v: unknown) => { if (typeof v === 'string' && v.trim().length > 12) out.push({ campo, texto: v }) }
  push('tesis', inf.tesis)
  const fe = inf.ficha_esencial as Record<string, unknown> | undefined
  if (fe) for (const k of ['tesis_una_linea', 'riesgo_resumen', 'que_la_invalidaria']) push(`ficha_esencial.${k}`, fe[k])
  if (Array.isArray(fe?.catalizadores)) fe!.catalizadores.forEach((c, i) => push(`ficha_esencial.catalizadores[${i}]`, c))
  const niv = inf.niveles as Record<string, { esencial?: { texto?: string } }> | undefined
  if (niv) for (const [k, v] of Object.entries(niv)) push(`niveles.${k}.esencial`, v?.esencial?.texto)
  for (const e of (inf.escenarios as Record<string, unknown>[] | undefined) ?? []) push('escenarios[].catalizador', e.catalizador)
  return out
}

interface Cuenta { que: string; n: number; informes: Set<string>; ejemplo: string; campo: string }
const cuentas = new Map<string, Cuenta>()
const anota = (clave: string, que: string, inf: Informe, campo: string, ejemplo: string) => {
  const c = cuentas.get(clave) ?? { que, n: 0, informes: new Set<string>(), ejemplo, campo }
  c.n++; c.informes.add(String(inf.id))
  if (!c.ejemplo) { c.ejemplo = ejemplo; c.campo = campo }
  cuentas.set(clave, c)
}

const recorte = (t: string, m: string) => {
  const i = Math.max(0, t.toLowerCase().indexOf(m.toLowerCase()) - 40)
  return (i > 0 ? '…' : '') + t.slice(i, i + 150).trim() + (t.length > i + 150 ? '…' : '')
}

for (const inf of informes) {
  for (const { campo, texto } of textosDeCliente(inf)) {
    for (const fam of FAMILIAS_INTERNAS) {
      for (const p of fam.patrones) {
        const m = texto.match(new RegExp(p, 'i'))
        if (m) anota(`${fam.clave}:${p}`, fam.que, inf, campo, recorte(texto, m[0]))
      }
    }
    for (const t of TRADUCCIONES) {
      const m = texto.match(new RegExp(t.de.source, t.de.flags.replace('g', '')))
      if (m) anota(`traduccion:${t.de.source}`, `${t.nota} → ${t.a || '(se quita)'}`, inf, campo, recorte(texto, m[0]))
    }
    for (const [v] of Object.entries(VOSEO)) {
      const m = texto.match(new RegExp(`(?<!\\p{L})${v}(?!\\p{L})`, 'iu'))
      if (m) anota(`voseo:${v}`, `voseo → ${VOSEO[v]}`, inf, campo, recorte(texto, m[0]))
    }
    for (const r of REPAROS) {
      const m = texto.match(r.re)
      if (m) anota(`reparo:${r.que}`, r.que, inf, campo, recorte(texto, m[0]))
    }
  }
}

const filas = [...cuentas.entries()].map(([clave, c]) => ({ clave, ...c, n_informes: c.informes.size }))
  .sort((a, b) => b.n_informes - a.n_informes || b.n - a.n)

if (process.argv.includes('--md')) {
  console.log(`<!-- Generado por site/scripts/patrones-prosa.ts sobre ${informes.length} informes. No editar a mano. -->\n`)
  console.log(`| Patrón | Qué es | Informes | Veces | Ejemplo real |`)
  console.log(`|---|---|---:|---:|---|`)
  for (const f of filas) {
    const ej = f.ejemplo.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    console.log(`| \`${f.clave.split(':').slice(1).join(':')}\` | ${f.que} | ${f.n_informes} | ${f.n} | ${ej} |`)
  }
} else {
  console.log(`informes leídos: ${informes.length}`)
  console.log(`patrones que disparan: ${filas.length}\n`)
  for (const f of filas) console.log(`${String(f.n_informes).padStart(3)} inf · ${String(f.n).padStart(3)}× · ${f.clave}\n        ${f.ejemplo.slice(0, 120)}`)
}
