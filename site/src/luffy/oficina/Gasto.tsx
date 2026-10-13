import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorLuffy6b } from '../api6b'
import { fmtFecha, fmtHora, fmtUsd } from '../formato'
import { Hoja } from './Hojas'
import { NOMBRE, type IdAgente } from './Escena'
import { gastoApi, umbralesDe, type Gasto, type Llamada, type Parte, type Periodo } from './gastoApi'

/* ============================================================================
   El gasto de los modelos, en la oficina: hoy, 7 días y el mes contra los umbrales
   (aviso, degradar, presupuesto) como barra; el reparto por origen y por agente; la
   serie diaria del mes, apilada por origen; y lo de las pruebas aparte, que no
   cuenta. Tocar un origen o un agente abre sus llamadas. El detalle (por tipo de
   turno, modelo, estilo, base de datos) sigue en Control → Gasto.
   ========================================================================== */
const PERIODOS: [Periodo, string][] = [['hoy', 'Hoy'], ['siete_dias', '7 días'], ['mes', 'Mes']]
const PALETA = ['#1FA46F', '#C9A24B', '#5FE0A6', '#EAD189', '#ECE6D8', '#8E918C', '#0F5A3C', '#8A6A2A', '#D9695F', '#5C605D']
const usd = (v: number | null | undefined) => (typeof v === 'number' ? fmtUsd(v, v >= 100 ? 0 : 2) : '—')
const ESTADO: Record<Gasto['umbrales']['estado'], string> = { normal: 'dentro de lo normal', aviso: 'pasó el aviso', degradado: 'degradado: modelos más baratos' }

export function GastoOficina() {
  const [g, setG] = useState<Gasto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('hoy')
  const [abierta, setAbierta] = useState<{ tipo: 'origen' | 'agente'; p: Parte } | null>(null)
  useEffect(() => {
    let v = true; const ctl = new AbortController()
    const traer = () => gastoApi.gasto(ctl.signal).then((x) => { if (v) { setG(x); setError(null) } }, (e) => { if (v && !(e instanceof DOMException)) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) })
    void traer()
    // la vitrina lo recalcula cada minuto
    const t = setInterval(traer, 60_000)
    return () => { v = false; ctl.abort(); clearInterval(t) }
  }, [])
  const colores = useMemo(() => { const m = new Map<string, string>(); [...(g?.mes.por_origen ?? []).map((x) => x.clave), ...Object.keys(g?.origenes ?? {})].forEach((k) => { if (!m.has(k)) m.set(k, PALETA[m.size % PALETA.length]) }); return m }, [g])

  if (error && !g) return <section className="lf-tarj lf-gof" data-prueba="gasto-oficina"><h3 className="mono">Gasto de los modelos</h3><p className="lf-ctrl__nota mono">{error}</p></section>
  if (!g) return <section className="lf-tarj lf-gof is-cargando" data-prueba="gasto-oficina"><h3 className="mono">Gasto de los modelos</h3></section>
  const t = g[periodo]
  return (
    <section className="lf-tarj lf-gof" data-prueba="gasto-oficina">
      <h3 className="mono">Gasto de los modelos<em><span className={`lf-gof__estado is-${g.umbrales.estado}`}>{ESTADO[g.umbrales.estado]}</span>{g.umbrales.restante_usd !== null ? ` · quedan ${usd(g.umbrales.restante_usd)} del mes` : ''}</em></h3>

      <div className="lf-gof__barras">{PERIODOS.map(([k, l]) => <Barra key={k} g={g} p={k} etiqueta={l} />)}</div>

      <div className="lf-gof__cab">
        <div className="lf-seg lf-seg--mini" role="group" aria-label="Período del reparto">{PERIODOS.map(([k, l]) => <button key={k} type="button" className={periodo === k ? 'is-on' : ''} aria-pressed={periodo === k} onClick={() => setPeriodo(k)}>{l}</button>)}</div>
        {t.pruebas_usd > 0 && <span className="lf-gof__pruebas mono">pruebas de las sesiones: {usd(t.pruebas_usd)} · aparte, no cuentan</span>}
      </div>
      <div className="lf-gof__reparto">
        <Reparto titulo="Por origen" partes={t.por_origen} total={t.uso_real_usd} colores={colores} abrir={(p) => setAbierta({ tipo: 'origen', p })} prueba="gasto-origenes" />
        <Reparto titulo="Por agente" partes={t.por_agente} total={t.uso_real_usd} abrir={(p) => setAbierta({ tipo: 'agente', p })} prueba="gasto-agentes" />
      </div>

      <Serie g={g} colores={colores} />
      <p className="lf-ctrl__nota mono lf-gof__pie">{g.nota ? `${g.nota} · ` : ''}<Link to="/luffy/control?ver=gasto">el detalle, en Control → Gasto</Link></p>
      {abierta && <HojaLlamadas periodo={periodo} desde={t.desde} origenes={g.origenes} tipo={abierta.tipo} parte={abierta.p} cerrar={() => setAbierta(null)} />}
    </section>
  )
}

/** Un tramo contra los umbrales: la barra llena hasta lo usado, con marcas en aviso, degradar y presupuesto. */
function Barra({ g, p, etiqueta }: { g: Gasto; p: Periodo; etiqueta: string }) {
  const usado = g[p].uso_real_usd ?? 0, u = umbralesDe(g, p)
  const tope = Math.max(usado, u.presupuesto ?? 0, u.degradar ?? 0) * 1.08 || 1
  const pos = (v: number | null) => (v === null ? null : `${Math.min(100, (v / tope) * 100)}%`)
  const estado = u.degradar !== null && usado >= u.degradar ? 'degradado' : u.aviso !== null && usado >= u.aviso ? 'aviso' : 'normal'
  return (
    <div className={`lf-gof__barra is-${estado}`} data-prueba={`gasto-barra-${p}`}>
      <div className="lf-gof__barra-cab"><span className="mono">{etiqueta.toUpperCase()}</span><b className="mono">{usd(usado)}</b>{u.presupuesto !== null && <em className="mono">{u.ritmo ? 'ritmo del presupuesto ' : 'de '}{usd(u.presupuesto)}</em>}</div>
      <div className="lf-gof__pista">
        <i className="lf-gof__lleno" style={{ width: pos(usado) ?? '0%' }} />
        {u.aviso !== null && <i className="lf-gof__marca is-aviso" style={{ left: pos(u.aviso)! }} title={`aviso: ${usd(u.aviso)}`} />}
        {u.degradar !== null && <i className="lf-gof__marca is-degradar" style={{ left: pos(u.degradar)! }} title={`degradar: ${usd(u.degradar)}`} />}
        {u.presupuesto !== null && <i className="lf-gof__marca is-presupuesto" style={{ left: pos(u.presupuesto)! }} title={`presupuesto: ${usd(u.presupuesto)}`} />}
      </div>
      <div className="lf-gof__leyenda mono">{u.aviso !== null && <span className="is-aviso">aviso {usd(u.aviso)}</span>}{u.degradar !== null && <span className="is-degradar">degradar {usd(u.degradar)}</span>}{u.presupuesto !== null && <span>presupuesto {usd(u.presupuesto)}</span>}</div>
    </div>
  )
}

function Reparto({ titulo, partes, total, colores, abrir, prueba }: { titulo: string; partes: Parte[]; total: number | null; colores?: Map<string, string>; abrir: (p: Parte) => void; prueba: string }) {
  const max = Math.max(0.0001, ...partes.map((x) => x.costo_usd))
  return (
    <div className="lf-gof__lista" data-prueba={prueba}>
      <h4 className="mono">{titulo}{total !== null ? <em> · {usd(total)}</em> : null}</h4>
      {partes.map((x) => (
        <button key={x.clave} type="button" className="lf-gof__fila" onClick={() => abrir(x)} data-clave={x.clave}>
          <span className="lf-gof__n"><i style={{ background: colores?.get(x.clave) ?? 'var(--esmeralda)' }} />{x.etiqueta}</span>
          <span className="lf-gof__b"><i style={{ width: `${(x.costo_usd / max) * 100}%`, background: colores?.get(x.clave) ?? 'var(--esmeralda)' }} /></span>
          <span className="lf-gof__v mono">{usd(x.costo_usd)}<em>{x.pct !== null ? ` · ${Math.round(x.pct)} %` : ''}{x.llamadas !== null ? ` · ${x.llamadas.toLocaleString('es-ES')} llamadas` : ''}{x.inferido_usd > 0 ? ' · parte inferida' : ''}</em></span>
        </button>
      ))}
      {!partes.length && <p className="lf-ctrl__nota mono">Nada en este período.</p>}
    </div>
  )
}

/** La serie diaria del mes, apilada por origen; las pruebas, en una franja tenue arriba (no cuentan). */
function Serie({ g, colores }: { g: Gasto; colores: Map<string, string> }) {
  const ahora = new Date(), mes = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`
  const dias = g.serie.filter((d) => d.dia.startsWith(mes))
  if (!dias.length) return null
  // la escala es el uso real: las pruebas no cuentan y no pueden aplastar lo demás (van marcadas abajo)
  const max = Math.max(0.0001, ...dias.map((d) => d.uso_real_usd))
  return (
    <div className="lf-gof__serie" data-prueba="gasto-serie">
      <h4 className="mono">Por día, en el mes<em> · hora de Chile</em></h4>
      <div className="lf-gof__dias">
        {dias.map((d) => {
          const partes = Object.entries(d.por_origen).filter(([k]) => k !== 'prueba' && k !== 'pruebas').sort((a, b) => b[1] - a[1])
          return (
            <div key={d.dia} className="lf-gof__dia" title={`${fmtFecha(d.dia)} · ${usd(d.uso_real_usd)}${d.pruebas_usd ? ` · pruebas ${usd(d.pruebas_usd)}` : ''}\n${partes.map(([k, v]) => `${g.origenes[k] ?? k}: ${usd(v)}`).join('\n')}`}>
              <div className="lf-gof__pila">
                {partes.map(([k, v]) => <i key={k} style={{ height: `${(v / max) * 100}%`, background: colores.get(k) ?? 'var(--ceniza-2)' }} />)}
              </div>
              <span className="mono">{Number(d.dia.slice(8))}</span>
              <b className={`lf-gof__prueba ${d.pruebas_usd > 0 ? 'is-on' : ''}`} aria-hidden="true" />
            </div>
          )
        })}
      </div>
      <div className="lf-gof__ley mono">{[...colores].filter(([k]) => k !== 'prueba' && k !== 'pruebas' && dias.some((d) => d.por_origen[k])).map(([k, c]) => <span key={k}><i style={{ background: c }} />{g.origenes[k] ?? k}</span>)}<span><i className="is-prueba" />ese día hubo pruebas (aparte, no cuentan)</span></div>
    </div>
  )
}

function HojaLlamadas({ periodo, desde, origenes, tipo, parte, cerrar }: { periodo: Periodo; desde: string | null; origenes: Record<string, string>; tipo: 'origen' | 'agente'; parte: Parte; cerrar: () => void }) {
  const [xs, setXs] = useState<Llamada[] | null>(null)
  const [mas, setMas] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const ctl = new AbortController()
    gastoApi.llamadas(periodo, { ...(tipo === 'origen' ? { origen: parte.clave } : { agente: parte.clave }), desde }, ctl.signal).then((r) => { setXs(r.items); setMas(r.mas) }, (e) => { if (!(e instanceof DOMException)) setError(e instanceof ErrorLuffy6b ? e.message : String(e)) })
    return () => ctl.abort()
  }, [periodo, desde, tipo, parte.clave])
  const nombre = PERIODOS.find(([k]) => k === periodo)?.[1].toLowerCase()
  return (
    <Hoja titulo={parte.etiqueta} sub={<>{tipo === 'origen' ? 'Origen' : 'Agente'} · {nombre} · {usd(parte.costo_usd)}{parte.llamadas !== null ? ` en ${parte.llamadas.toLocaleString('es-ES')} llamadas` : ''}</>} cerrar={cerrar} prueba="hoja-llamadas">
      {error && <p className="lf-hojaof__nota mono">{error}</p>}
      {!xs && !error && <p className="lf-hojaof__nota mono">Trayendo las llamadas…</p>}
      {xs && !xs.length && <p className="lf-hojaof__nota mono">Sin llamadas en este período.</p>}
      <ol className="lf-linea" data-prueba="llamadas">
        {xs?.map((l, i) => (
          <li key={i} className="lf-linea__r">
            <span className="lf-linea__h mono">{fmtHora(l.hora)}</span>
            <div className="lf-linea__c">
              <p>{tipo === 'origen' ? (NOMBRE[l.agente as IdAgente] ?? l.agente_etiqueta ?? l.agente.replace(/_/g, ' ')) : (origenes[l.origen] ?? l.origen.replace(/_/g, ' '))}{l.tipo_turno ? ` · ${l.tipo_turno.replace(/_/g, ' ')}` : ''}{' · '}<b className="mono">{fmtUsd(l.costo_usd, l.costo_usd < 0.01 ? 4 : 3)}</b>{l.inferido ? <em className="mono"> · origen inferido</em> : null}</p>
              <p className="lf-linea__m mono">{[l.modelo, l.tokens ? [l.tokens.entrada !== null ? `${l.tokens.entrada.toLocaleString('es-ES')} entrada` : null, l.tokens.cache !== null ? `${l.tokens.cache.toLocaleString('es-ES')} caché` : null, l.tokens.salida !== null ? `${l.tokens.salida.toLocaleString('es-ES')} salida` : null].filter(Boolean).join(' · ') : null].filter(Boolean).join(' · ')}{l.hilo_id && <> · <Link to={`/luffy/h/${l.hilo_id}`}>{l.hilo_titulo ? `«${l.hilo_titulo}»` : 'el hilo'}</Link></>}</p>
            </div>
          </li>
        ))}
      </ol>
      {mas && <p className="lf-hojaof__nota mono">Son las 60 más recientes del período.</p>}
    </Hoja>
  )
}
