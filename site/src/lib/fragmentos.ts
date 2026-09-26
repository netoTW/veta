import { lazy, type ComponentType } from 'react'
import { recargarUnaVez } from './guardaNavegacion'

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

   Se recarga **una vez** en diez segundos, y la cuenta la lleva la guardia única
   (guardaNavegacion.ts). Antes la marca vivía aquí, en sessionStorage, y si el
   almacenamiento estaba bloqueado (visores de correo) no se podía anotar y la
   página recargaba sin fin: 78 veces en 10 s, pantalla en blanco. Ahora, sin
   dónde anotar, no se recarga: sale el límite de error con «Recargar». La ruta
   no se pierde: recargar mantiene la URL.
   ========================================================================== */
/** Los tres navegadores lo dicen con tres frases distintas. */
export function esFalloDeFragmento(e: unknown): boolean {
  const m = String((e as { message?: unknown })?.message ?? e ?? '')
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(m)
}

/**
 * Como `lazy`, pero si la parte ya no existe pide la versión nueva de la página
 * en vez de enseñar un error que el visitante no puede resolver.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- la misma restricción que usa React en lazy() */
export function lazySeguro<T extends ComponentType<any>>(carga: () => Promise<{ default: T }>) {
  return lazy<T>(async () => {
    try {
      return await carga()
    } catch (e) {
      if (esFalloDeFragmento(e) && recargarUnaVez('fragmento')) {
        // La página se está yendo: no se resuelve ni se lanza, o React pinta
        // un error durante el parpadeo de la recarga.
        await new Promise<never>(() => {})
      }
      throw e
    }
  })
}
