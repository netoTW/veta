/* ============================================================================
   /luffy como app: lo que el navegador necesita para instalarla y abrirla sola.

   Sólo se monta cuando la sesión es de Pablo (LuffyShell): para cualquier otro,
   el sitio no lleva manifiesto, ni ícono de app, ni service worker de Luffy.

     montarApp()      pone el manifiesto, las etiquetas de iPhone y el ícono de la
                      gema; registra el service worker (servidor: luffyApp.ts).
                      Devuelve cómo deshacerlo al salir del panel.
     useConexion()    si hay red (para avisar cuando lo que se ve es lo último que llegó);
                      marcarRed() la ajusta con lo que pasa en cada pedido.
     suscribirPush()  preparado, sin uso: el camino para que las alertas lleguen por
                      notificación en vez de Telegram (ver ESTADO-WEB.md).
   ========================================================================== */
import { useSyncExternalStore } from 'react'

const MANIFIESTO = '/api/luffy/app/manifest.webmanifest'
const SW = '/api/luffy/app/sw.js'

export function montarApp(): () => void {
  const head = document.head
  const puestos: Element[] = []
  const poner = (tag: 'link' | 'meta', attrs: Record<string, string>) => {
    const el = document.createElement(tag)
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el.setAttribute('data-luffy', '')
    head.appendChild(el); puestos.push(el)
  }
  // el ícono de VETA se aparta mientras se está en el panel: en el inicio del iPhone va la gema
  const iconoVeta = head.querySelector('link[rel="apple-touch-icon"]:not([data-luffy])')
  iconoVeta?.setAttribute('rel', 'apple-touch-icon-veta')
  poner('link', { rel: 'manifest', href: MANIFIESTO, crossorigin: 'use-credentials' })
  poner('link', { rel: 'apple-touch-icon', href: '/img/app/gema-180.png' })
  poner('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' })
  poner('meta', { name: 'mobile-web-app-capable', content: 'yes' })
  poner('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' })
  poner('meta', { name: 'apple-mobile-web-app-title', content: 'Luffy' })
  // a pantalla completa en el iPhone el contenido llega bajo la barra de estado: el panel se corre con safe-area
  const vp = head.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const vpAntes = vp?.content ?? null
  if (vp) vp.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
  const tituloAntes = document.title
  document.title = 'Luffy'

  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    navigator.serviceWorker.register(SW, { scope: '/luffy' }).then(() => precalentarVistas(), () => { /* sin service worker el panel funciona igual, sólo que sin caché */ })
    navigator.serviceWorker.addEventListener('controllerchange', precalentarVistas)
  }
  return () => {
    for (const el of puestos) el.remove()
    iconoVeta?.setAttribute('rel', 'apple-touch-icon')
    if (vp && vpAntes !== null) vp.content = vpAntes
    document.title = tituloAntes
  }
}

/** Con el service worker activo, baja en segundo plano las vistas del panel: quedan guardadas
    (abren sin red) y, con red, cambiar de vista ya no espera su archivo. Una sola vez por carga. */
let precalentado = false
export function precalentarVistas() {
  if (precalentado || !navigator.serviceWorker?.controller) return
  precalentado = true
  const vistas = [() => import('./Terminal'), () => import('./Cartera'), () => import('./Radar'), () => import('./Chat'), () => import('./Control'), () => import('./Oficina'), () => import('./Informes'), () => import('./Laboratorio'), () => import('./Tableros'), () => import('./charts/Grafico')]
  const correr = (i: number) => { if (i >= vistas.length) return; vistas[i]().catch(() => {}).finally(() => setTimeout(() => correr(i + 1), 150)) }
  const empezar = () => correr(0)
  const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  setTimeout(() => (ric ? ric(empezar, { timeout: 4000 }) : empezar()), 4000)
}

/** Abierta como app (desde el ícono), no en una pestaña del navegador. */
export const comoApp = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/* Hay red si el navegador lo dice y si el último pedido al panel no falló por red: navigator.onLine
   sigue en «sí» con una wifi que no deja pasar nada. Los clientes avisan con marcarRed(). */
let redCaida = false
const oyentes = new Set<() => void>()
export function marcarRed(ok: boolean) { if (redCaida === !ok) return; redCaida = !ok; for (const f of oyentes) f() }
if (typeof window !== 'undefined') addEventListener('online', () => marcarRed(true))
const suscribir = (f: () => void) => { oyentes.add(f); addEventListener('online', f); addEventListener('offline', f); return () => { oyentes.delete(f); removeEventListener('online', f); removeEventListener('offline', f) } }
export function useConexion(): boolean { return useSyncExternalStore(suscribir, () => navigator.onLine && !redCaida, () => true) }

/** Preparado, sin uso todavía. Cuando Mugiwara publique su clave pública VAPID y la ruta para
    guardar suscripciones (pedido en el contrato: POST /push/suscripciones), esto pide permiso y
    devuelve la suscripción para mandársela. En el iPhone sólo funciona con la app instalada
    («Agregar a inicio», iOS 16.4 o más). El service worker ya sabe mostrar el aviso y abrir la
    vista que traiga. */
export async function suscribirPush(clavePublicaVapid: string): Promise<PushSubscriptionJSON | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return null
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return null
  const reg = await navigator.serviceWorker.ready
  const b64 = clavePublicaVapid.replace(/-/g, '+').replace(/_/g, '/')
  const crudo = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const clave = Uint8Array.from(crudo, (ch) => ch.charCodeAt(0))
  const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave }))
  return s.toJSON()
}
