import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authClient, mensajeAuth } from '../lib/auth'
import { useSesion } from '../lib/sesion'
import { invalidarDatos } from '../lib/datos'
import { controlInicial, type Control } from '../three/HeroScene'
import { AuthEscena, type EstadoEscena } from './AuthEscena'

/* ============================================================================
   Entrar · Registro · Recuperar · Restablecer — el primer contacto real.

   No es un formulario sobre fondo oscuro: es la roca del hero obedeciendo
   a la llave. En reposo la grieta apenas asoma; cuando el formulario tiene
   algo válido, avanza; al enviar, corre a saltos; con la llave correcta la
   piedra se abre y la cámara entra en la veta (y de ahí, al producto); con
   la equivocada la grieta se cierra de golpe, la piedra tiembla y la veta
   se enciende roja un instante.
   ========================================================================== */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const MIN_PASS = 10

function useEscena() {
  const control = useRef<Control>(controlInicial())
  const [estado, setEstado] = useState<EstadoEscena>('reposo')
  const set = (p: Partial<Control>) => Object.assign(control.current, p)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const luego = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }

  const api = {
    control, estado,
    reposo() { setEstado('reposo'); set({ u: 0.12, open: 0, tint: 0, dolly: 0 }) },
    atenta(valido: boolean) { setEstado('atenta'); set({ u: valido ? 0.58 : 0.32, open: 0, tint: 0 }) },
    enviando() { setEstado('enviando'); set({ u: 0.8, shake: 0.45, tint: 0 }) },
    exito() { setEstado('exito'); set({ u: 1, open: 1, dolly: 1, tint: 0, shake: 0.6 }) },
    /** Apertura a medias, sin cámara: para "te mandamos el enlace". */
    medio() { setEstado('exito'); set({ u: 0.86, open: 0.4, dolly: 0.15, tint: 0 }) },
    error() {
      setEstado('error'); set({ u: 0.06, open: 0, tint: 1, shake: 1, dolly: 0 })
      luego(1300, () => { set({ tint: 0 }) }); luego(1500, () => { setEstado('atenta'); set({ u: 0.32 }) })
    },
    luego,
  }
  return api
}

function Marco({ escena, eyebrow, titulo, lead, children, pie }: { escena: ReturnType<typeof useEscena>; eyebrow: string; titulo: ReactNode; lead: ReactNode; children: ReactNode; pie?: ReactNode }) {
  return (
    <div className={`auth auth--${escena.estado}`}>
      <AuthEscena control={escena.control} estado={escena.estado} />
      <div className="auth__panel">
        <Link to="/" className="auth__logo" aria-label="VETA, ir al inicio">
          <img src="/img/logo-mark.webp" alt="" width={460} height={345} />
          <span className="wordmark">Veta</span>
        </Link>
        <p className="eyebrow mono" data-mat="oro"><span className="eyebrow__mark" aria-hidden="true" />{eyebrow}</p>
        <h1 className="display auth__title">{titulo}</h1>
        <p className="auth__lead body-muted">{lead}</p>
        {children}
        {pie && <div className="auth__pie mono">{pie}</div>}
      </div>
      <p className="auth__foot mono" aria-hidden="true"><span>Tesis · Escenarios · Riesgo · Sin promesas</span></p>
    </div>
  )
}

function Campo({ id, label, children, ayuda }: { id: string; label: string; children: ReactNode; ayuda?: ReactNode }) {
  return (
    <div className="auth__campo">
      <label htmlFor={id} className="mono">{label}</label>
      {children}
      {ayuda && <span className="auth__ayuda">{ayuda}</span>}
    </div>
  )
}

function Clave({ id, value, onChange, onFocus, autoComplete, placeholder }: { id: string; value: string; onChange: (v: string) => void; onFocus?: () => void; autoComplete: string; placeholder?: string }) {
  const [ver, setVer] = useState(false)
  return (
    <span className="auth__clave">
      <input id={id} type={ver ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} autoComplete={autoComplete} placeholder={placeholder} minLength={MIN_PASS} required />
      <button type="button" className="auth__ver mono" onClick={() => setVer((v) => !v)} aria-pressed={ver}>{ver ? 'ocultar' : 'ver'}</button>
    </span>
  )
}

function Error({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p className="auth__error" role="alert"><span className="auth__error__mark" aria-hidden="true" />{msg}</p>
}

/* ================================ ENTRAR ================================ */
export function Entrar() {
  const escena = useEscena()
  const nav = useNavigate()
  const [q] = useSearchParams()
  const { yo, cargando, recargar } = useSesion()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState<string | null>(q.get('ok') === 'restablecida' ? null : null)
  const [ocupado, setOcupado] = useState(false)
  const volver = q.get('volver') && q.get('volver')!.startsWith('/') ? q.get('volver')! : '/gemas'
  const valido = EMAIL.test(email) && pass.length >= MIN_PASS

  // Ya con sesión: no hay nada que abrir acá.
  useEffect(() => { if (!cargando && yo?.usuario && escena.estado === 'reposo') nav(volver, { replace: true }) }, [cargando, yo, nav, volver, escena.estado])
  useEffect(() => { if (escena.estado !== 'reposo' && escena.estado !== 'enviando' && escena.estado !== 'exito' && escena.estado !== 'error') escena.atenta(valido) }, [valido]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setMsg(null); escena.enviando()
    const r = await authClient.signIn.email({ email: email.trim().toLowerCase(), password: pass })
    if (r.error) {
      setMsg(mensajeAuth(r.error.code, r.error.message)); escena.error(); setOcupado(false)
      return
    }
    invalidarDatos(); escena.exito()
    await recargar()
    escena.luego(1700, () => nav(volver, { replace: true }))
  }

  return (
    <Marco
      escena={escena}
      eyebrow="VETA · Entrar"
      titulo={<>La piedra se abre <em>con la llave correcta.</em></>}
      lead="Entrá a tu cuenta para leer las tesis, el seguimiento y la watchlist."
      pie={<><span>¿Sin cuenta? <Link to="/registro">Crear una</Link></span><span><Link to="/recuperar">Olvidé mi contraseña</Link></span></>}
    >
      <form className="auth__form" onSubmit={enviar} noValidate>
        {q.get('ok') === 'restablecida' && <p className="auth__ok mono">Contraseña nueva guardada. Entrá con ella.</p>}
        <Campo id="email" label="Correo">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => escena.atenta(valido)} autoComplete="email" inputMode="email" required autoFocus />
        </Campo>
        <Campo id="pass" label="Contraseña">
          <Clave id="pass" value={pass} onChange={setPass} onFocus={() => escena.atenta(valido)} autoComplete="current-password" />
        </Campo>
        <Error msg={msg} />
        <button type="submit" className="btn auth__btn" disabled={ocupado || escena.estado === 'exito'}>
          {escena.estado === 'exito' ? 'Abriendo…' : ocupado ? 'Comprobando…' : 'Entrar'}
        </button>
      </form>
    </Marco>
  )
}

/* =============================== REGISTRO =============================== */
export function Registro() {
  const escena = useEscena()
  const nav = useNavigate()
  const { recargar } = useSesion()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const valido = nombre.trim().length >= 2 && EMAIL.test(email) && pass.length >= MIN_PASS && pass === pass2
  useEffect(() => { if (escena.estado === 'atenta') escena.atenta(valido) }, [valido]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (ocupado) return
    if (pass !== pass2) { setMsg('Las dos contraseñas no coinciden.'); escena.error(); return }
    setOcupado(true); setMsg(null); escena.enviando()
    const r = await authClient.signUp.email({ email: email.trim().toLowerCase(), password: pass, name: nombre.trim() })
    if (r.error) { setMsg(mensajeAuth(r.error.code, r.error.message)); escena.error(); setOcupado(false); return }
    invalidarDatos(); escena.exito()
    await recargar()
    escena.luego(1700, () => nav('/gemas', { replace: true }))
  }

  return (
    <Marco
      escena={escena}
      eyebrow="VETA · Crear cuenta"
      titulo={<>Empezá por <em>la superficie.</em></>}
      lead="Una cuenta gratis muestra el titular y el tier de cada gema, y todos los análisis de monedas sin tesis. El plan se activa después."
      pie={<><span>¿Ya tenés cuenta? <Link to="/entrar">Entrar</Link></span></>}
    >
      <form className="auth__form" onSubmit={enviar} noValidate>
        <Campo id="nombre" label="Nombre">
          <input id="nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} onFocus={() => escena.atenta(valido)} autoComplete="name" required autoFocus />
        </Campo>
        <Campo id="email" label="Correo">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => escena.atenta(valido)} autoComplete="email" inputMode="email" required />
        </Campo>
        <Campo id="pass" label="Contraseña" ayuda={`Mínimo ${MIN_PASS} caracteres. Se guarda hasheada: nadie puede verla, ni nosotros.`}>
          <Clave id="pass" value={pass} onChange={setPass} onFocus={() => escena.atenta(valido)} autoComplete="new-password" />
        </Campo>
        <Campo id="pass2" label="Repetir contraseña">
          <Clave id="pass2" value={pass2} onChange={setPass2} onFocus={() => escena.atenta(valido)} autoComplete="new-password" />
        </Campo>
        <Error msg={msg} />
        <button type="submit" className="btn auth__btn" disabled={ocupado || escena.estado === 'exito'}>
          {escena.estado === 'exito' ? 'Abriendo…' : ocupado ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
    </Marco>
  )
}

/* ============================== RECUPERAR ============================== */
export function Recuperar() {
  const escena = useEscena()
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [hecho, setHecho] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const valido = EMAIL.test(email)
  useEffect(() => { if (escena.estado === 'atenta') escena.atenta(valido) }, [valido]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setMsg(null); escena.enviando()
    const r = await authClient.requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: '/restablecer' })
    setOcupado(false)
    if (r.error) { setMsg(mensajeAuth(r.error.code, r.error.message)); escena.error(); return }
    // No se dice si el correo existe: la respuesta es la misma.
    setHecho(true); escena.medio()
  }

  return (
    <Marco
      escena={escena}
      eyebrow="VETA · Recuperar contraseña"
      titulo={<>Una llave <em>nueva.</em></>}
      lead="Decinos tu correo. Si hay una cuenta, te llega un enlace de una hora y de un solo uso para elegir otra contraseña."
      pie={<><span><Link to="/entrar">Volver a entrar</Link></span></>}
    >
      {hecho ? (
        <div className="auth__hecho">
          <p className="auth__ok mono">Si hay una cuenta con ese correo, el enlace ya está en camino.</p>
          <p className="auth__ayuda">Vale una hora. Si no llega, revisá el correo no deseado o pedí otro.</p>
          <button type="button" className="btn btn--ghost auth__btn" onClick={() => { setHecho(false); escena.reposo() }}>Pedir otro</button>
        </div>
      ) : (
        <form className="auth__form" onSubmit={enviar} noValidate>
          <Campo id="email" label="Correo">
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onFocus={() => escena.atenta(valido)} autoComplete="email" inputMode="email" required autoFocus />
          </Campo>
          <Error msg={msg} />
          <button type="submit" className="btn auth__btn" disabled={ocupado}>{ocupado ? 'Enviando…' : 'Mandar el enlace'}</button>
        </form>
      )}
    </Marco>
  )
}

/* ============================= RESTABLECER ============================= */
export function Restablecer() {
  const escena = useEscena()
  const nav = useNavigate()
  const [q] = useSearchParams()
  const token = q.get('token') ?? ''
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [msg, setMsg] = useState<string | null>(q.get('error') ? 'El enlace ya no sirve: pedí uno nuevo.' : null)
  const [ocupado, setOcupado] = useState(false)
  const valido = pass.length >= MIN_PASS && pass === pass2 && !!token
  useEffect(() => { if (escena.estado === 'atenta') escena.atenta(valido) }, [valido]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (ocupado) return
    if (pass !== pass2) { setMsg('Las dos contraseñas no coinciden.'); escena.error(); return }
    setOcupado(true); setMsg(null); escena.enviando()
    const r = await authClient.resetPassword({ newPassword: pass, token })
    setOcupado(false)
    if (r.error) { setMsg(mensajeAuth(r.error.code, r.error.message)); escena.error(); return }
    escena.exito()
    escena.luego(1500, () => nav('/entrar?ok=restablecida', { replace: true }))
  }

  return (
    <Marco
      escena={escena}
      eyebrow="VETA · Nueva contraseña"
      titulo={<>Elegí la <em>llave.</em></>}
      lead={token ? 'Una contraseña nueva. Las sesiones abiertas se cierran.' : 'Este enlace no trae token. Pedí uno nuevo desde "Olvidé mi contraseña".'}
      pie={<><span><Link to="/recuperar">Pedir otro enlace</Link></span><span><Link to="/entrar">Entrar</Link></span></>}
    >
      <form className="auth__form" onSubmit={enviar} noValidate>
        <Campo id="pass" label="Contraseña nueva" ayuda={`Mínimo ${MIN_PASS} caracteres.`}>
          <Clave id="pass" value={pass} onChange={setPass} onFocus={() => escena.atenta(valido)} autoComplete="new-password" />
        </Campo>
        <Campo id="pass2" label="Repetir">
          <Clave id="pass2" value={pass2} onChange={setPass2} onFocus={() => escena.atenta(valido)} autoComplete="new-password" />
        </Campo>
        <Error msg={msg} />
        <button type="submit" className="btn auth__btn" disabled={ocupado || !token}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </Marco>
  )
}
