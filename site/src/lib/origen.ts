/* ============================================================================
   De dónde vino la visita.

   Vive en localStorage y dura 30 días, porque quien llega desde Instagram mira,
   se va y vuelve días después: si el origen muriera con la pestaña, esa venta
   se anotaría como tráfico directo y la campaña parecería no funcionar.

   **Manda el primero, no el último.** Una vez guardado no se pisa: la visita
   que trajo a la persona es la primera, no la última que hizo. La única
   excepción es subir de categoría — si lo guardado era una visita directa o un
   enlace suelto y después llega una con campaña marcada, gana la campaña; al
   revés nunca.

   Al pulsar un botón de plan esto viaja al servidor, que lo mete en la sesión
   de pago de Whop. Whop lo devuelve en el aviso y queda guardado con la cuenta.
   ========================================================================== */
const CLAVE = 'veta.origen'
const DIAS = 30
const VIDA_MS = DIAS * 24 * 60 * 60 * 1000
const CAMPOS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

export type Origen = Record<string, string>
interface Guardado { origen: Origen; en: number }

/** Un origen "con campaña" es el que trae utm_source: lo demás es de relleno. */
const conCampana = (o: Origen | null) => !!o?.utm_source

function leerGuardado(): Guardado | null {
  if (typeof window === 'undefined') return null
  try {
    const s = localStorage.getItem(CLAVE)
    if (!s) return null
    const g = JSON.parse(s) as Partial<Guardado>
    if (!g || typeof g.en !== 'number' || !g.origen || typeof g.origen !== 'object') { localStorage.removeItem(CLAVE); return null }
    if (Date.now() - g.en > VIDA_MS) { localStorage.removeItem(CLAVE); return null }
    return { origen: g.origen as Origen, en: g.en }
  } catch { return null }
}

/** Lo que trae la URL de ahora mismo. */
function origenDeAhora(): Origen {
  const q = new URLSearchParams(window.location.search)
  const o: Origen = {}
  for (const k of CAMPOS) {
    const v = q.get(k)
    if (v) o[k] = v.slice(0, 120)
  }
  // Sin campaña marcada, el dominio que nos enlazó ya dice algo. El propio sitio no cuenta.
  if (!Object.keys(o).length && document.referrer) {
    try {
      const h = new URL(document.referrer).hostname
      if (h && h !== window.location.hostname) o.referente = h
    } catch { /* referente ilegible */ }
  }
  o.aterrizaje = window.location.pathname.slice(0, 120)
  return o
}

/** Se llama una vez al arrancar la aplicación. */
export function recordarOrigen(): void {
  if (typeof window === 'undefined') return
  try {
    const guardado = leerGuardado()
    const ahora = origenDeAhora()
    // Ya hay uno vigente y no llega nada mejor: se deja como está.
    if (guardado && !(conCampana(ahora) && !conCampana(guardado.origen))) return
    localStorage.setItem(CLAVE, JSON.stringify({ origen: ahora, en: Date.now() } satisfies Guardado))
  } catch { /* sin storage: se pierde el origen, no la venta */ }
}

export function origenDeLaVisita(): Origen {
  return leerGuardado()?.origen ?? {}
}

/** El origen como parámetros de consulta, para pedir el enlace de pago. */
export function origenComoConsulta(): string {
  const o = origenDeLaVisita()
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v) q.set(k, v)
  return q.toString()
}
