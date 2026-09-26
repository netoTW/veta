import { useCallback, useRef } from 'react'
import { useNavigate, type NavigateOptions } from 'react-router-dom'

/* ============================================================================
   Guardia única de navegaciones automáticas.

   Toda recarga o redirección que la página hace SOLA (no un clic) pasa por aquí.
   Regla: la misma (tipo + clave) no se repite dentro de VENTANA_MS. La segunda
   vez se niega, se registra y la página se queda donde está.

   Por qué existe: la recuperación de contraseña se quedaba en blanco con el
   navegador al máximo. Con un fragmento de código caído y el almacenamiento de
   la pestaña bloqueado (visores de correo), la recarga «una sola vez» no podía
   anotar que ya había recargado y recargaba sin fin: 78 veces en 10 s.

   Dónde se anota, por orden: sessionStorage; si no deja, window.name (sobrevive
   a una recarga en la misma pestaña); si tampoco, se NIEGA. Ante la duda, no se
   recarga: una pantalla con un botón «Recargar» es mejor que un bucle.
   ========================================================================== */
export const VENTANA_MS = 10_000
const CLAVE = 'veta.guarda'
const PREFIJO_NOMBRE = 'veta.guarda:'

type Marcas = Record<string, number>

function leer(): { marcas: Marcas; guardar: (m: Marcas) => boolean } | null {
  try {
    const s = window.sessionStorage
    const marcas = JSON.parse(s.getItem(CLAVE) || '{}') as Marcas
    return { marcas, guardar: (m) => { try { s.setItem(CLAVE, JSON.stringify(m)); return true } catch { return false } } }
  } catch { /* sin sessionStorage: se prueba window.name */ }
  try {
    const n = window.name || ''
    const marcas = n.startsWith(PREFIJO_NOMBRE) ? (JSON.parse(n.slice(PREFIJO_NOMBRE.length)) as Marcas) : {}
    return { marcas, guardar: (m) => { try { window.name = PREFIJO_NOMBRE + JSON.stringify(m); return true } catch { return false } } }
  } catch { return null }
}

function avisar(tipo: string, clave: string, motivo: string) {
  try {
    void fetch('/api/fallo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ donde: 'guarda-navegacion', ruta: location.pathname + location.search, mensaje: `${tipo}:${clave} negada (${motivo})` }),
    }).catch(() => {})
  } catch { /* sin red: no hay nada que avisar */ }
}

/** ¿Puede hacerse ahora esta navegación automática? Si sí, queda anotada. */
export function puedo(tipo: 'recarga' | 'redireccion', clave: string, ahora = Date.now()): boolean {
  const alm = leer()
  if (!alm) { avisar(tipo, clave, 'sin almacenamiento'); return false }
  const id = `${tipo}:${clave}`
  const ultima = alm.marcas[id]
  if (ultima && ahora - ultima < VENTANA_MS) { avisar(tipo, clave, `repetida a los ${ahora - ultima} ms`); return false }
  // Se limpian las marcas viejas para que window.name no crezca.
  const marcas: Marcas = {}
  for (const [k, t] of Object.entries(alm.marcas)) if (ahora - t < VENTANA_MS) marcas[k] = t
  marcas[id] = ahora
  if (!alm.guardar(marcas)) { avisar(tipo, clave, 'no se pudo anotar'); return false }
  return true
}

/** Recarga la página si la guardia deja. Devuelve si recargó. */
export function recargarUnaVez(clave: string): boolean {
  if (!puedo('recarga', clave)) return false
  window.location.reload()
  return true
}

/** Lleva a otra dirección (fuera de la app) si la guardia deja. */
export function irUnaVez(url: string, clave = url): boolean {
  if (!puedo('redireccion', clave)) return false
  window.location.href = url
  return true
}

/** navigate() para usar dentro de efectos: la misma ruta no se repite en la ventana. */
export function useNavegarUnaVez() {
  const nav = useNavigate()
  const ultimo = useRef<{ a: string; t: number } | null>(null)
  return useCallback((a: string, o?: NavigateOptions) => {
    const ahora = Date.now()
    if (ultimo.current && ultimo.current.a === a && ahora - ultimo.current.t < VENTANA_MS) return false
    if (!puedo('redireccion', `app:${a}`, ahora)) return false
    ultimo.current = { a, t: ahora }
    nav(a, o)
    return true
  }, [nav])
}

/** Sólo rutas propias: «/algo», nunca «//otro-dominio» ni «/\\otro». */
export function rutaPropia(v: string | null | undefined, porDefecto: string): string {
  return v && /^\/(?![/\\])/.test(v) ? v : porDefecto
}
