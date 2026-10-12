import { Component, type ErrorInfo, type ReactNode } from 'react'

/* ============================================================================
   Una tarjeta que revienta no tumba la vista.

   Un límite de error de React sólo atrapa lo que se dibuja en un componente
   hijo: el JSX escrito en línea se evalúa en el padre, así que un `.join` sobre
   un dato raro tiraba la pantalla entera. Por eso `Seguro` recibe una función y
   la ejecuta dentro de su propio hijo: lo que falle ahí queda en esa tarjeta,
   se registra en el servidor (como el límite general) y el resto sigue.

     <Seguro t="Ficha del radar">{() => <section>…</section>}</Seguro>
   ========================================================================== */

type Hijos = ReactNode | (() => ReactNode)
interface Props { t: string; children: Hijos; clase?: string }
interface Estado { fallo: Error | null }

function Dentro({ f }: { f: Hijos }) { return <>{typeof f === 'function' ? f() : f}</> }

export class Seguro extends Component<Props, Estado> {
  state: Estado = { fallo: null }
  private avisado = false
  static getDerivedStateFromError(fallo: Error): Estado { return { fallo } }
  componentDidCatch(fallo: Error, info: ErrorInfo) {
    console.error('[luffy] tarjeta rota', this.props.t, fallo)
    if (this.avisado) return
    this.avisado = true
    try {
      void fetch('/api/fallo', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donde: `luffy:${this.props.t}`.slice(0, 40), ruta: location.pathname + location.search, mensaje: fallo.message?.slice(0, 500) ?? '', pila: (fallo.stack ?? '').slice(0, 2000), componente: (info.componentStack ?? '').slice(0, 1500) }),
      }).catch(() => {})
    } catch { /* mejor esfuerzo */ }
  }
  render() {
    if (!this.state.fallo) return <Dentro f={this.props.children} />
    return (
      <section className={`lf-tarj lf-seguro ${this.props.clase ?? ''}`} data-prueba="tarjeta-rota">
        <h3 className="mono">{this.props.t}</h3>
        <p className="lf-ctrl__nota">Esta parte no se pudo mostrar con lo que llegó del servidor. El resto de la vista sigue.</p>
        <p className="lf-ctrl__nota mono">{this.state.fallo.message.slice(0, 160)}</p>
        <button type="button" className="lf-mas mono" onClick={() => { this.avisado = false; this.setState({ fallo: null }) }}>Reintentar</button>
      </section>
    )
  }
}
