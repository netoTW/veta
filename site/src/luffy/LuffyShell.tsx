import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useSesion } from '../lib/sesion'
import { EmptyState } from '../ui/EmptyState'
import { LimiteDeError } from '../ui/LimiteDeError'
import { luffy } from './api'
import type { Costo } from './tipos'
import { fmtUsd } from './formato'

/* ============================================================================
   /luffy: la sección privada de Mugiwara. Sólo para el rol admin real; para
   cualquier otro, esta página no existe (ni se nombra). El servidor repite la
   misma puerta en /api/luffy/* con 404.
   ========================================================================== */

function NoExiste() {
  return (
    <div className="lf-noexiste shell">
      <EmptyState kind="vacio" title="Esta página no existe." detail="Revisa la dirección o vuelve al inicio." action={<Link to="/" className="btn btn--ghost">Ir al inicio</Link>} />
    </div>
  )
}

const TABS = [{ to: '/luffy', label: 'Chat', fin: true }, { to: '/luffy/laboratorio', label: 'Laboratorio', fin: false }, { to: '/luffy/tableros', label: 'Tableros', fin: false }]

export function LuffyShell() {
  const { yo, cargando } = useSesion()
  const loc = useLocation()
  const [costo, setCosto] = useState<Costo | null>(null)
  const esPablo = !!yo?.usuario && !yo.impersonando && yo.rol_real === 'admin'
  useEffect(() => { if (!esPablo) return; luffy.costo().then(setCosto, () => setCosto(null)) }, [esPablo])
  useEffect(() => { document.title = 'Luffy · VETA' }, [])
  if (cargando) return null
  if (!esPablo) return <NoExiste />
  const esChat = loc.pathname === '/luffy' || loc.pathname.startsWith('/luffy/h/')
  return (
    <div className={`lf ${esChat ? 'lf--chat' : ''}`}>
      <header className="lf-top">
        <Link to="/luffy" className="lf-top__marca" aria-label="Luffy">
          <img src="/img/logo-mark.webp" alt="" width={460} height={345} />
          <span className="wordmark">Luffy</span>
          <span className="lf-top__sub mono">Mugiwara</span>
        </Link>
        <nav className="lf-top__tabs mono" aria-label="Secciones">
          {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.fin} className={({ isActive }) => (isActive || (t.fin && loc.pathname.startsWith('/luffy/h/')) ? 'is-active' : '')}>{t.label}</NavLink>)}
        </nav>
        <div className="lf-top__der mono">
          {costo && Number.isFinite(costo.costo_usd) && (
            <span className="lf-top__costo" title={costo.presupuesto ? `Gasto del mes contra el presupuesto de ${fmtUsd(costo.presupuesto.presupuesto_api_usd, 0)}` : 'Gasto del mes'}>
              <b className="num">{fmtUsd(costo.costo_usd, 2)}</b>{costo.presupuesto ? <i style={{ ['--p' as string]: Math.min(1, costo.costo_usd / costo.presupuesto.presupuesto_api_usd) }} /> : null}
            </span>
          )}
          <Link to="/admin/bandeja" className="lf-top__veta">VETA</Link>
        </div>
      </header>
      <main className="lf-main">
        <Suspense fallback={null}>
          <LimiteDeError key={loc.pathname} donde="luffy"><Outlet /></LimiteDeError>
        </Suspense>
      </main>
    </div>
  )
}
