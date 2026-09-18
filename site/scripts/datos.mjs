/* Compila la base de contenido del motor (JSONL) a JSON por sección para el SERVIDOR de la web.
   Regla dura: no se calcula nada. Sólo se toma la ÚLTIMA versión de cada registro
   (version_registro más alto) y se copia tal cual. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// En el servidor, base_contenido es la del motor (mismo disco): VETA_BASE_CONTENIDO. En local, la copia sincronizada.
const SRC = process.env.VETA_BASE_CONTENIDO ? resolve(process.env.VETA_BASE_CONTENIDO) : resolve(here, '../../datos-motor/base_contenido')
// Salida PRIVADA: la sirve el servidor aplicando la matriz de acceso. Nunca en public/.
const OUT = process.env.VETA_DATOS ? resolve(process.env.VETA_DATOS) : resolve(here, '../server/datos')
mkdirSync(OUT, { recursive: true })

const jsonl = (f) => readFileSync(resolve(SRC, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const latest = (rows) => {
  const by = new Map()
  for (const r of rows) {
    const prev = by.get(r.id)
    if (!prev || (r.version_registro ?? 0) > (prev.version_registro ?? 0)) by.set(r.id, r)
  }
  return [...by.values()]
}
// Rutas locales del motor no van a la web.
const limpiar = (r) => { const { ruta_informe, ...rest } = r; return rest }

const gemas = latest(jsonl('gema.jsonl')).map(limpiar)
const analisis = latest(jsonl('analisis.jsonl')).map(limpiar)
const watchlist = latest(jsonl('watchlist.jsonl'))
const seguimientoTodo = jsonl('seguimiento_diario.jsonl')
// Seguimiento: el id lleva la fecha (gema:fecha), así que "último" es por gema: la fecha más
// nueva y, dentro de ella, la versión más alta. El historial completo va aparte.
const seguimiento = [...new Map([...seguimientoTodo]
  .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (a.version_registro ?? 0) - (b.version_registro ?? 0))
  .map((r) => [r.gema_id, r])).values()]
const benchmark = JSON.parse(readFileSync(resolve(SRC, 'benchmark-congelado.json'), 'utf8'))
// Visuales: mapa de liquidación proyectado y series, una por informe (última corrida).
const visualesTodo = existsSync(resolve(SRC, 'visuales.jsonl')) ? jsonl('visuales.jsonl') : []
const visuales = Object.fromEntries([...visualesTodo].sort((a, b) => String(a.escrito_en).localeCompare(String(b.escrito_en))).map((v) => [v.informe_id, v]))

const meta = {
  generado_en: new Date().toISOString(),
  version_motor: gemas[0]?.version_motor ?? '',
  conteos: { gemas: gemas.length, analisis: analisis.length, watchlist: watchlist.length, seguimiento: seguimiento.length, visuales: Object.keys(visuales).length },
  versiones_seguimiento: seguimientoTodo.length,
}
writeFileSync(resolve(OUT, 'visuales.json'), JSON.stringify(visuales))
writeFileSync(resolve(OUT, 'gemas.json'), JSON.stringify(gemas))
writeFileSync(resolve(OUT, 'analisis.json'), JSON.stringify(analisis))
writeFileSync(resolve(OUT, 'watchlist.json'), JSON.stringify(watchlist))
writeFileSync(resolve(OUT, 'seguimiento.json'), JSON.stringify({ ultimo: seguimiento, historial: seguimientoTodo }))
writeFileSync(resolve(OUT, 'benchmark.json'), JSON.stringify(benchmark))
writeFileSync(resolve(OUT, 'meta.json'), JSON.stringify(meta))
console.log(JSON.stringify(meta))
