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

   Navegación (fase 6b §8): en escritorio, barra superior con Chat, Terminal,
   Cartera, Radar y un menú «Más» (Laboratorio, Tableros, Control, Oficina,
   Informes). En el teléfono, barra inferior de vidrio con esas cinco y «Más».
   ========================================================================== */

function NoExiste() {
  return (
    <div className="lf-noexiste shell">
      <EmptyState kind="vacio" title="Esta página no existe." detail="Revisa la dirección o vuelve al inicio." action={<Link to="/" className="btn btn--ghost">Ir al inicio</Link>} />
    </div>
  )
}

const PRINCIPALES = [
  { to: '/luffy', label: 'Chat', activa: (p: string) => p === '/luffy' || p.startsWith('/luffy/h/'), icono: 'M4 5h16v11H8l-4 4V5z' },
  { to: '/luffy/terminal', label: 'Terminal', activa: (p: string) => p.startsWith('/luffy/terminal'), icono: 'M3 17l5-6 4 3 5-7 4 5M3 20h18' },
  { to: '/luffy/cartera', label: 'Cartera', activa: (p: string) => p.startsWith('/luffy/cartera'), icono: 'M3 7h18v12H3zM3 11h18M16 15h2' },
  { to: '/luffy/radar', label: 'Radar', activa: (p: string) => p.startsWith('/luffy/radar'), icono: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 12l6-6' },
]
const MAS = [
  { to: '/luffy/laboratorio', label: 'Laboratorio', activa: (p: string) => p.startsWith('/luffy/laboratorio') },
  { to: '/luffy/tableros', label: 'Tableros', activa: (p: string) => p.startsWith('/luffy/tableros') },
  { to: '/luffy/control', label: 'Control de Luffy', activa: (p: string) => p.startsWith('/luffy/control') },
  { to: '/luffy/oficina', label: 'Oficina en vivo', activa: (p: string) => p.startsWith('/luffy/oficina') },
  { to: '/luffy/informes', label: 'Informes', activa: (p: string) => p.startsWith('/luffy/informes') },
]

export function LuffyShell() {
  const { yo, cargando } = useSesion()
  const loc = useLocation()
  const [costo, setCosto] = useState<Costo | null>(null)
  const [mas, setMas] = useState(false)
  const esPablo = !!yo?.usuario && !yo.impersonando && yo.rol_real === 'admin'
  /* El gasto del mes es un adorno de la barra: se muestra lo último guardado y se pide después de
     que la vista cargó lo suyo, para no competir con ella en el teléfono. */
  useEffect(() => {
    if (!esPablo) return
    try { const g = sessionStorage.getItem('luffy.costo'); if (g) setCosto(JSON.parse(g) as Costo) } catch { /* sin storage */ }
    const t = setTimeout(() => luffy.costo().then((c) => { setCosto(c); try { sessionStorage.setItem('luffy.costo', JSON.stringify(c)) } catch { /* lleno */ } }, () => {}), 3500)
    return () => clearTimeout(t)
  }, [esPablo])
  useEffect(() => { document.title = 'Luffy · VETA' }, [])
  useEffect(() => { setMas(false) }, [loc.pathname])
  if (cargando) return null
  if (!esPablo) return <NoExiste />
  const p = loc.pathname
  const esChat = PRINCIPALES[0].activa(p)
  const enMas = MAS.some((m) => m.activa(p))
  const costoUsd = costo ? (typeof (costo as { total_usd?: number }).total_usd === 'number' ? (costo as { total_usd?: number }).total_usd! : costo.costo_usd) : null
  return (
    <div className={`lf ${esChat ? 'lf--chat' : ''} ${p.startsWith('/luffy/terminal') ? 'lf--terminal' : ''}`}>
      <header className="lf-top">
        <Link to="/luffy" className="lf-top__marca" aria-label="Luffy">
          <img src="/img/logo-mark.webp" alt="" width={460} height={345} />
          <span className="wordmark">Luffy</span>
          <span className="lf-top__sub mono">Mugiwara</span>
        </Link>
        <nav className="lf-top__tabs mono" aria-label="Secciones">
          {PRINCIPALES.map((t) => <NavLink key={t.to} to={t.to} className={t.activa(p) ? 'is-active' : ''}>{t.label}</NavLink>)}
          <details className={`lf-mas ${enMas ? 'is-activa' : ''}`} open={mas} onToggle={(e) => setMas((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>Más{enMas ? ` · ${MAS.find((m) => m.activa(p))?.label}` : ''}</summary>
            <div className="lf-mas__lista">{MAS.map((m) => <NavLink key={m.to} to={m.to} className={m.activa(p) ? 'is-active' : ''}>{m.label}</NavLink>)}</div>
          </details>
        </nav>
        <div className="lf-top__der mono">
          {costoUsd !== null && Number.isFinite(costoUsd) && (
            <Link to="/luffy/control" className="lf-top__costo" title={costo?.presupuesto ? `Gasto del mes contra el presupuesto de ${fmtUsd(costo.presupuesto.presupuesto_api_usd, 0)}` : 'Gasto del mes'}>
              <b className="num">{fmtUsd(costoUsd, 2)}</b>{costo?.presupuesto ? <i style={{ ['--p' as string]: Math.min(1, costoUsd / costo.presupuesto.presupuesto_api_usd) }} /> : null}
            </Link>
          )}
          <Link to="/admin/bandeja" className="lf-top__veta">VETA</Link>
        </div>
      </header>
      <main className="lf-main">
        <Suspense fallback={null}>
          {/* la terminal no se desmonta al cambiar de moneda (la lista, la sincronía y lo pedido siguen); el resto se reinicia por ruta */}
          <LimiteDeError key={p.startsWith('/luffy/terminal') ? '/luffy/terminal' : p.startsWith('/luffy/informes') ? '/luffy/informes' : p} donde="luffy"><Outlet /></LimiteDeError>
        </Suspense>
      </main>
      {/* barra inferior del teléfono */}
      <nav className="lf-abajo mono" aria-label="Secciones">
        {PRINCIPALES.map((t) => (
          <NavLink key={t.to} to={t.to} className={t.activa(p) ? 'is-active' : ''}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.icono} /></svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
        <button type="button" className={`lf-abajo__mas ${enMas ? 'is-active' : ''}`} aria-expanded={mas} onClick={() => setMas((v) => !v)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" /></svg>
          <span>Más</span>
        </button>
      </nav>
      {mas && (
        <>
          <button type="button" className="lf-velo" aria-label="Cerrar" onClick={() => setMas(false)} />
          <div className="lf-hoja-mas" role="dialog" aria-label="Más secciones">
            <div className="lf-lab__ctrl-cab mono"><span>Más</span><button type="button" className="lf-lab__cerrar" onClick={() => setMas(false)} aria-label="Cerrar">×</button></div>
            {MAS.map((m) => <NavLink key={m.to} to={m.to} className={`lf-hoja-mas__item ${m.activa(p) ? 'is-active' : ''}`}>{m.label}</NavLink>)}
          </div>
        </>
      )}
    </div>
  )
}
