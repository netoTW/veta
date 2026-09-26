/* Textos de cada estado de un pedido (ESPECIFICACION-LANZAMIENTO.md §5, contrato §20). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textoDeEstado, horaEstimada } from '../../src/producto/analizar/estados.ts'

const base = { simbolo: 'CELO', nombre: 'Celo' }
const ahora = new Date('2026-09-26T10:00:00Z')
const casos: [string, Parameters<typeof textoDeEstado>[0], string, RegExp | null][] = [
  ['en cola con hora', { ...base, estado: 'en_cola', enviada: true, puesto: 2, inicio_estimado: '2026-09-26T12:30:00Z' }, 'Tu análisis de Celo está en la cola', /^Puesto 2\. Empieza hacia las \d\d:\d\d\.$/],
  ['en cola sin hora (o requiere_admin)', { ...base, estado: 'en_cola', enviada: true, puesto: null, posicion_cola: 3 }, 'Tu análisis de Celo está en la cola', /^Puesto 3\. Te avisamos en cuanto empiece\.$/],
  ['reservado por el tope', { ...base, estado: 'en_cola', enviada: false }, 'Tu análisis de Celo está reservado', /próximo turno/],
  ['en curso', { ...base, estado: 'en_curso' }, 'Analizando Celo', /te avisamos al terminar/],
  ['entregado', { ...base, estado: 'listo', resultado: { tesis: null } }, 'Tu análisis de Celo está listo', null],
  ['entregado sin tesis', { ...base, estado: 'listo', resultado: { motivo_sin_tesis_cliente: 'Una de las cifras no se pudo confirmar.' } }, 'Tu análisis de Celo está listo', /^Esta vez sin tesis, y te decimos por qué en el informe\./],
  ['no analizable', { ...base, estado: 'no_analizable', motivo_no_analizable: 'Ninguna fuente da un precio reciente' }, 'Celo no da para un análisis completo', /^Ninguna fuente da un precio reciente\. No se descontó nada de tu cupo\.$/],
  ['cancelado', { ...base, estado: 'fallido', fallo: { codigo: 'cancelado' } }, 'Cancelaste este análisis', /No se descontó/],
  ['bloqueado viejo', { ...base, estado: 'bloqueado' }, 'Este análisis no se completó', /No se descontó de tu cupo/],
  ['fallido viejo con código', { ...base, estado: 'fallido', fallo: { codigo: 'fuente_caida' } }, 'Este análisis no se completó', /No se descontó de tu cupo/],
  ['estado desconocido', { ...base, estado: 'raro' }, 'Estamos comprobando tu pedido', /Tu cupo está a salvo/],
]
for (const [nombre, s, titular, cuerpo0] of casos) {
  test(nombre, () => {
    const t = textoDeEstado(s, ahora)
    assert.equal(t.titular, titular)
    if (cuerpo0) assert.match(t.cuerpo[0], cuerpo0)
    // Nunca vacío, nunca jerga ni voseo.
    assert.ok(t.titular.length > 0 && t.etiqueta.length > 0)
    assert.doesNotMatch([t.titular, ...t.cuerpo].join(' '), /bloque|verificador|motor|§|tenés|podés|pedí/i)
  })
}
test('la hora estimada no promete el pasado', () => {
  assert.equal(horaEstimada('2026-09-26T08:00:00Z', ahora), null)
  assert.match(horaEstimada('2026-09-27T09:00:00Z', ahora) ?? '', /^mañana hacia las /)
})
