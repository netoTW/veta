import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ErrorApi } from '../lib/datos'
import { LECTURA_LABEL, llano } from '../lib/lenguaje'
import { precio } from '../lib/formato'

/* ============================================================================
   La caja de ticker, incrustada en la portada.

   Es la mejor demostración que tenemos y hasta ahora estaba escondida detrás
   de un botón. Escribes un ticker y ves la lectura sin crear cuenta y sin
   gastar nada. Lo que se muestra aquí es un resumen; el detalle está en
   Analiza tu moneda.
   ========================================================================== */

interface Candidata { simbolo: string; nombre: string; cadena?: string | null; contrato?: string | null; con_informe?: boolean }
interface Resolucion { consulta: string; interpretada_como: string; normalizada?: string | null; candidatas: Candidata[] }
interface Bloque { lectura: string; texto: string }
interface Lectura {
  simbolo: string; nombre: string; cadena: string | null; precio_usd: number | null
  demanda: Bloque; riesgo_cola: Bloque; concentracion: Bloque; tokenomics: Bloque; liquidez: Bloque
}

type Estado =
  | { t: 'quieto' }
  | { t: 'buscando' }
  | { t: 'varias'; r: Resolucion }
  | { t: 'ninguna'; consulta: string }
  | { t: 'lectura'; l: Lectura }
  | { t: 'sin_datos'; simbolo: string; texto: string }
  | { t: 'error'; texto: string }

const CHIPS: { k: keyof Lectura; que: string }[] = [
  { k: 'demanda', que: 'Qué mueve el precio' },
  { k: 'riesgo_cola', que: 'Caídas' },
  { k: 'concentracion', que: 'Quién lo tiene' },
  { k: 'tokenomics', que: 'El token cobra' },
  { k: 'liquidez', que: 'Salida' },
]

export function Probar() {
  const [q, setQ] = useState('')
  const [e, setE] = useState<Estado>({ t: 'quieto' })
  const ref = useRef<HTMLInputElement>(null)

  const leer = async (c: Candidata) => {
    setE({ t: 'buscando' })
    try {
      const r = await api<{ lectura: Lectura | null; sin_datos: { texto: string } | null }>('/api/analizar/determinista',
        { cuerpo: { simbolo: c.simbolo, contrato: c.contrato ?? undefined, cadena: c.cadena ?? undefined } })
      if (r.lectura) setE({ t: 'lectura', l: r.lectura })
      else setE({ t: 'sin_datos', simbolo: c.simbolo, texto: llano(r.sin_datos?.texto ?? '') })
    } catch (err) {
      setE({ t: 'error', texto: err instanceof ErrorApi ? err.message : 'No pudimos leerla ahora mismo.' })
    }
  }

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault()
    const consulta = q.trim(); if (!consulta) return
    setE({ t: 'buscando' })
    try {
      const r = await api<Resolucion>('/api/analizar/resolver', { cuerpo: { consulta } })
      if (!r.candidatas.length) { setE({ t: 'ninguna', consulta }); return }
      if (r.candidatas.length === 1) { await leer(r.candidatas[0]); return }
      setE({ t: 'varias', r })
    } catch (err) {
      setE({ t: 'error', texto: err instanceof ErrorApi ? err.message : 'No pudimos buscarla ahora mismo.' })
    }
  }

  const otra = () => { setE({ t: 'quieto' }); setQ(''); ref.current?.focus() }

  return (
    <div className="probar">
      <form className="probar__form" onSubmit={enviar} role="search">
        <label className="vh" htmlFor="probar-q">Moneda</label>
        <input ref={ref} id="probar-q" className="probar__input mono" value={q} spellCheck={false} autoComplete="off"
          onChange={(ev) => { setQ(ev.target.value); if (e.t !== 'quieto') setE({ t: 'quieto' }) }}
          placeholder="ORCA, MORPHO, ONDO…" />
        <button type="submit" className="btn probar__btn" disabled={e.t === 'buscando' || !q.trim()}>
          {e.t === 'buscando' ? 'Leyendo…' : 'Leer gratis'}
        </button>
      </form>
      <p className="probar__pie mono">Sin cuenta y sin gastar nada. El ticker solo: RAY, no RAYUSDT.</p>

      {e.t === 'varias' && (
        <div className="probar__salida">
          <p className="probar__dice">Más de una moneda coincide. ¿Cuál es la tuya?</p>
          <ul className="probar__cands">
            {e.r.candidatas.slice(0, 6).map((c) => (
              <li key={`${c.simbolo}-${c.contrato ?? c.nombre}`}>
                <button type="button" className="probar__cand" onClick={() => leer(c)}>
                  <b className="mono">{c.simbolo}</b><span>{c.nombre}</span>{c.cadena && <i className="mono">{c.cadena}</i>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.t === 'ninguna' && (
        <div className="probar__salida">
          <p className="probar__dice">No encontramos <b className="mono">{e.consulta.toUpperCase()}</b> entre las monedas que cubrimos hoy.</p>
          <button type="button" className="btn btn--ghost" onClick={otra}>Probar con otra</button>
        </div>
      )}

      {e.t === 'sin_datos' && (
        <div className="probar__salida">
          <p className="probar__dice"><b className="mono">{e.simbolo}</b> está entre las que cubrimos, pero todavía no tiene lectura guardada.</p>
          <Link to={`/analizar?m=${e.simbolo}`} className="btn btn--ghost">Pedir que la analicemos</Link>
        </div>
      )}

      {e.t === 'error' && (
        <div className="probar__salida">
          <p className="probar__dice">{e.texto}</p>
          <button type="button" className="btn btn--ghost" onClick={otra}>Probar de nuevo</button>
        </div>
      )}

      {e.t === 'lectura' && (
        <div className="probar__salida probar__lect">
          <div className="probar__cab">
            <b className="display probar__sym">{e.l.simbolo}</b>
            <span className="probar__nom">{e.l.nombre}{e.l.cadena ? ` · ${e.l.cadena}` : ''}</span>
            {e.l.precio_usd != null && <span className="probar__precio mono">{precio(e.l.precio_usd)}</span>}
          </div>
          <ul className="probar__chips">
            {CHIPS.map(({ k, que }) => {
              const b = e.l[k] as Bloque | undefined
              const et = b && LECTURA_LABEL[b.lectura]
              if (!et || b.lectura === 'sin_dato') return null
              return (
                <li key={k} className={`probar__chip is-${et.tono}`}>
                  <span className="mono probar__chip-k">{que}</span>
                  <b>{et.t}</b>
                </li>
              )
            })}
          </ul>
          <div className="probar__acciones">
            <Link to={`/analizar?m=${e.l.simbolo}`} className="btn">Ver la lectura completa</Link>
            <button type="button" className="btn btn--ghost" onClick={otra}>Probar con otra</button>
          </div>
          <p className="probar__aviso mono">Esto es la lectura gratis. El informe con tesis, escenarios y riesgo está en los planes.</p>
        </div>
      )}
    </div>
  )
}
