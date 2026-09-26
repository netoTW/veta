/* La ficha gratis: qué cifra lleva signo (ESPECIFICACION-LANZAMIENTO.md §4, contrato §23). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contexto } from '../../src/producto/analizar/ficha.tsx'
import { cifraCliente } from '../../src/lib/formato.ts'
const c = (clave: string, unidad: string | null) => contexto({ clave, unidad })
test('las variaciones llevan signo', () => {
  assert.equal(cifraCliente(1.5, '%', c('var_24h', '%')), '+1,5 %')
  assert.equal(cifraCliente(32.8, '%', c('oi_cambio_7d', '%')), '+32,8 %')
})
test('una caída no es una variación: «Peor semana de cada 20» sin «+»', () => {
  assert.equal(cifraCliente(31, '%', c('cvar_7d', '%')), '31,0 %')
  assert.equal(cifraCliente(31.7, '%', c('caida_max_90d', '%')), '31,7 %')
})
test('el precio con decimales según magnitud; las cantidades sin decimales', () => {
  assert.equal(cifraCliente(0.3401, 'USD', c('precio_usd', 'USD')), '0,3401 USD')
  assert.equal(cifraCliente(254107.4, 'USD', c('libro_2pct', 'USD')), '254 107 USD')
})
