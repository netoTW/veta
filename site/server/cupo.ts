/* ============================================================================
   Cupo mensual de análisis profundos (spec §5).

   - Se reinicia el día de renovación del plan, no el 1 de cada mes.
   - No acumula: lo que no se usó en el ciclo se pierde.
   - Se reserva al pedir y se devuelve si el análisis falla o queda bloqueado.
   - Admin no tiene cupo (ilimitado). Gratis y visitante: 0 profundos.
   ========================================================================== */
import { bd, ahora, asignarPlan } from './db.ts'
import { ENV } from './entorno.ts'

export interface Cupo {
  plan: string; ilimitado: boolean
  incluidos: number; usados: number; restantes: number
  periodo: string; fecha_reinicio: string
}

const masUnMes = (d: Date) => { const x = new Date(d); x.setMonth(x.getMonth() + 1); return x }
const menosUnMes = (d: Date) => { const x = new Date(d); x.setMonth(x.getMonth() - 1); return x }
type Sus = { plan: string; fecha_renovacion: string }

/** El ciclo vigente de un usuario: avanza la renovación si ya pasó y garantiza la fila del cupo. */
export async function cupoDe(usuarioId: string, plan: string, esAdmin = false): Promise<Cupo> {
  let sus = await bd.uno<Sus>('SELECT plan, fecha_renovacion FROM suscripcion WHERE usuario_id = ?', [usuarioId])
  if (!sus) { await asignarPlan(usuarioId, (plan === 'pro' || plan === 'base' ? plan : 'gratis')); sus = (await bd.uno<Sus>('SELECT plan, fecha_renovacion FROM suscripcion WHERE usuario_id = ?', [usuarioId]))! }
  let renov = new Date(sus.fecha_renovacion)
  const hoy = new Date()
  if (renov.getTime() <= hoy.getTime()) {
    while (renov.getTime() <= hoy.getTime()) renov = masUnMes(renov)
    await bd.ejecutar('UPDATE suscripcion SET fecha_renovacion = ?, actualizada_en = ? WHERE usuario_id = ?', [renov.toISOString(), ahora(), usuarioId])
  }
  const periodo = menosUnMes(renov).toISOString().slice(0, 10)
  const incluidos = ENV.CUPO[plan] ?? 0
  await bd.ejecutar(`INSERT INTO cupo (usuario_id, periodo, analisis_incluidos, analisis_usados, solicitudes_scanner_usadas, fecha_reinicio) VALUES (?, ?, ?, 0, 0, ?)
              ON CONFLICT(usuario_id, periodo) DO UPDATE SET analisis_incluidos = excluded.analisis_incluidos, fecha_reinicio = excluded.fecha_reinicio`,
    [usuarioId, periodo, incluidos, renov.toISOString()])
  const fila = (await bd.uno<{ analisis_incluidos: number; analisis_usados: number }>('SELECT analisis_incluidos, analisis_usados FROM cupo WHERE usuario_id = ? AND periodo = ?', [usuarioId, periodo]))!
  return {
    plan, ilimitado: esAdmin,
    incluidos: fila.analisis_incluidos, usados: fila.analisis_usados,
    restantes: esAdmin ? Infinity : Math.max(0, fila.analisis_incluidos - fila.analisis_usados),
    periodo, fecha_reinicio: renov.toISOString(),
  }
}

/** Reserva un análisis del cupo. */
export async function reservar(usuarioId: string, periodo: string) {
  await bd.ejecutar('UPDATE cupo SET analisis_usados = analisis_usados + 1 WHERE usuario_id = ? AND periodo = ?', [usuarioId, periodo])
}
/** Un análisis que falla o queda bloqueado NO consume cupo (spec §5.6). */
export async function devolver(usuarioId: string, periodo: string) {
  await bd.ejecutar('UPDATE cupo SET analisis_usados = CASE WHEN analisis_usados > 0 THEN analisis_usados - 1 ELSE 0 END WHERE usuario_id = ? AND periodo = ?', [usuarioId, periodo])
}

/* ---------- tope global de la plataforma (spec §5.7) ---------- */
export async function topeMensual(): Promise<number> {
  const a = await bd.uno<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'tope_mensual_usd'")
  return a ? Number(a.valor) : ENV.TOPE_MENSUAL_USD
}
export async function fijarTope(usd: number) {
  await bd.ejecutar("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('tope_mensual_usd', ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado", [String(usd), ahora()])
}
/** Gasto del mes calendario: lo ya cobrado más lo que está en curso, al costo estimado. */
export async function gastoMes() {
  const mes = new Date().toISOString().slice(0, 7)
  const real = (await bd.uno<{ s: number }>("SELECT COALESCE(SUM(costo_real_usd), 0) AS s FROM solicitud WHERE nivel = 'profundo' AND substr(creada, 1, 7) = ?", [mes]))!.s
  const enCurso = (await bd.uno<{ n: number }>("SELECT COUNT(*) AS n FROM solicitud WHERE nivel = 'profundo' AND estado = 'en_curso'"))!.n
  const enCola = (await bd.uno<{ n: number }>("SELECT COUNT(*) AS n FROM solicitud WHERE nivel = 'profundo' AND estado = 'en_cola'"))!.n
  const n = (await bd.uno<{ n: number }>("SELECT COUNT(*) AS n FROM solicitud WHERE nivel = 'profundo' AND substr(creada, 1, 7) = ?", [mes]))!.n
  const tope = await topeMensual()
  return { mes, real: Number(real), en_curso: enCurso, en_cola: enCola, comprometido: Number(real) + enCurso * ENV.COSTO_ESTIMADO_USD, n, tope, estimado_por_analisis: ENV.COSTO_ESTIMADO_USD }
}
/** ¿Entra un análisis más sin pasar el techo? */
export const hayMargen = async () => { const g = await gastoMes(); return g.comprometido + ENV.COSTO_ESTIMADO_USD <= g.tope }
