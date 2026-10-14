import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLuffy6b } from './api6b'
import { aciertosApi, NOMBRE_PLAZO, PLAZOS, type Aciertos, type Agregado, type Caja, type FilaAciertos, type Mantener, type Plazo } from './aciertosApi'
import { fmt, fmtFecha, fmtPrecio, fmtUsd, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* ============================================================================
   La tabla de aciertos del radar (CONTRATO-PANEL §8.9: `GET /radar/aciertos`).
   Una fila por modo: señales y, a 7, 14 y 30 días, cuántas le ganaron al universo
   que el radar no marcó (v2.7) y a BTC, y el retorno mediano; «hasta hoy» es
   provisional (ningún plazo cumplido) y se marca así. Al tocar un modo, sus señales
   una por una. Debajo, la caja contra mantener: cada compra, lo que hizo la caja y
   lo que habría dado quedarse con la moneda, sin stop y con stop por volatilidad.
   Es una medición, no un marcador: los números van sin verde ni rojo, con su signo
   y su tamaño de muestra. La forma y el adaptador viven en aciertosApi.ts.
   ========================================================================== */
// un decimal, como las frases de Mugiwara («retorno mediano −9,3 %»)
const ret = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')} %`)
const usdSigno = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtUsd(Math.abs(v))}`)
/** «18 oct»: los plazos caen dentro de los próximos 30 días, el año sobra. */
const dia = (f: string | null) => { const d = f ? new Date(`${f.slice(0, 10)}T12:00:00Z`) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '') : '—' }
/** cuántas de `n` le ganaron, desde el porcentaje que llega */
const cuantas = (pct: number | null, n: number) => (pct === null ? null : Math.round((pct / 100) * n))

/* ---------- radar y propuestas: por modo ---------- */
function Celda({ a, plazo, primera }: { a: Agregado | null; plazo: Plazo; primera: string | null }) {
  const prov = plazo === 'a_hoy'
  if (!a) return <div className="lf-ac__c is-vacia"><span className="mono">—</span></div>
  const estado = a.plazo ?? (a.n ? (a.pendientes ? 'parcial' : 'cumplido') : a.pendientes ? 'pendiente' : 'sin_datos')
  if (estado === 'sin_datos') return <div className="lf-ac__c is-pendiente" data-plazo={plazo}><b className="mono">sin datos</b><small>todavía sin precio para medir</small></div>
  if (estado === 'pendiente' || !a.n) return <div className="lf-ac__c is-pendiente" data-plazo={plazo}><b className="mono">sin cumplir</b><small>{a.pendientes} por cumplir</small>{primera && <small>el primero, el {dia(primera)}</small>}</div>
  const kb = cuantas(a.acierto_pct, a.n), ku = cuantas(a.acierto_vs_universo_pct, a.n)
  return (
    <div className={`lf-ac__c ${prov ? 'is-provisional' : ''}`} data-plazo={plazo}>
      <small className="lf-ac__cap mono">le ganan</small>
      {ku !== null && <span className="lf-ac__par" data-contra="universo" title={`el ${fmt(a.acierto_vs_universo_pct)} % le ganó a la mediana del universo${a.exceso_universo_mediano_pct !== null ? `; diferencia mediana ${ret(a.exceso_universo_mediano_pct)}` : ''}${a.universo_n_mediano ? ` (mediana de ${a.universo_n_mediano} monedas)` : ''}`}><span>al universo</span><b className="num">{ku} de {a.n}</b></span>}
      <span className="lf-ac__par" data-contra="btc" title={a.acierto_pct !== null ? `el ${fmt(a.acierto_pct)} % le ganó a BTC en el mismo plazo` : undefined}><span>a BTC</span><b className="num">{kb === null ? '—' : `${kb} de ${a.n}`}</b></span>
      <small>mediana <span className="num">{ret(a.ret_mediano_pct)}</span></small>
      {(prov || a.pendientes > 0) && <small className="lf-ac__prov" title={!prov && primera ? `la próxima se cumple el ${dia(primera)}` : undefined}>{prov ? 'provisional' : `${a.pendientes} por cumplir`}</small>}
    </div>
  )
}

function Detalle({ f }: { f: FilaAciertos }) {
  if (!f.items.length) return <p className="lf-ctrl__nota mono">{f.tipo === 'total' ? 'Las señales están en cada modo.' : 'Sin señales en la respuesta.'}</p>
  const xs = [...f.items].sort((a, b) => b.fecha.localeCompare(a.fecha))
  return (
    <div className="lf-ac__det" data-prueba="aciertos-senales">
      <div className="lf-ac__dcab mono" aria-hidden="true"><span>Fecha</span><span>Moneda</span><span>{f.tipo === 'luffy' ? 'Precio propuesto' : 'Precio de la señal'}</span>{PLAZOS.map((p) => <span key={p}>{p === 'a_hoy' ? 'Hasta hoy' : p.replace('d', ' d')}</span>)}</div>
      {xs.map((s) => (
        <div key={s.id} className="lf-ac__s" data-prueba="aciertos-senal">
          <span className="mono lf-ac__f">{fmtFecha(s.fecha)}</span>
          <Link className="lf-ac__m" to={`/luffy/terminal/${encodeURIComponent(s.activo)}`}>{s.activo}{s.estado ? <small> · {s.estado.replace(/_/g, ' ')}</small> : null}</Link>
          <span className="num lf-ac__p">{fmtPrecio(s.precio)}</span>
          {PLAZOS.map((p) => { const m = s.medida[p]; return (
            <span key={p} className={`lf-ac__r ${p === 'a_hoy' ? 'is-provisional' : ''}`} data-plazo={p}>
              <small className="lf-ac__rl mono">{p === 'a_hoy' ? 'hoy' : p.replace('d', ' d')}</small>
              {!m ? '—' : m.pendiente ? <em className="mono" title={`se cumple el ${fmtFecha(m.fecha)}`}>{dia(m.fecha)}</em> : m.sin_precio ? <em className="mono">sin precio</em> : <>
                <b className="num">{ret(m.ret_pct)}</b>
                <small className="num">BTC {ret(m.btc_pct)}</small>
                {m.universo_pct !== null && <small className="num" data-prueba="senal-universo" title={m.universo_n ? `mediana de ${m.universo_n} monedas que el radar no marcó` : undefined}>universo {ret(m.universo_pct)}</small>}
              </>}
            </span>
          ) })}
        </div>
      ))}
    </div>
  )
}

/* ---------- la caja contra mantener ---------- */
const valorMantener = (m: Mantener | null) => (!m ? '—' : m.sin_precio ? 'sin precio' : m.pendiente ? `el ${dia(m.fecha)}` : ret(m.ret_pct))

function CeldaCaja({ s, c, plazo }: { s: Mantener | null; c: Mantener | null; plazo: Plazo }) {
  const prov = plazo === 'a_hoy'
  // sin stop y con stop vencen el mismo día: si los dos esperan, se dice una vez
  if (s?.pendiente && (!c || c.pendiente)) return <div className="lf-ac__c is-pendiente" data-plazo={plazo}><b className="mono">sin cumplir</b><small>se cumple el {dia(s.fecha)}</small></div>
  return (
    <div className={`lf-ac__c ${prov ? 'is-provisional' : ''}`} data-plazo={plazo}>
      <span className="lf-ac__par"><span>sin stop</span><b className="num">{valorMantener(s)}</b></span>
      <span className="lf-ac__par"><span>con stop</span><b className="num">{valorMantener(c)}</b></span>
      {c?.salio_por_stop && <small className="lf-ac__prov" data-prueba="salio-por-stop">el stop saltó el {dia(c.salio_por_stop)}</small>}
      {prov && <small className="lf-ac__prov">provisional</small>}
    </div>
  )
}
function CeldaResumen({ s, c, plazo }: { s: number | null; c: number | null; plazo: Plazo }) {
  if (s === null && c === null) return <div className="lf-ac__c is-pendiente" data-plazo={plazo}><b className="mono">sin cumplir</b></div>
  return (
    <div className={`lf-ac__c ${plazo === 'a_hoy' ? 'is-provisional' : ''}`} data-plazo={plazo}>
      <span className="lf-ac__par"><span>sin stop</span><b className="num">{ret(s)}</b></span>
      <span className="lf-ac__par"><span>con stop</span><b className="num">{ret(c)}</b></span>
      {plazo === 'a_hoy' && <small className="lf-ac__prov">provisional</small>}
    </div>
  )
}

function CajaContraMantener({ c, motivo }: { c: Caja | null; motivo: string | null }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const ops = [...(c?.operaciones ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const simuladas = ops.filter((o) => o.simulado).length
  return (
    <section className="lf-ac__caja" data-prueba="aciertos-caja" aria-label="La caja contra mantener">
      <h2 className="lf-ac__h">La caja contra mantener</h2>
      <p className="lf-ctrl__nota">Cada compra de la caja contra quedarse con la moneda desde la misma entrada, sin stop y con un stop por volatilidad{c?.metodo_stop ? ` (${c.metodo_stop})` : ''}. «Hasta hoy» es provisional.</p>
      {motivo && <p className="lf-ctrl__nota mono">No se pudo medir la caja: {motivo}</p>}
      {c && !ops.length && !motivo && <p className="lf-ctrl__nota mono">La caja todavía no compró nada.</p>}
      {ops.length > 0 && (
        <div className="lf-ac__t lf-ac__t--caja" role="table" aria-label="La caja contra mantener">
          <div className="lf-ac__cab mono" role="row"><span role="columnheader">Operación</span><span role="columnheader">Lo que hizo la caja</span>{PLAZOS.map((p) => <span key={p} role="columnheader">{p === 'a_hoy' ? 'Mantener hasta hoy' : `Mantener ${NOMBRE_PLAZO[p]}`}{p === 'a_hoy' ? <small> provisional</small> : null}</span>)}</div>
          {c?.resumen && (
            <div className="lf-ac__fila is-total is-resumen" role="row" data-prueba="caja-resumen">
              <span className="lf-ac__n" role="cell"><b>Resumen</b><small className="mono">{c.resumen.operaciones ? `medias de ${c.resumen.operaciones} reales` : 'sin operaciones reales todavía'}{simuladas ? ` · sin las ${simuladas} simuladas` : ''}</small></span>
              <span className="lf-ac__cel" role="cell"><small className="lf-ac__rl mono">Lo que hizo la caja</small><div className="lf-ac__c"><b className="num">{ret(c.resumen.real_medio_pct)}</b><small>de media</small></div></span>
              {PLAZOS.map((p) => <span key={p} className="lf-ac__cel" role="cell"><small className="lf-ac__rl mono">{p === 'a_hoy' ? 'Hasta hoy' : NOMBRE_PLAZO[p]}</small><CeldaResumen s={c.resumen!.sin_stop[p]} c={c.resumen!.con_stop[p]} plazo={p} /></span>)}
            </div>
          )}
          {ops.map((o) => { const on = abierta === o.id; return (
            <Fragment key={o.id}>
              <button type="button" role="row" className={`lf-ac__fila ${o.simulado ? 'is-simulada' : ''} ${on ? 'is-abierta' : ''}`} aria-expanded={on} onClick={() => setAbierta(on ? null : o.id)} data-prueba="caja-operacion" data-simulada={o.simulado ? 'si' : 'no'}>
                <span className="lf-ac__n" role="cell"><b>{o.activo}{o.simulado && <em className="lf-ac__sim mono">simulada</em>}</b><small className="mono">{fmtFecha(o.fecha)}{o.usdt !== null ? ` · ${fmtUsd(o.usdt)}` : ''} · entrada {fmtPrecio(o.precio_entrada)}</small></span>
                <span className="lf-ac__cel" role="cell"><small className="lf-ac__rl mono">Lo que hizo la caja</small>{o.real.abierta
                  ? <div className="lf-ac__c is-pendiente"><b className="mono">abierta</b><small>todavía no vendió</small></div>
                  : <div className="lf-ac__c"><b className="num">{ret(o.real.ret_pct)}</b><small className="num">{usdSigno(o.real.pnl_usdt)}{o.real.dias !== null ? ` · ${fmt(o.real.dias)} ${o.real.dias === 1 ? 'día' : 'días'}` : ''}</small></div>}</span>
                {PLAZOS.map((p) => <span key={p} className="lf-ac__cel" role="cell"><small className="lf-ac__rl mono">{p === 'a_hoy' ? 'Hasta hoy' : NOMBRE_PLAZO[p]}</small><CeldaCaja s={o.sin_stop[p]} c={o.con_stop[p]} plazo={p} /></span>)}
              </button>
              {on && <div className="lf-ac__abierta" data-prueba="caja-detalle">
                {/* la tesis llega cortada a 300 caracteres */}
                {o.tesis && <p className="lf-ac__frase">{o.tesis.trim()}{o.tesis.length >= 300 ? '…' : ''}</p>}
                <ul className="lf-ac__datos">
                  <li>Entró a <span className="num">{fmtPrecio(o.precio_entrada)}</span> el {fmtFecha(o.fecha, true)}{o.usdt !== null ? `, con ${fmtUsd(o.usdt)}` : ''}.</li>
                  <li>{o.real.abierta ? 'Sigue abierta.' : <>Salió a <span className="num">{fmtPrecio(o.real.precio_salida)}</span> el {fmtFecha(o.real.fecha, true)}{o.real.ventas ? `, en ${o.real.ventas} venta${o.real.ventas === 1 ? '' : 's'}` : ''}.</>}</li>
                  <li>Stop de la caja <span className="num">{fmtPrecio(o.stop_caja)}</span>; stop por volatilidad <span className="num">{fmtPrecio(o.stop_volatilidad)}</span>{o.atr_pct !== null ? ` (ATR diario de 14 días: ${fmt(o.atr_pct)} %)` : ''}.</li>
                  {o.mision && <li>Misión {o.mision}{o.simulado ? ', simulada: no entra en el resumen' : ''}.</li>}
                </ul>
              </div>}
            </Fragment>
          ) })}
        </div>
      )}
    </section>
  )
}

export function TablaAciertos() {
  const [d, setD] = useState<Aciertos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    aciertosApi.traer(ctl.signal).then((x) => { setD(x); setError(null) }, (e) => { if (!(e instanceof DOMException)) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) })
    return () => ctl.abort()
  }, [])
  if (error && !d) return <EmptyState kind="error" title="No se pudo traer la tabla de aciertos." detail={error} />
  if (!d) return <div className="lf-lab__vacio"><span className="lf-gema is-latiendo" /></div>
  if (!d.filas.length && !d.caja) return <EmptyState kind="sin-datos" title="Todavía no hay señales que medir." detail={d.no_disponibles[0]?.motivo ?? 'El radar no emitió candidatas.'} />
  const motivo = (s: string) => d.no_disponibles.find((x) => x.seccion === s)?.motivo ?? null
  const otros = d.no_disponibles.filter((x) => x.seccion !== 'caja' && x.seccion !== 'universo')
  return (
    <div className="lf-ac" data-prueba="aciertos">
      <p className="lf-ctrl__nota">Cada señal se mide desde su precio contra {d.universo ? 'el universo y contra BTC' : 'BTC'} en el mismo plazo, con velas diarias. Un plazo cuenta cuando se cumple; «hasta hoy» es provisional.{d.calculado_en ? <span className="lf-ac__edad"> · calculado {hace(d.calculado_en)}</span> : null}</p>
      {d.universo?.que_es && <p className="lf-ctrl__nota" data-prueba="universo-que-es">El universo: {d.universo.que_es}{d.universo.monedas ? ` (${d.universo.monedas.toLocaleString('es-ES')} monedas con velas)` : ''}.</p>}
      {motivo('universo') && <p className="lf-ctrl__nota mono">Sin la comparación con el universo: {motivo('universo')}.</p>}
      {d.filas.length > 0 && (
        <div className="lf-ac__t" role="table" aria-label="Aciertos por modo">
          <div className="lf-ac__cab mono" role="row"><span role="columnheader">Modo</span><span role="columnheader">Señales</span>{PLAZOS.map((p) => <span key={p} role="columnheader">{NOMBRE_PLAZO[p]}{p === 'a_hoy' ? <small> provisional</small> : null}</span>)}</div>
          {d.filas.map((f) => { const on = abierta === f.clave; return (
            <Fragment key={f.clave}>
              <button type="button" role="row" className={`lf-ac__fila is-${f.tipo} ${on ? 'is-abierta' : ''}`} aria-expanded={on} onClick={() => setAbierta(on ? null : f.clave)} data-prueba="aciertos-fila" data-modo={f.clave}>
                <span className="lf-ac__n" role="cell"><b>{f.etiqueta}</b>{f.desde ? <small className="mono">desde el {fmtFecha(f.desde)}</small> : null}</span>
                <span className="lf-ac__k num" role="cell">{f.senales}<small className="mono">{f.tipo === 'luffy' ? ' propuestas' : ' señales'}</small></span>
                {PLAZOS.map((p) => <span key={p} role="cell" className="lf-ac__cel"><small className="lf-ac__rl mono">{NOMBRE_PLAZO[p]}</small><Celda a={f.plazos[p]} plazo={p} primera={f.primera[p]} /></span>)}
              </button>
              {on && <div className="lf-ac__abierta" data-prueba="aciertos-detalle">
                {f.texto && <p className="lf-ac__frase">{f.texto}</p>}
                <Detalle f={f} />
              </div>}
            </Fragment>
          ) })}
        </div>
      )}
      {otros.map((x) => <p key={x.seccion + x.motivo} className="lf-ctrl__nota mono">No se pudo medir {x.seccion.replace(/_/g, ' ')}: {x.motivo}</p>)}
      {(d.caja || motivo('caja')) && <CajaContraMantener c={d.caja} motivo={motivo('caja')} />}
      {d.fuente && <p className="lf-ctrl__nota mono lf-ac__fuente">Fuente: {d.fuente}.</p>}
    </div>
  )
}
