import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ErrorApi } from '../../lib/datos'
import { fechaHora, num, usd } from '../../lib/formato'
import { Loader } from '../../ui/Loader'
import { EmptyState } from '../../ui/EmptyState'
import { AdminCab } from './piezasAdmin'
import { PlanBadge, TierBadge } from '../piezas'
import type { Rol } from '../../lib/matriz'
import type { Cupo, Solicitud } from '../analizar/piezasAnalizar'

/* ============================================================================
   Admin · Consumo de "analiza tu moneda" (spec §5.7): gasto del mes contra
   el tope, por usuario y pedido a pedido. El tope se cambia acá y queda en
   el registro de acciones.
   ========================================================================== */

interface Mes { mes: string; real: number; en_curso: number; en_cola: number; comprometido: number; n: number; tope: number; estimado_por_analisis: number }
interface FilaUsuario { usuario_id: string; usuario_email: string; plan: string | null; profundos: number; deterministas: number; listos: number; sin_terminar: number; costo_real_usd: number; ultimo: string; cupo: Cupo | null }
interface Datos { mes: Mes; por_usuario: FilaUsuario[]; solicitudes: (Solicitud & { usuario_email: string | null; costo_real_usd: number })[]; cola: (Solicitud & { usuario_email: string | null })[]; visitantes_determinista: number; por_mes: { mes: string; n: number; costo: number }[]; motor: string; motor_url: string | null; costo_estimado: number }
const ESTADO: Record<string, string> = { en_cola: 'en cola', en_curso: 'en marcha', listo: 'listo', fallido: 'falló', bloqueado: 'bloqueado' }
const rolDePlan = (p: string | null): Rol => (p === 'pro' ? 'pro' : p === 'base' ? 'base' : 'visitante')

export function Consumo() {
  const [d, setD] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tope, setTope] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cargar = useCallback(async () => { try { const x = await api<Datos>('/api/admin/consumo'); setD(x); setTope((t) => t || String(x.mes.tope)); setError(null) } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const id = setInterval(cargar, 8000); return () => clearInterval(id) }, [cargar])
  if (!d) return <div className="shell p-cargando">{error ? <EmptyState kind="error" title="No se pudo cargar" detail={error} /> : <Loader size={72} label="Cargando" />}</div>
  const m = d.mes
  const pctTope = m.tope ? Math.min(1, m.comprometido / m.tope) : 0
  const retenidos = d.cola.filter((s) => !s.enviada).length
  const guardar = async () => { setGuardando(true); try { await api('/api/admin/consumo/tope', { metodo: 'PATCH', cuerpo: { tope: Number(tope) } }); await cargar() } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } finally { setGuardando(false) } }
  return (
    <>
      <AdminCab
        eyebrow="Admin · Consumo"
        titulo={<>Lo que <em>cuesta</em> analizar a pedido</>}
        lead="Cada análisis profundo gasta dinero real. El cupo por usuario lo acota; el tope mensual de la plataforma es la red: si se pasa, los pedidos se encolan y avisan."
        mesa="tres"
        tiles={[
          { k: `Gasto ${m.mes}`, v: usd(m.comprometido, 2), tono: pctTope > 0.9 ? 'rojo' : pctTope > 0.6 ? 'oro' : 'esm', sub: `${usd(m.real, 2)} cobrado · ${m.en_curso} en marcha a ${usd(m.estimado_por_analisis, 2)}` },
          { k: 'Tope mensual', v: usd(m.tope), tono: 'hueso', sub: `${Math.round(pctTope * 100)} % usado` },
          { k: 'Por lanzar', v: num(d.cola.length), tono: d.cola.length ? 'rojo' : 'mudo', sub: d.cola.length ? 'pedidos en cola esperan tu mano' : `${m.n} profundos este mes · ${m.en_curso} en marcha` },
          { k: 'Motor', v: d.motor === 'simulador' ? 'simulador' : 'real', tono: d.motor === 'simulador' ? 'mudo' : 'esm', sub: d.motor === 'simulador' ? 'sin gasto real todavía' : (d.motor_url ?? 'conectado') },
        ]}
      />
      <div className="shell a-vot">
        {error && <p className="a-dec__msg a-dec__msg--error">{error}</p>}
        <section className={`a-vot__activa a-cons__cola ${d.cola.length ? 'is-pendiente' : ''}`}>
          <div className="a-vot__cab">
            <div>
              <span className="a-sec__k mono">Cola pendiente de lanzar</span>
              <h2 className="display a-vot__h2">{d.cola.length ? `${d.cola.length} ${d.cola.length === 1 ? 'pedido espera' : 'pedidos esperan'} tu mano` : 'Nada en cola'}</h2>
              <p className="body-muted a-vot__lead">Nada se lanza solo: un análisis profundo gasta dinero en agentes. El usuario ya sabe que está en cola y que no hay tiempo garantizado. Cada pedido se lanza desde el motor con el comando de al lado; el progreso llega solo.</p>
            </div>
            {d.cola.length > 0 && <pre className="a-cons__cmd mono">.venv/bin/python gem-pipeline/pipeline/lanzar_pedidos.py --lanzar --todos</pre>}
          </div>
          {d.cola.length > 0 && (
            <ol className="a-vot__recuento">
              {d.cola.map((s, i) => (
                <li key={s.id} className="a-vot__fila a-cons__pedido">
                  <span className="mono a-cons__pos">{i + 1}</span>
                  <div className="a-vot__id"><b className="display">{s.simbolo}</b><span>{s.usuario_email ?? '—'}</span><span className="mono a-vot__sen">{s.enviada ? 'el motor lo tiene · espera lanzamiento' : 'retenido por el tope de gasto'} · desde {fechaHora(s.creada)}</span></div>
                  <pre className="a-cons__cmd a-cons__cmd--chico mono">--lanzar {s.id}</pre>
                  <span className="mono a-vot__n">{s.consume_cupo ? 'cupo reservado' : 'sin cupo'}</span>
                  <Link to={`/analizar/s/${s.id}`} className="mono a-vot__quien">ver</Link>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="a-vot__activa a-cons__tope">
          <div className="a-vot__cab">
            <div>
              <span className="a-sec__k mono">Tope mensual de la plataforma</span>
              <h2 className="display a-vot__h2">{usd(m.comprometido, 2)} de {usd(m.tope)}</h2>
              <div className="a-cons__barra" aria-hidden="true"><span style={{ width: `${pctTope * 100}%` }} className={pctTope > 0.9 ? 'is-rojo' : ''} /></div>
              <p className="body-muted a-vot__lead">Se cuenta lo cobrado más lo que está en marcha al costo estimado. Al pasarlo, cada pedido nuevo queda en cola con aviso al usuario y arranca cuando se libera.</p>
            </div>
            <div className="a-vot__form">
              <label className="a-vot__campo"><span className="mono">Tope (USD)</span><input value={tope} onChange={(e) => setTope(e.target.value)} inputMode="decimal" /></label>
              <button type="button" className="btn" onClick={guardar} disabled={guardando || Number(tope) === m.tope}>{guardando ? 'Guardando…' : 'Fijar tope'}</button>
            </div>
          </div>
          {retenidos > 0 && <p className="a-dec__msg a-dec__msg--error">{retenidos} {retenidos === 1 ? 'pedido retenido' : 'pedidos retenidos'} por el tope. Subilo para que pasen al motor.</p>}
        </section>

        <section className="a-vot__sec">
          <h2 className="display a-vot__h2">Por usuario</h2>
          <div className="a-vot__scroll">
            <table className="a-vot__tabla">
              <thead><tr><th className="mono">Usuario</th><th className="mono">Plan</th><th className="mono">Cupo</th><th className="mono">Profundos</th><th className="mono">Listos</th><th className="mono">Sin terminar</th><th className="mono">Gratis</th><th className="mono">Costo real</th><th className="mono">Último</th></tr></thead>
              <tbody>
                {d.por_usuario.map((u) => (
                  <tr key={u.usuario_id}>
                    <td className="mono"><Link to={`/admin/cuentas/${u.usuario_id}`}>{u.usuario_email}</Link></td>
                    <td><PlanBadge rol={rolDePlan(u.plan)} compacto /></td>
                    <td className="mono">{u.cupo ? (u.cupo.ilimitado ? 'sin cupo' : `${u.cupo.usados} de ${u.cupo.incluidos}`) : '—'}</td>
                    <td className="mono">{u.profundos}</td><td className="mono">{u.listos}</td><td className="mono">{u.sin_terminar}</td><td className="mono">{u.deterministas}</td>
                    <td className="mono">{usd(u.costo_real_usd, 2)}</td><td className="mono">{fechaHora(u.ultimo)}</td>
                  </tr>
                ))}
                {!d.por_usuario.length && <tr><td colSpan={9} className="mono">Nadie pidió nada todavía.</td></tr>}
              </tbody>
            </table>
            <p className="a-dec__regla mono">{d.visitantes_determinista} lecturas gratis de visitantes sin cuenta.</p>
          </div>
        </section>

        <section className="a-vot__sec">
          <h2 className="display a-vot__h2">Pedido a pedido</h2>
          <div className="a-vot__scroll">
            <table className="a-vot__tabla">
              <thead><tr><th className="mono">Cuándo</th><th className="mono">Usuario</th><th className="mono">Moneda</th><th className="mono">Estado</th><th className="mono">Etapa</th><th className="mono">Riesgo</th><th className="mono">Cupo</th><th className="mono">Costo</th><th className="mono">Motor</th></tr></thead>
              <tbody>
                {d.solicitudes.map((s) => (
                  <tr key={s.id} className={s.estado === 'bloqueado' || s.estado === 'fallido' ? 'is-rojo' : ''}>
                    <td className="mono">{fechaHora(s.creada)}</td><td className="mono">{s.usuario_email ?? '—'}</td>
                    <td className="mono"><Link to={`/analizar/s/${s.id}`}>{s.simbolo}</Link></td>
                    <td className="mono">{ESTADO[s.estado] ?? s.estado}</td><td className="mono">{s.etapa ?? '—'}</td>
                    <td>{s.tier ? <TierBadge tier={s.tier} size={16} /> : '—'}</td>
                    <td className="mono">{s.consume_cupo ? (s.estado === 'listo' ? 'consumió' : s.estado === 'fallido' || s.estado === 'bloqueado' ? 'devuelto' : 'reservado') : 'no'}</td>
                    <td className="mono">{usd(s.costo_real_usd, 2)}</td><td className="mono">{s.motor}</td>
                  </tr>
                ))}
                {!d.solicitudes.length && <tr><td colSpan={9} className="mono">Sin pedidos profundos.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  )
}
