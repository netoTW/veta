import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import type { EstadoFuente, InstrumentosLuffy, Oficina as OficinaT } from '../tipos6b'
import { fmtHora, fmtUsd, hace } from '../formato'
import { NOMBRE, grupoDe, type GrupoFuente, type IdAgente, type Puerto } from './Escena'
import { CANAL_LLANO, MODO_LLANO, cubreDesde, franjas, fuenteLlana, lecturas, lineaDe, pasoDe, type Ev, type Linea, type Turno } from './historia'

/* ============================================================================
   Profundizar con un toque: la hoja que se abre al tocar un agente (su línea de
   tiempo de 24 h: qué hizo, con qué herramienta, cuánto costó y el enlace al hilo)
   o una fuente (su salud de las últimas horas). Al costado en el escritorio, desde
   abajo en el teléfono. Aquí se usa el vocabulario real: es el panel de Pablo.
   ========================================================================== */
export const SALUD_LLANO: Record<EstadoFuente, string> = { al_dia: 'al día', atrasada: 'atrasada', caida: 'caída', apagada: 'apagada', sin_datos: 'sin datos aún' }
const seg = (s?: number | null) => (typeof s === 'number' ? (s >= 90 ? `${Math.round(s / 60)} min` : `${s < 10 ? s.toFixed(1).replace('.', ',') : Math.round(s)} s`) : '')
const usd = (v?: number | null) => (typeof v === 'number' && v > 0 ? fmtUsd(v, v < 0.01 ? 4 : 3) : '')

export function Hoja({ titulo, sub, cerrar, children, prueba }: { titulo: ReactNode; sub?: ReactNode; cerrar: () => void; children: ReactNode; prueba: string }) {
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    caja.current?.focus()
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    document.addEventListener('keydown', k)
    return () => { document.removeEventListener('keydown', k); antes?.focus?.() }
  }, [cerrar])
  // en un portal: por encima de la barra de arriba del panel
  return createPortal(
    <>
      <button type="button" className="lf-velo lf-velo--hojaof" aria-label="Cerrar" onClick={cerrar} />
      <div ref={caja} className="lf-hojaof" role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined} tabIndex={-1} data-prueba={prueba}>
        <header className="lf-hojaof__cab"><div><h2>{titulo}</h2>{sub && <p className="mono">{sub}</p>}</div><button type="button" className="lf-lab__cerrar" onClick={cerrar} aria-label="Cerrar">×</button></header>
        <div className="lf-hojaof__cuerpo">{children}</div>
      </div>
    </>,
    document.body,
  )
}

const Cubre = () => { const d = cubreDesde(); return d ? <p className="lf-hojaof__nota mono">La historia que llegó alcanza desde las {fmtHora(d)}.</p> : null }

/* ---------- un agente ---------- */
/** Los instrumentos de un escritorio que Luffy usó por su cuenta, de más a menos usado. */
export const porInstrumento = (x: InstrumentosLuffy) => Object.entries(x.por_instrumento ?? {}).map(([k, v]) => [k.replace(/_/g, ' '), v] as const).sort((p, q) => q[1] - p[1])

export function HojaAgente({ a, rol, cifra, instrumentos, version, cargada, cerrar, repetir }: { a: IdAgente; rol: string; cifra: string; instrumentos?: InstrumentosLuffy | null; version: number; cargada: boolean; cerrar: () => void; repetir: (t: Turno) => void }) {
  const lineas = useMemo(() => lineaDe(a), [a, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const [abierto, setAbierto] = useState<string | null>(null)
  const total = lineas.reduce((s, l) => s + (l.costo ?? 0), 0)
  return (
    <Hoja titulo={NOMBRE[a]} sub={<>{rol}<br />{cifra}</>} cerrar={cerrar} prueba={`hoja-${a}`}>
      {a === 'jev' && <Barras lineas={lineas} />}
      {instrumentos && <div className="lf-instr" data-prueba="instrumentos-luffy">
        <h3 className="lf-hojaof__t mono">Instrumentos que Luffy usó por su cuenta · 24 h<em> · {instrumentos.n.toLocaleString('es-ES')} {instrumentos.n === 1 ? 'vez' : 'veces'} · sin costo</em></h3>
        {instrumentos.n ? <ul className="lf-instr__l">{porInstrumento(instrumentos).map(([k, v]) => <li key={k}><span>{k}</span><b className="mono">{v}</b></li>)}</ul>
          : <p className="lf-hojaof__nota mono">No los usó en las últimas 24 h.</p>}
        {instrumentos.ultimo && <p className="lf-hojaof__nota mono">La última vez, {hace(instrumentos.ultimo)}.</p>}
      </div>}
      <h3 className="lf-hojaof__t mono">{a === 'luffy' ? 'Turnos de las últimas 24 h' : a === 'jev' ? 'Por hora' : a === 'crawler' ? 'Lecturas y ciclos del radar' : 'Encargos de las últimas 24 h'}{total > 0 && <em> · {usd(total)}</em>}</h3>
      {!cargada && <p className="lf-hojaof__nota mono">Trayendo la historia…</p>}
      {cargada && !lineas.length && <p className="lf-hojaof__nota mono">Sin actividad en las últimas 24 h.</p>}
      <ol className="lf-linea" data-prueba="linea-agente">
        {lineas.slice(0, 120).map((l) => <Renglon key={l.clave} l={l} abierto={abierto === l.clave} alternar={() => setAbierto((x) => (x === l.clave ? null : l.clave))} repetir={repetir} />)}
      </ol>
      {lineas.length > 120 && <p className="lf-hojaof__nota mono">Y {lineas.length - 120} más.</p>}
      <Cubre />
    </Hoja>
  )
}

function Renglon({ l, abierto, alternar, repetir }: { l: Linea; abierto: boolean; alternar: () => void; repetir: (t: Turno) => void }) {
  const t = l.turno
  return (
    <li className={`lf-linea__r ${l.mal ? 'is-mal' : ''}`}>
      <span className="lf-linea__h mono">{fmtHora(l.hora)}</span>
      <div className="lf-linea__c">
        <p>{t ? <button type="button" className="lf-linea__abrir" onClick={alternar} aria-expanded={abierto}>{l.texto}</button> : l.texto}</p>
        <p className="lf-linea__m mono">
          {[t ? (t.tipo_turno ? t.tipo_turno.replace(/_/g, ' ') : '') : '', l.n && t ? `${l.n} herramienta${l.n === 1 ? '' : 's'}` : '', l.herramienta && !t ? l.herramienta : '', seg(l.duracion), usd(l.costo)].filter(Boolean).join(' · ')}
          {l.hilo && <> · <Link to={`/luffy/h/${l.hilo}`}>{t ? 'el hilo' : 'el turno'}</Link></>}
        </p>
        {t && <div className="lf-linea__acc">
          <button type="button" className="lf-chip lf-chip--oro" onClick={() => repetir(t)} disabled={!t.hasta} data-prueba="repetir-turno">Repetir en la sala</button>
        </div>}
        {t && abierto && <ol className="lf-linea__pasos">{t.pasos.map((p) => <li key={p.id}><span className="mono">{fmtHora(p.hora).slice(-5)}</span> {describirPaso(p)}</li>)}</ol>}
      </div>
    </li>
  )
}
export function describirPaso(p: Ev): string {
  switch (p.tipo) {
    case 'turno_abierto': return `abre el turno (${MODO_LLANO[p.modo] ?? p.modo}, por ${CANAL_LLANO[p.canal] ?? p.canal})`
    case 'turno_cerrado': return `cierra · ${p.herramientas} herramienta${p.herramientas === 1 ? '' : 's'} · ${seg(p.duracion_s)}${p.costo_usd ? ` · ${usd(p.costo_usd)}` : ''}`
    case 'herramienta': return `${p.quien === 'luffy' ? '' : `${NOMBRE[p.quien as IdAgente] ?? p.quien}: `}${pasoDe(p)} · ${p.nombre}${p.ok ? '' : ' (falló)'}`
    case 'agente_convocado': return `convoca al ${NOMBRE[p.agente as IdAgente] ?? p.agente}`
    case 'agente_terminado': return `el ${NOMBRE[p.agente as IdAgente] ?? p.agente} entrega · ${seg(p.duracion_s)}${p.costo_usd ? ` · ${usd(p.costo_usd)}` : ''}`
    case 'propuesta': return `propone ${p.accion} ${p.par}`
    case 'modelo': return `${p.quien === 'luffy' ? 'piensa' : `${NOMBRE[p.quien as IdAgente] ?? p.quien} piensa`}${p.iteracion ? ` (vuelta ${p.iteracion})` : ''}${p.modelo ? ` · ${p.modelo}` : ''}${p.costo_usd ? ` · ${usd(p.costo_usd)}` : ''}`
    default: return p.tipo
  }
}

function Barras({ lineas }: { lineas: Linea[] }) {
  const max = Math.max(1, ...lineas.map((l) => l.n ?? 0))
  const porHora = new Map(lineas.map((l) => [new Date(l.hora).getHours(), l]))
  const ahora = new Date().getHours()
  return (
    <div className="lf-barras" aria-label="Publicaciones clasificadas por hora">
      {Array.from({ length: 24 }, (_, i) => { const h = (ahora + 1 + i) % 24, l = porHora.get(h); return <i key={i} style={{ height: `${Math.max(2, ((l?.n ?? 0) / max) * 100)}%` }} title={l ? `${h}:00 · ${l.texto}` : `${h}:00 · nada`} className={l ? '' : 'is-vacia'} /> })}
    </div>
  )
}

/* ---------- una fuente (o el grupo de un objeto) ---------- */
const GRUPO_DE_PUERTO: Record<Puerto, GrupoFuente> = { social: 'antena', anuncios: 'parabolica', votaciones: 'parabolica', datos: 'servidor' }
const TITULO: Record<GrupoFuente, string> = { antena: 'Lo social', parabolica: 'Anuncios y votaciones', servidor: 'Exchanges y datos' }
export function HojaFuentes({ cual, estado, version, cargada, cerrar }: { cual: GrupoFuente | Puerto; estado: OficinaT | null; version: number; cargada: boolean; cerrar: () => void }) {
  const g: GrupoFuente = cual in GRUPO_DE_PUERTO ? GRUPO_DE_PUERTO[cual as Puerto] : (cual as GrupoFuente)
  const fs = (estado?.fuentes ?? []).filter((f) => grupoDe(f.nombre) === g)
  return (
    <Hoja titulo={TITULO[g]} sub="La salud de cada fuente en las últimas 24 h, en tramos de media hora." cerrar={cerrar} prueba="hoja-fuentes">
      {!cargada && <p className="lf-hojaof__nota mono">Trayendo la historia…</p>}
      {fs.map((f) => <FilaFuente key={f.nombre} f={f} version={version} />)}
      {!fs.length && <p className="lf-hojaof__nota mono">Sin fuentes en este grupo.</p>}
      <Cubre />
    </Hoja>
  )
}
function FilaFuente({ f, version }: { f: OficinaT['fuentes'][number]; version: number }) {
  // los listados y las votaciones llegan como lecturas de cada sitio (binance, upbit…): se juntan bajo su grupo
  const ls = useMemo(() => lecturas(f.nombre), [f.nombre, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const tramos = useMemo(() => franjas(ls), [ls])
  const mal = ls.filter((l) => !l.ok), ultimaMal = mal[mal.length - 1]
  return (
    <section className="lf-salud" data-prueba={`salud-${f.nombre}`}>
      <header><b><i className={`lf-salud__luz is-${f.estado}`} />{f.etiqueta ?? fuenteLlana(f.nombre)}</b><span className="mono">{SALUD_LLANO[f.estado]}{f.ultima_lectura ? ` · leída ${hace(f.ultima_lectura)}` : ''}</span></header>
      {f.detalle && <p className="lf-salud__d">{f.detalle}</p>}
      <div className="lf-salud__tramos" aria-label={`${ls.length} lecturas en 24 h`}>{tramos.map((t, i) => <i key={i} className={`is-${t}`} />)}</div>
      <p className="lf-salud__m mono">{ls.length ? `${ls.length} lectura${ls.length === 1 ? '' : 's'} en 24 h${mal.length ? ` · ${mal.length} con error` : ' · todas bien'}` : f.estado === 'apagada' ? 'apagada a propósito' : 'sin lecturas en la historia'}{ultimaMal ? ` · último error ${hace(ultimaMal.hora)}: ${ultimaMal.detalle || 'no respondió'}` : ''}</p>
    </section>
  )
}
