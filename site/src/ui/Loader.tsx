import { useId } from 'react'

/* ============================================================================
   Símbolo de carga — la grieta de oro que avanza por la piedra.

   No es un spinner: es la marca contando lo que está pasando. La piedra
   cerrada (public/img/tier/cerrada, la misma roca de los tiers); una grieta de oro que la recorre de
   arriba abajo; detrás de la grieta, a medida que avanza, asoma la piedra
   abierta con su veta. Cuando termina, la piedra está abierta.

     <Loader />                 indeterminado: la grieta avanza y se reinicia
     <Loader progress={0.62} /> determinado: la grieta llega hasta el 62 %

   Las esperas en este producto duran minutos: la versión determinada es la
   que debe usarse siempre que el motor reporte avance.
   ========================================================================== */

interface Props {
  progress?: number
  /** Píxeles de lado. */
  size?: number
  label?: string
  className?: string
}

// La grieta sigue la veta real de la piedra abierta (centroide por fila del verde en
// public/img/tier/bajo-480.webp, viewBox 100×100). Longitud ≈ 99.
const CRACK = 'M 52.4 2.7 L 55.0 9.4 L 52.4 16.0 L 51.4 22.7 L 49.9 29.4 L 50.9 36.0 L 50.1 42.7 L 55.7 49.4 L 53.5 56.0 L 54.7 62.7 L 54.1 69.4 L 55.9 76.0 L 60.0 82.7 L 59.4 89.4 L 60.0 96.0'
const CRACK_LEN = 99

export function Loader({ progress, size = 96, label = 'Analizando', className = '' }: Props) {
  const id = useId()
  const determinate = typeof progress === 'number'
  const p = determinate ? Math.max(0, Math.min(1, progress)) : 0

  return (
    <div
      className={`loader ${determinate ? 'is-determinate' : 'is-indeterminate'} ${className}`}
      role={determinate ? 'progressbar' : 'status'}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.round(p * 100) : undefined}
      aria-label={label}
      style={{ width: size, ['--p' as string]: determinate ? p : undefined }}
    >
      <div className="loader__piedra" style={{ width: size, height: size }}>
        <span className="loader__glow" aria-hidden="true" />
        <img className="loader__cerrada" src="/img/tier/cerrada-480.webp" alt="" width={size} height={size} draggable={false} />
        <img className="loader__abierta" src="/img/tier/bajo-480.webp" alt="" width={size} height={size} draggable={false} />
        <svg className="loader__grieta" viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#EAD189" />
              <stop offset="0.5" stopColor="#C9A24B" />
              <stop offset="1" stopColor="#8A6A2A" />
            </linearGradient>
          </defs>
          <path className="loader__crack" d={CRACK} stroke={`url(#${id}-gold)`} strokeDasharray={CRACK_LEN} />
        </svg>
      </div>
      {determinate && <span className="loader__pct num">{Math.round(p * 100)}%</span>}
    </div>
  )
}
