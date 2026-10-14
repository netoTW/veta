import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLuffy6b } from './api6b'
import { aciertosApi, NOMBRE_PLAZO, PLAZOS, type Aciertos, type Agregado, type FilaAciertos, type Plazo } from './aciertosApi'
import { fmt, fmtFecha, fmtPrecio, hace } from './formato'
import { EmptyState } from '../ui/EmptyState'

/* ============================================================================
   La tabla de aciertos del radar (CONTRATO-PANEL §8.9, v2.6: `GET /radar/aciertos`).
   Una fila por modo: señales, cuántas le ganaron a BTC y el retorno mediano a 7,
   14 y 30 días; «hasta hoy» es provisional (ningún plazo cumplido) y se marca así.
   Al tocar un modo, sus señales una por una. Es una medición, no un marcador: los
   números van sin verde ni rojo, con su signo y su tamaño de muestra.
   La forma y el adaptador viven en aciertosApi.ts.
   ========================================================================== */
/* ---------- la vista ---------- */
// un decimal, como las frases de Mugiwara («retorno mediano −9,3 %»)
const ret = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace('.', ',')} %`)
/** «18 oct»: los plazos caen dentro de los próximos 30 días, el año sobra. */
const dia = (f: string | null) => { const d = f ? new Date(`${f.slice(0, 10)}T12:00:00Z`) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace('.', '') : '—' }
const cuantas = (a: Agregado) => (a.acierto_pct === null ? null : Math.round((a.acierto_pct / 100) * a.n))

function Celda({ a, plazo, primera }: { a: Agregado | null; plazo: Plazo; primera: string | null }) {
  const prov = plazo === 'a_hoy'
  if (!a) return <div className="lf-ac__c is-vacia"><span className="mono">—</span></div>
  if (!a.n) return <div className="lf-ac__c is-pendiente" data-plazo={plazo}><b className="mono">sin cumplir</b><small>{a.pendientes} por cumplir</small>{primera && <small>el primero, el {dia(primera)}</small>}</div>
  const k = cuantas(a)
  return (
    <div className={`lf-ac__c ${prov ? 'is-provisional' : ''}`} data-plazo={plazo}>
      <b className="num">{k === null ? '—' : `${k} de ${a.n}`}</b>
      <small>le ganan a BTC{a.acierto_pct !== null ? ` · ${fmt(a.acierto_pct)} %` : ''}</small>
      <small>mediana <span className="num">{ret(a.ret_mediano_pct)}</span></small>
      {(prov || a.pendientes > 0) && <small className="lf-ac__prov">{prov ? 'provisional' : `${a.pendientes} por cumplir${primera ? ` · el próximo, el ${dia(primera)}` : ''}`}</small>}
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
              {!m ? '—' : m.pendiente ? <em className="mono" title={`se cumple el ${fmtFecha(m.fecha)}`}>{dia(m.fecha)}</em> : <><b className="num">{ret(m.ret_pct)}</b><small className="num">BTC {ret(m.btc_pct)}</small></>}
            </span>
          ) })}
        </div>
      ))}
    </div>
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
  if (!d.filas.length) return <EmptyState kind="sin-datos" title="Todavía no hay señales que medir." detail={d.no_disponibles[0]?.motivo ?? 'El radar no emitió candidatas.'} />
  return (
    <div className="lf-ac" data-prueba="aciertos">
      <p className="lf-ctrl__nota">Cada señal se mide desde su precio contra BTC en el mismo plazo, con velas diarias. Un plazo cuenta cuando se cumple; «hasta hoy» es provisional.{d.calculado_en ? <span className="lf-ac__edad"> · calculado {hace(d.calculado_en)}</span> : null}</p>
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
      {d.no_disponibles.map((x) => <p key={x.seccion + x.motivo} className="lf-ctrl__nota mono">No se pudo medir {x.seccion.replace(/_/g, ' ')}: {x.motivo}</p>)}
      {d.fuente && <p className="lf-ctrl__nota mono lf-ac__fuente">Fuente: {d.fuente}.</p>}
    </div>
  )
}
