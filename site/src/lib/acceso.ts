/* ============================================================================
   Roles y matriz de acceso — veta-planes-roles-permisos.md §3 y §4.

   La matriz vive en matriz.ts (compartida con el servidor). Acá sólo queda
   el hook que da el rol EFECTIVO de la sesión real. El servidor vuelve a
   aplicar la matriz en cada petición: esto es para no pedir ni pintar lo que
   el usuario no puede ver, no para protegerlo.
   ========================================================================== */
import { useSesion } from './sesion'
import type { Rol } from './matriz'

export { ROLES, ROL_LABEL, PLAN_LABEL, PLANES, puede, planMinimo, rolDe } from './matriz'
export type { Rol, Plan, Seccion } from './matriz'

/** Rol efectivo (lo que decidió el servidor) y, en desarrollo, "ver como". */
export function useRol(): { rol: Rol; setRol: (r: Rol) => void } {
  const { rol, setVerComo } = useSesion()
  return { rol, setRol: setVerComo }
}
