/* Datos incompletos dichos al cliente (ESPECIFICACION-LANZAMIENTO.md §6, contrato §20.2). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lineasDeIntegridad, partirSinVerificar } from '../../src/producto/integridad.tsx'

test('sin verificar: una línea por dato, con su fuente y su cifra', () => {
  const l = lineasDeIntegridad({ fuentes: [], integridad: { sin_verificar: [{ que: 'desbloqueo del equipo en marzo de 2027', fuente: 'obtenido de docs.x.io, sin verificar', cifra: '15 %' }] } })
  assert.deepEqual(l.sinVerificar, ['Obtenido de docs.x.io, sin verificar: desbloqueo del equipo en marzo de 2027 (15\u202F%).'])
})
test('una fuente sin la coletilla se completa', () => {
  const l = lineasDeIntegridad({ fuentes: [], integridad: { sin_verificar: [{ que: 'ingresos de 30 días', fuente: 'Token Terminal' }] } })
  assert.equal(l.sinVerificar[0], 'Obtenido de Token Terminal, sin verificar: ingresos de 30 días.')
})
test('las retiradas no producen ninguna línea para el cliente', () => {
  const l = lineasDeIntegridad({ fuentes: [], integridad: { retiradas: [{ que: 'x' }], no_disponibles: [] } as never })
  assert.deepEqual(l, { sinVerificar: [], noDisponibles: [] })
})
test('registro viejo: lo ausente sale de las fuentes, sólo si se puede decir en llano', () => {
  const l = lineasDeIntegridad({ fuentes: [
    { campo: 'tvl_usd', fuente: 'defillama', timestamp: '', calidad: 'ausente' },
    { campo: 'campo_raro_interno', fuente: 'x', timestamp: '', calidad: 'ausente' },
    { campo: 'mcap_usd', fuente: 'x', timestamp: '', calidad: 'ok' },
  ] as never })
  assert.deepEqual(l.noDisponibles, ['fondos bloqueados'])
})
test('la marca ⟦sv:i⟧ se parte en texto y nota', () => {
  assert.deepEqual(partirSinVerificar('El equipo desbloquea un 15 %⟦sv:0⟧ en marzo.'), [{ texto: 'El equipo desbloquea un 15 %' }, { nota: 0 }, { texto: ' en marzo.' }])
})

test('un nombre de dato del motor sale en llano', () => {
  const l = lineasDeIntegridad({ fuentes: [], integridad: { no_disponibles: [{ que: 'TVL ethena-usde y Δ30d' }] } })
  assert.equal(l.noDisponibles[0], 'fondos bloqueados y variación a 30 días')
})
