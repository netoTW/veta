/* Las hojas de estilo cierran todas sus llaves.

   Un bloque sin cerrar al final de un archivo no da error: el minificador lo cierra
   solo, y todo lo que se agregue después queda adentro sin que nadie lo note. Pasó
   el 12-oct en pulida.css: un @media (prefers-reduced-motion) abierto se tragó el
   vidrio liviano del teléfono y el aviso «Sin conexión», que sólo se aplicaban a
   quien tuviera el movimiento reducido. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dirname, '../../src/styles')

for (const f of readdirSync(DIR).filter((x) => x.endsWith('.css'))) {
  test(`${f}: llaves balanceadas`, () => {
    // sin comentarios ni cadenas, que pueden llevar llaves sueltas
    const s = readFileSync(join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    let d = 0, linea = 1
    for (const ch of s) {
      if (ch === '\n') linea++
      else if (ch === '{') d++
      else if (ch === '}') { d--; assert.ok(d >= 0, `${f}: «}» de más hacia la línea ${linea}`) }
    }
    assert.equal(d, 0, `${f}: ${d} bloque(s) sin cerrar al final`)
  })
}
