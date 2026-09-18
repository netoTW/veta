import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Sistema } from './components/Sistema'
import { Footer } from './components/Footer'
import { useLenis, useReveals } from './lib/motion'
import { ProveedorSesion } from './lib/sesion'
import { Shell } from './producto/Shell'
import { SoloAdmin } from './producto/admin/SoloAdmin'

/* Producto: carga aparte. La portada no lo necesita. */
const Gemas = lazy(() => import('./producto/paginas/Gemas').then((m) => ({ default: m.Gemas })))
const GemaDetalle = lazy(() => import('./producto/paginas/InformeDetalle').then((m) => ({ default: m.GemaDetalle })))
const AnalisisDetalle = lazy(() => import('./producto/paginas/InformeDetalle').then((m) => ({ default: () => <m.InformeDetalle tipo="analisis" /> })))
const Seguimiento = lazy(() => import('./producto/paginas/Seguimiento').then((m) => ({ default: m.Seguimiento })))
const Analisis = lazy(() => import('./producto/paginas/Analisis').then((m) => ({ default: m.Analisis })))
const Piezas = lazy(() => import('./producto/paginas/Piezas').then((m) => ({ default: m.Piezas })))
const Watchlist = lazy(() => import('./producto/paginas/Watchlist').then((m) => ({ default: m.Watchlist })))
const Analizar = lazy(() => import('./producto/paginas/Analizar').then((m) => ({ default: m.Analizar })))
const AnalizarSolicitud = lazy(() => import('./producto/paginas/Analizar').then((m) => ({ default: m.AnalizarSolicitud })))
const Votacion = lazy(() => import('./producto/paginas/Votacion').then((m) => ({ default: m.Votacion })))
const Cuenta = lazy(() => import('./producto/paginas/Cuenta').then((m) => ({ default: m.Cuenta })))
/* Autenticación: el momento de marca. Su propio chunk (trae la escena 3D). */
const Entrar = lazy(() => import('./auth/Paginas').then((m) => ({ default: m.Entrar })))
const Registro = lazy(() => import('./auth/Paginas').then((m) => ({ default: m.Registro })))
const Recuperar = lazy(() => import('./auth/Paginas').then((m) => ({ default: m.Recuperar })))
const Restablecer = lazy(() => import('./auth/Paginas').then((m) => ({ default: m.Restablecer })))
/* Admin */
const Bandeja = lazy(() => import('./producto/admin/Bandeja').then((m) => ({ default: m.Bandeja })))
const BandejaDetalle = lazy(() => import('./producto/admin/BandejaDetalle').then((m) => ({ default: m.BandejaDetalle })))
const Cuentas = lazy(() => import('./producto/admin/Cuentas').then((m) => ({ default: m.Cuentas })))
const CuentaDetalle = lazy(() => import('./producto/admin/CuentaDetalle').then((m) => ({ default: m.CuentaDetalle })))
const Operacion = lazy(() => import('./producto/admin/Operacion').then((m) => ({ default: m.Operacion })))
const Consumo = lazy(() => import('./producto/admin/Consumo').then((m) => ({ default: m.Consumo })))
const VotacionAdmin = lazy(() => import('./producto/admin/Votacion').then((m) => ({ default: m.VotacionAdmin })))
const Acciones = lazy(() => import('./producto/admin/Acciones').then((m) => ({ default: m.Acciones })))

function Portada() {
  useLenis()
  useReveals()
  return (
    <>
      <a className="skip-link" href="#sistema">Saltar al contenido</a>
      <Nav />
      <main>
        <Hero />
        <Sistema />
      </main>
      <Footer />
    </>
  )
}

function Producto() {
  return (
    <Shell>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorSesion>
        <Routes>
          <Route path="/" element={<Portada />} />
          <Route path="/entrar" element={<Suspense fallback={null}><Entrar /></Suspense>} />
          <Route path="/registro" element={<Suspense fallback={null}><Registro /></Suspense>} />
          <Route path="/recuperar" element={<Suspense fallback={null}><Recuperar /></Suspense>} />
          <Route path="/restablecer" element={<Suspense fallback={null}><Restablecer /></Suspense>} />
          <Route element={<Producto />}>
            <Route path="/gemas" element={<Gemas />} />
            <Route path="/gemas/:id" element={<GemaDetalle />} />
            <Route path="/seguimiento" element={<Seguimiento />} />
            <Route path="/analisis" element={<Analisis />} />
            <Route path="/analisis/:id" element={<AnalisisDetalle />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/analizar" element={<Analizar />} />
            <Route path="/analizar/s/:id" element={<AnalizarSolicitud />} />
            <Route path="/votacion" element={<Votacion />} />
            <Route path="/cuenta" element={<Cuenta />} />
            <Route path="/piezas" element={<Piezas />} />
            <Route path="/admin/bandeja" element={<SoloAdmin><Bandeja /></SoloAdmin>} />
            <Route path="/admin/bandeja/:id" element={<SoloAdmin><BandejaDetalle /></SoloAdmin>} />
            <Route path="/admin/cuentas" element={<SoloAdmin><Cuentas /></SoloAdmin>} />
            <Route path="/admin/cuentas/:id" element={<SoloAdmin><CuentaDetalle /></SoloAdmin>} />
            <Route path="/admin/operacion" element={<SoloAdmin><Operacion /></SoloAdmin>} />
            <Route path="/admin/consumo" element={<SoloAdmin><Consumo /></SoloAdmin>} />
            <Route path="/admin/votacion" element={<SoloAdmin><VotacionAdmin /></SoloAdmin>} />
            <Route path="/admin/acciones" element={<SoloAdmin><Acciones /></SoloAdmin>} />
          </Route>
        </Routes>
      </ProveedorSesion>
    </BrowserRouter>
  )
}
