import { useEffect, useRef, useState } from 'react'
import { useTier } from '../lib/tier'

/* ============================================================================
   Hero móvil — la misma metáfora, por su propio camino.

   No se baja Three (860 KB) en una red móvil. El poster generado ES la piedra;
   sobre él, un canvas 2D pone lo que el poster no puede:
     · ceniza     partículas grises que convergen sobre la piedra y se apagan
     · pulso      la veta respira: un resplandor esmeralda sobre la grieta
     · paralaje   giroscopio y scroll mueven ceniza y pulso con la piedra

   El ciclo es el mismo del desktop (cycle), con la misma duración.
   ========================================================================== */

const CENIZA = [142, 145, 140] as const
const DUST_N = 260
const CICLO = 21

// Dónde está la piedra y la veta en /img/hero-poster-m.webp (fracciones del
// encuadre 9:16). Si se regenera el poster, se ajustan estos números.
const ROCK = { cx: 0.54, cy: 0.68, rx: 0.32, ry: 0.34 }
const VEIN = [
  { x: 0.62, y: 0.42 }, { x: 0.55, y: 0.55 }, { x: 0.48, y: 0.66 }, { x: 0.40, y: 0.76 }, { x: 0.32, y: 0.86 },
]

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const damp = (c: number, t: number, l: number, dt: number) => c + (t - c) * (1 - Math.exp(-l * dt))
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const clamp01 = (v: number) => clamp(v, 0, 1)
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

function cycle(f: number) {
  let form: number, open: number
  if (f < 0.28) form = easeOutCubic(clamp01(f / 0.28))
  else if (f < 0.88) form = 1
  else form = 1 - easeInOutCubic(clamp01((f - 0.88) / 0.12))
  if (f < 0.38) open = 0
  else if (f < 0.52) open = easeInOutCubic(clamp01((f - 0.38) / 0.14))
  else if (f < 0.80) open = 1
  else if (f < 0.87) open = 1 - easeInOutCubic(clamp01((f - 0.80) / 0.07))
  else open = 0
  return { form, open }
}

export function HeroMobile() {
  const tier = useTier()
  const [live, setLive] = useState(false)
  const holderRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (tier !== 'mobile') return
    const holder = holderRef.current
    const canvas = canvasRef.current
    if (!holder || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const rnd = mulberry32(2026)

    // Ceniza: origen disperso por todo el hero, destino sobre la elipse de la
    // piedra (con sesgo hacia el borde, donde se lee que "aterriza").
    const dust = Array.from({ length: DUST_N }, () => {
      const a = rnd() * Math.PI * 2
      const rr = 0.55 + Math.sqrt(rnd()) * 0.5
      return {
        ox: rnd(), oy: rnd() * 0.95,
        tx: ROCK.cx + Math.cos(a) * ROCK.rx * rr, ty: ROCK.cy + Math.sin(a) * ROCK.ry * rr,
        delay: rnd() * 0.45, seed: rnd() * Math.PI * 2, r: 0.7 + rnd() * 1.3, b: rnd(),
      }
    })

    // Reactividad: giroscopio con cero relativo; drag como respaldo.
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 }
    let gyroBase: { beta: number; gamma: number } | null = null
    const onGyro = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return
      if (!gyroBase) gyroBase = { beta: e.beta, gamma: e.gamma }
      tilt.ty = clamp((e.gamma - gyroBase.gamma) / 28, -1, 1)
      tilt.tx = clamp((e.beta - gyroBase.beta) / 28, -1, 1)
    }
    window.addEventListener('deviceorientation', onGyro)
    let dragging = false, lastX = 0, lastY = 0
    const onDown = (e: PointerEvent) => {
      const r = holder.getBoundingClientRect()
      if (e.clientY < r.top || e.clientY > r.bottom) return
      dragging = true; lastX = e.clientX; lastY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      tilt.ty = clamp(tilt.ty + (e.clientX - lastX) / 160, -1.2, 1.2)
      tilt.tx = clamp(tilt.tx + (e.clientY - lastY) / 160, -1, 1)
      lastX = e.clientX; lastY = e.clientY
    }
    const onUp = () => { dragging = false }
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })

    const resize = () => {
      const r = holder.getBoundingClientRect()
      W = r.width; H = r.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
    const t0 = performance.now()

    const draw = (time: number) => {
      const t = (time - t0) / 1000
      const dt = 1 / 60
      tilt.x = damp(tilt.x, tilt.tx, 3, dt)
      tilt.y = damp(tilt.y, tilt.ty, 3, dt)
      const { form, open } = cycle((t % CICLO) / CICLO)
      const scroll = window.scrollY
      ctx.clearRect(0, 0, W, H)

      // La imagen va con object-fit: cover, 9:16 sobre un viewport parecido:
      // las fracciones se aplican al holder con un ajuste por relación.
      const imgAspect = 1520 / 2688
      const holdAspect = W / H
      let sx = W, sy = H, ox = 0, oy = 0
      if (holdAspect > imgAspect) { sy = W / imgAspect; oy = (H - sy) * 0.62 } // object-position 50% 62%
      else { sx = H * imgAspect; ox = (W - sx) * 0.5 }
      const px = (fx: number) => ox + fx * sx + tilt.y * 10
      const py = (fy: number) => oy + fy * sy - scroll * 0.18 + tilt.x * 8

      // ── pulso de la veta ──
      if (open > 0.01) {
        const breathe = 0.8 + 0.2 * Math.sin(t * 1.1)
        for (const v of VEIN) {
          const gx = px(v.x), gy = py(v.y)
          const gr = Math.min(W, H) * 0.13
          const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr)
          g.addColorStop(0, `rgba(95,224,166,${0.16 * open * breathe})`)
          g.addColorStop(0.5, `rgba(31,164,111,${0.06 * open * breathe})`)
          g.addColorStop(1, 'rgba(31,164,111,0)')
          ctx.fillStyle = g
          ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2)
        }
      }

      // ── ceniza que converge ──
      for (const d of dust) {
        let k = clamp01((form - d.delay) / Math.max(1 - d.delay, 0.001))
        k = smoother(k)
        const drift = Math.sin(t * 0.4 + d.seed) * 6
        const x0 = ox + d.ox * sx + drift + tilt.y * 18 * (1 - k)
        const y0 = oy + d.oy * sy - scroll * 0.3 + Math.cos(t * 0.5 + d.seed * 1.7) * 6 + tilt.x * 14 * (1 - k)
        const x1 = px(d.tx), y1 = py(d.ty)
        const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k
        const apagado = 1 - clamp01((k - 0.8) / 0.2)
        const r = d.r * (1 - k * 0.6)
        ctx.fillStyle = rgba(CENIZA, (0.28 + 0.4 * d.b) * apagado)
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
      }
    }

    let raf = 0
    let inView = true
    const loop = (time: number) => { draw(time); raf = requestAnimationFrame(loop) }
    const start = () => { if (!raf && inView && !document.hidden) raf = requestAnimationFrame(loop) }
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0 } }
    const io = new IntersectionObserver((es) => {
      inView = es[es.length - 1].isIntersecting
      inView ? start() : stop()
    }, { rootMargin: '60px 0px' })
    io.observe(holder)
    const onVis = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVis)
    start()
    setLive(true)

    return () => {
      stop(); io.disconnect(); setLive(false)
      window.removeEventListener('deviceorientation', onGyro)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointerdown', onDown)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [tier])

  if (tier !== 'mobile') return null

  return (
    <div ref={holderRef} className={`herom ${live ? 'is-live' : ''}`} aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}
