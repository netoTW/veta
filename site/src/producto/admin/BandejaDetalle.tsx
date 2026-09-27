import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Cuerpo } from '../paginas/InformeDetalle'
import { Advertencias, ProveedorNivel, TierBadge, Volver, ordenar, Adv } from '../piezas'
import { api, invalidarDatos, ErrorApi } from '../../lib/datos'
import { fechaHora } from '../../lib/formato'
import { EmptyState } from '../../ui/EmptyState'
import { Loader } from '../../ui/Loader'
import type { Informe, Objecion, Reconsulta } from '../../lib/contrato'
import type { FilaBandeja } from './Bandeja'
import { EstadoPublicacion, SelloVerificador } from './piezasAdmin'
import { contradiccionesDelRegistro, motivoDesautorizacion } from '../../lib/contradicciones'
import { tesisCompuesta } from '../cifras'
import { TierIcon } from '../../ui/TierIcon'

/* ============================================================================
   Revisión de un informe: el informe completo tal como lo vería un
   suscriptor, las advertencias por severidad, las objeciones del Escéptico,
   el reporte del Verificador, el paquete del motor y el historial de
   decisiones. La barra de decisión queda fija a la derecha.

   Regla dura: un informe que el Verificador no dejó en "pasa" no se aprueba
   sin confirmar explícitamente que se vio el bloqueo; queda registrado quién
   y cuándo. Rechazar y pedir más exigen motivo.
   ========================================================================== */

interface Detalle {
  informe: Informe; fila: FilaBandeja
  historial: { id: number; accion: string; motivo: string | null; version_registro: number; verificador_estado: string | null; bloqueo_confirmado: number; admin_email: string; fecha: string }[]
  paquete: { disponible: boolean; informe_md: string | null; verificador: Record<string, unknown> | null; esceptico: Record<string, unknown> | null; paquete: Record<string, unknown> | null }
}
type Pestana = 'informe' | 'advertencias' | 'esceptico' | 'verificador' | 'paquete' | 'historial'
const PESTANAS: { k: Pestana; l: string }[] = [
  { k: 'informe', l: 'Informe' }, { k: 'advertencias', l: 'Advertencias' }, { k: 'esceptico', l: 'Escéptico' },
  { k: 'verificador', l: 'Verificador' }, { k: 'paquete', l: 'Paquete' }, { k: 'historial', l: 'Historial' },
]

export function BandejaDetalle() {
  const { id = '' } = useParams()
  const [d, setD] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pestana, setPestana] = useState<Pestana>('informe')
  const cargar = useCallback(() => api<Detalle>(`/api/admin/bandeja/${id}`).then(setD, (e: Error) => setError(e.message)), [id])
  useEffect(() => { void cargar() }, [cargar])

  if (error) return <div className="shell"><EmptyState kind="error" title="No se pudo cargar el informe." detail={error} /></div>
  if (!d) return <div className="shell p-cargando"><Loader size={72} label="Cargando el informe" /></div>
  const { informe: inf, fila } = d
  const esAnalisis = inf.tipo === 'analisis'
  // `corregido` (§20.2) no es un bloqueo: el informe se entregó con sus correcciones anotadas.
  const bloqueado = fila.verificador.estado === 'bloqueado'

  return (
    <div className="a-rev">
      <div className="shell">
        <Volver to="/admin/bandeja" label="Bandeja" />
        <header className="a-rev__cab">
          <TierIcon tier={inf.tier.toLowerCase() as 'bajo' | 'medio' | 'alto'} size={96} className="a-rev__piedra" />
          <div className="a-rev__quien">
            <span className="a-fila__sym display a-rev__sym">{inf.simbolo}</span>
            <span className="a-fila__nombre">{inf.nombre} · {inf.cadena}</span>
            <div className="a-rev__chips">
              <TierBadge tier={inf.tier} />
              <span className="mono a-fila__tipo">{inf.tipo} · v{inf.version_registro} · escrito {fechaHora(inf.escrito_en)}</span>
            </div>
          </div>
          <div className="a-rev__sellos">
            <SelloVerificador estado={fila.verificador.estado} hallazgos={fila.verificador.hallazgos} grande />
            <EstadoPublicacion p={fila.publicacion} />
          </div>
        </header>
      </div>

      <div className="shell a-rev__cuerpo">
        <div className="a-rev__principal">
          <div className="a-tabs" role="tablist">
            {PESTANAS.map((p) => {
              const n = p.k === 'advertencias' ? fila.advertencias.total : p.k === 'esceptico' ? fila.esceptico.objeciones : p.k === 'historial' ? d.historial.length : p.k === 'verificador' ? inf.verificador.reconsultas.length : null
              return (
                <button key={p.k} type="button" role="tab" aria-selected={pestana === p.k} className={`a-tab mono ${pestana === p.k ? 'is-on' : ''}`} onClick={() => setPestana(p.k)}>
                  {p.l}{n !== null && <span className="a-tab__n num">{n}</span>}
                </button>
              )
            })}
          </div>

          {pestana === 'informe' && (
            <div className="a-rev__informe">
              <ProsaVsMotor inf={inf} />
              <p className="p-nota">Tal como lo vería un suscriptor base o pro, con los dos niveles de lectura.</p>
              <ProveedorNivel><Cuerpo inf={inf} esAnalisis={esAnalisis} /></ProveedorNivel>
            </div>
          )}

          {pestana === 'advertencias' && (
            <section className="a-sec">
              <p className="p-nota">Todas, en ambos niveles. Primero las que comprometen la tesis.</p>
              <Advertencias completo items={inf.ficha_esencial.advertencias} titulo="Ficha esencial" detalle />
              {Object.entries(inf.niveles).map(([k, n]) => n.esencial.advertencias.length ? (
                <div key={k} className="a-sec__grupo">
                  <span className="mono a-sec__k">{k} · {n.esencial.advertencias.length}</span>
                  <ul className="p-seccion__advs">{ordenar(n.esencial.advertencias).map((a, i) => <Adv key={i} a={a} />)}</ul>
                </div>
              ) : null)}
            </section>
          )}

          {pestana === 'esceptico' && <Esceptico inf={inf} />}
          {pestana === 'verificador' && <Verificador inf={inf} bruto={d.paquete.verificador} />}
          {pestana === 'paquete' && <Paquete p={d.paquete} />}
          {pestana === 'historial' && (
            <section className="a-sec">
              {d.historial.length === 0 && <p className="p-nota">Sin decisiones todavía.</p>}
              {d.historial.length > 0 && (
                <div className="p-tabla-wrap"><table className="p-tabla">
                  <thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Versión</th><th>Verificador</th><th>Motivo</th></tr></thead>
                  <tbody>{d.historial.map((h) => (
                    <tr key={h.id}><td className="num">{fechaHora(h.fecha)}</td><td>{h.admin_email}</td><td className="mono">{h.accion}{h.bloqueo_confirmado ? ' · bloqueo confirmado' : ''}</td><td className="num">v{h.version_registro}</td><td className="mono">{h.verificador_estado ?? '—'}</td><td>{h.motivo ?? '—'}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </section>
          )}
        </div>

        <BarraDecision fila={fila} bloqueado={bloqueado} integridad={(inf as unknown as { integridad?: IntegridadAdmin | null }).integridad ?? null} onHecho={async () => { invalidarDatos(); await cargar(); setPestana('historial') }} />
      </div>
    </div>
  )
}

/* ---------- prosa del Redactor contra el motor: sólo acá se ve ---------- */
function ProsaVsMotor({ inf }: { inf: Informe }) {
  const cs = contradiccionesDelRegistro(inf)
  if (!cs.length) return <p className="a-msg mono" style={{ color: 'var(--esmeralda-luz)' }}>Prosa del Redactor coherente con el motor: se muestra tal cual al cliente.</p>
  const porCampo = [...new Set(cs.map((c) => c.campo))]
  const leer = (campo: string) => campo.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), inf)
  return (
    <section className="a-dec__ver is-bloqueado" style={{ marginBottom: 18 }} aria-label="Prosa desautorizada">
      <span className="mono">Prosa del Redactor desautorizada · {cs.length} {cs.length === 1 ? 'hallazgo' : 'hallazgos'} · el cliente ve la lectura compuesta desde el contrato</span>
      <strong style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.8rem' }}>{motivoDesautorizacion(cs)}</strong>
      {porCampo.map((campo) => (
        <div key={campo} className="a-sec__grupo">
          <span className="mono a-sec__k">{campo}</span>
          <p className="p-prosa-des__texto" style={{ padding: 0 }}>{String(leer(campo) ?? '')}</p>
          <ul className="a-log" style={{ marginTop: 6 }}>
            {cs.filter((c) => c.campo === campo).map((c, i) => <li key={i} style={{ gridTemplateColumns: '1fr 1fr' }}><span><b style={{ color: 'var(--hueso)', fontWeight: 500 }}>«{c.dice}»</b></span><span>{c.sobre === 'proceso' ? 'habla del proceso, no de la moneda' : `motor: ${c.motor}`}</span></li>)}
          </ul>
        </div>
      ))}
      <div className="a-sec__grupo"><span className="mono a-sec__k">lo que ve el cliente en su lugar</span><p className="a-obj__que">{tesisCompuesta(inf)}</p></div>
      <p className="a-dec__regla mono">Arreglo de fondo: el Redactor escribe sobre la moneda y no sobre el proceso; se regenera en la próxima corrida con agentes.</p>
    </section>
  )
}

/* ---------- decisión ---------- */
function BarraDecision({ fila, bloqueado, onHecho, integridad }: { fila: FilaBandeja; bloqueado: boolean; onHecho: () => Promise<void>; integridad?: IntegridadAdmin | null }) {
  const [motivo, setMotivo] = useState('')
  const [vioBloqueo, setVioBloqueo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const p = fila.publicacion
  const yaPublicado = p.estado === 'aprobado'

  const decidir = async (accion: 'aprobar' | 'rechazar' | 'pedir_mas' | 'despublicar') => {
    setOcupado(accion); setMsg(null)
    try {
      await api(`/api/admin/bandeja/${fila.id}/decision`, { cuerpo: { accion, motivo, bloqueo_confirmado: vioBloqueo } })
      setMsg({ tipo: 'ok', texto: accion === 'aprobar' ? 'Publicado. Visible según plan desde ahora (pro primero).' : accion === 'rechazar' ? 'Rechazado y registrado.' : accion === 'pedir_mas' ? 'Registrado: se pidió más.' : 'Despublicado.' })
      setMotivo(''); setVioBloqueo(false)
      await onHecho()
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof ErrorApi ? e.message : String(e) })
    } finally { setOcupado(null) }
  }
  const necesitaMotivo = motivo.trim().length < 5

  return (
    <aside className={`a-dec a-dec--${p.estado}`} aria-label="Decisión">
      <div className="a-dec__cab">
        <span className="mono a-dec__k">Decisión</span>
        <EstadoPublicacion p={p} conFecha={false} />
      </div>
      {p.ultima && <span className="a-dec__quien mono">{p.ultima.accion} · {p.ultima.admin_email} · {fechaHora(p.ultima.fecha)}</span>}
      {p.estado === 'nueva_version' && <p className="a-dec__aviso">Se aprobó la v{p.version_aprobada}; el motor escribió la v{fila.version_registro}. Hasta que la apruebes, la gema no se ve.</p>}

      {!!(integridad?.retiradas?.length || integridad?.sin_verificar?.length) && (
        <p className="a-dec__aviso">
          Antes de aprobar: el verificador corrigió {integridad?.retiradas?.length ?? 0} {integridad?.retiradas?.length === 1 ? 'cifra' : 'cifras'}
          {integridad?.sin_verificar?.length ? ` y hay ${integridad.sin_verificar.length} sin verificar` : ''}. El detalle está en la pestaña Verificador; el cliente sólo ve las sin verificar y la línea de no disponibles.
        </p>
      )}
      <div className={`a-dec__ver ${bloqueado ? 'is-bloqueado' : ''}`}>
        <span className="mono">Verificador</span>
        <strong>{fila.verificador.estado || 'pasa'}</strong>
        {bloqueado && fila.verificador.motivo_bloqueo && <p>{fila.verificador.motivo_bloqueo}</p>}
        {bloqueado && (
          <label className="a-dec__check">
            <input type="checkbox" checked={vioBloqueo} onChange={(e) => setVioBloqueo(e.target.checked)} />
            <span>Vi el bloqueo del Verificador y aun así quiero publicar. Queda registrado con mi nombre y la hora.</span>
          </label>
        )}
      </div>

      <label className="a-dec__motivo">
        <span className="mono">Motivo <em>(obligatorio para rechazar o pedir más)</em></span>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} placeholder="Qué falta, qué está mal, qué hay que volver a mirar." />
      </label>

      <div className="a-dec__botones">
        <button type="button" className="btn btn--esmeralda a-dec__aprobar" disabled={!!ocupado || yaPublicado || (bloqueado && !vioBloqueo)} onClick={() => decidir('aprobar')} title={bloqueado && !vioBloqueo ? 'Confirmá que viste el bloqueo' : undefined}>
          <span className="a-dec__gema a-dec__gema--esm" aria-hidden="true" />{ocupado === 'aprobar' ? 'Publicando…' : yaPublicado ? 'Ya publicado' : 'Aprobar y publicar'}
        </button>
        <button type="button" className="btn a-dec__pedir" disabled={!!ocupado || necesitaMotivo} onClick={() => decidir('pedir_mas')}><span className="a-dec__gema a-dec__gema--oro" aria-hidden="true" />{ocupado === 'pedir_mas' ? '…' : 'Pedir más'}</button>
        <button type="button" className="btn btn--ghost a-dec__rechazar" disabled={!!ocupado || necesitaMotivo} onClick={() => decidir('rechazar')}><span className="a-dec__gema a-dec__gema--rojo" aria-hidden="true" />{ocupado === 'rechazar' ? '…' : 'Rechazar'}</button>
        {yaPublicado && <button type="button" className="btn btn--ghost" disabled={!!ocupado} onClick={() => decidir('despublicar')}>Despublicar</button>}
      </div>
      {msg && <p className={`a-dec__msg a-dec__msg--${msg.tipo}`} role="status">{msg.texto}</p>}
      <p className="a-dec__regla mono">Nada se publica sin este clic. Un informe bloqueado no se aprueba sin confirmar el bloqueo.</p>
    </aside>
  )
}

/* ---------- escéptico ---------- */
function Esceptico({ inf }: { inf: Informe }) {
  const e = inf.esceptico
  return (
    <section className="a-sec">
      <div className="a-rev__chips" style={{ marginBottom: 4 }}>
        <span className={`p-chip mono ${e.comparables_son_comparables ? 'p-chip--esm' : 'p-chip--rojo'}`}>{e.comparables_son_comparables ? 'comparables: sí' : 'comparables: NO son comparables'}</span>
        <span className={`p-chip mono ${e.rechaza ? 'p-chip--rojo' : 'p-chip--mudo'}`}>{e.rechaza ? 'rechaza el informe' : 'no rechaza'}</span>
        <span className="p-chip p-chip--mudo mono">{e.objeciones.length} objeciones</span>
      </div>
      {e.motivo_rechazo && <p className="a-obj__que" style={{ color: 'var(--rojo-luz)' }}>{e.motivo_rechazo}</p>}
      <div className="a-obj"><span className="mono a-sec__k">Veredicto sobre el escenario bull</span><p className="a-obj__ev">{e.veredicto_bull || '—'}</p></div>
      {e.objeciones.map((o: Objecion, i: number) => (
        <article key={i} className="a-obj">
          <span className={`p-chip mono ${o.que_conclusion_cambia === 'tesis' ? 'p-chip--rojo' : o.que_conclusion_cambia === 'tier' ? 'p-chip--oro' : 'p-chip--mudo'}`}>cambia: {o.que_conclusion_cambia}</span>
          <p className="a-obj__que">{o.objecion}</p>
          <p className="a-obj__ev"><span className="mono">evidencia</span>{o.evidencia}</p>
          {o.cambio_propuesto && <p className="a-obj__ev"><span className="mono">cambio propuesto</span>{o.cambio_propuesto}</p>}
          <p className="a-obj__fuente mono">{o.fuente}</p>
        </article>
      ))}
    </section>
  )
}

/* ---------- verificador ---------- */
interface IntegridadAdmin {
  version?: number
  /** v1: la frase retirada (`que`, `cifra`); v2 (§20.3): la cifra (`cifra_id`) y el `veredicto`. */
  retiradas?: { que?: string; cifra_id?: string; veredicto?: string; seccion?: string; cifra?: string; motivo_interno?: string }[]
  /** v2: cifras del paquete reemplazadas por la de la fuente comprobada. */
  reconciliadas?: { cifra_id: string; valor_anterior?: number | string; valor_fuente?: number | string; fuente_url?: string }[]
  sin_verificar?: { que: string; fuente: string; seccion?: string; cifra?: string }[]
  no_disponibles?: { que: string; motivo_cliente?: string; cifra_id?: string }[]
}

function Verificador({ inf, bruto }: { inf: Informe; bruto: Record<string, unknown> | null }) {
  const v = inf.verificador
  const pasa = v.estado !== 'bloqueado'
  const ig = (inf as unknown as { integridad?: IntegridadAdmin | null }).integridad ?? null
  return (
    <section className="a-sec">
      {ig && (ig.retiradas?.length || ig.reconciliadas?.length || ig.sin_verificar?.length || ig.no_disponibles?.length) ? (
        <div className="a-sec__grupo" style={{ marginBottom: 16 }}>
          <span className="mono a-sec__k">integridad v{ig.version ?? 1} · retiradas {ig.retiradas?.length ?? 0}{ig.reconciliadas ? ` · reconciliadas ${ig.reconciliadas.length}` : ''} · sin verificar {ig.sin_verificar?.length ?? 0} · no disponibles {ig.no_disponibles?.length ?? 0}</span>
          <div className="p-tabla-wrap"><table className="p-tabla">
            <thead><tr><th>Tipo</th><th>Qué</th><th>Sección</th><th>Cifra</th><th>Motivo</th></tr></thead>
            <tbody>
              {(ig.retiradas ?? []).map((r, i) => <tr key={`r${i}`} className="is-ausente"><td className="mono">retirada{r.veredicto ? ` · ${r.veredicto}` : ''}</td><td>{r.que ?? <span className="mono">{r.cifra_id}</span>}</td><td className="mono">{r.seccion}</td><td>{r.cifra ?? ''}</td><td>{r.motivo_interno}</td></tr>)}
              {(ig.reconciliadas ?? []).map((r, i) => <tr key={`c${i}`}><td className="mono">reconciliada</td><td className="mono">{r.cifra_id}</td><td /><td>{String(r.valor_anterior ?? '')} → {String(r.valor_fuente ?? '')}</td><td>{r.fuente_url && /^https?:/.test(r.fuente_url) ? <a href={r.fuente_url} target="_blank" rel="noreferrer">{new URL(r.fuente_url).hostname}</a> : r.fuente_url}</td></tr>)}
              {(ig.sin_verificar ?? []).map((r, i) => <tr key={`s${i}`}><td className="mono">sin verificar</td><td>{r.que}</td><td className="mono">{r.seccion}</td><td>{r.cifra}</td><td>{r.fuente}</td></tr>)}
              {(ig.no_disponibles ?? []).map((r, i) => <tr key={`n${i}`}><td className="mono">no disponible</td><td>{r.que}{r.cifra_id ? <span className="mono"> · {r.cifra_id}</span> : null}</td><td /><td /><td>{r.motivo_cliente}</td></tr>)}
            </tbody>
          </table></div>
        </div>
      ) : null}
      <div className={`a-dec__ver ${pasa ? '' : 'is-bloqueado'}`} style={{ marginBottom: 16 }}>
        <span className="mono">Estado</span><strong>{v.estado}</strong>
        {v.motivo_bloqueo && <p>{v.motivo_bloqueo}</p>}
      </div>
      <div className="p-tabla-wrap"><table className="p-tabla">
        <thead><tr><th>Número</th><th>En el informe</th><th>En la fuente</th><th>Coincide</th><th>Fuente</th><th>Comentario</th></tr></thead>
        <tbody>{v.reconsultas.map((r: Reconsulta, i: number) => (
          <tr key={i} className={r.coincide === false ? 'is-ausente' : ''}>
            <td>{r.numero}</td><td className="num">{r.valor_informe}</td><td className="num">{r.valor_fuente}</td>
            <td className="mono">{r.coincide === null ? 'sin verificar' : r.coincide ? 'sí' : 'NO'}</td>
            <td>{/^https?:/.test(r.fuente_url) ? <a href={r.fuente_url} target="_blank" rel="noreferrer">{new URL(r.fuente_url).hostname}</a> : r.fuente_url}</td>
            <td>{r.comentario}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {v.hallazgos.length > 0 && (
        <div className="a-sec__grupo"><span className="mono a-sec__k">hallazgos · {v.hallazgos.length}</span><pre className="a-json">{JSON.stringify(v.hallazgos, null, 2)}</pre></div>
      )}
      {bruto && <details className="a-det"><summary className="mono">verificador.json completo</summary><pre className="a-json">{JSON.stringify(bruto, null, 2)}</pre></details>}
    </section>
  )
}

/* ---------- paquete ---------- */
function Paquete({ p }: { p: Detalle['paquete'] }) {
  if (!p.disponible) return <section className="a-sec"><EmptyState kind="sin-datos" title="El paquete de esta corrida no está en la carpeta de reports." detail="Se lee de VETA_REPORTS_DIR/<id>/ (paquete.json, informe.md, verificador.json, esceptico.json)." /></section>
  const claves = p.paquete ? Object.entries(p.paquete).map(([k, v]) => ({ k, bytes: JSON.stringify(v).length, v })) : []
  return (
    <section className="a-sec">
      {p.informe_md && (
        <details className="a-det" open>
          <summary className="mono">informe.md · {Math.round(p.informe_md.length / 1024)} KB</summary>
          <pre className="a-md">{p.informe_md}</pre>
        </details>
      )}
      {claves.length > 0 && (
        <div className="a-sec__grupo">
          <span className="mono a-sec__k">paquete.json · {claves.length} bloques · {Math.round(claves.reduce((s, c) => s + c.bytes, 0) / 1024)} KB</span>
          {claves.map((c) => (
            <details key={c.k} className="a-det">
              <summary className="mono">{c.k} · {c.bytes >= 1024 ? `${Math.round(c.bytes / 1024)} KB` : `${c.bytes} B`}</summary>
              <pre className="a-json">{JSON.stringify(c.v, null, 2)}</pre>
            </details>
          ))}
        </div>
      )}
      {p.esceptico && <details className="a-det"><summary className="mono">esceptico.json</summary><pre className="a-json">{JSON.stringify(p.esceptico, null, 2)}</pre></details>}
      <p className="p-nota"><Link to="/admin/bandeja">← volver a la bandeja</Link></p>
    </section>
  )
}
