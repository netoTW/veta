import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { ROLES, puede, type Rol } from '../lib/acceso'
import { useSesion } from '../lib/sesion'
import { authClient } from '../lib/auth'
import { invalidarDatos, useMeta } from '../lib/datos'
import { fechaHora } from '../lib/formato'
import { PlanBadge } from './piezas'
import { AvisoAnalisis, CupoBarra } from './analizar/aviso'

/* ============================================================================
   Cáscara del producto: barra superior con la sesión real, enlaces de admin,
   banda de impersonación y pie con la versión del motor. Sin 3D.

   El selector "ver como" existe SÓLO en desarrollo y SÓLO para admin; el
   servidor lo honra en las mismas condiciones. Para ver la plataforma como
   un usuario concreto está la impersonación (Cuentas).
   ========================================================================== */

const LINKS = [
  { to: '/gemas', label: 'Gemas' },
  { to: '/noticias', label: 'Noticias' },
  { to: '/seguimiento', label: 'Seguimiento' },
  { to: '/analisis', label: 'Análisis' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/votacion', label: 'Votación' },
  { to: '/analizar', label: 'Analizar' },
]
const LINKS_ADMIN = [
  { to: '/admin/bandeja', label: 'Bandeja' },
  { to: '/admin/cuentas', label: 'Cuentas' },
  { to: '/admin/votacion', label: 'Votación' },
  { to: '/admin/consumo', label: 'Consumo' },
  { to: '/admin/contenido', label: 'Contenido' },
  { to: '/admin/operacion', label: 'Operación' },
]

function SelectorRol() {
  const { yo, setVerComo } = useSesion()
  if (!import.meta.env.DEV || !yo?.desarrollo || yo.rol_real !== 'admin' || yo.impersonando) return null
  const actual: Rol = yo.ver_como ?? 'admin'
  return (
    <div className="p-rol" role="group" aria-label="Ver como (sólo desarrollo)">
      <span className="p-rol__label mono">Ver como</span>
      {ROLES.map((r) => (
        <button key={r} type="button" className={`p-rol__btn mono ${actual === r ? 'is-on' : ''}`} aria-pressed={actual === r}
          onClick={() => { invalidarDatos(); setVerComo(r === 'admin' ? null : r) }}>{r}</button>
      ))}
    </div>
  )
}

function BandaImpersonacion() {
  const { yo, recargar } = useSesion()
  const nav = useNavigate()
  const [saliendo, setSaliendo] = useState(false)
  if (!yo?.impersonando || !yo.usuario) return null
  const salir = async () => {
    setSaliendo(true)
    await authClient.admin.stopImpersonating()
    invalidarDatos()
    await recargar()
    nav('/admin/cuentas')
  }
  return (
    <div className="p-imp" role="status">
      <span className="p-imp__dot" aria-hidden="true" />
      <span className="mono">Estás viendo VETA como <b>{yo.usuario.email}</b> · plan {yo.usuario.plan}</span>
      <button type="button" className="p-imp__salir mono" onClick={salir} disabled={saliendo}>{saliendo ? 'Saliendo…' : 'Salir de la impersonación'}</button>
    </div>
  )
}

export function Shell({ children }: { children: ReactNode }) {
  const { yo, rol, salir } = useSesion()
  const meta = useMeta()
  const loc = useLocation()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [loc.pathname])
  const esAdminReal = yo?.rol_real === 'admin' && !yo.impersonando

  const cerrar = async () => { await salir(); invalidarDatos(); nav('/entrar') }

  return (
    <div className={`p-shell ${yo?.impersonando ? 'is-impersonando' : ''}`} data-rol={rol}>
      <BandaImpersonacion />
      <header className="p-top">
        <div className="shell p-top__inner">
          <Link to="/" className="p-top__logo" aria-label="VETA, ir al inicio">
            <img src="/img/logo-mark.webp" alt="" width={460} height={345} />
            <span className="wordmark">Veta</span>
          </Link>
          <nav className={`p-top__links mono ${open ? 'is-open' : ''}`} aria-label="Producto">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'is-active' : '')}>{l.label}</NavLink>
            ))}
            {esAdminReal && LINKS_ADMIN.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `p-top__admin ${isActive ? 'is-active' : ''}`}>{l.label}</NavLink>
            ))}
          </nav>
          <div className="p-top__right">
            <AvisoAnalisis />
            <CupoBarra />
            <PlanBadge rol={rol} />
            {yo?.usuario ? (
              <span className="p-yo">
                <Link to="/cuenta" className="p-yo__email mono" title="Mi cuenta">{yo.usuario.email}</Link>
                <button type="button" className="p-yo__salir mono" onClick={cerrar}>Salir</button>
              </span>
            ) : (
              <Link to={`/entrar?volver=${encodeURIComponent(loc.pathname)}`} className="p-yo__entrar mono">Entrar</Link>
            )}
            <button type="button" className="p-top__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              <span className="vh">Menú</span>
              <span className={`nav__burger ${open ? 'is-open' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="p-main">{children}</main>

      <footer className="p-foot">
        <div className="shell p-foot__inner mono">
          <span>
            Datos actualizados {meta.estado === 'ok' ? fechaHora(meta.datos.generado_en) : '…'}{esAdminReal && meta.estado === 'ok' ? <> · motor {meta.datos.version_motor}</> : null}
          </span>
          <span>Nada de esto es consejo de inversión. Todo número lleva su fuente y su fecha.</span>
        </div>
      </footer>

      <SelectorRol />
    </div>
  )
}

/** Exportación (plan Pro): la sirve el servidor, que vuelve a comprobar el plan. */
export function Exportar({ que }: { que: string }) {
  const { rol } = useSesion()
  if (!puede(rol, 'exportar')) return null
  return (
    <a className="btn btn--ghost" href={`/api/contenido/exportar/${que}`} download title="JSON con lo que ves, con sus fuentes y fechas">
      Exportar {que}
    </a>
  )
}

/** Cabecera de página: eyebrow con contexto, título y una línea de lectura. */
export function Cabecera({ eyebrow, titulo, lead, acciones }: { eyebrow: ReactNode; titulo: ReactNode; lead?: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="shell p-cab">
      <p className="eyebrow mono"><span className="eyebrow__mark" aria-hidden="true" />{eyebrow}<span className="eyebrow__rule" aria-hidden="true" /></p>
      <div className="p-cab__row">
        <div>
          <h1 className="display p-cab__title">{titulo}</h1>
          {lead && <p className="p-cab__lead body-muted">{lead}</p>}
        </div>
        {acciones && <div className="p-cab__acciones">{acciones}</div>}
      </div>
    </div>
  )
}
