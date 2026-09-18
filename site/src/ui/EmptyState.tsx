import type { ReactNode } from 'react'

/* ============================================================================
   Estados vacíos, de error y "sin datos".

     vacio     Piedra intacta. Nada que revelar todavía: es la espera antes
               de pedir un análisis. Tono neutro.
     sin-datos Piedra abierta y vacía por dentro: el motor buscó y no
               encontró veta. Es un resultado honesto, no un fallo.
     error     Piedra partida en dos con una esquirla caída. Rojo apagado
               sólo en la marca; la piedra sigue siendo piedra.

   La misma piedra en los tres (fotografía de mineral, public/img/vacio/).
   Texto corto, sin exclamar.
   ========================================================================== */

export type EmptyKind = 'vacio' | 'sin-datos' | 'error'

interface Props {
  kind: EmptyKind
  title: string
  detail?: string
  action?: ReactNode
  className?: string
}

const IMG: Record<EmptyKind, string> = { vacio: 'intacta', 'sin-datos': 'vacia', error: 'rota' }

export function EmptyState({ kind, title, detail, action, className = '' }: Props) {
  return (
    <div className={`empty empty--${kind} ${className}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span className="empty__art" aria-hidden="true">
        <img src={`/img/vacio/${IMG[kind]}-480.webp`} alt="" width={96} height={96} loading="lazy" decoding="async" draggable={false} />
        {kind === 'error' && <span className="empty__mark" />}
      </span>
      <p className="empty__title">{title}</p>
      {detail && <p className="empty__detail">{detail}</p>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  )
}
