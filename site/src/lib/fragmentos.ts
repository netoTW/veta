import { lazy, type ComponentType } from 'react'

/* ============================================================================
   Fragmentos de código que desaparecen bajo los pies.

   Las pantallas se cargan por partes. Cada despliegue publica partes nuevas con
   otro nombre y **borra las anteriores**: comprobado, un fragmento de hace un
   rato devuelve 404. Una pestaña que lleva abierta desde antes del despliegue
   sigue pidiendo los nombres viejos, así que al abrir una pantalla que aún no
   había cargado, la carga falla y se cae.

   No es un fallo del código de la pantalla: es código que ya no está. Por eso
   reintentar no sirve —el fichero no va a volver— y lo que hace falta es pedir
   la versión nueva, que es exactamente lo que hace recargar.

   Se recarga **una vez**. La marca vive en la pestaña y se borra en cuanto un
   fragmento carga bien, así que el siguiente despliegue vuelve a tener su
   oportunidad, pero un fallo de red persistente no deja la página dando
   vueltas. La ruta no se pierde: recargar mantiene la URL.
   ========================================================================== */
const CLAVE = 'veta.fragmento-recargado'

/** Los tres navegadores lo dicen con tres frases distintas. */
export function esFalloDeFragmento(e: unknown): boolean {
  const m = String((e as { message?: unknown })?.message ?? e ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(m)
}

const yaRecargo = () => { try { return !!sessionStorage.getItem(CLAVE) } catch { return false } }
const anotarRecarga = () => { try { sessionStorage.setItem(CLAVE, String(Date.now())) } catch { /* sin storage */ } }
const olvidarRecarga = () => { try { sessionStorage.removeItem(CLAVE) } catch { /* sin storage */ } }

/**
 * Como `lazy`, pero si la parte ya no existe pide la versión nueva de la página
 * en vez de enseñar un error que el visitante no puede resolver.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- la misma restricción que usa React en lazy() */
export function lazySeguro<T extends ComponentType<any>>(carga: () => Promise<{ default: T }>) {
  return lazy<T>(async () => {
    try {
      const m = await carga()
      olvidarRecarga()
      return m
    } catch (e) {
      if (esFalloDeFragmento(e) && !yaRecargo()) {
        anotarRecarga()
        window.location.reload()
        // La página se está yendo: no se resuelve ni se lanza, o React pinta
        // un error durante el parpadeo de la recarga.
        await new Promise<never>(() => {})
      }
      throw e
    }
  })
}
