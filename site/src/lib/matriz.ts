/* ============================================================================
   Matriz de acceso — veta-planes-roles-permisos.md §3 y §4.
   Sin React: la importan el cliente (para no pedir lo que no puede ver) y el
   SERVIDOR (que es quien de verdad decide). La fuente de verdad es una sola.
   ========================================================================== */

export type Rol = 'visitante' | 'base' | 'pro' | 'admin'
export type Plan = 'gratis' | 'base' | 'pro'
export const ROLES: Rol[] = ['visitante', 'base', 'pro', 'admin']
export const PLANES: Plan[] = ['gratis', 'base', 'pro']
export const ROL_LABEL: Record<Rol, string> = {
  visitante: 'Visitante', base: 'Suscriptor base', pro: 'Suscriptor pro', admin: 'Admin',
}
export const PLAN_LABEL: Record<Rol, string> = { visitante: 'Gratis', base: 'Base', pro: 'Pro', admin: 'Admin' }

/** Secciones de la matriz (§4). */
export type Seccion =
  | 'gemas.titular'
  | 'gemas.informe'
  | 'gemas.anticipado'
  | 'seguimiento'
  | 'alertas'
  | 'watchlist'
  | 'analisis'
  | 'noticias'
  | 'ledger.resumen'
  | 'ledger.detalle'
  | 'ledger.bloqueados'
  | 'analiza.determinista'
  | 'analiza.profundo'
  | 'scanner.solicitar'
  | 'exportar'
  | 'bandeja'
  | 'cuentas'

const MATRIZ: Record<Seccion, Rol[]> = {
  'gemas.titular':        ['visitante', 'base', 'pro', 'admin'],
  'gemas.informe':        ['base', 'pro', 'admin'],
  'gemas.anticipado':     ['pro', 'admin'],
  'seguimiento':          ['base', 'pro', 'admin'],
  'alertas':              ['pro', 'admin'],
  'watchlist':            ['base', 'pro', 'admin'],
  'analisis':             ['visitante', 'base', 'pro', 'admin'],
  /* El titular y la primera línea son de todos; la lectura entera, del plan Base. */
  'noticias':             ['base', 'pro', 'admin'],
  'ledger.resumen':       ['visitante', 'base', 'pro', 'admin'],
  'ledger.detalle':       ['base', 'pro', 'admin'],
  'ledger.bloqueados':    ['admin'],
  'analiza.determinista': ['visitante', 'base', 'pro', 'admin'],
  'analiza.profundo':     ['base', 'pro', 'admin'],
  'scanner.solicitar':    ['pro', 'admin'],
  'exportar':             ['pro', 'admin'],
  'bandeja':              ['admin'],
  'cuentas':              ['admin'],
}

export const puede = (rol: Rol, seccion: Seccion) => MATRIZ[seccion].includes(rol)

/** El plan mínimo que abre una sección: para decir "esto es del plan Base". */
export function planMinimo(seccion: Seccion): Rol {
  return ROLES.find((r) => MATRIZ[seccion].includes(r)) ?? 'admin'
}

/** El rol efectivo de un usuario autenticado: admin manda; si no, el plan. */
export function rolDe(u: { role?: string | null; plan?: string | null; banned?: boolean | null } | null | undefined): Rol {
  if (!u) return 'visitante'
  if (u.banned) return 'visitante'
  if (u.role === 'admin') return 'admin'
  if (u.plan === 'pro') return 'pro'
  if (u.plan === 'base') return 'base'
  return 'visitante'
}
