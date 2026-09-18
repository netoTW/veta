import { Suspense, lazy, useEffect, useRef, useState } from 'react'
// 0 === THREE.NoToneMapping. Se escribe el número para no meter todo three en el bundle inicial.
import { detectQuality, detectTier, dprCap, type Quality, type Tier } from '../lib/tier'
import { GLBoundary } from './GLBoundary'

// Three, R3F y el post viven en su propio chunk: no entran al bundle inicial
// ni se descargan en gamas que no los van a usar.
const Canvas = lazy(() =>
  import('@react-three/fiber').then((m) => ({ default: m.Canvas })),
)
const HeroScene = lazy(() => import('../three/HeroScene'))

export function Hero3D() {
  const [tier, setTier] = useState<Tier | null>(null)
  const [quality, setQuality] = useState<Quality>('high')
  const [armed, setArmed] = useState(false)
  const [live, setLive] = useState(false)
  const [failed, setFailed] = useState(false)
  const [inView, setInView] = useState(true)
  const holderRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef(0)
  const pointerRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setTier(detectTier())
    // ?q=high|medium fuerza la calidad: para medir rendimiento y revisar la gama baja.
    const forced = new URLSearchParams(window.location.search).get('q')
    setQuality(forced === 'high' || forced === 'medium' ? forced : detectQuality())
  }, [])

  // Primero termina de cargar la página, después el 3D.
  useEffect(() => {
    if (tier !== 'full') return
    let id = 0
    const arm = () => { id = window.setTimeout(() => setArmed(true), 120) }
    if (document.readyState === 'complete') arm()
    else window.addEventListener('load', arm, { once: true })
    return () => { window.removeEventListener('load', arm); clearTimeout(id) }
  }, [tier])

  useEffect(() => {
    if (tier !== 'full') return
    const onScroll = () => {
      const el = holderRef.current
      if (!el) return
      const h = el.getBoundingClientRect().height || 1
      scrollRef.current = Math.min(1, Math.max(0, window.scrollY / h))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [tier])

  // El puntero se escucha en window: el canvas deja pasar los clics. Además
  // se publica en CSS (--hx/--hy) para que el fondo haga paralaje a su ritmo.
  useEffect(() => {
    if (tier !== 'full') return
    const root = document.documentElement
    const onMove = (e: PointerEvent) => {
      const el = holderRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return
      const x = ((e.clientX - r.left) / r.width) * 2 - 1
      const y = -(((e.clientY - r.top) / r.height) * 2 - 1)
      pointerRef.current.x = x
      pointerRef.current.y = y
      root.style.setProperty('--hx', x.toFixed(3))
      root.style.setProperty('--hy', y.toFixed(3))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [tier])

  useEffect(() => {
    const el = holderRef.current
    if (!el || tier !== 'full') return
    const io = new IntersectionObserver(
      (entries) => setInView(entries[entries.length - 1].isIntersecting),
      { rootMargin: '80px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [tier])

  if (tier !== 'full' || failed) return null

  return (
    <div ref={holderRef} className={`hero3d ${live ? 'is-live' : ''}`} aria-hidden="true" data-quality={quality}>
      {armed && (
        <GLBoundary onFail={() => { setFailed(true); setLive(false) }}>
          <Suspense fallback={null}>
            <Canvas
              dpr={dprCap('full', quality)}
              frameloop={inView ? 'always' : 'never'}
              // El tone mapping lo hace el post (ACES) sobre un buffer HDR:
              // si el renderer lo aplicara antes, el bloom trabajaría sobre
              // colores ya comprimidos y nada brillaría de verdad.
              gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', toneMapping: 0 }}
              camera={{ fov: 46, position: [0, 0, 6], near: 0.1, far: 30 }}
              onCreated={() => setLive(true)}
            >
              <HeroScene scrollRef={scrollRef} pointerRef={pointerRef} quality={quality} />
            </Canvas>
          </Suspense>
        </GLBoundary>
      )}
    </div>
  )
}
