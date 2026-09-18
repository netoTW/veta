import { useEffect, useState } from 'react'

/*
 * GSAP y Lenis se cargan DESPUÉS del primer pintado, en un chunk aparte.
 * Son mejoras progresivas: sin ellos la página se lee entera igual, y meterlos
 * en el bundle inicial costaba ~600 ms de bloqueo en un móvil de gama media.
 */

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Suscribe a prefers-reduced-motion y re-renderiza si el usuario lo cambia. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

type Motion = {
  gsap: typeof import('gsap').gsap
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger
}

let motionPromise: Promise<Motion> | null = null

function loadMotion(): Promise<Motion> {
  if (!motionPromise) {
    motionPromise = Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([g, s]) => {
        g.gsap.registerPlugin(s.ScrollTrigger)
        return { gsap: g.gsap, ScrollTrigger: s.ScrollTrigger }
      },
    )
  }
  return motionPromise
}

/** Espera a que el hilo principal esté libre antes de traer las librerías. */
function whenIdle(fn: () => void) {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
  }).requestIdleCallback
  if (ric) ric(fn, { timeout: 1800 })
  else window.setTimeout(fn, 260)
}

/** Scroll físico con Lenis, sincronizado al ticker de GSAP. */
export function useLenis() {
  useEffect(() => {
    if (prefersReducedMotion()) return
    let cancelled = false
    let dispose = () => {}

    whenIdle(() => {
      if (cancelled) return
      void Promise.all([loadMotion(), import('lenis')]).then(([{ gsap, ScrollTrigger }, L]) => {
        if (cancelled) return
        const lenis = new L.default({
          duration: 1.05,
          easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
          wheelMultiplier: 1,
          touchMultiplier: 1.6,
        })
        lenis.on('scroll', ScrollTrigger.update)
        const raf = (time: number) => lenis.raf(time * 1000)
        gsap.ticker.add(raf)
        gsap.ticker.lagSmoothing(0)
        dispose = () => {
          gsap.ticker.remove(raf)
          lenis.destroy()
        }
      })
    })

    return () => { cancelled = true; dispose() }
  }, [])
}

/**
 * Reveals orquestados. Cada [data-reveal] entra una vez, con stagger por grupo.
 * Si GSAP nunca llega, todo queda visible: no se oculta nada por adelantado.
 */
export function useReveals() {
  useEffect(() => {
    if (prefersReducedMotion()) return
    let cancelled = false
    let dispose = () => {}

    whenIdle(() => {
      if (cancelled) return
      void loadMotion().then(({ gsap, ScrollTrigger }) => {
        if (cancelled) return
        const ctx = gsap.context(() => {
          /*
           * Coreografía por variantes. Cada elemento declara CÓMO entra
           * (data-reveal="up|left|right|scale") y su sección declara el RITMO
           * (data-flow="build" antes del clímax, "calm" después). Todo es
           * transform+opacity y relativo al elemento: ninguna medida depende
           * del texto que haya adentro.
           */
          gsap.utils.toArray<HTMLElement>('[data-reveal-group]').forEach((group) => {
            const items = Array.from(group.querySelectorAll<HTMLElement>('[data-reveal]'))
            if (!items.length) return
            // Lo que ya está en pantalla no se esconde para volver a aparecer.
            if (group.getBoundingClientRect().top < window.innerHeight * 0.78) return

            const calm = group.closest('[data-flow="calm"]') !== null
            const dist = calm ? 20 : 34
            for (const el of items) {
              const v = el.getAttribute('data-reveal') || 'up'
              if (v === 'left') gsap.set(el, { opacity: 0, x: -dist })
              else if (v === 'right') gsap.set(el, { opacity: 0, x: dist })
              else if (v === 'scale') gsap.set(el, { opacity: 0, y: dist * 0.5, scale: 0.965 })
              else gsap.set(el, { opacity: 0, y: dist })
            }
            gsap.to(items, {
              opacity: 1, x: 0, y: 0, scale: 1,
              duration: calm ? 1.05 : 0.8,
              ease: calm ? 'power2.out' : 'power3.out',
              stagger: calm ? 0.10 : 0.07,
              scrollTrigger: { trigger: group, start: 'top 78%', once: true },
            })
          })

          // Paralaje de capas de atmósfera: cada una declara su amplitud.
          gsap.utils.toArray<HTMLElement>('[data-parallax]').forEach((el) => {
            const amt = parseFloat(el.getAttribute('data-parallax') || '30')
            gsap.fromTo(el, { y: amt }, {
              y: -amt, ease: 'none',
              scrollTrigger: {
                trigger: el.closest('section') ?? el,
                start: 'top bottom', end: 'bottom top', scrub: true,
              },
            })
          })

          // La espina se dibuja con el scroll; los nodos se encienden al pasar.
          const spineLine = document.querySelector<HTMLElement>('.spine__line')
          if (spineLine) {
            gsap.fromTo(spineLine, { scaleY: 0 }, {
              scaleY: 1, ease: 'none',
              scrollTrigger: { trigger: '.blueprint', start: 'top 72%', end: 'bottom 95%', scrub: 0.4 },
            })
          }
          gsap.utils.toArray<HTMLElement>('.spine__node').forEach((node) => {
            ScrollTrigger.create({
              trigger: node, start: 'top 62%',
              onEnter: () => node.classList.add('is-lit'),
              onLeaveBack: () => node.classList.remove('is-lit'),
            })
          })

          // Las hairlines de cada eyebrow se dibujan de izquierda a derecha:
          // el gesto de un plano trazándose, no una línea que aparece.
          gsap.utils.toArray<HTMLElement>('.eyebrow__rule').forEach((line) => {
            if (line.getBoundingClientRect().top < window.innerHeight * 0.9) return
            gsap.fromTo(
              line,
              { scaleX: 0, transformOrigin: 'left center' },
              {
                scaleX: 1, duration: 1.15, ease: 'power2.inOut',
                scrollTrigger: { trigger: line, start: 'top 90%', once: true },
              },
            )
          })
        })
        ScrollTrigger.refresh()
        dispose = () => ctx.revert()
      })
    })

    return () => { cancelled = true; dispose() }
  }, [])
}
