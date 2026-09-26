/* ============================================================================
   Límite de consultas de la ficha gratis (ESPECIFICACION-LANZAMIENTO.md §4).

   Por día y con ráfaga mínima entre consultas. El visitante cuenta por IP; quien
   tiene cuenta, por usuario (quien comparte red —una oficina, un móvil con CGNAT—
   no se castiga por los demás). Admin no tiene límite. Los números se cambian en
   /admin/operacion sin desplegar (ajustes › limites_ficha).
   ========================================================================== */
import { createHash } from 'node:crypto'
import { bd, ahora } from './db.ts'
import { ENV } from './entorno.ts'
import type { Rol } from '../src/lib/matriz.ts'

export interface Limite { dia: number; rafaga_s: number }
export type Limites = Record<'visitante' | 'gratis' | 'base' | 'pro', Limite>
export const LIMITES_POR_DEFECTO: Limites = {
  visitante: { dia: 5, rafaga_s: 5 }, gratis: { dia: 15, rafaga_s: 3 }, base: { dia: 60, rafaga_s: 2 }, pro: { dia: 60, rafaga_s: 2 },
}

let memo: { hasta: number; l: Limites } | null = null
export async function limites(): Promise<Limites> {
  if (memo && memo.hasta > Date.now()) return memo.l
  const f = await bd.uno<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'limites_ficha'").catch(() => undefined)
  let l = LIMITES_POR_DEFECTO
  try { if (f) l = { ...LIMITES_POR_DEFECTO, ...(JSON.parse(f.valor) as Partial<Limites>) } } catch { /* ajuste roto: los de siempre */ }
  memo = { hasta: Date.now() + 30_000, l }
  return l
}
export async function fijarLimites(l: Limites) {
  await bd.ejecutar("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('limites_ficha', ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado", [JSON.stringify(l), ahora()])
  memo = null
}

/* La IP de quien pregunta. Comprobado en el registro de Caddy: por Vercel llegan
   X-Vercel-Forwarded-For y X-Real-Ip con la IP del cliente, y Caddy (sin trusted_proxies)
   sustituye X-Forwarded-For por la IP de Vercel. Si se leyera ésa, todos los visitantes
   compartirían límite. Quien llame a api.vetalab.io saltándose Vercel puede falsear la
   cabecera: el límite de visitante es contra el abuso, no una barrera (BACKLOG.md). */
export function ipDe(h: Headers): string {
  const primera = (v: string | null) => (v ?? '').split(',')[0].trim()
  return primera(h.get('x-vercel-forwarded-for')) || primera(h.get('x-real-ip')) || primera(h.get('x-forwarded-for')) || 'local'
}
export const hashIp = (ip: string) => createHash('sha256').update(`${ip}|${ENV.SECRETO}`).digest('hex').slice(0, 16)

const ultima = new Map<string, number>()
export type Veredicto = { ok: true } | { ok: false; reintentar_en: number; texto: string; clave: 'dia' | 'rafaga' }

/** ¿Puede consultar ahora? Si sí, queda anotada la consulta. */
export async function permitirFicha(rol: Rol, conCuenta: boolean, usuarioId: string | null, ip: string, simbolo: string): Promise<Veredicto> {
  if (rol === 'admin') return { ok: true }
  const perfil = rol === 'visitante' ? (conCuenta ? 'gratis' : 'visitante') : rol
  const todos = await limites()
  const lim = todos[perfil]
  const ipH = hashIp(ip)
  const clave = usuarioId ? `u:${usuarioId}` : `ip:${ipH}`
  const t = Date.now()
  const antes = ultima.get(clave)
  if (antes && t - antes < lim.rafaga_s * 1000) {
    const s = Math.ceil((lim.rafaga_s * 1000 - (t - antes)) / 1000)
    return { ok: false, reintentar_en: s, clave: 'rafaga', texto: `Un momento: puedes pedir otra ficha en ${s} ${s === 1 ? 'segundo' : 'segundos'}.` }
  }
  const dia = new Date().toISOString().slice(0, 10)
  const n = usuarioId
    ? (await bd.uno<{ n: number }>('SELECT COUNT(*) AS n FROM consulta_ficha WHERE dia = ? AND usuario_id = ?', [dia, usuarioId]))!.n
    : (await bd.uno<{ n: number }>('SELECT COUNT(*) AS n FROM consulta_ficha WHERE dia = ? AND ip_hash = ? AND usuario_id IS NULL', [dia, ipH]))!.n
  if (Number(n) >= lim.dia) {
    const manana = new Date(); manana.setUTCHours(24, 0, 0, 0)
    const texto = perfil === 'visitante'
      ? `Has usado tus ${lim.dia} fichas de hoy. Con una cuenta gratis tienes ${todos.gratis.dia} al día.`
      : `Has usado tus fichas de hoy. Mañana tienes ${lim.dia} más.`
    return { ok: false, reintentar_en: Math.ceil((manana.getTime() - t) / 1000), clave: 'dia', texto }
  }
  ultima.set(clave, t)
  if (ultima.size > 20_000) ultima.clear()
  await bd.ejecutar('INSERT INTO consulta_ficha (dia, ip_hash, usuario_id, simbolo, creada) VALUES (?, ?, ?, ?, ?)', [dia, ipH, usuarioId, simbolo.slice(0, 40), ahora()])
  return { ok: true }
}
