import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Red de seguridad para todo lo que dependa de WebGL.
 *
 * Un canvas 3D puede caerse por razones que no controlamos: pérdida de
 * contexto, driver, memoria, una pestaña en segundo plano por horas. Sin esto,
 * React desmonta el árbol y lo remonta en bucle — que es exactamente cómo se
 * ve "roto". Con esto, se apaga y queda la capa estática de abajo.
 */
interface Props { children: ReactNode; onFail?: () => void }
interface State { failed: boolean }

export class GLBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Se registra una vez y se sigue: el visitante ve el poster, no un bucle.
    console.warn('[3H] escena 3D deshabilitada:', error.message, info.componentStack)
    this.props.onFail?.()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
