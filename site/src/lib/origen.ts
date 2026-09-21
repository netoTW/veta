/* ============================================================================
   De dónde vino la visita.

   Se guarda una sola vez, al entrar, y no se vuelve a pisar: lo que trajo a una
   persona es la visita que la trajo, no la última página que miró. Vive en
   sessionStorage, así que dura lo que dura la pestaña y no sigue a nadie entre
   sesiones.

   Al pulsar un botón de plan, esto viaja al servidor, que lo mete en la sesión
   de pago de Whop. Whop lo devuelve intacto en el aviso y queda guardado con la
   cuenta. Sin esto no se sabe qué campaña trajo cada suscriptor.
   ========================================================================== */
const CLAVE = 'veta.origen'
const CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export type Origen = Record<string, string>

/** Se llama una vez al arrancar la aplicación. */
export function recordarOrigen(): void {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(CLAVE)) return
    const q = new URLSearchParams(window.location.search)
    const o: Origen = {}
    for (const k of CAMPOS) {
      const v = q.get(k)
      if (v) o[k] = v.slice(0, 120)
    }
    // Sin UTM, el dominio que nos enlazó ya dice bastante. El propio sitio no cuenta.
    if (!Object.keys(o).length && document.referrer) {
      try {
        const h = new URL(document.referrer).hostname
        if (h && h !== window.location.hostname) o.referente = h
      } catch { /* referente ilegible */ }
    }
    o.aterrizaje = window.location.pathname.slice(0, 120)
    sessionStorage.setItem(CLAVE, JSON.stringify(o))
  } catch { /* sin storage: se pierde el origen, no la venta */ }
}

export function origenDeLaVisita(): Origen {
  if (typeof window === 'undefined') return {}
  try {
    const s = sessionStorage.getItem(CLAVE)
    const o = s ? JSON.parse(s) as unknown : null
    return o && typeof o === 'object' ? o as Origen : {}
  } catch { return {} }
}

/** El origen como parámetros de consulta, para pedir el enlace de pago. */
export function origenComoConsulta(): string {
  const o = origenDeLaVisita()
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v) q.set(k, v)
  return q.toString()
}
