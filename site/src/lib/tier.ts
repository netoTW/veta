/* ============================================================================
   Gamas de dispositivo — la arquitectura de rendimiento del sitio.

     'full'   Desktop capaz. El show completo: escena 3D, bloom, partículas,
              reactividad al cursor. Acá NO se optimiza a la baja.
     'mobile' Móvil moderno. Camino propio, no recortado: canvas 2D reactivo
              al tacto y al scroll, con micro-física. Tiene que verse caro.
     'basic'  Gama baja, equipos viejos, o movimiento reducido. Algo aceptable
              y funcional. No manda sobre las dos gamas de arriba.

   Regla de oro: el que decide abre el link en su iPhone, en la reunión.
   'mobile' nunca puede verse roto ni genérico.
   ========================================================================== */

import { useEffect, useState } from 'react'

export type Tier = 'full' | 'mobile' | 'basic'

interface Signals {
  reducedMotion: boolean
  webgl2: boolean
  cores: number
  memory: number
  finePointer: boolean
  width: number
}

function readSignals(): Signals {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    webgl2: hasWebGL2(),
    cores: nav.hardwareConcurrency ?? 4,
    // deviceMemory no existe en Safari: su ausencia no es señal de equipo débil.
    memory: nav.deviceMemory ?? 8,
    finePointer: window.matchMedia('(pointer: fine)').matches,
    width: window.innerWidth,
  }
}

let cachedWebGL2: boolean | null = null
function hasWebGL2(): boolean {
  if (cachedWebGL2 !== null) return cachedWebGL2
  try {
    const c = document.createElement('canvas')
    cachedWebGL2 = !!c.getContext('webgl2')
  } catch {
    cachedWebGL2 = false
  }
  return cachedWebGL2
}

export function detectTier(): Tier {
  if (typeof window === 'undefined') return 'basic'
  const s = readSignals()

  // Movimiento reducido es una preferencia declarada, no una limitación:
  // se respeta antes que cualquier medición de capacidad.
  if (s.reducedMotion) return 'basic'
  if (!s.webgl2) return 'basic'
  if (s.cores <= 2 || s.memory <= 2) return 'basic'

  // Puntero fino + pantalla ancha = escritorio de verdad. Un iPad con teclado
  // cae acá y lo aguanta; un iPhone no, y por eso tiene su propio camino.
  if (s.finePointer && s.width >= 1024) return 'full'

  // Móvil moderno: cuatro núcleos son un piso realista para animar a 60fps.
  if (s.cores >= 4) return 'mobile'

  return 'basic'
}

/** Cap de DPR por gama: el bloom cuesta a resolución de pantalla. */
export function dprCap(tier: Tier, quality: Quality = 'high'): [number, number] {
  if (tier !== 'full') return [1, 1.5]
  return quality === 'high' ? [1, 1.4] : [1, 1.25]
}

/**
 * Dentro de 'full', dos calidades. 'high' lleva todo: oclusión ambiental,
 * transmisión en la veta, multisampling, partículas completas. 'medium' quita
 * lo que más cuesta y mantiene el mismo lenguaje: bloom, PBR, luz interna.
 */
export type Quality = 'high' | 'medium'

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'medium'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 8
  const dpr = window.devicePixelRatio || 1
  // Muchos núcleos y memoria; o un DPR bajo, que abarata cada efecto.
  if (cores >= 8 && memory >= 8) return 'high'
  if (cores >= 6 && dpr <= 1.5) return 'high'
  return 'medium'
}


/** La gama, resuelta en el cliente. null mientras no se sabe. */
export function useTier(): Tier | null {
  const [tier, setTier] = useState<Tier | null>(null)
  useEffect(() => setTier(detectTier()), [])
  return tier
}
