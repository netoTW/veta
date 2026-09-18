import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PlanBadge, Dato } from '../piezas'
import { api, ErrorApi } from '../../lib/datos'
import { useSesion } from '../../lib/sesion'
import { fechaHora, num } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'
import { planARol, useImpersonar, type UsuarioAdmin } from './Cuentas'
import { AdminCab, PLAN_DESC, SegmentoPlan } from './piezasAdmin'

interface Detalle {
  usuario: UsuarioAdmin
  usos: { id: number; simbolo: string; fecha: string; tipo: string; consumio_cupo: number; costo_real_usd: number; resultado: string | null }[]
  alertas: { id: number; tipo: string; gema_id: string; fecha: string; leida: number }[]
  acciones: { admin_email: string; accion: string; detalle: string | null; fecha: string }[]
}

export function CuentaDetalle() {
  const { id = '' } = useParams()
  const { yo } = useSesion()
  const [d, setD] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [cupo, setCupo] = useState<number | ''>('')
  const impersonar = useImpersonar()
  const cargar = useCallback(() => api<Detalle>(`/api/admin/usuarios/${id}`).then((x) => { setD(x); setCupo(x.usuario.cupo?.analisis_incluidos ?? 0) }, (e: Error) => setError(e.message)), [id])
  useEffect(() => { void cargar() }, [cargar])

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null)
    try { await fn(); setMsg(ok); await cargar() } catch (e) { setMsg(e instanceof ErrorApi ? e.message : String(e)) }
  }

  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudo cargar la cuenta." detail={error} /></div>
  if (!d) return <div className="shell p-cargando"><Loader size={72} label="Cargando la cuenta" /></div>
  const u = d.usuario
  const soyYo = u.id === yo?.usuario?.id
  const esAdmin = u.rol === 'admin'

  return (
    <>
      <AdminCab
        compacta mesa="tres"
        eyebrow={<><Link to="/admin/cuentas">Cuentas</Link> · {u.nombre}</>}
        titulo={<><span className="a-cab__email">{u.email}</span></>}
        lead={<span className="a-rev__chips" style={{ marginTop: 0 }}><PlanBadge rol={planARol(u)} /><span className="mono a-fila__tipo">rol {u.rol}</span><span className={`p-estado mono ${u.estado === 'suspendido' ? 'p-estado--rota' : 'p-estado--intacta'}`}><span className="p-estado__dot" aria-hidden="true" />{u.estado}</span></span>}
        tiles={[
          { k: 'plan', v: esAdmin ? 'admin' : u.plan, tono: esAdmin ? 'hueso' : u.plan === 'pro' ? 'oro' : u.plan === 'base' ? 'esm' : 'mudo' },
          { k: 'cupo usado', v: u.cupo ? `${u.cupo.analisis_usados} / ${u.cupo.analisis_incluidos}` : '—', tono: 'hueso' },
          { k: 'costo real', v: `${num(u.consumo.costo_real_usd, 2)} USD`, tono: 'oro', sub: `${u.consumo.analisis} análisis` },
          { k: 'último acceso', v: u.ultimo_acceso ? fechaHora(u.ultimo_acceso).split('·')[0] : '—', tono: 'mudo' },
        ]}
        acciones={!esAdmin && !soyYo ? <button type="button" className="btn" onClick={() => impersonar(u.id)}><span className="a-ojo" aria-hidden="true" style={{ marginRight: 8 }} />Impersonar</button> : undefined}
      />
    <div className="shell">
      {msg && <p className="a-msg mono" role="status">{msg}</p>}

      <div className="a-cuenta">
        <section className="p-card">
          <span className="mono a-sec__k">Cuenta</span>
          <div className="p-datos">
            <Dato k="Alta" v={fechaHora(u.fecha_alta)} />
            <Dato k="Último acceso" v={u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : '—'} tono="mudo" />
            <Dato k="Suscripción" v={u.suscripcion ? `${u.suscripcion.plan} · ${u.suscripcion.estado}` : '—'} sub={u.suscripcion ? <>renueva {fechaHora(u.suscripcion.fecha_renovacion)} · proveedor {u.suscripcion.proveedor_pago ?? 'sin conectar'}</> : undefined} />
            <Dato k="Costo real acumulado" v={`${num(u.consumo.costo_real_usd, 2)} USD`} sub={<>{u.consumo.analisis} análisis · {u.consumo.con_cupo} con cupo</>} />
          </div>
          {u.motivo_suspension && <p className="p-nota" style={{ color: 'var(--rojo-luz)' }}>Suspendida: {u.motivo_suspension}</p>}
        </section>

        <section className="p-card">
          <span className="mono a-sec__k">Plan</span>
          <div className="a-acciones">
            <SegmentoPlan valor={u.plan} disabled={esAdmin} onChange={(pl) => accion(() => api(`/api/admin/usuarios/${u.id}/plan`, { metodo: 'PATCH', cuerpo: { plan: pl } }), `Plan ${pl} asignado.`)} />
          </div>
          <p className="p-nota">{PLAN_DESC[u.plan] ?? ''}{esAdmin ? ' · admin ve todo, el plan no aplica' : ''}</p>
          <div className="a-acciones" style={{ marginTop: 12 }}>
            {!soyYo && (u.rol === 'admin'
              ? <button type="button" className="btn btn--ghost" onClick={() => accion(() => api(`/api/admin/usuarios/${u.id}/rol`, { metodo: 'PATCH', cuerpo: { rol: 'usuario' } }), 'Ya no es admin.')}>Quitar admin</button>
              : <button type="button" className="btn btn--ghost" onClick={() => accion(() => api(`/api/admin/usuarios/${u.id}/rol`, { metodo: 'PATCH', cuerpo: { rol: 'admin' } }), 'Ahora es admin.')}>Hacer admin</button>)}
          </div>
        </section>

        <section className="p-card">
          <span className="mono a-sec__k">Cupo de análisis · {u.cupo?.periodo ?? 'sin periodo'}</span>
          <div className="p-datos">
            <Dato k="Usados" v={u.cupo ? `${u.cupo.analisis_usados} de ${u.cupo.analisis_incluidos}` : '—'} sub={u.cupo ? <>se reinicia {fechaHora(u.cupo.fecha_reinicio)}</> : undefined} />
            <Dato k="Solicitudes al scanner" v={u.cupo ? String(u.cupo.solicitudes_scanner_usadas) : '—'} tono="mudo" />
          </div>
          <div className="a-acciones">
            <label className="a-inline"><span className="mono">incluidos</span><input type="number" min={0} max={100} value={cupo} onChange={(e) => setCupo(e.target.value === '' ? '' : Number(e.target.value))} /></label>
            <button type="button" className="btn btn--ghost" disabled={cupo === ''} onClick={() => accion(() => api(`/api/admin/usuarios/${u.id}/cupo`, { metodo: 'PATCH', cuerpo: { analisis_incluidos: cupo } }), 'Cupo ajustado.')}>Ajustar cupo</button>
          </div>
        </section>

        <section className="p-card">
          <span className="mono a-sec__k">Estado</span>
          {!soyYo ? (
            u.estado === 'suspendido'
              ? <div className="a-acciones"><button type="button" className="btn btn--esmeralda" onClick={() => accion(() => api(`/api/admin/usuarios/${u.id}/estado`, { metodo: 'PATCH', cuerpo: { estado: 'activo' } }), 'Reactivada.')}>Reactivar</button></div>
              : <div className="a-acciones a-acciones--col">
                  <label className="a-dec__motivo"><span className="mono">Motivo</span><textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué se suspende (queda en el registro)." /></label>
                  <button type="button" className="btn btn--ghost a-dec__rechazar" onClick={() => accion(() => api(`/api/admin/usuarios/${u.id}/estado`, { metodo: 'PATCH', cuerpo: { estado: 'suspendido', motivo } }), 'Suspendida.')}>Suspender</button>
                </div>
          ) : <p className="p-nota">Es tu cuenta: no podés suspenderla ni quitarte el rol.</p>}
        </section>

        <section className="p-card a-cuenta--ancha">
          <span className="mono a-sec__k">Consumo · {d.usos.length} análisis</span>
          {d.usos.length === 0 ? <p className="p-nota">Sin análisis on-demand todavía (esa función llega en la próxima fase).</p> : (
            <div className="p-tabla-wrap"><table className="p-tabla">
              <thead><tr><th>Fecha</th><th>Moneda</th><th>Tipo</th><th>Cupo</th><th>Costo real</th><th>Resultado</th></tr></thead>
              <tbody>{d.usos.map((x) => <tr key={x.id}><td className="num">{fechaHora(x.fecha)}</td><td className="mono">{x.simbolo}</td><td className="mono">{x.tipo}</td><td>{x.consumio_cupo ? 'sí' : 'no'}</td><td className="num">{num(x.costo_real_usd, 2)} USD</td><td>{x.resultado ?? '—'}</td></tr>)}</tbody>
            </table></div>
          )}
        </section>

        <section className="p-card a-cuenta--ancha">
          <span className="mono a-sec__k">Acciones de admin sobre esta cuenta · {d.acciones.length}</span>
          {d.acciones.length === 0 ? <p className="p-nota">Ninguna.</p> : (
            <ul className="a-log">{d.acciones.map((a, i) => <li key={i}><span className="num">{fechaHora(a.fecha)}</span><span className="mono">{a.accion}</span><span>{a.admin_email}</span><span className="a-log__det">{a.detalle ?? ''}</span></li>)}</ul>
          )}
        </section>
      </div>
    </div>
    </>
  )
}
