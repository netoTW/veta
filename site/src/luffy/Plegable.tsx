import { useState, type ReactNode } from 'react'

/** Una lista larga se muestra recortada, con un botón para ver el resto. */
export function Plegable<T>({ items, tope, pintar, texto = 'Ver todo' }: { items: T[]; tope: number; pintar: (x: T, i: number) => ReactNode; texto?: string }) {
  const [todo, setTodo] = useState(false)
  const vis = todo ? items : items.slice(0, tope)
  return (
    <>
      {vis.map(pintar)}
      {items.length > tope && <button type="button" className="lf-mas mono" onClick={() => setTodo((v) => !v)}>{todo ? 'Ver menos' : `${texto} · ${items.length - tope} más`}</button>}
    </>
  )
}
