/* ============================================================================
   Sesión real. Reemplaza al selector de rol simulado.

   El rol EFECTIVO lo decide el servidor (/api/yo) a partir del usuario
   autenticado: admin manda, si no el plan. El cliente sólo lo usa para no
   pedir lo que no puede ver; el servidor lo vuelve a aplicar en cada
   petición. "Ver como" existe sólo en desarrollo y sólo para admin: viaja
   como cabecera y el servidor lo honra únicamente en ese caso.
   ========================================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authClient } from './auth'
import { ROLES, type Rol } from './matriz'

export interface Usuario {
  id: string; email: string; nombre: string; plan: string; rol: string; estado: string
  suspendido: boolean; fecha_alta: string; ultimo_acceso: string | null
}
export interface Yo {
  usuario: Usuario | null
  rol: Rol; rol_real: Rol; ver_como: Rol | null
  impersonando: boolean; desarrollo: boolean; horas_anticipo: number
}

interface Ctx {
  yo: Yo | null
  cargando: boolean
  rol: Rol
  /** "Ver como" (desarrollo, admin). null = como uno mismo. */
  verComo: Rol | null
  setVerComo: (r: Rol | null) => void
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

export const SesionContext = createContext<Ctx>({
  yo: null, cargando: true, rol: 'visitante', verComo: null, setVerComo: () => {}, recargar: async () => {}, salir: async () => {},
})
export const useSesion = () => useContext(SesionContext)

const CLAVE = 'veta.ver-como'
function leerVerComo(): Rol | null {
  if (!import.meta.env.DEV) return null
  const q = new URLSearchParams(window.location.search).get('rol')
  if (q && (ROLES as string[]).includes(q)) { try { localStorage.setItem(CLAVE, q) } catch { /* sin storage */ } return q as Rol }
  try { const s = localStorage.getItem(CLAVE); return s && (ROLES as string[]).includes(s) ? (s as Rol) : null } catch { return null }
}

/** Cabeceras extra para /api: la de "ver como" (sólo dev). */
export function cabecerasApi(): Record<string, string> {
  const v = leerVerComo()
  return v ? { 'x-veta-ver-como': v } : {}
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [yo, setYo] = useState<Yo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [verComo, setVerComoState] = useState<Rol | null>(() => (typeof window === 'undefined' ? null : leerVerComo()))

  const recargar = useCallback(async () => {
    try {
      const r = await fetch('/api/yo', { credentials: 'same-origin', headers: cabecerasApi() })
      setYo(r.ok ? await r.json() : null)
    } catch { setYo(null) }
    setCargando(false)
  }, [])

  useEffect(() => { void recargar() }, [recargar, verComo])

  // La sesión del cliente de auth cambia (login, logout, impersonación): se vuelve a pedir /api/yo.
  const { data: sesion } = authClient.useSession()
  const sesionId = sesion?.session?.id ?? null
  useEffect(() => { void recargar() }, [sesionId, recargar])

  const setVerComo = useCallback((r: Rol | null) => {
    try { if (r) localStorage.setItem(CLAVE, r); else localStorage.removeItem(CLAVE) } catch { /* sin storage */ }
    setVerComoState(r)
  }, [])

  const salir = useCallback(async () => {
    await authClient.signOut()
    setVerComo(null)
    await recargar()
  }, [recargar, setVerComo])

  const valor = useMemo<Ctx>(() => ({
    yo, cargando, rol: yo?.rol ?? 'visitante', verComo: yo?.ver_como ?? null, setVerComo, recargar, salir,
  }), [yo, cargando, setVerComo, recargar, salir])

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>
}
