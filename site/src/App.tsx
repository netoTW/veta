import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { useLenis, useReveals } from './lib/motion'
import { ProveedorSesion } from './lib/sesion'
import { recordarOrigen } from './lib/origen'
import { Shell } from './producto/Shell'
import { LimiteDeError } from './ui/LimiteDeError'
import { SoloAdmin } from './producto/admin/SoloAdmin'

/* De dónde vino la visita: se anota al entrar, antes de pintar nada. */
recordarOrigen()

/* Producto: carga aparte. La portada no lo necesita. */
const Gemas = lazy(() => import('./producto/paginas/Gemas').then((m) => ({ default: m.Gemas })))
const GemaDetalle = lazy(() => import('./producto/paginas/InformeDetalle').then((m) => ({ default: m.GemaDetalle })))
const AnalisisDetalle = lazy(() => import('./producto/paginas/InformeDetalle').then((m) => ({ default: () => <m.InformeDetalle tipo="analisis" /> })))
const Seguimiento = lazy(() => import('./producto/paginas/Seguimiento').then((m) => ({ default: m.Seguimiento })))
const Analisis = lazy(() => import('./producto/paginas/Analisis').then((m) => ({ default: m.Analisis })))
const Piezas = lazy(() => import('./producto/paginas/Piezas').then((m) => ({ default: m.Piezas })))
const Watchlist = lazy(() => import('./producto/paginas/Watchlist').then((m) => ({ default: m.Watchlist })))
const Noticias = lazy(() => import('./producto/paginas/Noticias').then((m) => ({ default: m.Noticias })))
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
/* La guía de estilo sale de la portada: queda en /sistema, sin enlace en la navegación. */
const Sistema = lazy(() => import('./components/Sistema').then((m) => ({ default: m.Sistema })))
const Portada = lazy(() => import('./publico/Portada').then((m) => ({ default: m.Portada })))
const Metodologia = lazy(() => import('./publico/Metodologia').then((m) => ({ default: m.Metodologia })))
const Precios = lazy(() => import('./publico/Precios').then((m) => ({ default: m.Precios })))
const Nosotros = lazy(() => import('./publico/Nosotros').then((m) => ({ default: m.Nosotros })))
const Gracias = lazy(() => import('./publico/Gracias').then((m) => ({ default: m.Gracias })))
const Terminos = lazy(() => import('./publico/Legales').then((m) => ({ default: m.Terminos })))
const Privacidad = lazy(() => import('./publico/Legales').then((m) => ({ default: m.Privacidad })))
const Contacto = lazy(() => import('./publico/Legales').then((m) => ({ default: m.Contacto })))
const ContenidoAdmin = lazy(() => import('./producto/admin/Contenido').then((m) => ({ default: m.Contenido })))
const Acciones = lazy(() => import('./producto/admin/Acciones').then((m) => ({ default: m.Acciones })))

/* La guía de estilo, fuera de la portada. */
function GuiaVisual() {
  useLenis(); useReveals()
  return (<><Nav /><main><Sistema /></main><Footer /></>)
}

/* El límite se vuelve a montar al cambiar de ruta: si una pantalla revienta,
   navegar a otra tiene que devolverte una pantalla viva, no el mismo error. */
function Limite({ donde, children }: { donde: string; children: React.ReactNode }) {
  const { pathname } = useLocation()
  return <LimiteDeError key={pathname} donde={donde}>{children}</LimiteDeError>
}

function Producto() {
  return (
    <Shell>
      <Suspense fallback={null}>
        <Limite donde="producto"><Outlet /></Limite>
      </Suspense>
    </Shell>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorSesion>
        <Limite donde="publico">
        <Routes>
          <Route path="/" element={<Suspense fallback={null}><Portada /></Suspense>} />
          <Route path="/metodologia" element={<Suspense fallback={null}><Metodologia /></Suspense>} />
          <Route path="/precios" element={<Suspense fallback={null}><Precios /></Suspense>} />
          <Route path="/nosotros" element={<Suspense fallback={null}><Nosotros /></Suspense>} />
          <Route path="/gracias" element={<Suspense fallback={null}><Gracias /></Suspense>} />
          <Route path="/terminos" element={<Suspense fallback={null}><Terminos /></Suspense>} />
          <Route path="/privacidad" element={<Suspense fallback={null}><Privacidad /></Suspense>} />
          <Route path="/contacto" element={<Suspense fallback={null}><Contacto /></Suspense>} />
          {/* Referencia interna del sistema visual. Sin enlace en la navegación. */}
          <Route path="/sistema" element={<Suspense fallback={null}><GuiaVisual /></Suspense>} />
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
            <Route path="/noticias" element={<Noticias />} />
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
            <Route path="/admin/contenido" element={<SoloAdmin><ContenidoAdmin /></SoloAdmin>} />
            <Route path="/admin/acciones" element={<SoloAdmin><Acciones /></SoloAdmin>} />
          </Route>
        </Routes>
        </Limite>
      </ProveedorSesion>
    </BrowserRouter>
  )
}
