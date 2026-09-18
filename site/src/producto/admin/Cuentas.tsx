import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlanBadge } from '../piezas'
import { api, invalidarDatos, ErrorApi } from '../../lib/datos'
import { useSesion } from '../../lib/sesion'
import { fechaHora, num } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'
import type { Rol } from '../../lib/matriz'
import { AdminCab, PLAN_DESC, SegmentoPlan } from './piezasAdmin'

/* ============================================================================
   Gestión de cuentas. Cambiar el plan de cualquier usuario es lo que
   permite probar cada vista sin crear cuentas nuevas; impersonar es verla
   con sus ojos. Las contraseñas no se ven ni se exportan: la recuperación
   es por correo.
   ========================================================================== */

export interface UsuarioAdmin {
  id: string; email: string; nombre: string; rol: string; plan: string; estado: string; motivo_suspension: string | null
  fecha_alta: string; ultimo_acceso: string | null
  suscripcion: { plan: string; estado: string; fecha_renovacion: string; proveedor_pago: string | null; id_externo: string | null } | null
  cupo: { periodo: string; analisis_incluidos: number; analisis_usados: number; solicitudes_scanner_usadas: number; fecha_reinicio: string } | null
  consumo: { analisis: number; costo_real_usd: number; con_cupo: number }
}

export const planARol = (u: { rol: string; plan: string }): Rol => (u.rol === 'admin' ? 'admin' : u.plan === 'pro' ? 'pro' : u.plan === 'base' ? 'base' : 'visitante')

export function useImpersonar() {
  const nav = useNavigate()
  const { recargar } = useSesion()
  return async (id: string) => {
    await api(`/api/admin/usuarios/${id}/impersonar`, { cuerpo: {} })
    invalidarDatos(); await recargar(); nav('/gemas')
  }
}

export function Cuentas() {
  const { yo } = useSesion()
  const [lista, setLista] = useState<UsuarioAdmin[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [crear, setCrear] = useState(false)
  const impersonar = useImpersonar()
  const cargar = useCallback(() => api<{ usuarios: UsuarioAdmin[] }>('/api/admin/usuarios').then((d) => setLista(d.usuarios), (e: Error) => setError(e.message)), [])
  useEffect(() => { void cargar() }, [cargar])

  const cambiarPlan = async (u: UsuarioAdmin, plan: string) => {
    try { await api(`/api/admin/usuarios/${u.id}/plan`, { metodo: 'PATCH', cuerpo: { plan } }); setMsg(`${u.email} → plan ${plan}`); await cargar() } catch (e) { setMsg(e instanceof ErrorApi ? e.message : String(e)) }
  }

  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudieron cargar las cuentas." detail={error} /></div>
  if (!lista) return <div className="shell p-cargando"><Loader size={72} label="Cargando cuentas" /></div>

  return (
    <>
      <AdminCab
        mesa="tres"
        eyebrow={<>Administración · Cuentas</>}
        titulo={<>Quién entra, <em>y con qué plan.</em></>}
        lead="El plan se asigna a mano mientras no hay proveedor de pago. Impersonar muestra la plataforma con los ojos de esa cuenta, sin cerrar la tuya."
        tiles={[
          { k: 'usuarios', v: lista.length, tono: 'hueso' },
          { k: 'pro', v: lista.filter((u) => u.rol !== 'admin' && u.plan === 'pro').length, tono: 'oro' },
          { k: 'base', v: lista.filter((u) => u.rol !== 'admin' && u.plan === 'base').length, tono: 'esm' },
          { k: 'gratis', v: lista.filter((u) => u.rol !== 'admin' && u.plan === 'gratis').length, tono: 'mudo' },
          { k: 'suspendidos', v: lista.filter((u) => u.estado === 'suspendido').length, tono: 'rojo' },
        ]}
        acciones={<><button type="button" className="btn" onClick={() => setCrear((v) => !v)}>{crear ? 'Cerrar' : 'Crear usuario'}</button><Link to="/admin/acciones" className="btn btn--ghost">Registro</Link></>}
      />
      <div className="shell">
        {crear && <CrearUsuario onCreado={async (email) => { setCrear(false); setMsg(`Creado ${email}. Le llegó el enlace para elegir contraseña (en local: server/correo-saliente/).`); await cargar() }} />}
        {msg && <p className="a-msg mono" role="status">{msg}</p>}
        <div className="p-tabla-wrap">
          <table className="p-tabla a-usuarios">
            <thead><tr><th>Cuenta</th><th>Plan</th><th>Estado</th><th>Alta · último acceso</th><th>Cupo · costo real</th><th></th></tr></thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className={u.estado === 'suspendido' ? 'is-ausente' : ''}>
                  <td><Link to={`/admin/cuentas/${u.id}`} className="a-usuarios__email">{u.email}</Link><div className="p-nota" style={{ fontSize: '0.74rem' }}>{u.nombre}</div></td>
                  <td>
                    <span className="a-plan-sel">
                      <PlanBadge rol={planARol(u)} compacto />
                      {u.rol !== 'admin' && <SegmentoPlan valor={u.plan} onChange={(pl) => cambiarPlan(u, pl)} />}
                    </span>
                  </td>
                  <td><span className={`p-estado mono ${u.estado === 'suspendido' ? 'p-estado--rota' : 'p-estado--intacta'}`}><span className="p-estado__dot" aria-hidden="true" />{u.estado}</span><div className="p-nota" style={{ fontSize: '0.66rem', marginTop: 4 }}>{u.rol}</div></td>
                  <td className="num"><span className="a-dos"><span>{fechaHora(u.fecha_alta)}</span><span className="a-dos__sub">{u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'sin acceso'}</span></span></td>
                  <td className="num"><span className="a-dos"><span>{u.cupo ? `${u.cupo.analisis_usados} de ${u.cupo.analisis_incluidos}` : '—'}</span><span className="a-dos__sub">{num(u.consumo.costo_real_usd, 2)} USD reales</span></span></td>
                  <td className="a-usuarios__acc">
                    <Link to={`/admin/cuentas/${u.id}`} className="mono">Ver</Link>
                    {u.rol !== 'admin' && u.id !== yo?.usuario?.id && <button type="button" className="mono a-link a-link--imp" onClick={() => impersonar(u.id)}><span className="a-ojo" aria-hidden="true" />Impersonar</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="p-nota" style={{ marginTop: 14 }}>Las contraseñas se guardan hasheadas y no son visibles para nadie. Para dar acceso a alguien nuevo, crealo: le llega un enlace para elegir la suya.</p>
      </div>
    </>
  )
}

function CrearUsuario({ onCreado }: { onCreado: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [plan, setPlan] = useState('base')
  const [rol, setRol] = useState('usuario')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setOcupado(true); setError(null)
    try { await api('/api/admin/usuarios', { cuerpo: { email, nombre, plan, rol } }); await onCreado(email) } catch (err) { setError(err instanceof ErrorApi ? err.message : String(err)) } finally { setOcupado(false) }
  }
  return (
    <form className="a-crear" onSubmit={enviar}>
      <label><span className="mono">Correo</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></label>
      <label><span className="mono">Nombre</span><input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <label><span className="mono">Plan</span><select className="a-select mono" value={plan} onChange={(e) => setPlan(e.target.value)}><option value="gratis">gratis</option><option value="base">base</option><option value="pro">pro</option></select></label>
      <label><span className="mono">Rol</span><select className="a-select mono" value={rol} onChange={(e) => setRol(e.target.value)}><option value="usuario">usuario</option><option value="admin">admin</option></select></label>
      <button type="submit" className="btn" disabled={ocupado}>{ocupado ? 'Creando…' : 'Crear e invitar'}</button>
      <span className="p-nota a-crear__nota">{PLAN_DESC[plan]}. Sin contraseña inicial: recibe un enlace de una hora para elegirla.</span>
      {error && <span className="auth__error" role="alert">{error}</span>}
    </form>
  )
}
