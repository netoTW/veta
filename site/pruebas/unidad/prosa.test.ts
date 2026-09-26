/* Números de la prosa a la tabla de §23 (contrato). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { numerosDeProsa } from '../../src/lib/lenguaje.ts'
const F = '\u202F'
const casos: [string, string][] = [
  ['ingresos bruta (fees de 17.676.632 USD en 30d)', `ingresos bruta (fees de 17${F}676${F}632${F}USD en 30d)`],
  ['creció 17,3% en 30 días', `creció 17,3${F}% en 30 días`],
  ['cae 25 %; el límite es 15 %', `cae 25${F}%; el límite es 15${F}%`],
  ['Sube Anchor de 0.32.1 a 1.0.2', 'Sube Anchor de 0.32.1 a 1.0.2'],
  ['un margen de 1.5 veces', 'un margen de 1,5 veces'],
  ['precio 0,3010 USD', `precio 0,3010${F}USD`],
  ['cayó -12,4 % en la semana', `cayó −12,4${F}% en la semana`],
  ['el máximo del 2026-08-24', 'el máximo del 24 ago 2026'],
  ['SIMD-0437 en Solana', 'SIMD-0437 en Solana'],
  ['1.425.000.000 ENA en circulación', `1${F}425${F}000${F}000 ENA en circulación`],
]
for (const [a, b] of casos) test(a, () => assert.equal(numerosDeProsa(a), b))
