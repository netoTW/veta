/* ============================================================================
   Noticias y agenda.

   El noticiero del motor corre solo a las 12:30 UTC y deja sus piezas en
   `base_contenido/noticias/`. No pasan por la bandeja: ya se verifican por
   código antes de escribirse —enlace vivo, fecha, cifras contra el motor y
   filtro de lenguaje—, y lo que no pasa va a `rechazadas.jsonl` con su motivo.
   Lo que sí puede hacer admin es **despublicar** una pieza: se anota en la
   misma tabla `publicacion` que gobierna los informes, con tipo 'noticia'.

   La agenda sale de `agenda.json`, que el motor escribe con los eventos ya
   datados. Sólo se muestran los que están por venir: una agenda con lo de
   ayer no es una agenda. El motor garantiza que los eventos derivados de
   informes salen únicamente de lo PUBLICADO, nunca de la bandeja.

   Acceso: el titular y la primera línea son de todos; la lectura entera y los
   escenarios de la agenda, del plan Base en adelante. La lista de monedas que
   se movieron es del Pro; el agregado, de todos.
   ========================================================================== */
import { Hono } from 'hono'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { bd, ahora, registrarAccion } from './db.ts'
import { ENV } from './entorno.ts'
import { puede, type Rol } from '../src/lib/matriz.ts'
import * as contenido from './contenido.ts'
import type { Sesion } from './auth.ts'
import { noticiasDespublicadas, publicacionCambio } from './publicacion.ts'

const CARPETA = () => resolve(ENV.BASE_CONTENIDO, 'noticias')

export interface Fuente { url: string; medio: string; fecha: string; cita?: string }
export interface Pieza {
  id: string; tipo: string; titular: string
  que_paso: string; por_que_importa: string; conclusion: string
  monedas: string[]; fuentes: Fuente[]; publicada_en: string
  cifras_verificadas?: { texto: string; activo: string; valor: number; ok: boolean }[]
}
export interface Evento {
  id: string; fecha: string; tipo: string; simbolo: string | null
  que: string; hora_utc?: string; fuente_url?: string
  escenario_condicional?: { si: string; entonces: string }
  informe_id?: string
}

/* ---------- lectura con caché por mtime, igual que el resto del contenido ---------- */
const cache = new Map<string, { mtime: number; datos: unknown }>()
function leerArchivo<T>(nombre: string, parse: (t: string) => T, vacio: T): T {
  const f = resolve(CARPETA(), nombre)
  if (!existsSync(f)) return vacio
  try {
    const m = statSync(f).mtimeMs
    const c = cache.get(nombre)
    if (c && c.mtime === m) return c.datos as T
    const datos = parse(readFileSync(f, 'utf8'))
    cache.set(nombre, { mtime: m, datos })
    return datos
  } catch (e) {
    console.warn(`[noticias] ${nombre}:`, (e as Error).message)
    return vacio
  }
}
const leerJsonl = <T>(nombre: string): T[] =>
  leerArchivo<T[]>(nombre, (t) => t.split('\n').filter((l) => l.trim()).flatMap((l) => {
    try { return [JSON.parse(l) as T] } catch { return [] }
  }), [])
const leerJson = <T>(nombre: string): T | null =>
  leerArchivo<T | null>(nombre, (t) => JSON.parse(t) as T, null)

/* ---------- despublicadas ---------- */
/** La última decisión de admin sobre cada pieza. 'despublicar' la esconde para todos menos admin.
    Sale de la memoria compartida de publicación (server/publicacion.ts), no de una consulta por petición. */
const despublicadas = noticiasDespublicadas

/* ---------- recorte para quien no tiene plan ---------- */
/** La primera frase de la entradilla. Lo suficiente para saber si te interesa, no para leerla. */
export function primeraLinea(t: string): string {
  const limpio = (t ?? '').trim()
  if (!limpio) return ''
  const corte = limpio.search(/(?<=\.)\s/)
  const frase = corte > 0 ? limpio.slice(0, corte + 1) : limpio
  if (frase.length <= 220) return frase
  // Se corta por espacio: partir una palabra por la mitad se lee como un error.
  const recorte = frase.slice(0, 217)
  const espacio = recorte.lastIndexOf(' ')
  return `${(espacio > 140 ? recorte.slice(0, espacio) : recorte).trimEnd()}…`
}

const recortar = (p: Pieza) => ({
  id: p.id, tipo: p.tipo, titular: p.titular,
  que_paso: primeraLinea(p.que_paso),
  monedas: p.monedas ?? [],
  publicada_en: p.publicada_en,
  recorte: 'sin_plan' as const,
})

/* ---------- agenda ---------- */
/** Sólo lo que está por venir. Hoy cuenta: un evento de esta tarde todavía es agenda. */
function agendaFutura(retirados: Set<string>): Evento[] {
  const a = leerJson<{ eventos?: Evento[]; solo_publicados?: boolean }>('agenda.json')
  const hoy = new Date().toISOString().slice(0, 10)
  return (a?.eventos ?? [])
    .filter((e) => typeof e?.fecha === 'string' && e.fecha >= hoy)
    // Un evento que cuelga de un informe retirado se va con él.
    .filter((e) => !e.informe_id || !retirados.has(e.informe_id))
    .sort((x, y) => x.fecha.localeCompare(y.fecha))
}

const sinEscenario = (e: Evento) => {
  const { escenario_condicional: _, ...resto } = e
  return { ...resto, recorte: 'sin_plan' as const }
}

/* ---------- movimientos de la pasada ---------- */
interface Tendencias {
  calculado_en?: string
  publico?: { monedas?: { simbolo: string; nombre?: string; var_24h?: number; precio_usd?: number; rango_mcap?: number }[] }
  rastreo?: { agregado?: Record<string, unknown> }
}
function movimientosPara(rol: Rol) {
  const filas = leerJsonl<Tendencias>('tendencias.jsonl')
  const t = filas[filas.length - 1]
  if (!t) return null
  const monedas = t.publico?.monedas ?? []
  // El agregado es para todos; los nombres, del Pro.
  const detalle = puede(rol, 'watchlist') && (rol === 'pro' || rol === 'admin')
  return {
    calculado_en: t.calculado_en ?? null,
    agregado: t.rastreo?.agregado ?? null,
    n: monedas.length,
    monedas: detalle ? monedas.slice(0, 12) : [],
    recorte: detalle ? null : ('solo_pro' as const),
  }
}

/* ---------- lo que sale por la API ---------- */
export async function noticiasPara(rol: Rol) {
  const fuera = await despublicadas()
  const esAdmin = rol === 'admin'
  const completo = puede(rol, 'noticias')
  const piezas = leerJsonl<Pieza>('publicadas.jsonl')
    .filter((p) => p?.id && (esAdmin || !fuera.has(p.id)))
    .sort((a, b) => String(b.publicada_en ?? '').localeCompare(String(a.publicada_en ?? '')))
  const agenda = agendaFutura(esAdmin ? new Set<string>() : contenido.idsRetirados())
  return {
    completo,
    piezas: piezas.map((p) => (completo ? { ...p, despublicada: fuera.has(p.id) } : recortar(p))),
    agenda: agenda.map((e) => (completo ? e : sinEscenario(e))),
    movimientos: movimientosPara(rol),
    hay_agenda: existsSync(resolve(CARPETA(), 'agenda.json')),
  }
}

/* ---------- rutas de admin: despublicar y devolver ---------- */
type Vars = { sesion: Sesion | null; rol: Rol }
export const noticiasAdmin = new Hono<{ Variables: Vars }>()

noticiasAdmin.use('*', async (c, next) => {
  if (c.get('rol') !== 'admin') return c.json({ error: 'sin_acceso' }, 403)
  await next()
})

noticiasAdmin.post('/:id/:accion', async (c) => {
  const id = c.req.param('id')
  const accion = c.req.param('accion')
  if (accion !== 'despublicar' && accion !== 'republicar') return c.json({ error: 'accion_invalida' }, 400)
  const existe = leerJsonl<Pieza>('publicadas.jsonl').some((p) => p.id === id)
  if (!existe) return c.json({ error: 'no_encontrada' }, 404)
  const { motivo } = await c.req.json().catch(() => ({})) as { motivo?: string }
  const s = c.get('sesion')!
  await bd.ejecutar(
    `INSERT INTO publicacion (informe_id, tipo, version_registro, accion, motivo, verificador_estado, bloqueo_confirmado, admin_id, admin_email, fecha)
     VALUES (?, 'noticia', 1, ?, ?, NULL, 0, ?, ?, ?)`,
    [id, accion === 'despublicar' ? 'despublicar' : 'aprobar', motivo ?? null, s.user.id, s.user.email, ahora()])
  publicacionCambio()
  await registrarAccion({
    admin_id: s.user.id, admin_email: s.user.email,
    accion: `noticia.${accion}`, objetivo_tipo: 'noticia', objetivo_id: id, detalle: { motivo: motivo ?? null },
  })
  return c.json({ ok: true })
})
