/* La guardia única de navegaciones automáticas (ESPECIFICACION-LANZAMIENTO.md §1, A1.3). */
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

type Alm = { datos: Map<string, string>; roto: boolean }
const alm: Alm = { datos: new Map(), roto: false }
const avisos: string[] = []
const g = globalThis as unknown as Record<string, unknown>
g.window = g
g.location = { pathname: '/restablecer', search: '', reload() {}, href: '' }
g.fetch = async (_u: string, o: { body: string }) => { avisos.push(JSON.parse(o.body).mensaje); return new Response('{}') }
Object.defineProperty(g, 'sessionStorage', {
  configurable: true,
  get() {
    if (alm.roto) throw new Error('SecurityError: bloqueado')
    return { getItem: (k: string) => alm.datos.get(k) ?? null, setItem: (k: string, v: string) => { alm.datos.set(k, v) } }
  },
})
g.name = ''

const { puedo, rutaPropia, VENTANA_MS } = await import('../../src/lib/guardaNavegacion.ts')

beforeEach(() => { alm.datos.clear(); alm.roto = false; g.name = ''; avisos.length = 0 })

test('la primera recarga pasa y la segunda dentro de la ventana se niega', () => {
  assert.equal(puedo('recarga', 'fragmento', 1_000), true)
  assert.equal(puedo('recarga', 'fragmento', 1_000 + VENTANA_MS - 1), false)
  assert.match(avisos[0], /negada \(repetida/)
})

test('pasada la ventana vuelve a poder (el siguiente despliegue tiene su oportunidad)', () => {
  assert.equal(puedo('recarga', 'fragmento', 1_000), true)
  assert.equal(puedo('recarga', 'fragmento', 1_000 + VENTANA_MS), true)
})

test('claves distintas no se estorban', () => {
  assert.equal(puedo('recarga', 'fragmento', 1_000), true)
  assert.equal(puedo('redireccion', 'auth', 1_001), true)
})

test('sin sessionStorage usa window.name, que sobrevive a la recarga', () => {
  alm.roto = true
  assert.equal(puedo('recarga', 'fragmento', 5_000), true)
  assert.match(String(g.name), /^veta\.guarda:/)
  assert.equal(puedo('recarga', 'fragmento', 5_500), false) // el bucle de 78 recargas en 10 s, cortado en la segunda
})

test('sin ningún almacenamiento se niega siempre', () => {
  alm.roto = true
  Object.defineProperty(g, 'name', { configurable: true, get() { throw new Error('bloqueado') }, set() { throw new Error('bloqueado') } })
  try {
    assert.equal(puedo('recarga', 'fragmento', 9_000), false)
    assert.equal(puedo('recarga', 'fragmento', 99_000), false)
    assert.match(avisos[0], /sin almacenamiento|no se pudo anotar/)
  } finally { Object.defineProperty(g, 'name', { configurable: true, writable: true, value: '' }) }
})

test('volver sólo acepta rutas propias', () => {
  assert.equal(rutaPropia('/analisis/CELO', '/gemas'), '/analisis/CELO')
  assert.equal(rutaPropia('//evil.com', '/gemas'), '/gemas')
  assert.equal(rutaPropia('/\\evil.com', '/gemas'), '/gemas')
  assert.equal(rutaPropia('https://evil.com', '/gemas'), '/gemas')
  assert.equal(rutaPropia(null, '/gemas'), '/gemas')
})
