/* ============================================================================
   Qué está publicado, en memoria.

   Cada petición de contenido preguntaba a la base, informe por informe, cuál
   era su última decisión: 1 + N consultas a Supabase, que está al otro lado
   del Atlántico (100 ms cada una). Son un puñado de filas que sólo cambian
   cuando alguien decide en la bandeja. Aquí se cargan de una vez y se olvidan
   en cuanto cambian; además caducan solas cada minuto, por si una fila entra
   por otra vía.

   Quien escribe en `publicacion` llama a `publicacionCambio()` después.
   ========================================================================== */
import { bd } from './db.ts'

export interface UltimaDecision {
  accion: string; motivo: string | null; version_registro: number; admin_email: string; fecha: string
  bloqueo_confirmado: number; verificador_estado: string | null
}

const VIDA_MS = 60_000
let decisiones: { hasta: number; porId: Map<string, UltimaDecision & { tipo: string }> } | null = null
let cargando: Promise<Map<string, UltimaDecision & { tipo: string }>> | null = null
const oyentes: (() => void)[] = []

/** Última decisión de cada informe (y de cada noticia), por id. */
export async function ultimasDecisiones() {
  if (decisiones && decisiones.hasta > Date.now()) return decisiones.porId
  return cargar()
}
/* Se refresca sola antes de caducar: si esperara a caducar, la primera petición tras un
   rato sin tráfico pagaba la consulta a Supabase (medido: 257 ms en /analisis). */
setInterval(() => { cargar().catch((e) => console.warn('[publicacion] refresco:', (e as Error).message)) }, 45_000).unref()

function cargar() {
  // Si varias peticiones llegan a la vez con la caché vacía, se hace UNA consulta.
  cargando ??= (async () => {
    const filas = await bd.todos<UltimaDecision & { informe_id: string; tipo: string }>(
      `SELECT informe_id, tipo, accion, motivo, version_registro, admin_email, fecha, bloqueo_confirmado, verificador_estado
         FROM publicacion ORDER BY id ASC`)
    const porId = new Map<string, UltimaDecision & { tipo: string }>()
    for (const { informe_id, ...u } of filas) porId.set(informe_id, u)
    decisiones = { hasta: Date.now() + VIDA_MS, porId }
    return porId
  })().finally(() => { cargando = null })
  return cargando
}

/** Noticias cuya última decisión es despublicar. */
export async function noticiasDespublicadas(): Promise<Set<string>> {
  const fuera = new Set<string>()
  for (const [id, u] of await ultimasDecisiones()) if (u.tipo === 'noticia' && u.accion === 'despublicar') fuera.add(id)
  return fuera
}

/** Llamar tras escribir en `publicacion`. */
export function publicacionCambio() {
  decisiones = null
  for (const f of oyentes) { try { f() } catch (e) { console.error('[publicacion] oyente:', (e as Error).message) } }
}

/** Para quien necesita enterarse de cada cambio (el fichero que lee el motor). */
export function alCambiarPublicacion(f: () => void) { oyentes.push(f) }
