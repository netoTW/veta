import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ErrorApi, invalidarDatos } from '../../lib/datos'
import { fecha, fechaHora, num, pct, usd } from '../../lib/formato'
import { Loader } from '../../ui/Loader'
import { EmptyState } from '../../ui/EmptyState'
import { AdminCab } from './piezasAdmin'
import { Piedra, Mecha, EstadoGanadora, firmaDe, senalLlana, materialDe, type Candidata, type Votacion as V, type Embudo } from '../votacion/piezasVoto'

/* ============================================================================
   Admin · Votación semanal.

   Se crea desde el ranking del scanner (nunca a mano), se mira el recuento
   en vivo, se cierra a mano y, si se decide, se lanza el análisis de la
   ganadora. Lanzar cuesta dinero real: pide confirmación y queda en el
   registro de acciones. La web no dispara nada sola.
   ========================================================================== */

interface VotoUsuario { simbolo: string; fecha: string; email: string }
type VAdmin = V & { votos_por_usuario: VotoUsuario[] }
interface Ranking { archivo: string | null; embudo: Embudo; candidatas: Omit<Candidata, 'votos'>[] }

const semanaISO = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dia = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dia)
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1))
  return `${x.getUTCFullYear()}-W${String(Math.ceil((((x.getTime() - y0.getTime()) / 86400000) + 1) / 7)).padStart(2, '0')}`
}
const proximoDomingo = () => {
  const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); d.setHours(21, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function VotacionAdmin() {
  const [votaciones, setVotaciones] = useState<VAdmin[] | null>(null)
  const [ranking, setRanking] = useState<Ranking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([api<{ votaciones: VAdmin[] }>('/api/admin/votacion'), api<Ranking>('/api/admin/votacion/ranking')])
      setVotaciones(a.votaciones); setRanking(r); setError(null)
    } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) }
  }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const id = setInterval(cargar, 10000); return () => clearInterval(id) }, [cargar])

  if (!votaciones || !ranking) return <div className="shell p-cargando">{error ? <EmptyState kind="error" title="No se pudo cargar" detail={error} /> : <Loader size={72} label="Cargando" />}</div>
  const activa = votaciones.find((v) => v.estado === 'abierta') ?? null
  const cerradas = votaciones.filter((v) => v.estado === 'cerrada')
  const pendientes = cerradas.filter((v) => v.cola_estado === 'pendiente').length
  const diasRanking = ranking.embudo.generado ? Math.floor((Date.now() - Date.parse(ranking.embudo.generado)) / 86400000) : null

  return (
    <>
      <AdminCab
        eyebrow="Admin · Votación semanal"
        titulo={<>La <em>mesa</em> de la semana</>}
        lead="La lista sale del ranking del scanner y sólo de ahí. Tú abres la votación, miras el recuento, la cierras y decides si se lanza el análisis. Lanzar cuesta dinero: nada se dispara solo."
        mesa="tres"
        tiles={[
          { k: 'Votación', v: activa ? 'abierta' : 'ninguna', tono: activa ? 'esm' : 'mudo', sub: activa ? `semana ${activa.semana.slice(-2)} · cierra ${fecha(activa.cierra)}` : 'abrí una desde el ranking' },
          { k: 'Votos', v: activa ? num(activa.total_votos) : '—', tono: 'oro', sub: activa ? `${activa.n_candidatas} candidatas` : undefined },
          { k: 'Por lanzar', v: num(pendientes), tono: pendientes ? 'rojo' : 'mudo', sub: pendientes ? 'ganadoras sin análisis pedido' : 'cola al día' },
          { k: 'Ranking', v: diasRanking === null ? 'sin corrida' : diasRanking === 0 ? 'hoy' : `${diasRanking} d`, tono: diasRanking === null || diasRanking > 7 ? 'rojo' : 'hueso', sub: ranking.archivo ?? 'no hay archivo del scanner' },
        ]}
      />
      <div className="shell a-vot">
        {error && <p className="a-dec__msg a-dec__msg--error">{error}</p>}
        {activa ? <ActivaAdmin v={activa} onCambio={cargar} /> : <Crear ranking={ranking} onCreada={cargar} />}
        {cerradas.length > 0 && (
          <section className="a-vot__sec">
            <h2 className="display a-vot__h2">Cerradas</h2>
            <ol className="a-vot__lista">{cerradas.map((v) => <CerradaAdmin key={v.id} v={v} onCambio={cargar} />)}</ol>
          </section>
        )}
        {activa && <details className="a-vot__ranking"><summary className="mono">Ranking del scanner ({ranking.candidatas.length}) · {ranking.archivo}</summary><TablaRanking ranking={ranking} /></details>}
      </div>
    </>
  )
}

/* ---------- la activa: recuento en vivo y cierre ---------- */
function ActivaAdmin({ v, onCambio }: { v: VAdmin; onCambio: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cands = [...(v.candidatas ?? [])].sort((a, b) => b.votos - a.votos || b.puntaje - a.puntaje)
  const max = Math.max(0, ...cands.map((c) => c.votos))
  const cerrar = async () => {
    setOcupado(true); setError(null)
    try { await api(`/api/admin/votacion/${v.id}/cerrar`, { cuerpo: {} }); invalidarDatos(); await onCambio() } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } finally { setOcupado(false); setConfirmando(false) }
  }
  return (
    <section className="a-vot__activa">
      <div className="a-vot__cab">
        <div>
          <span className="a-sec__k mono">Abierta · semana {v.semana.slice(-2)}</span>
          <h2 className="display a-vot__h2">Recuento en vivo</h2>
        </div>
        <Mecha abre={v.abre} cierra={v.cierra} estado={v.estado} compacta />
      </div>
      <ol className="a-vot__recuento">
        {cands.map((c, i) => (
          <li key={c.simbolo} className={`a-vot__fila ${i === 0 && c.votos > 0 ? 'is-lider' : ''}`}>
            <Piedra firma={firmaDe(c.disparadores)} size={56} lit={i === 0 && c.votos > 0} />
            <div className="a-vot__id"><b className="display">{c.simbolo}</b><span>{c.nombre}</span><span className="mono a-vot__sen">{c.disparadores.map((d) => senalLlana(d.disparador)).join(' · ')}</span></div>
            <div className="a-vot__barra"><span style={{ width: `${max ? (c.votos / max) * 100 : 0}%` }} /></div>
            <span className="mono a-vot__n"><b>{c.votos}</b> {c.votos === 1 ? 'voto' : 'votos'}</span>
            <span className="mono a-vot__quien">{v.votos_por_usuario.filter((u) => u.simbolo === c.simbolo).map((u) => u.email).join(', ') || '—'}</span>
          </li>
        ))}
      </ol>
      <div className="a-vot__acciones">
        {!confirmando ? (
          <button type="button" className="btn" onClick={() => setConfirmando(true)}>Cerrar votación</button>
        ) : (
          <div className="a-vot__confirma">
            <p>Se cierra ahora con <b>{num(v.total_votos)}</b> votos. Gana la más votada; si hay empate, desempata el puntaje del scanner. No se reabre.</p>
            <div className="a-vot__botones"><button type="button" className="btn btn--ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>Todavía no</button><button type="button" className="btn" onClick={cerrar} disabled={ocupado}>{ocupado ? 'Cerrando…' : 'Cerrar y contar'}</button></div>
          </div>
        )}
        {error && <p className="a-dec__msg a-dec__msg--error">{error}</p>}
        <p className="a-dec__regla mono">El cierre es manual aunque venza el plazo: la mecha sólo avisa.</p>
      </div>
    </section>
  )
}

/* ---------- una cerrada: ganadora, cola, lanzar ---------- */
function CerradaAdmin({ v, onCambio }: { v: VAdmin; onCambio: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState(false)
  const gan = v.candidatas?.find((c) => c.simbolo === v.ganadora)
  const lanzar = async () => {
    setOcupado(true); setError(null)
    try { await api(`/api/admin/votacion/${v.id}/lanzar`, { cuerpo: {} }); await onCambio() } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } finally { setOcupado(false); setConfirmando(false) }
  }
  return (
    <li className={`a-vot__cerrada ${v.cola_estado === 'pendiente' ? 'is-pendiente' : ''}`}>
      <div className="a-vot__cerrada-cab">
        <Piedra firma={gan ? firmaDe(gan.disparadores) : 'oro'} size={64} lit />
        <div className="a-vot__id">
          <span className="mono a-sec__k">Semana {v.semana.slice(-2)} · cerró {fechaHora(v.cerrada_en)}</span>
          <b className="display">{v.ganadora ?? '—'} <small>{v.ganadora_nombre}</small></b>
          <span className="mono a-vot__sen">{gan ? `${gan.votos} de ${v.total_votos} votos` : `${v.total_votos} votos`} · {v.n_candidatas} candidatas</span>
        </div>
        <div className="a-vot__cola">
          <EstadoGanadora v={v} />
          {v.cola_estado === 'pendiente' && !confirmando && <button type="button" className="btn btn--esmeralda" onClick={() => setConfirmando(true)}>Lanzar análisis de {v.ganadora}</button>}
          {confirmando && (
            <div className="a-vot__confirma">
              <p>Se pide al motor el análisis de <b>{v.ganadora}</b>. Cuesta dinero real y queda registrado con tu nombre. El resultado pasa por la bandeja antes de publicarse.</p>
              <div className="a-vot__botones"><button type="button" className="btn btn--ghost" onClick={() => setConfirmando(false)} disabled={ocupado}>Cancelar</button><button type="button" className="btn btn--esmeralda" onClick={lanzar} disabled={ocupado}>{ocupado ? 'Encolando…' : 'Sí, lanzar'}</button></div>
            </div>
          )}
          {error && <p className="a-dec__msg a-dec__msg--error">{error}</p>}
        </div>
      </div>
      <button type="button" className="a-vot__ver mono" onClick={() => setAbierta((x) => !x)} aria-expanded={abierta}>{abierta ? 'Ocultar el detalle' : 'Ver quién votó qué'}</button>
      {abierta && (
        <table className="a-vot__tabla">
          <thead><tr><th className="mono">Candidata</th><th className="mono">Votos</th><th className="mono">Quiénes</th></tr></thead>
          <tbody>
            {[...(v.candidatas ?? [])].sort((a, b) => b.votos - a.votos).map((c) => (
              <tr key={c.simbolo} className={c.simbolo === v.ganadora ? 'is-gan' : ''}><td className="mono">{c.simbolo}</td><td className="mono">{c.votos}</td><td className="mono">{v.votos_por_usuario.filter((u) => u.simbolo === c.simbolo).map((u) => `${u.email} (${fecha(u.fecha)})`).join(', ') || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}

/* ---------- crear desde el ranking ---------- */
function Crear({ ranking, onCreada }: { ranking: Ranking; onCreada: () => Promise<void> }) {
  const [sel, setSel] = useState<string[]>(() => ranking.candidatas.slice(0, 5).map((c) => c.simbolo))
  const [semana, setSemana] = useState(semanaISO())
  const [cierra, setCierra] = useState(proximoDomingo())
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toggle = (s: string) => setSel((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : xs.length >= 6 ? xs : [...xs, s]))
  const crear = async () => {
    setOcupado(true); setError(null)
    try { await api('/api/admin/votacion', { cuerpo: { semana, cierra: new Date(cierra).toISOString(), simbolos: sel } }); invalidarDatos(); await onCreada() } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } finally { setOcupado(false) }
  }
  if (!ranking.candidatas.length) return <EmptyState kind="sin-datos" title="No hay ranking del scanner" detail="La votación se arma sólo desde la corrida del scanner (base_contenido/scanner/candidatas-*.jsonl). Sin corrida no hay lista." />
  return (
    <section className="a-vot__crear">
      <div className="a-vot__cab">
        <div>
          <span className="a-sec__k mono">Abrir la votación de la semana</span>
          <h2 className="display a-vot__h2">Elige de 4 a 5 del ranking</h2>
          <p className="body-muted a-vot__lead">Corrida del {ranking.embudo.generado ? fechaHora(ranking.embudo.generado) : '—'}: {num(ranking.embudo.bajadas)} monedas → {num(ranking.embudo.con_disparador)} con señal. Las de arriba tienen más puntaje. No se aceptan propuestas fuera del ranking.</p>
        </div>
        <div className="a-vot__form">
          <label className="a-vot__campo"><span className="mono">Semana</span><input value={semana} onChange={(e) => setSemana(e.target.value)} pattern="\d{4}-W\d{2}" /></label>
          <label className="a-vot__campo"><span className="mono">Cierra</span><input type="datetime-local" value={cierra} onChange={(e) => setCierra(e.target.value)} /></label>
          <button type="button" className="btn" onClick={crear} disabled={ocupado || sel.length < 2}>{ocupado ? 'Abriendo…' : `Abrir con ${sel.length}`}</button>
        </div>
      </div>
      {error && <p className="a-dec__msg a-dec__msg--error">{error}</p>}
      <TablaRanking ranking={ranking} sel={sel} onToggle={toggle} />
    </section>
  )
}

function TablaRanking({ ranking, sel, onToggle }: { ranking: Ranking; sel?: string[]; onToggle?: (s: string) => void }) {
  return (
    <div className="a-vot__scroll">
      <table className="a-vot__tabla a-vot__tabla--ranking">
        <thead><tr>{onToggle && <th />}<th className="mono">#</th><th className="mono">Candidata</th><th className="mono">Carril</th><th className="mono">Puntaje</th><th className="mono">Señales</th><th className="mono">Vale</th><th className="mono">Ingresos / valor</th><th className="mono">Alertas</th></tr></thead>
        <tbody>
          {ranking.candidatas.map((c, i) => {
            const m = c.metricas as Record<string, number | undefined>
            const on = sel?.includes(c.simbolo)
            return (
              <tr key={c.simbolo} className={on ? 'is-sel' : ''} onClick={onToggle ? () => onToggle(c.simbolo) : undefined}>
                {onToggle && <td><input type="checkbox" checked={!!on} onChange={() => onToggle(c.simbolo)} aria-label={`Incluir ${c.simbolo}`} /></td>}
                <td className="mono">{i + 1}</td>
                <td><span className="a-vot__cand"><Piedra firma={firmaDe(c.disparadores)} size={28} /><b className="mono">{c.simbolo}</b><span>{c.nombre}</span></span></td>
                <td className="mono">{c.carril}</td>
                <td className="mono">{c.puntaje}</td>
                <td><span className="a-vot__senales">{c.disparadores.map((d) => <span key={d.disparador} className={`a-vot__senal is-${materialDe(d.disparador)}`} title={d.detalle}>{senalLlana(d.disparador)}</span>)}</span></td>
                <td className="mono">{usd(m.mcap_usd)}</td>
                <td className="mono">{m.revenue_anual_sobre_mcap === undefined || m.revenue_anual_sobre_mcap === null ? '—' : pct(m.revenue_anual_sobre_mcap * 100, 1)}</td>
                <td className="mono">{c.flags_riesgo.length ? <span className="a-vot__flag" title={c.flags_riesgo.join(' · ')}>{c.flags_riesgo.length}</span> : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="a-dec__regla mono">Fuente: {ranking.archivo}. <Link to="/admin/acciones">Registro de acciones</Link>.</p>
    </div>
  )
}
