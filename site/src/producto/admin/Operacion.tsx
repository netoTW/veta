import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ErrorApi } from '../../lib/datos'
import { fecha, fechaHora, num, usd } from '../../lib/formato'
import { Loader } from '../../ui/Loader'
import { EmptyState } from '../../ui/EmptyState'
import { AdminCab } from './piezasAdmin'
import { TierBadge } from '../piezas'
import type { Tier } from '../../lib/contrato'

/* ============================================================================
   Admin · Operación. El chequeo de dos minutos del servidor, en la web.

   Cada componente se juzga por lo último que PRODUJO, no por estar vivo:
   MUDO (corrió y no produjo nada) es peor que VIEJO, porque se disfraza de
   éxito. La cola no se ejecuta sola: lanzar es la única escritura y queda
   con nombre. Lo que /operacion no expone (una tanda como tal, sus tiempos y
   motivos de bloqueo) se muestra desde lo que el motor deja en disco y se
   declara como hueco.
   ========================================================================== */

type EstadoComp = 'ok' | 'MUDO' | 'VIEJO' | 'SIN DATOS' | 'HEREDADO' | 'no_aplica' | string
interface Comp { estado: EstadoComp; ultimo?: string; produjo?: string; plazo?: string; nota?: string; [k: string]: unknown }
interface Estado { cuando: string; maquina: string; instalado_en: string | null; nota_instalacion: string; componentes: Record<string, Comp>; consumo_apis_mes?: { mes: string; registros_contados: number; proveedores: Record<string, unknown>; es_un_piso: boolean; no_contado: string }; global: { ok: number; mudo: number; viejo: number; heredado: number; sin_datos: number; total: number; veredicto: string; requiere_atencion: string[] } }
interface Hit { detectado: string; moneda: string; fila_watchlist: string; capa: string; fuente: string; url: string; que_disparo: { motivo: string; evidencia: string; confianza: string }; extracto: string; escenario_vigilado: string; interpretado: boolean; decision: string; motivo_decision: string }
interface Hits { cuando: string; total: number; devueltos: number; pendientes_de_interpretar: number; por_moneda: Record<string, number>; nota: string; hits: Hit[] }
interface Pedido { id: string; moneda: string; nivel: string; origen: string; origen_crudo: string; entro: string; estado: string; etapa: string | null; avance: number | null; detalle: string; actualizado: string | null; costo_real_usd: number | null }
interface Cola { cuando: string; en_cola: Pedido[]; en_curso: Pedido[]; cerrados: Pedido[]; nota: string }
interface Alerta { severidad: 'alta' | 'media' | 'baja'; tipo: string; componente: string; texto: string; desde: string | null; hace_horas: number | null }
interface Alertas { cuando: string; n_alta: number; n_media: number; n_baja: number; hay_que_mirar: boolean; alertas: Alerta[] }
interface Corrida { simbolo: string; corrida: string; cuando: string; tier: string; hay_tesis: boolean; publicable: boolean; bloqueado: boolean; motivo_bloqueo: string; reloj_s: number | null; segundos_modelo: number | null; salida_tokens: number | null; campos_ausentes: number | null; campos_totales: number | null; nota: string }
interface Tanda { archivo: string; n: number; completadas: number; bloqueadas: number; con_tesis: number; tiempo_medio_s: number | null; desde: string | null; hasta: string | null; corridas: Corrida[] }
interface Resumen {
  conexion: { url: string; caido: boolean; status: number; token_local: boolean; tunel: string }
  estado: (Estado & { error?: string; texto?: string }) | null; hits: (Hits & { error?: string }) | null; cola: (Cola & { error?: string }) | null; alertas: (Alertas & { error?: string }) | null
  sync: { cuando: string | null; ok: boolean | null; duracion_s: number | null; salida: string; en_curso: boolean; proxima: string | null; configurado: boolean; cada_minutos: number; gemas: number; analisis: number }
  tanda: Tanda | null
}

const COMP_LABEL: Record<string, string> = { grabador: 'Grabador de liquidaciones', cron: 'Cron diario', vigia: 'Vigía', servicio: 'Servicio a pedido', snapshots: 'Snapshots de tenedores', respaldo: 'Respaldo fuera del servidor' }
const tonoEstado = (e: EstadoComp): 'esm' | 'rojo' | 'oro' | 'mudo' | 'hueso' => (e === 'ok' ? 'esm' : e === 'MUDO' ? 'rojo' : e === 'VIEJO' || e === 'SIN DATOS' ? 'oro' : e === 'HEREDADO' ? 'hueso' : 'mudo')
const labelEstado = (e: EstadoComp) => (e === 'ok' ? 'ok' : e === 'no_aplica' ? 'no aplica' : e)
const ETAPAS = ['recolectando', 'calculando', 'esceptico', 'redactando', 'verificando']
const mmss = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`)
const hace = (iso: string | null | undefined) => { if (!iso) return '—'; const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d` }

export function Operacion() {
  const [d, setD] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const cargar = useCallback(async () => { try { setD(await api<Resumen>('/api/admin/operacion/resumen')); setError(null) } catch (e) { setError(e instanceof ErrorApi ? e.message : String(e)) } }, [])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { const id = setInterval(cargar, 30000); return () => clearInterval(id) }, [cargar])
  if (!d) return <div className="shell p-cargando">{error ? <EmptyState kind="error" title="No se pudo cargar" detail={error} /> : <Loader size={72} label="Mirando el servidor" />}</div>
  const est = d.estado && !d.estado.error ? d.estado : null
  const g = est?.global
  const veredicto = d.conexion.caido ? 'sin conexión' : g?.veredicto ?? (d.estado?.error ?? 'sin respuesta')
  const tonoVer = d.conexion.caido || veredicto === 'mudo' ? 'rojo' : veredicto === 'degradado' ? 'oro' : veredicto === 'heredado' ? 'hueso' : veredicto === 'ok' ? 'esm' : 'mudo'
  const al = d.alertas && !d.alertas.error ? d.alertas : null
  const cola = d.cola && !d.cola.error ? d.cola : null
  const sincronizarAhora = async () => { setSincronizando(true); try { await api('/api/admin/operacion/sincronizar', { cuerpo: {} }); await cargar() } finally { setSincronizando(false) } }
  return (
    <>
      <AdminCab
        eyebrow={<>Admin · Operación · {est?.maquina ?? 'servidor'}</>}
        titulo={<>Qué produjo el <em>servidor</em> hoy</>}
        lead="Cada componente se juzga por lo último que produjo, no por estar vivo. Mudo es peor que viejo: corrió y no dejó nada. La cola no se ejecuta sola; lanzar es un acto con nombre."
        mesa="tres"
        tiles={[
          { k: 'Veredicto', v: veredicto, tono: tonoVer, sub: g ? `${g.ok} ok · ${g.mudo} mudo · ${g.viejo} viejo · ${g.sin_datos} sin datos · ${g.heredado} heredado` : d.conexion.caido ? 'el túnel no responde' : (d.estado?.texto ?? '') },
          { k: 'Alertas', v: al ? num(al.n_alta + al.n_media + al.n_baja) : '—', tono: al?.n_alta ? 'rojo' : al?.n_media ? 'oro' : 'mudo', sub: al ? `${al.n_alta} altas · ${al.n_media} medias · ${al.n_baja} bajas` : undefined },
          { k: 'Cola', v: cola ? num(cola.en_cola.length) : '—', tono: cola?.en_curso.length ? 'esm' : cola?.en_cola.length ? 'oro' : 'mudo', sub: cola ? `${cola.en_curso.length} en marcha · ${cola.cerrados.length} cerrados` : undefined },
          { k: 'Contenido', v: d.sync.cuando ? hace(d.sync.cuando) : 'sin sincronizar', tono: d.sync.ok === false ? 'rojo' : d.sync.ok ? 'esm' : 'mudo', sub: `${d.sync.gemas} gemas · ${d.sync.analisis} análisis en la bandeja` },
        ]}
      />
      <div className="shell a-vot a-op">
        {error && <p className="a-dec__msg a-dec__msg--error">{error}</p>}

        {/* ---------- conexión y sincronización ---------- */}
        <section className={`a-op__servidor ${d.conexion.caido ? 'is-caido' : ''}`}>
          <div className="a-op__srv">
            <span className="a-sec__k mono">Túnel al servidor</span>
            <b className={`a-op__estado mono is-${d.conexion.caido ? 'rojo' : 'esm'}`}><span className="a-op__gema" aria-hidden="true" />{d.conexion.caido ? 'caído' : 'abierto'}</b>
            <span className="mono a-op__mini">{d.conexion.url}{!d.conexion.token_local ? ' · SIN TOKEN LOCAL' : ''}</span>
            {d.conexion.caido && <pre className="a-cons__cmd mono">{d.conexion.tunel}</pre>}
          </div>
          <div className="a-op__srv">
            <span className="a-sec__k mono">Contenido sincronizado</span>
            <b className={`a-op__estado mono is-${d.sync.ok === false ? 'rojo' : d.sync.ok ? 'esm' : 'mudo'}`}><span className="a-op__gema" aria-hidden="true" />{d.sync.en_curso ? 'sincronizando…' : d.sync.cuando ? `${hace(d.sync.cuando)} · ${d.sync.duracion_s ?? '—'} s` : 'nunca'}</b>
            <span className="mono a-op__mini">{d.sync.configurado ? `cada ${d.sync.cada_minutos} min · base_contenido y reports del servidor → bandeja` : 'sin servidor configurado'}</span>
            {d.sync.ok === false && <pre className="a-cons__cmd a-cons__cmd--chico mono">{d.sync.salida}</pre>}
          </div>
          <div className="a-op__srv a-op__srv--acciones">
            <button type="button" className="btn btn--ghost" onClick={sincronizarAhora} disabled={sincronizando || d.sync.en_curso}>{sincronizando || d.sync.en_curso ? 'Sincronizando…' : 'Sincronizar ahora'}</button>
            <Link to="/admin/bandeja" className="btn">Ir a la bandeja</Link>
            {est && <span className="mono a-op__mini">instalado {fechaHora(est.instalado_en)} · chequeo {fechaHora(est.cuando)}</span>}
          </div>
        </section>

        {/* ---------- la tanda: progreso ---------- */}
        <Progreso cola={cola} tanda={d.tanda} onLanzado={cargar} />

        {/* ---------- componentes ---------- */}
        {est && (
          <section className="a-vot__sec">
            <h2 className="display a-vot__h2">Componentes</h2>
            <div className="a-op__comps">
              {Object.entries(est.componentes).map(([k, c]) => <Componente key={k} k={k} c={c} />)}
            </div>
            {est.consumo_apis_mes && (
              <p className="a-dec__regla mono">Consumo de APIs {est.consumo_apis_mes.mes}: {num(est.consumo_apis_mes.registros_contados)} registros{est.consumo_apis_mes.es_un_piso ? ' (es un piso)' : ''} · {est.consumo_apis_mes.no_contado}</p>
            )}
          </section>
        )}

        {/* ---------- alertas ---------- */}
        <section className="a-vot__sec">
          <h2 className="display a-vot__h2">Alertas{al ? <small className="a-op__small"> · {al.hay_que_mirar ? 'hay que mirar' : 'nada urgente'}</small> : null}</h2>
          {al ? (
            al.alertas.length ? <ul className="a-op__alertas">{[...al.alertas].sort((a, b) => peso(a.severidad) - peso(b.severidad)).map((a, i) => (
              <li key={i} className={`a-op__alerta is-${a.severidad}`}>
                <span className="a-op__sev mono">{a.severidad}</span>
                <div><b>{a.componente || a.tipo}</b><span className="mono a-op__tipo">{a.tipo}</span><p>{a.texto}</p></div>
                <span className="mono a-op__mini">{a.hace_horas !== null ? `hace ${a.hace_horas} h` : a.desde ? fechaHora(a.desde) : '—'}</span>
              </li>
            ))}</ul> : <p className="body-muted">Sin alertas.</p>
          ) : <p className="a-dec__msg a-dec__msg--error">{d.alertas?.error ?? 'sin respuesta'}</p>}
        </section>

        {/* ---------- hits del vigía ---------- */}
        <section className="a-vot__sec">
          <h2 className="display a-vot__h2">Hits del Vigía{d.hits && !d.hits.error ? <small className="a-op__small"> · {d.hits.total} en total · {d.hits.pendientes_de_interpretar} sin interpretar</small> : null}</h2>
          {d.hits && !d.hits.error ? (
            <>
              <p className="body-muted a-op__nota">{d.hits.nota}</p>
              {d.hits.hits.length ? (
                <div className="a-vot__scroll"><table className="a-vot__tabla a-op__hits">
                  <thead><tr><th className="mono">Detectado</th><th className="mono">Moneda</th><th className="mono">Fuente</th><th className="mono">Qué disparó</th><th className="mono">Extracto</th><th className="mono">Decisión</th></tr></thead>
                  <tbody>{d.hits.hits.map((h, i) => (
                    <tr key={i}>
                      <td className="mono">{fechaHora(h.detectado)}</td>
                      <td><b className="mono">{h.moneda}</b><span className="a-op__mini mono"> {h.fila_watchlist}</span></td>
                      <td><a href={h.url} target="_blank" rel="noreferrer" className="mono">{h.fuente}</a><span className="a-op__mini mono"> · {h.capa}</span></td>
                      <td><span className="mono">{h.que_disparo.motivo}: «{h.que_disparo.evidencia}»</span><span className={`a-op__conf mono is-${h.que_disparo.confianza}`}> {h.que_disparo.confianza}</span></td>
                      <td className="a-op__extracto" title={h.escenario_vigilado}>{h.extracto.trim().slice(0, 180)}{h.extracto.length > 180 ? '…' : ''}</td>
                      <td className="mono">{h.decision}{h.motivo_decision ? ` · ${h.motivo_decision}` : ''}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : <p className="body-muted">Sin hits. Cero hits es un día sano; cero ítems leídos no lo sería.</p>}
            </>
          ) : <p className="a-dec__msg a-dec__msg--error">{d.hits?.error ?? 'sin respuesta'}</p>}
        </section>
      </div>
    </>
  )
}
const peso = (s: string) => (s === 'alta' ? 0 : s === 'media' ? 1 : 2)

/* ---------- un componente ---------- */
function Componente({ k, c }: { k: string; c: Comp }) {
  const tono = tonoEstado(c.estado)
  const ex = c as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' ? num(v) : '—')
  const ultimoMsg = ex.ultimo_mensaje as { iso?: string; hace_horas?: number } | undefined
  return (
    <article className={`a-op__comp is-${tono}`}>
      <div className="a-op__comp-cab">
        <b>{COMP_LABEL[k] ?? k}</b>
        <span className={`a-op__estado mono is-${tono}`}><span className="a-op__gema" aria-hidden="true" />{labelEstado(c.estado)}</span>
      </div>
      <dl className="a-op__dl">
        <div><dt className="mono">último</dt><dd className="mono">{c.ultimo && c.ultimo !== 'None' ? c.ultimo : '—'}</dd></div>
        <div><dt className="mono">produjo</dt><dd>{c.produjo || '—'}</dd></div>
        {c.plazo && <div><dt className="mono">plazo</dt><dd className="mono">{c.plazo}</dd></div>}
      </dl>
      {k === 'grabador' && !!ex.por_exchange && (
        <ul className="a-op__lista mono">
          {Object.entries(ex.por_exchange as Record<string, { eventos_hoy: number; ultimo_mensaje: { hace_horas: number | null } }>).map(([v, x]) => <li key={v}>{v}: {num(x.eventos_hoy)} eventos hoy · último {x.ultimo_mensaje.hace_horas === null ? '—' : x.ultimo_mensaje.hace_horas < 0.1 ? 'ahora' : `hace ${x.ultimo_mensaje.hace_horas} h`}</li>)}
          <li>{n(ex.n_huecos_24h)} huecos en 24 h · {String(ex.politica_huecos ?? '')}</li>
        </ul>
      )}
      {k === 'cron' && <ul className="a-op__lista mono"><li>{n(ex.gemas_medidas)} gemas medidas · {n(ex.filas_evaluadas)} filas · {n(ex.gatillos_activados)} gatillos</li>{Array.isArray(ex.partes_con_error) && ex.partes_con_error.length > 0 && <li className="is-rojo">partes con error: {(ex.partes_con_error as string[]).join(', ')}</li>}</ul>}
      {k === 'vigia' && <ul className="a-op__lista mono"><li>{n(ex.fuentes_vivas)} de {n(ex.fuentes_totales)} fuentes vivas · {n(ex.items_leidos)} ítems · {n(ex.hits_total)} hits</li>{!!ex.cobertura_watchlist && <li>watchlist: {n((ex.cobertura_watchlist as Record<string, unknown>).vigilables)} vigilables de {n((ex.cobertura_watchlist as Record<string, unknown>).filas_activas)} activas</li>}</ul>}
      {k === 'servicio' && <ul className="a-op__lista mono"><li>{n(ex.en_cola)} en cola · {n(ex.en_curso)} en marcha · {n(ex.completados_hoy)} completados hoy</li></ul>}
      {k === 'snapshots' && ultimoMsg && <ul className="a-op__lista mono"><li>{n(ex.monedas_con_serie)} monedas con serie</li></ul>}
      {k === 'respaldo' && <ul className="a-op__lista mono"><li>{ex.verificado_en_destino ? 'verificado en destino' : 'sin verificar en destino'}</li></ul>}
      {c.nota && <p className="a-op__comp-nota">{c.nota}</p>}
    </article>
  )
}

/* ---------- la tanda: en marcha, en cola, última registrada ---------- */
function Progreso({ cola, tanda, onLanzado }: { cola: Cola | null; tanda: Tanda | null; onLanzado: () => Promise<void> }) {
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [respuesta, setRespuesta] = useState<{ id: string; status: number; texto: string; ok: boolean } | null>(null)
  const lanzar = async (id: string) => {
    setOcupado(true)
    try {
      const r = await api<{ status: number; ok?: boolean; texto?: string; nota?: string; error?: string }>('/api/admin/operacion/lanzar', { cuerpo: { id } })
      setRespuesta({ id, status: r.status, ok: !!r.ok, texto: r.ok ? `Lanzado. ${r.nota ?? ''}` : `${r.texto ?? r.error ?? 'sin respuesta'}${r.nota ? ` · ${r.nota}` : ''}` })
    } catch (e) { const err = e as ErrorApi; setRespuesta({ id, status: err.status ?? 0, ok: false, texto: `${(err.cuerpo?.texto as string) ?? err.message}${err.cuerpo?.nota ? ` · ${err.cuerpo.nota}` : ''}` }) }
    finally { setOcupado(false); setConfirmando(null); await onLanzado() }
  }
  const enCurso = cola?.en_curso ?? []
  const cerrados = cola?.cerrados ?? []
  const bloq = cerrados.filter((p) => p.estado === 'bloqueado').length, fall = cerrados.filter((p) => p.estado === 'fallido').length, listos = cerrados.filter((p) => p.estado === 'listo').length
  return (
    <section className={`a-vot__activa a-op__tanda ${enCurso.length ? 'is-viva' : ''}`}>
      <div className="a-vot__cab">
        <div>
          <span className="a-sec__k mono">Tanda · progreso</span>
          <h2 className="display a-vot__h2">{enCurso.length ? `${enCurso.length} en marcha ahora` : cola ? 'Nada corriendo ahora' : 'Sin conexión con la cola'}</h2>
          <p className="body-muted a-vot__lead">{cola?.nota ?? 'La cola del servidor no respondió.'}</p>
        </div>
        {cola && <ul className="a-op__kpis mono"><li><b>{enCurso.length}</b> en marcha</li><li><b>{cola.en_cola.length}</b> en cola</li><li><b className="is-esm">{listos}</b> listos</li><li><b className="is-rojo">{bloq}</b> bloqueados</li><li><b className="is-rojo">{fall}</b> fallidos</li></ul>}
      </div>

      {enCurso.length > 0 && (
        <ol className="a-vot__recuento">
          {enCurso.map((p) => (
            <li key={p.id} className="a-vot__fila a-op__curso">
              <div className="a-vot__id"><b className="display">{p.moneda}</b><span>{p.origen}</span><span className="mono a-vot__sen">{p.id} · entró {fechaHora(p.entro)}</span></div>
              <div className="a-op__etapas">
                {ETAPAS.map((e) => <span key={e} className={`a-op__etapa mono ${p.etapa === e ? 'is-actual' : ETAPAS.indexOf(e) < ETAPAS.indexOf(p.etapa ?? '') ? 'is-hecha' : ''}`}>{e}</span>)}
                {p.avance !== null && <span className="a-vot__barra a-op__barra"><span style={{ width: `${Math.round(p.avance * 100)}%` }} /></span>}
              </div>
              <span className="a-op__detalle">{p.detalle}</span>
              <span className="mono a-vot__quien">{hace(p.actualizado)}</span>
            </li>
          ))}
        </ol>
      )}

      {cola && cola.en_cola.length > 0 && (
        <div className="a-op__cola">
          <span className="a-sec__k mono">En cola · esperan lanzamiento</span>
          <ol className="a-vot__recuento">
            {cola.en_cola.map((p, i) => (
              <li key={p.id} className="a-vot__fila a-op__pedido">
                <span className="mono a-cons__pos">{i + 1}</span>
                <div className="a-vot__id"><b className="display">{p.moneda}</b><span>{p.origen} · {p.nivel}</span><span className="mono a-vot__sen">{p.id} · entró {fechaHora(p.entro)}</span></div>
                <span className="a-op__detalle">{p.detalle}</span>
                <div className="a-op__lanzar">
                  {confirmando === p.id ? (
                    <div className="a-vot__confirma a-op__confirma">
                      <p>Se lanza <b>{p.moneda}</b> en el servidor. Gasta dinero en agentes y queda con tu nombre en los dos lados.</p>
                      <div className="a-vot__botones"><button type="button" className="btn btn--ghost" onClick={() => setConfirmando(null)} disabled={ocupado}>No</button><button type="button" className="btn btn--esmeralda" onClick={() => lanzar(p.id)} disabled={ocupado}>{ocupado ? 'Lanzando…' : 'Sí, lanzar'}</button></div>
                    </div>
                  ) : <button type="button" className="btn btn--esmeralda" onClick={() => { setRespuesta(null); setConfirmando(p.id) }} disabled={ocupado}>Lanzar</button>}
                  {respuesta?.id === p.id && <p className={`a-dec__msg ${respuesta.ok ? 'a-dec__msg--ok' : 'a-dec__msg--error'}`}>{respuesta.status ? `${respuesta.status} · ` : ''}{respuesta.texto}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {cerrados.length > 0 && (
        <details className="a-vot__ranking"><summary className="mono">Cerrados en el registro del servidor ({cerrados.length})</summary>
          <div className="a-vot__scroll"><table className="a-vot__tabla"><thead><tr><th className="mono">Moneda</th><th className="mono">Estado</th><th className="mono">Origen</th><th className="mono">Entró</th><th className="mono">Actualizado</th><th className="mono">Costo</th></tr></thead>
            <tbody>{cerrados.map((p) => <tr key={p.id} className={p.estado !== 'listo' ? 'is-rojo' : ''}><td className="mono">{p.moneda}</td><td className="mono">{p.estado}</td><td>{p.origen}</td><td className="mono">{fechaHora(p.entro)}</td><td className="mono">{fechaHora(p.actualizado)}</td><td className="mono">{p.costo_real_usd === null ? '—' : usd(p.costo_real_usd, 2)}</td></tr>)}</tbody></table></div>
        </details>
      )}

      {tanda && (
        <div className="a-op__ultima">
          <div className="a-vot__cab">
            <div>
              <span className="a-sec__k mono">Última tanda registrada en el servidor · {fecha(tanda.desde)}</span>
              <h3 className="display a-op__h3">{tanda.n} corridas · {tanda.completadas} completas · {tanda.bloqueadas} bloqueadas · {mmss(tanda.tiempo_medio_s)} por moneda</h3>
              <p className="body-muted a-vot__lead">Sale de {tanda.archivo}: lo que el corredor de la tanda deja en disco. La ruta de operación no expone la tanda como tal (ni tiempos ni motivos): hueco 36.</p>
            </div>
          </div>
          <div className="a-vot__scroll"><table className="a-vot__tabla a-op__corridas">
            <thead><tr><th className="mono">Moneda</th><th className="mono">Cuándo</th><th className="mono">Riesgo</th><th className="mono">Tesis</th><th className="mono">Resultado</th><th className="mono">Tiempo</th><th className="mono">Campos</th><th className="mono">Nota</th></tr></thead>
            <tbody>{tanda.corridas.map((c) => (
              <tr key={c.corrida} className={c.bloqueado ? 'is-rojo' : ''}>
                <td><b className="mono">{c.simbolo}</b><span className="a-op__mini mono"> {c.corrida}</span></td>
                <td className="mono">{fechaHora(c.cuando)}</td>
                <td>{c.tier ? <TierBadge tier={c.tier as Tier} size={16} /> : '—'}</td>
                <td className="mono">{c.hay_tesis ? 'sí' : 'no'}</td>
                <td>{c.bloqueado ? <><span className="mono">bloqueada</span>{c.motivo_bloqueo ? <p className="a-op__motivo">{c.motivo_bloqueo}</p> : <p className="a-op__motivo a-op__mini">sin motivo registrado</p>}</> : <span className="mono">completa{c.publicable ? '' : ' · no publicable'}</span>}</td>
                <td className="mono">{mmss(c.reloj_s)}<span className="a-op__mini"> · {num(c.salida_tokens)} tokens</span></td>
                <td className="mono">{c.campos_ausentes !== null && c.campos_totales !== null ? `${c.campos_totales - c.campos_ausentes} de ${c.campos_totales}` : '—'}</td>
                <td className="a-op__nota-corrida">{c.nota}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </section>
  )
}
