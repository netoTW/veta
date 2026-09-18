import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useSesion } from '../../lib/sesion'
import { EmptyState } from '../../ui/EmptyState'

/** Puerta de admin: rol REAL admin y sin impersonar. El servidor lo vuelve a exigir. */
export function SoloAdmin({ children }: { children: ReactNode }) {
  const { yo, cargando } = useSesion()
  if (cargando) return null
  if (!yo?.usuario) {
    return <div className="shell" style={{ paddingTop: 40 }}><EmptyState kind="vacio" title="Hay que entrar." detail="La administración es sólo para admin." action={<Link to="/entrar?volver=/admin/bandeja" className="btn">Entrar</Link>} /></div>
  }
  if (yo.impersonando) {
    return <div className="shell" style={{ paddingTop: 40 }}><EmptyState kind="sin-datos" title="Estás impersonando." detail="Salí de la impersonación (arriba) para administrar." /></div>
  }
  if (yo.rol_real !== 'admin') {
    return <div className="shell" style={{ paddingTop: 40 }}><EmptyState kind="sin-datos" title="Esto es sólo para admin." detail="Tu cuenta no tiene rol de administración." action={<Link to="/gemas" className="btn btn--ghost">Ir a Gemas</Link>} /></div>
  }
  return <>{children}</>
}
