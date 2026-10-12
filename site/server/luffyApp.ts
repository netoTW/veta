/* ============================================================================
   /luffy como app instalable: el manifiesto y el service worker.

   Los dos se sirven bajo /api/luffy/app/, detrás del mismo control que el resto
   del puente (sólo el admin real; los demás reciben 404). Así, para quien no es
   Pablo, nada en el sitio público delata que esta app existe: ni un manifiesto
   con su nombre ni un service worker en /luffy. Los íconos sí son públicos
   (public/img/app/gema-*.png): son una gema, sin nombre.

   El service worker vive en /api/luffy/app/sw.js pero controla /luffy gracias a
   la cabecera Service-Worker-Allowed. Su versión es la hora de arranque del
   servidor: cada despliegue reinicia el servicio, el navegador ve un archivo
   distinto y se instala el nuevo.
   ========================================================================== */
import { Hono } from 'hono'

export const appLuffy = new Hono()
const VERSION = new Date().toISOString().replace(/\D/g, '').slice(0, 14)

const MANIFIESTO = {
  id: '/luffy',
  name: 'Luffy',
  short_name: 'Luffy',
  description: 'El panel de Mugiwara: chat, terminal, cartera y radar.',
  lang: 'es',
  start_url: '/luffy',
  scope: '/luffy',
  display: 'standalone',
  orientation: 'any',
  background_color: '#0A0B0C',
  theme_color: '#0C0E10',
  icons: [
    { src: '/img/app/gema-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/img/app/gema-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/img/app/gema-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/img/app/gema-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  shortcuts: [
    { name: 'Terminal', url: '/luffy/terminal', icons: [{ src: '/img/app/gema-192.png', sizes: '192x192' }] },
    { name: 'Cartera', url: '/luffy/cartera', icons: [{ src: '/img/app/gema-192.png', sizes: '192x192' }] },
    { name: 'Radar', url: '/luffy/radar', icons: [{ src: '/img/app/gema-192.png', sizes: '192x192' }] },
  ],
}

appLuffy.get('/manifest.webmanifest', (c) => c.body(JSON.stringify(MANIFIESTO), 200, { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'private, max-age=600' }))

/* La pantalla sin conexión: sin red y sin nada guardado todavía. Roca, la gema y
   qué hacer, en el mismo sistema visual; todo en línea, porque no hay red. */
const SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#0C0E10"><title>Luffy · sin conexión</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:grid;place-items:center;padding:max(24px,env(safe-area-inset-top)) 24px max(24px,env(safe-area-inset-bottom));background:radial-gradient(120% 90% at 30% 20%,#1B1F23 0,#111316 55%,#08090A 100%);color:#ECE6D8;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:360px;text-align:center}
svg{width:84px;height:84px;filter:drop-shadow(0 0 28px rgba(63,224,160,.28))}
.ma{display:block;margin:22px 0 8px;font:500 11px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.22em;text-transform:uppercase;color:#C9A24C}
h1{margin:0 0 10px;font-weight:400;font-size:28px;letter-spacing:-.01em}
p{margin:0 0 26px;color:#A39E92}
button{appearance:none;border:1px solid rgba(201,162,76,.55);background:rgba(201,162,76,.08);color:#F2D58C;border-radius:999px;padding:12px 26px;font:500 12px/1 ui-monospace,"JetBrains Mono",monospace;letter-spacing:.18em;text-transform:uppercase;cursor:pointer}
button:active{transform:translateY(1px)}
</style></head><body><main>
<svg viewBox="0 0 512 512" aria-hidden="true"><polygon points="256,66 334,148 322,382 256,446 190,382 178,148" fill="#0C5A3B"/><polygon points="256,66 178,148 212,204 262,252" fill="#5FD9A2"/><polygon points="256,66 334,148 302,206 262,252" fill="#2FB57E"/><polygon points="334,148 322,382 256,446 262,252 302,206" fill="#0A4A31"/><polyline points="184,318 214,304 232,326 262,306 288,330 318,316" fill="none" stroke="#D9B45A" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/><polygon points="256,66 334,148 322,382 256,446 190,382 178,148" fill="none" stroke="#C9A24C" stroke-width="6" stroke-linejoin="round"/></svg>
<span class="ma">Sin conexión</span>
<h1>Luffy vuelve con la red.</h1>
<p>El teléfono no tiene conexión ahora. En cuanto vuelva, el panel abre donde lo dejaste.</p>
<button type="button" onclick="location.reload()">Reintentar</button>
</main><script>addEventListener('online',()=>location.reload())</script></body></html>`

/* El service worker. Estrategias:
     - la carcasa (/luffy y cualquier /luffy/*): se responde al instante con la
       última guardada y se actualiza por detrás; sin nada guardado y sin red, la
       pantalla sin conexión;
     - /assets/* (con hash, inmutables): de la caché; si no está, de la red y se guarda;
     - fuentes e imágenes: la guardada y se refresca por detrás;
     - los datos del panel (/api/luffy/*, también los gráficos aunque vayan por POST): siempre
       de la red; si no hay red, la última respuesta guardada, marcada con X-Luffy-Guardado.
       El SSE, las acciones y el resto de /api no se tocan. Al cerrar sesión se borra todo;
     - el resto de /api: nunca se toca.
   Al instalarse guarda la carcasa y los archivos que el HTML pide de entrada.
   Push: los manejadores están escritos pero nadie se suscribe todavía (ver pwa.ts). */
const SW = `/* Luffy · service worker ${VERSION} */
const VERSION = '${VERSION}'
const CARCASA = 'luffy-carcasa-' + VERSION
const ESTATICOS = 'luffy-estaticos-' + VERSION
const DATOS = 'luffy-datos'
const MAX_DATOS = 160
const SIN_CONEXION = ${JSON.stringify(SIN_CONEXION)}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CARCASA)
      const r = await fetch('/luffy', { credentials: 'same-origin', cache: 'no-cache' })
      if (r.ok) {
        await c.put('/luffy', r.clone())
        const html = await r.text()
        const urls = [...new Set([...html.matchAll(/(?:src|href)="(\\/(?:assets|fonts)\\/[^"]+)"/g)].map((m) => m[1]))]
        const e2 = await caches.open(ESTATICOS)
        await Promise.all(urls.map((u) => e2.add(u).catch(() => {})))
      }
    } catch (_) { /* sin red al instalar: se guarda en el primer uso */ }
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const ks = await caches.keys()
    await Promise.all(ks.filter((k) => k.startsWith('luffy-') && k !== CARCASA && k !== ESTATICOS && k !== DATOS).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

/* Los datos del panel: de la red siempre; sin red, lo último guardado. Un gráfico va por POST con el
   spec en el cuerpo: se guarda bajo una dirección GET con la huella del cuerpo. */
function huella(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(36) }
async function datos(req, clave) {
  const c = await caches.open(DATOS)
  try {
    const r = await fetch(req)
    if (r.ok && (r.headers.get('content-type') || '').includes('application/json')) {
      c.put(clave, r.clone()).then(async () => { const ks = await c.keys(); for (const k of ks.slice(0, Math.max(0, ks.length - MAX_DATOS))) await c.delete(k) }).catch(() => {})
    }
    return r
  } catch (err) {
    const g = await c.match(clave)
    if (!g) throw err
    const h = new Headers(g.headers); h.set('X-Luffy-Guardado', '1')
    return new Response(g.body, { status: 200, headers: h })
  }
}

function sinConexion() { return new Response(SIN_CONEXION, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }) }

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/luffy/') && !url.pathname.startsWith('/api/luffy/app/') && !url.pathname.startsWith('/api/luffy/eventos') && url.pathname !== '/api/luffy/chat') {
    if (req.method === 'GET') { e.respondWith(datos(req, req.url)); return }
    if (req.method === 'POST' && url.pathname === '/api/luffy/graficos/datos') {
      e.respondWith(req.clone().text().then((cuerpo) => datos(req, url.origin + url.pathname + '?h=' + huella(cuerpo))))
      return
    }
    return
  }
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return

  if (req.mode === 'navigate' && (url.pathname === '/luffy' || url.pathname.startsWith('/luffy/'))) {
    e.respondWith((async () => {
      const c = await caches.open(CARCASA)
      const guardada = await c.match('/luffy')
      const red = fetch(req).then(async (r) => { if (r.ok && (r.headers.get('content-type') || '').includes('text/html')) await c.put('/luffy', r.clone()); return r })
      if (guardada) { e.waitUntil(red.catch(() => {})); return guardada }
      try { return await red } catch (_) { return sinConexion() }
    })())
    return
  }
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith((async () => {
      const c = await caches.open(ESTATICOS)
      const g = await c.match(req)
      if (g) return g
      const r = await fetch(req)
      if (r.ok) c.put(req, r.clone()).catch(() => {})
      return r
    })())
    return
  }
  if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/img/')) {
    e.respondWith((async () => {
      const c = await caches.open(ESTATICOS)
      const g = await c.match(req)
      const red = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()).catch(() => {}); return r })
      if (g) { e.waitUntil(red.catch(() => {})); return g }
      return red
    })())
  }
})

/* Al cerrar sesión la página pide borrar lo guardado del panel. */
self.addEventListener('message', (e) => {
  if (e.data === 'luffy:olvidar') e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('luffy-')).map((k) => caches.delete(k)))))
})

/* ---------- notificaciones push: preparadas, no activas ----------
   Cuando Mugiwara mande alertas por push (en vez de Telegram), cada mensaje llega
   como JSON {titulo, texto, url, tag}. Nada se suscribe hasta que pwa.ts lo pida. */
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (_) { d = { texto: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Luffy', { body: d.texto || '', icon: '/img/app/gema-192.png', badge: '/img/app/gema-192.png', tag: d.tag || undefined, data: { url: d.url || '/luffy' } }))
})
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const destino = (e.notification.data && e.notification.data.url) || '/luffy'
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const c = cs.find((x) => new URL(x.url).pathname.startsWith('/luffy'))
    if (c) { await c.focus(); if ('navigate' in c) await c.navigate(destino); return }
    await self.clients.openWindow(destino)
  })())
})
`

appLuffy.get('/sw.js', (c) => c.body(SW, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Service-Worker-Allowed': '/luffy', 'Cache-Control': 'no-cache' }))
