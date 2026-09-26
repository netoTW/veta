/* ============================================================================
   Tenencia declarada: ninguna moneda en la que el operador tenga posición aparece
   en nada que vea un cliente (decisión de Pablo, 26-sep-2026).

   La lista es la del motor (`config/conflictos_interes.yaml`), leída del mismo
   fichero y no copiada: una copia se desincroniza. El motor ya excluye esas
   monedas de sus rutas, pero lo que la web sirve sale también de exportaciones
   anteriores a esa regla (la watchlist traía SYN). Por eso el filtro vive en UN
   sitio, a la salida de toda la API, y no ruta por ruta: una ruta nueva queda
   cubierta sin que nadie se acuerde.

   Regla de filtrado, para cualquier rol que no sea admin:
   - un elemento de una lista que sea de una moneda declarada se quita;
   - una respuesta que en sí misma es de una moneda declarada pasa a 404.
   ========================================================================== */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Context, Next } from 'hono'
import { ENV } from './entorno.ts'
import type { Rol } from '../src/lib/matriz.ts'

export const RUTA_CONFLICTOS = process.env.VETA_CONFLICTOS
  ?? resolve(ENV.BASE_CONTENIDO, '..', 'config', 'conflictos_interes.yaml')

export interface Declaradas { simbolos: Set<string>; ids: Set<string>; contratos: Set<string> }

/** El YAML es plano y lo escribe el motor con forma fija: símbolo en la raíz,
    `id_coingecko` y `contratos` debajo. No hace falta un parser completo. */
export function leerDeclaradas(texto: string): Declaradas {
  const d: Declaradas = { simbolos: new Set(), ids: new Set(), contratos: new Set() }
  let enContratos = false
  for (const linea of texto.split('\n')) {
    if (/^\s*#/.test(linea) || !linea.trim()) continue
    const raiz = linea.match(/^([A-Za-z0-9._-]+):\s*$/)
    if (raiz) { d.simbolos.add(raiz[1].toUpperCase()); enContratos = false; continue }
    const id = linea.match(/^\s+id_coingecko:\s*["']?([^"'\s]+)["']?\s*$/)
    if (id) { d.ids.add(id[1].toLowerCase()); enContratos = false; continue }
    if (/^\s+contratos:\s*$/.test(linea)) { enContratos = true; continue }
    const item = linea.match(/^\s+-\s*["']?([^"'\s]+)["']?\s*$/)
    if (enContratos && item) { d.contratos.add(item[1].toLowerCase()); continue }
    if (/^\s+[a-z_]+:/.test(linea)) enContratos = false
  }
  return d
}

let cache: { mtime: number; d: Declaradas } | null = null
let avisado = false
export function declaradas(): Declaradas {
  if (!existsSync(RUTA_CONFLICTOS)) {
    if (!avisado) { console.error(`[tenencia] no existe ${RUTA_CONFLICTOS}: no hay lista de tenencia declarada`); avisado = true }
    return { simbolos: new Set(), ids: new Set(), contratos: new Set() }
  }
  const mtime = statSync(RUTA_CONFLICTOS).mtimeMs
  if (!cache || cache.mtime !== mtime) cache = { mtime, d: leerDeclaradas(readFileSync(RUTA_CONFLICTOS, 'utf8')) }
  return cache.d
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')

/** ¿Este objeto es de una moneda declarada? Por símbolo, id de CoinGecko,
    contrato, identificador de informe (`SYN-…`) o lista de monedas de una pieza. */
export function esDeclarada(o: Record<string, unknown>, d: Declaradas): boolean {
  if (!d.simbolos.size) return false
  const sym = texto(o.simbolo ?? o.symbol).toUpperCase()
  if (sym && d.simbolos.has(sym)) return true
  const idcg = texto(o.id_coingecko).toLowerCase()
  if (idcg && d.ids.has(idcg)) return true
  const ct = texto(o.contrato).toLowerCase()
  if (ct && d.contratos.has(ct)) return true
  for (const k of ['id', 'informe_id', 'gema_id', 'analisis_origen']) {
    const pref = texto(o[k]).split('-')[0].toUpperCase()
    if (pref && texto(o[k]).includes('-') && d.simbolos.has(pref)) return true
  }
  if (Array.isArray(o.monedas) && o.monedas.some((m) => d.simbolos.has(texto(typeof m === 'object' && m ? (m as { simbolo?: unknown }).simbolo : m).toUpperCase()))) return true
  return false
}

/** Quita de cualquier lista, a cualquier profundidad, lo que sea de una moneda declarada. */
export function filtrar(v: unknown, d: Declaradas): unknown {
  if (Array.isArray(v)) return v.filter((x) => !(x && typeof x === 'object' && !Array.isArray(x) && esDeclarada(x as Record<string, unknown>, d))).map((x) => filtrar(x, d))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) out[k] = filtrar(x, d)
    return out
  }
  return v
}

/** Middleware de salida para /api/*. Admin ve todo; el resto, nada de lo declarado. */
export async function sinTenencia(c: Context<{ Variables: { rol: Rol } }>, next: Next) {
  await next()
  if (c.get('rol') === 'admin') return
  if (!(c.res.headers.get('content-type') ?? '').includes('application/json')) return
  const d = declaradas()
  if (!d.simbolos.size) return
  const cuerpo = await c.res.clone().json().catch(() => undefined)
  if (cuerpo === undefined) return
  const cabeceras = new Headers(c.res.headers); cabeceras.delete('content-length')
  // Una respuesta que es, entera, de una moneda declarada no existe para este rol.
  const raiz = cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo as Record<string, unknown> : null
  if (raiz && esDeclarada(raiz, d)) {
    c.res = new Response(JSON.stringify({ error: 'no_encontrado' }), { status: 404, headers: cabeceras })
    return
  }
  c.res = new Response(JSON.stringify(filtrar(cuerpo, d)), { status: c.res.status, headers: cabeceras })
}
