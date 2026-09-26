import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { esFalloDeFragmento } from '../lib/fragmentos'

/* ============================================================================
   Límite de error.

   Una pantalla en blanco no es un error: es la ausencia de cualquier señal, y
   deja a la persona sin saber si esperar, recargar o irse. React desmonta el
   árbol entero cuando algo revienta durante el render, y sin esto lo que queda
   es exactamente eso: nada.

   Aquí se corta la caída, se enseña una piedra partida con un mensaje en
   palabras normales, y **se registra el fallo en el servidor**, porque un
   error que sólo vive en la consola del visitante es un error que nunca vamos
   a ver.

   El fallo se manda una sola vez por montaje: si el render vuelve a reventar
   en bucle, no se convierte en una tormenta de peticiones.
   ========================================================================== */

interface Props { children: ReactNode; donde?: string }
interface Estado { fallo: Error | null }

export class LimiteDeError extends Component<Props, Estado> {
  state: Estado = { fallo: null }
  private avisado = false

  static getDerivedStateFromError(fallo: Error): Estado {
    return { fallo }
  }

  componentDidCatch(fallo: Error, info: ErrorInfo) {
    console.error('[veta] pantalla rota', this.props.donde ?? '', fallo, info.componentStack)
    if (this.avisado) return
    this.avisado = true
    // Sin await ni reintento: si el aviso falla, el usuario ya tiene su mensaje.
    try {
      void fetch('/api/fallo', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donde: this.props.donde ?? null,
          ruta: window.location.pathname + window.location.search,
          mensaje: fallo.message?.slice(0, 500) ?? '',
          pila: (fallo.stack ?? '').slice(0, 2000),
          componente: (info.componentStack ?? '').slice(0, 1500),
        }),
      }).catch(() => { /* el aviso es mejor-esfuerzo */ })
    } catch { /* idem */ }
  }

  private reintentar = () => { this.avisado = false; this.setState({ fallo: null }) }
  /* Si lo que faltó fue un trozo de la propia página, reintentar no puede
     funcionar: el fichero ya no existe en el servidor. Lo que hace falta es
     pedir la versión nueva. */
  private recargar = () => { window.location.reload() } // nav-por-clic: el botón «Recargar»

  render() {
    if (!this.state.fallo) return this.props.children
    const viejo = esFalloDeFragmento(this.state.fallo)
    return (
      <div className="shell">
        <EmptyState
          kind="error"
          title={viejo ? 'Esta página se actualizó mientras la tenías abierta.' : 'Esta pantalla no se pudo dibujar.'}
          detail={viejo
            ? 'Hay una versión nueva. Cárgala y sigues donde estabas.'
            : 'Ya quedó registrado de nuestro lado y lo vamos a mirar. Puedes reintentar o volver al inicio.'}
          action={
            <div className="pub__acciones">
              {viejo
                ? <button type="button" className="btn" onClick={this.recargar}>Cargar la versión nueva</button>
                : <button type="button" className="btn" onClick={this.reintentar}>Reintentar</button>}
              <a href="/" className="btn btn--ghost">Volver al inicio</a>
            </div>
          }
        />
      </div>
    )
  }
}
