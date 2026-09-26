import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { detectQuality, detectTier, dprCap, type Quality, type Tier } from '../lib/tier'
import { GLBoundary } from '../components/GLBoundary'
import type { Control } from '../three/control'

/* ============================================================================
   La escena del login: la misma roca del hero, pero obedeciendo al
   formulario (Control). En gamas sin WebGL queda el poster con la luz en
   CSS, que también responde al estado (reposo / enviando / éxito / error).
   ========================================================================== */

const Canvas = lazy(() => import('@react-three/fiber').then((m) => ({ default: m.Canvas })))
const Escena = lazy(() => import('../three/HeroScene').then((m) => ({ default: m.EscenaControlada })))

export type EstadoEscena = 'reposo' | 'atenta' | 'enviando' | 'exito' | 'error'

/** `sin3d`: sólo el poster. Recuperar y restablecer son un formulario de un campo; no
    pagan la escena (compilar shaders bloqueaba el hilo principal 300 ms o más). */
export function AuthEscena({ control, estado, sin3d = false }: { control: React.RefObject<Control>; estado: EstadoEscena; sin3d?: boolean }) {
  const [tier, setTier] = useState<Tier | null>(null)
  const [quality, setQuality] = useState<Quality>('high')
  const [live, setLive] = useState(false)
  const [failed, setFailed] = useState(false)
  const holderRef = useRef<HTMLDivElement>(null)
  const pointerRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (sin3d) return
    // Después del primer pintado: el formulario aparece antes de que la escena pida nada.
    const ric = window.requestIdleCallback ?? ((f: () => void) => window.setTimeout(f, 200))
    const cic = window.cancelIdleCallback ?? window.clearTimeout
    const id = ric(() => setTier(detectTier()), { timeout: 1500 })
    return () => cic(id)
  }, [sin3d])

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('q')
    setQuality(forced === 'high' || forced === 'medium' ? forced : detectQuality())
  }, [])

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
      pointerRef.current.x = x; pointerRef.current.y = y
      root.style.setProperty('--hx', x.toFixed(3)); root.style.setProperty('--hy', y.toFixed(3))
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [tier])

  const con3d = tier === 'full' && !failed
  return (
    <div ref={holderRef} className={`auth__art auth__art--${estado} ${live ? 'is-live' : ''}`} aria-hidden="true" data-quality={quality}>
      <picture className="auth__poster">
        <source media="(max-width: 720px)" srcSet="/img/hero-poster-m.webp" />
        <img src="/img/hero-poster-1440.webp" srcSet="/img/hero-poster-960.webp 960w, /img/hero-poster-1440.webp 1440w, /img/hero-poster.webp 2048w" sizes="100vw" alt="" width={2048} height={1152} fetchPriority="high" decoding="async" />
      </picture>
      <span className="auth__luz" />
      {con3d && (
        <GLBoundary onFail={() => { setFailed(true); setLive(false) }}>
          <Suspense fallback={null}>
            <div className="auth__canvas">
              <Canvas
                dpr={dprCap('full', quality)}
                gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', toneMapping: 0 }}
                camera={{ fov: 46, position: [0, 0, 6], near: 0.1, far: 30 }}
                onCreated={() => setLive(true)}
              >
                <Escena pointerRef={pointerRef} quality={quality} control={control} />
              </Canvas>
            </div>
          </Suspense>
        </GLBoundary>
      )}
      <span className="auth__veil" />
      <span className="auth__flash" />
    </div>
  )
}
