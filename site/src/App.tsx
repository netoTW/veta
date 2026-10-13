import { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation, useParams } from 'react-router-dom'
import { Nav } from './components/Nav'
import { Footer } from './components/Footer'
import { useLenis, useReveals } from './lib/motion'
import { ProveedorSesion } from './lib/sesion'
import { recordarOrigen } from './lib/origen'
import { lazySeguro as lazy } from './lib/fragmentos'
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
const Enlaces = lazy(() => import('./producto/admin/Enlaces').then((m) => ({ default: m.Enlaces })))
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
/* Luffy: el panel privado de Mugiwara. Sólo admin real; para el resto no existe. */
const LuffyShell = lazy(() => import('./luffy/LuffyShell').then((m) => ({ default: m.LuffyShell })))
const LuffyChat = lazy(() => import('./luffy/Chat').then((m) => ({ default: m.Chat })))
const LuffyLaboratorio = lazy(() => import('./luffy/Laboratorio').then((m) => ({ default: m.Laboratorio })))
const LuffyTableros = lazy(() => import('./luffy/Tableros').then((m) => ({ default: m.Tableros })))
const LuffyTerminal = lazy(() => import('./luffy/Terminal').then((m) => ({ default: m.Terminal })))
// el terminal v2 (CONTRATO-PANEL §8.8) es «Terminal» desde el 13-oct; el de antes queda un tiempo en /luffy/terminal1
/* la dirección provisoria del v2 lleva a la de siempre */
function HaciaTerminal() { const { activo } = useParams(); return <Navigate to={`/luffy/terminal${activo ? `/${activo}` : ''}`} replace /> }
const LuffyTerminal2 = lazy(() => import('./luffy/terminal2/Terminal2').then((m) => ({ default: m.Terminal2 })))
const LuffyCartera = lazy(() => import('./luffy/Cartera').then((m) => ({ default: m.Cartera })))
const LuffyRadar = lazy(() => import('./luffy/Radar').then((m) => ({ default: m.Radar })))
const LuffyControl = lazy(() => import('./luffy/Control').then((m) => ({ default: m.Control })))
const LuffyOficina = lazy(() => import('./luffy/Oficina').then((m) => ({ default: m.Oficina })))
const LuffyInformes = lazy(() => import('./luffy/Informes').then((m) => ({ default: m.Informes })))

/* La guía de estilo, fuera de la portada. */
function GuiaVisual() {
  useLenis(); useReveals()
  return (<><Nav /><main><Sistema /></main><Footer /></>)
}

/* El límite se vuelve a montar al cambiar de ruta: si una pantalla revienta,
   navegar a otra tiene que devolverte una pantalla viva, no el mismo error. */
function Limite({ donde, children }: { donde: string; children: React.ReactNode }) {
  const { pathname } = useLocation()
  /* Bajo /luffy el panel tiene su propio límite por vista (LuffyShell): si este se reiniciara en
     cada ruta, cambiar de moneda desmontaría el panel entero (carcasa, lista, lo pedido). */
  return <LimiteDeError key={pathname.startsWith('/luffy') ? '/luffy' : pathname} donde={donde}>{children}</LimiteDeError>
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
          <Route path="/sistema" element={<Suspense fallback={null}><SoloAdmin><GuiaVisual /></SoloAdmin></Suspense>} />
          <Route path="/entrar" element={<Suspense fallback={null}><Entrar /></Suspense>} />
          <Route path="/registro" element={<Suspense fallback={null}><Registro /></Suspense>} />
          <Route path="/recuperar" element={<Suspense fallback={null}><Recuperar /></Suspense>} />
          <Route path="/restablecer" element={<Suspense fallback={null}><Restablecer /></Suspense>} />
          <Route path="/luffy" element={<Suspense fallback={null}><LuffyShell /></Suspense>}>
            <Route index element={<LuffyChat />} />
            <Route path="h/:hiloId" element={<LuffyChat />} />
            <Route path="laboratorio" element={<LuffyLaboratorio />} />
            <Route path="laboratorio/t/:tableroId" element={<LuffyLaboratorio />} />
            <Route path="laboratorio/:specId" element={<LuffyLaboratorio />} />
            <Route path="tableros" element={<LuffyTableros />} />
            {/* una sola ruta con la moneda opcional: pasar de /terminal a /terminal/WAL no remonta la terminal */}
            <Route path="terminal/:activo?" element={<LuffyTerminal2 />} />
            <Route path="terminal1/:activo?" element={<LuffyTerminal />} />
            <Route path="t2/:activo?" element={<HaciaTerminal />} />
            <Route path="cartera" element={<LuffyCartera />} />
            <Route path="radar" element={<LuffyRadar />} />
            <Route path="control" element={<LuffyControl />} />
            <Route path="oficina" element={<LuffyOficina />} />
            <Route path="informes/:fecha?" element={<LuffyInformes />} />
          </Route>
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
            <Route path="/piezas" element={<SoloAdmin><Piezas /></SoloAdmin>} />
            <Route path="/admin/bandeja" element={<SoloAdmin><Bandeja /></SoloAdmin>} />
            <Route path="/admin/bandeja/:id" element={<SoloAdmin><BandejaDetalle /></SoloAdmin>} />
            <Route path="/admin/cuentas" element={<SoloAdmin><Cuentas /></SoloAdmin>} />
            <Route path="/admin/enlaces" element={<SoloAdmin><Enlaces /></SoloAdmin>} />
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
