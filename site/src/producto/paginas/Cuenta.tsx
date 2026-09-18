import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Cabecera } from '../Shell'
import { PlanBadge, Dato } from '../piezas'
import { authClient, mensajeAuth } from '../../lib/auth'
import { useSesion } from '../../lib/sesion'
import { api, invalidarDatos } from '../../lib/datos'
import { fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { rolDe } from '../../lib/matriz'
import { MarcadorPersonal } from '../marcador'

/* ============================================================================
   Mi cuenta: quién soy, qué plan tengo, mi cupo, cambiar contraseña, salir.
   "Ver planes" de las puertas de acceso cae acá (#plan): sin proveedor de
   pago todavía, el plan lo activa VETA a mano.
   ========================================================================== */

interface MiCuenta {
  suscripcion: { plan: string; estado: string; fecha_renovacion: string } | null
  cupo: { periodo: string; analisis_incluidos: number; analisis_usados: number; fecha_reinicio: string } | null
  sesiones: number
}

const PLANES = [
  { k: 'gratis', rol: 'visitante' as const, t: 'Gratis', d: ['Titular y tier de cada gema', 'Análisis de monedas sin tesis', 'Ledger resumido', 'Análisis determinista instantáneo'] },
  { k: 'base', rol: 'base' as const, t: 'Base', d: ['Todo el informe: tesis, dos varas, escenarios, riesgo', 'Los dos niveles de lectura', 'Seguimiento diario', 'Watchlist y radar', 'Ledger detallado', '1–2 análisis profundos al mes'] },
  { k: 'pro', rol: 'pro' as const, t: 'Pro', d: ['Todo lo del base', 'Acceso anticipado a gemas nuevas', 'Alertas de invalidación y gatillos', 'Exportación CSV/JSON', 'Solicitar monedas al scanner', 'Cupo mayor de análisis'] },
]

export function Cuenta() {
  const { yo, cargando, salir } = useSesion()
  const nav = useNavigate()
  const [mi, setMi] = useState<MiCuenta | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [actual, setActual] = useState(''); const [nueva, setNueva] = useState(''); const [nueva2, setNueva2] = useState('')
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => { if (yo?.usuario) api<MiCuenta>('/api/cuenta').then(setMi, () => setMi(null)) }, [yo])

  if (cargando) return null
  if (!yo?.usuario) {
    return (
      <>
        <Cabecera eyebrow="Cuenta" titulo={<>Todavía no entraste.</>} lead="Con una cuenta gratis ves el titular y el tier de cada gema y todos los análisis sin tesis." />
        <div className="shell"><EmptyState kind="vacio" title="Sin sesión." action={<><Link to="/entrar" className="btn">Entrar</Link> <Link to="/registro" className="btn btn--ghost">Crear cuenta</Link></>} /></div>
        <div className="shell" id="plan"><Planes actual="gratis" /></div>
      </>
    )
  }
  const u = yo.usuario
  const cambiar = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    if (nueva !== nueva2) { setMsg({ tipo: 'error', texto: 'Las dos contraseñas nuevas no coinciden.' }); return }
    setOcupado(true)
    const r = await authClient.changePassword({ currentPassword: actual, newPassword: nueva, revokeOtherSessions: true })
    setOcupado(false)
    if (r.error) { setMsg({ tipo: 'error', texto: mensajeAuth(r.error.code, r.error.message) }); return }
    setActual(''); setNueva(''); setNueva2(''); setMsg({ tipo: 'ok', texto: 'Contraseña cambiada. Las otras sesiones se cerraron.' })
  }

  return (
    <>
      <Cabecera eyebrow={<>Cuenta · {u.email}</>} titulo={<>Tu cuenta.</>} lead="Quién sos, qué plan tenés y cuánto cupo te queda. El plan lo activa VETA a mano por ahora." acciones={<button type="button" className="btn btn--ghost" onClick={async () => { await salir(); invalidarDatos(); nav('/entrar') }}>Salir</button>} />
      <div className="shell a-cuenta">
        <section className="p-card">
          <span className="mono a-sec__k">Identidad</span>
          <div className="p-datos">
            <Dato k="Correo" v={u.email} />
            <Dato k="Nombre" v={u.nombre} tono="mudo" />
            <Dato k="Alta" v={fechaHora(u.fecha_alta)} tono="mudo" />
            <Dato k="Último acceso" v={u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : '—'} tono="mudo" />
          </div>
        </section>
        <section className="p-card">
          <span className="mono a-sec__k">Plan y cupo</span>
          <div className="a-rev__chips" style={{ marginBottom: 12 }}><PlanBadge rol={rolDe({ role: u.rol, plan: u.plan })} />{mi?.suscripcion && <span className="mono a-fila__tipo">{mi.suscripcion.estado} · renueva {fechaHora(mi.suscripcion.fecha_renovacion)}</span>}</div>
          <div className="p-datos">
            <Dato k="Análisis profundos este mes" v={mi?.cupo ? `${mi.cupo.analisis_usados} de ${mi.cupo.analisis_incluidos}` : '—'} sub={mi?.cupo ? <>se reinicia {fechaHora(mi.cupo.fecha_reinicio)} · no se acumula</> : undefined} />
          </div>
          <p className="p-nota">Un análisis que falla o no se publica no consume cupo.</p>
        </section>
        <section className="p-card">
          <span className="mono a-sec__k">Contraseña</span>
          <form className="auth__form" onSubmit={cambiar}>
            <label className="auth__campo"><span className="mono">Actual</span><input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoComplete="current-password" required /></label>
            <label className="auth__campo"><span className="mono">Nueva (mínimo 10)</span><input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" minLength={10} required /></label>
            <label className="auth__campo"><span className="mono">Repetir</span><input type="password" value={nueva2} onChange={(e) => setNueva2(e.target.value)} autoComplete="new-password" minLength={10} required /></label>
            {msg && <p className={msg.tipo === 'ok' ? 'auth__ok mono' : 'auth__error'} role="status">{msg.texto}</p>}
            <button type="submit" className="btn btn--ghost" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Cambiar contraseña'}</button>
          </form>
          <p className="p-nota">Se guarda hasheada: nadie puede verla. Si la perdés, <Link to="/recuperar">se recupera por correo</Link>.</p>
        </section>
      </div>
      <div className="shell" style={{ marginTop: 20 }}><MarcadorPersonal /></div>
      <div className="shell" id="plan" style={{ marginTop: 28 }}><Planes actual={u.rol === 'admin' ? 'admin' : u.plan} /></div>
    </>
  )
}

function Planes({ actual }: { actual: string }) {
  return (
    <section className="a-planes" aria-label="Planes">
      <div className="p-seccion__head"><h2 className="p-seccion__titulo">Los tres planes</h2><span className="mono p-seccion__calidad">sin proveedor de pago todavía · se activa a mano</span></div>
      <div className="a-planes__grid">
        {PLANES.map((p) => (
          <article key={p.k} className={`p-card a-plan ${actual === p.k ? 'is-actual' : ''}`}>
            <PlanBadge rol={p.rol} />
            <h3 className="a-plan__t">{p.t}</h3>
            <ul className="a-plan__l">{p.d.map((x) => <li key={x}>{x}</li>)}</ul>
            {actual === p.k ? <span className="mono a-plan__actual">tu plan</span> : <a className="btn btn--ghost" href={`mailto:hola@veta.local?subject=Plan ${p.t}`}>Pedir el plan {p.t}</a>}
          </article>
        ))}
      </div>
      <p className="p-nota" style={{ marginTop: 12 }}>Los precios son suposiciones hasta que haya usuarios reales; el cobro llega con el proveedor de pago. Mientras tanto, escribinos y activamos el plan.</p>
    </section>
  )
}
