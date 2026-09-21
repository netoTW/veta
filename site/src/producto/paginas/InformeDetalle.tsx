import { useParams } from 'react-router-dom'
import {
  Cargando, Puerta, TierBadge, Advertencias, Adv, Avanzado, ProveedorNivel, SelectorNivel,
  FuenteChip, TablaFuentes, Dato, Ausente, Volver, useNivel,
} from '../piezas'
import { useAnalisis, useGemas, useGemasTodo, useVisuales } from '../../lib/datos'
import { Heatmap, HeatmapAusente } from '../charts/Heatmap'
import { PrecioMaximos, RevenueDiario, TvlComparado, Concentracion } from '../charts/Series'
import { MarcadorDeGema, PrediccionGema } from '../marcador'
import { useEffect, useState } from 'react'
import { puede, useRol } from '../../lib/acceso'
import { fecha, fechaHora, mult, num, pct, precio, usd, conUnidad, TIPO_ESCENARIO, DIRECCION_LABEL, CAMPO_LABEL, dias } from '../../lib/formato'
import type { Advertencia, Escenario, Informe, Invalidacion, VaraRevenue } from '../../lib/contrato'
import { etiquetadasDe } from '../../lib/contrato'
import { EmptyState } from '../../ui/EmptyState'
import { Cifras, Prosa, RiesgoLlano } from '../cifras'
import { estadoEconomicoLlano, tieneCriterioInterno, llano, delCatalogo, prosaDeCliente } from '../../lib/lenguaje'

/* ============================================================================
   Informe — el detalle de una gema (o de un análisis sin tesis).

   Dos niveles de lectura: abre en ESENCIAL (una frase por sección, la del
   contrato) y el AVANZADO despliega todos los números con su fuente. Las
   advertencias que cambian la decisión se muestran en AMBOS niveles, arriba
   y en cada sección. Las dos varas van lado a lado, nunca fundidas.
   ========================================================================== */

/* ---------- escala de múltiplos: log, de 0.5× a 16× ---------- */
const LOG_MIN = Math.log(0.5), LOG_MAX = Math.log(16)
const pos = (x: number) => Math.max(0, Math.min(100, ((Math.log(Math.max(x, 0.5)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100))

function Escala({ rangos }: { rangos: { tipo: string; min: number; max: number }[] }) {
  return (
    <div className="p-escala" aria-hidden="true">
      <span className="p-escala__eje" />
      <span className="p-escala__uno" style={{ left: `${pos(1)}%` }} />
      {rangos.map((r, i) => (
        <span key={i} className={`p-escala__rango p-escala__rango--${r.tipo}`} style={{ left: `${pos(r.min)}%`, width: `${Math.max(0.6, pos(r.max) - pos(r.min))}%` }} title={`${r.tipo}: ${mult(r.min)} – ${mult(r.max)}`} />
      ))}
      <span className="p-escala__ticks">
        {[0.5, 2, 4, 8, 16].map((t) => <span key={t} style={{ left: `${pos(t)}%` }}>{t}×</span>)}
      </span>
    </div>
  )
}

/* ---------- invalidación (Sprint 6: campos, no texto) ----------
   El umbral llega crudo con su unidad; acá sólo se formatea. El texto del
   Redactor queda debajo, para leer. */
function InvalidacionEstructurada({ inv }: { inv: Invalidacion }) {
  return (
    <div className="p-inval">
      <p className="p-inval__regla">
        <span className="p-inval__campo num">{CAMPO_LABEL[inv.campo] ?? inv.campo}</span>
        <span className="p-inval__dir">{DIRECCION_LABEL[inv.direccion] ?? inv.direccion}</span>
        <span className="p-inval__umbral num">{conUnidad(inv.umbral, inv.unidad)}</span>
        {inv.ventana_dias ? <span className="p-inval__ventana">· ventana {dias(inv.ventana_dias)}</span> : null}
      </p>
      <p className="p-inval__texto">{prosaDeCliente(inv.texto)}</p>

    </div>
  )
}

/** Sólo se ve en esencial (el complemento de <Avanzado>). */
function NivelEsencial({ children }: { children: React.ReactNode }) {
  const { nivel } = useNivel()
  return nivel === 'esencial' ? <>{children}</> : null
}

/* ---------- secciones ---------- */
function Seccion({ id, titulo, esencial, advertencias, children }: {
  id: string; titulo: string; esencial?: string; advertencias?: Advertencia[]; children?: React.ReactNode
}) {
  return (
    <section className="p-seccion" id={id} aria-labelledby={`${id}-h`}>
      <div className="p-seccion__head">
        <h2 className="p-seccion__titulo" id={`${id}-h`}>{titulo}</h2>
      </div>
      {esencial && <p className="p-esencial">{esencial}</p>}
      {advertencias && advertencias.length > 0 && <Advertencias items={advertencias} titulo="Advertencias de la sección" compacta />}
      {children}
    </section>
  )
}

function VaraRevenueBloque({ v, esAnalisis }: { v: VaraRevenue & { no_disponible_motivo?: string }; esAnalisis: boolean }) {
  const { nivel } = useNivel()
  if (!v.comparables) {
    return (
      <div className="p-vara">
        <div className="p-vara__h"><h3>Por ingresos</h3><span className="mono">valuación relativa</span></div>
        <Ausente motivo={tieneCriterioInterno(v.no_disponible_motivo) ? 'No hay protocolos equivalentes con los que comparar esta moneda.' : (v.no_disponible_motivo ?? 'No hay con qué comparar esta moneda.')} />
        {esAnalisis && <p className="p-nota">Sin comparables no publicamos una magnitud: preferimos no decirlo a decirlo sin respaldo.</p>}
      </div>
    )
  }
  return (
    <div className="p-vara">
      <div className="p-vara__h"><h3>Por ingresos</h3><span className="mono">{prosaDeCliente(v.metrica)}</span></div>
      <div className="p-datos">
        <Dato k="esta moneda" v={num(v.multiplo_moneda, 3)} tono="oro" />
        <Dato k="mediana de pares" v={num(v.mediana, 3)} sub={<>p25 {num(v.p25, 3)} · p75 {num(v.p75, 3)}</>} />
        <Dato k="brecha" v={v.hay_brecha ? `${mult(v.rango_min)} – ${mult(v.rango_max)}` : 'no hay'} tono={v.hay_brecha ? 'pos' : 'mudo'} sub={v.hay_brecha ? 'lo que implicaría cerrar la brecha' : 'cotiza en línea con sus pares'} />
      </div>
      {nivel === 'avanzado' && (
        <div className="p-avanzado">
          <div className="p-tabla-wrap">
            <table className="p-tabla">
              <thead><tr><th>Comparable</th><th className="num">mcap</th><th className="num">revenue anual</th><th className="num">a holders 30d</th><th className="num">múltiplo</th></tr></thead>
              <tbody>
                {v.comparables.map((c) => (
                  <tr key={c.slug}>
                    <td>{c.nombre} <span className="mono" style={{ color: 'var(--ceniza-2)' }}>{c.simbolo}</span></td>
                    <td className="num">{usd(c.mcap_usd)}</td>
                    <td className="num">{usd(c.revenue_anualizado)}</td>
                    <td className="num">{usd(c.revenue_holders_30d)}</td>
                    <td className="num">{num(c.multiplo, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {v.excluidos.length > 0 && (
            <dl className="p-kv">
              {v.excluidos.map((e) => <div key={e.simbolo} style={{ display: 'contents' }}><dt>excluido {e.simbolo}</dt><dd>{e.motivo} <span className="mono" style={{ color: 'var(--ceniza-2)' }}>({e.regla})</span></dd></div>)}
            </dl>
          )}
          <FuenteChip fuente={v.fuente} />
        </div>
      )}
    </div>
  )
}

function EscenarioFila({ e }: { e: Escenario }) {
  const { nivel } = useNivel()
  return (
    <div className={`p-escenario p-escenario--${e.tipo}`}>
      <div className="p-escenario__tipo">
        <strong>{TIPO_ESCENARIO[e.tipo] ?? e.tipo}</strong>
        <span className="p-escenario__rango num">{mult(e.rango_min)} – {mult(e.rango_max)}</span>
        <span className="mono" style={{ color: 'var(--ceniza-2)' }}>horizonte {dias(e.horizonte_dias)}</span>
      </div>
      <div className="p-escenario__cuerpo">
        <div>
          <span className="mono">Catalizador {e.catalizador_datado ? '· con fecha' : <span style={{ color: 'var(--oro-luz)' }}>· ◆ sin fecha</span>}</span>
          {e.catalizador}
        </div>
        <div>
          <span className="mono" style={{ color: 'var(--rojo-luz)' }}>Invalidación</span>
          {e.invalidacion}
        </div>
        {nivel === 'avanzado' && (
          <>
            <div><span className="mono">Evidencia citada</span>{e.evidencia_citada}</div>
            <div><span className="mono">De dónde sale la magnitud</span>{prosaDeCliente(e.magnitud_origen)}</div>
            <div><span className="mono">Confianza del horizonte</span>{e.confianza_horizonte}</div>
          </>
        )}
      </div>
    </div>
  )
}

/* ---------- el informe ---------- */
/** ¿Pantalla angosta? Los charts tienen versión móvil propia, no la misma apretada. */
function useMovil() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)')
    const f = () => setM(mq.matches)
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  return m
}

/* ============================================================================
   El informe de cliente en cinco secciones (contrato §11).

   Las secciones 1 y 3 las escribe el motor y todavía no llegan: mientras no
   estén, no se muestran. Lo que no aplica no aparece, y no se deja hueco.
   ========================================================================== */
export interface PuntoSerie { t: string; c: number; v?: number | null }
export interface NivelesCliente {
  precio_usd?: number; fecha?: string
  maximo?: { valor_usd?: number; fecha?: string }
  serie?: PuntoSerie[]
  zonas_volumen?: { desde: number; hasta: number; fraccion_del_volumen?: number; dias_con_volumen?: number }[]
  escenarios?: { nombre?: string; min_x?: number; max_x?: number; un_solo_nivel?: boolean; dias?: number; condicion?: string }[]
  parrafos?: string[]
}
export interface Hallazgo { titular?: string; parrafos?: string[]; por_que_no_se_ve?: string }
/**
 * §15: una sección que no aplica llega como `null` (objetos) o `[]` (listas),
 * nunca ausente, y `disponible` dice si hubo narrado publicable. `lectura`
 * viene siempre. Los tipos admiten `null` a propósito: si alguien escribe
 * `ic.lectura.veredicto` sin comprobar, el compilador lo para.
 *
 * Las secciones ya degradan solas —`null` es falso igual que ausente— y cada
 * una cae a su dato de ficha, así que un informe sin narrado sigue enseñando
 * tesis, niveles e invalidación en vez de cinco cajas vacías.
 */
export interface InformeCliente {
  disponible?: boolean
  que_paso?: { titular?: string; parrafos?: string[]; cuando?: string } | null
  lectura?: { veredicto?: string; parrafos?: string[]; direccion?: string; horizonte_dias?: number } | null
  hallazgo?: Hallazgo | null
  hallazgos?: Hallazgo[]
  niveles?: NivelesCliente | null
  vigilar?: { senal?: string; parrafos?: string[] } | null
  invalida?: { condicion?: string } | null
  riesgos?: string[]
  avanzado?: Record<string, string> | null
}

/* ---------- el gráfico de precio: serie real, máximo marcado y zonas de volumen ---------- */
/** Más de tres veces el precio de hoy: se sale de la escala y se cuenta como dato. */
const LEJOS_X = 3

/** "1/21" + 2021-10-23 → "Cotiza a 1/21 de su máximo de 2021." */
function tituloNiveles(fraccion?: string | null, fechaMax?: string | null): string | undefined {
  if (!fraccion) return undefined
  const f = llano(String(fraccion)).replace(/\s*del m[aá]ximo\s*$/i, '').trim()
  const anio = fechaMax ? new Date(fechaMax).getUTCFullYear() : null
  return `Cotiza a ${f} de su máximo${anio ? ` de ${anio}` : ''}.`
}

function GraficoPrecio({ n }: { n: NivelesCliente }) {
  const s = (n.serie ?? []).filter((x) => typeof x.c === 'number' && x.c > 0)
  if (s.length < 5) return null
  const W = 720, H = 220, PL = 8, PR = 8, PT = 14, PB = 22
  const cs = s.map((x) => x.c)
  const zonas = (n.zonas_volumen ?? []).filter((z) => typeof z.desde === 'number' && typeof z.hasta === 'number')
  const maxAbs = n.maximo?.valor_usd
  const hoyP = cs[cs.length - 1]
  /* Un máximo muy por encima aplasta la serie contra el borde y no se lee nada. Cuando
     pasa de tres veces el precio de hoy, sale de la escala y se cuenta como dato. */
  const lejos = typeof maxAbs === 'number' && hoyP > 0 && maxAbs / hoyP > LEJOS_X
  const max = lejos ? undefined : maxAbs
  const lo = Math.min(...cs, ...zonas.map((z) => z.desde))
  const hi = Math.max(...cs, ...(typeof max === 'number' ? [max] : []), ...zonas.filter((z) => !lejos || z.hasta <= hoyP * LEJOS_X).map((z) => z.hasta))
  const x = (i: number) => PL + (i / Math.max(1, s.length - 1)) * (W - PL - PR)
  const y = (v: number) => PT + (1 - (v - lo) / Math.max(1e-12, hi - lo)) * (H - PT - PB)
  const linea = s.map((p2, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p2.c).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(s.length - 1).toFixed(1)},${(H - PB).toFixed(1)} L${x(0).toFixed(1)},${(H - PB).toFixed(1)} Z`
  const conVol = s.some((p2) => typeof p2.v === 'number')

  return (
    <figure className="p-graf">
      <svg viewBox={`0 0 ${W} ${H}`} className="p-graf__svg" role="img"
        aria-label={`Precio de los últimos ${s.length} días. Máximo ${max ? precio(max) : 'sin dato'}. ${zonas.length} zonas donde se concentró el volumen.`}>
        <defs>
          <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--esmeralda)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--esmeralda)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {zonas.filter((z) => z.desde <= hi && z.hasta >= lo).map((z, i) => (
          <g key={i}>
            <rect x={PL} y={y(z.hasta)} width={W - PL - PR} height={Math.max(2, y(z.desde) - y(z.hasta))} fill="var(--oro)" fillOpacity="0.07" />
            {typeof z.fraccion_del_volumen === 'number' && (
              <text x={W - PR - 4} y={y(z.hasta) + 11} textAnchor="end" className="p-graf__zt">{pct(z.fraccion_del_volumen, 0)} del volumen</text>
            )}
          </g>
        ))}
        <path d={area} fill="url(#gfill)" />
        <path d={linea} fill="none" stroke="var(--esmeralda-luz)" strokeWidth="1.6" strokeLinejoin="round" />
        {typeof max === 'number' && (
          <g>
            <line x1={PL} x2={W - PR} y1={y(max)} y2={y(max)} stroke="var(--oro)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={PL + 4} y={y(max) - 5} className="p-graf__mt">Máximo {precio(max)}{n.maximo?.fecha ? ` · ${fecha(n.maximo.fecha)}` : ''}</text>
          </g>
        )}
        <circle cx={x(s.length - 1)} cy={y(cs[cs.length - 1])} r="3.5" fill="var(--hueso)" />
      </svg>
      <figcaption className="p-graf__pie mono">
        <span>{fecha(s[0].t)} — {fecha(s[s.length - 1].t)}</span>
        <span>{s.length} días{conVol ? ' · las bandas marcan dónde se concentró el volumen' : ''}</span>
      </figcaption>
      {lejos && typeof maxAbs === 'number' && (
        <p className="p-graf__lejos">
          <b className="mono">{precio(maxAbs)}</b>
          <span>su máximo{n.maximo?.fecha ? ` de ${new Date(n.maximo.fecha).getUTCFullYear()}` : ''}, {mult(maxAbs / hoyP)} por encima de hoy. Queda fuera del gráfico para que se vean los {s.length} días.</span>
        </p>
      )}
    </figure>
  )
}

const AVANZADO_LABEL: Record<string, string> = {
  riesgo: 'Riesgo', valuacion: 'Valuación', mercado: 'Mercado', captura: 'Captura de valor', metodo: 'Método',
}

function SeccionCliente({ n, k, titulo, children }: { n: string; k: string; titulo?: string; children: React.ReactNode }) {
  return (
    <section className="shell p-cli" aria-labelledby={`cli-${n}`}>
      <p className="p-cli__k mono"><span aria-hidden="true">{n}</span> · {k}</p>
      {titulo && <h2 id={`cli-${n}`} className="display p-cli__t">{titulo}</h2>}
      {!titulo && <span id={`cli-${n}`} className="vh">{k}</span>}
      {children}
    </section>
  )
}

/* ---------- 4 · Niveles ----------
   Una escala de precios, no una línea: el informe no trae serie temporal, y
   dibujar una línea sin datos sería inventar cifras (hueco §11.3). */
function Niveles({ inf, nc }: { inf: Informe; nc?: NivelesCliente | null }) {
  const f = inf.ficha_esencial
  const hoy = f.precio_y_fecha_referencia?.precio_usd
  const rf = inf.varas?.reflexiva as { maximo_valor?: number | null; maximo_fecha?: string | null; fraccion_del_maximo?: string | null } | undefined
  const max = typeof rf?.maximo_valor === 'number' ? rf.maximo_valor : null
  if (typeof hoy !== 'number') return null

  const esc = (inf.escenarios ?? []).filter((e) => typeof e.rango_min === 'number' && typeof e.rango_max === 'number')
  const marcas: { v: number; et: string; clase: string }[] = []
  const lejano: { v: number; que: string }[] = []
  const cerca = (v: number) => v <= hoy * LEJOS_X && v >= hoy / LEJOS_X
  if (max && max > 0) {
    if (cerca(max)) marcas.push({ v: max, et: `Máximo${rf?.maximo_fecha ? ` · ${fecha(rf.maximo_fecha)}` : ''}`, clase: 'is-max' })
    else lejano.push({ v: max, que: `su máximo${rf?.maximo_fecha ? ` de ${new Date(rf.maximo_fecha).getUTCFullYear()}` : ''}, ${mult(max / hoy)} por encima de hoy` })
  }
  marcas.push({ v: hoy, et: `Hoy · ${fecha(f.precio_y_fecha_referencia.fecha)}`, clase: 'is-hoy' })
  for (const e of esc) {
    const et = delCatalogo('escenarios[].tipo', e.tipo) || 'Escenario'
    // Un escenario a la baja se dibuja en su suelo, no en su techo: su techo es el precio de hoy.
    const baja = e.rango_min < 1
    const x = baja ? e.rango_min : e.rango_max
    const v = hoy * x
    if (cerca(v)) marcas.push({ v, et: `${et} · ${mult(x)}${e.horizonte_dias ? ` · ${e.horizonte_dias} d` : ''}`, clase: baja ? 'is-baja' : 'is-alza' })
    else lejano.push({ v, que: `el techo del escenario ${baja ? 'a la baja' : 'al alza'}, ${mult(x)}` })
  }
  const vs0 = marcas.map((m) => m.v)
  const lo = Math.min(...vs0), hi = Math.max(...vs0)
  const pos = (v: number) => (hi === lo ? 50 : ((hi - v) / (hi - lo)) * 100)
  /* Dos etiquetas se pisan cuando caen cerca EN PANTALLA, no cuando sus precios se parecen:
     con un rango grande, valores muy distintos acaban en la misma línea. Se funden. */
  const fundidas: typeof marcas = []
  for (const m of [...marcas].sort((a, b) => b.v - a.v)) {
    const prev = fundidas[fundidas.length - 1]
    if (prev && Math.abs(pos(prev.v) - pos(m.v)) < 9) { prev.et = `${prev.et} · ${m.et}`; continue }
    fundidas.push({ ...m })
  }

  const conSerie = (nc?.serie?.length ?? 0) >= 5
  return (
    <SeccionCliente n="4" k="Niveles" titulo={tituloNiveles(rf?.fraccion_del_maximo, rf?.maximo_fecha)}>
      {conSerie && nc ? <GraficoPrecio n={nc} /> : null}
      {(nc?.parrafos ?? []).map((t, i) => <p key={i} className="p-cli__p">{prosaDeCliente(t)}</p>)}
      {!conSerie && <div className="p-niv" style={{ height: `${Math.max(130, fundidas.length * 64)}px` }} role="img" aria-label={fundidas.map((m) => `${m.et}: ${precio(m.v)}`).join('. ')}>
        {fundidas.map((m, i) => (
          <div key={i} className={`p-niv__fila ${m.clase}`} style={{ top: `${pos(m.v)}%` }}>
            <span className="p-niv__precio mono">{precio(m.v)}</span>
            <span className="p-niv__linea" aria-hidden="true" />
            <span className="p-niv__et mono">{m.et}</span>
          </div>
        ))}
      </div>}
      {(() => {
        /* El techo del escenario alcista suele ser el propio máximo: mismo número, dos
           frases. Se juntan en una. */
        const juntos: { v: number; ques: string[] }[] = []
        for (const x of lejano.sort((a, b) => b.v - a.v)) {
          const prev = juntos[juntos.length - 1]
          if (prev && Math.abs(prev.v - x.v) / Math.max(prev.v, x.v) < 0.01) { prev.ques.push(x.que); continue }
          juntos.push({ v: x.v, ques: [x.que] })
        }
        if (!juntos.length) return null
        return (
          <ul className="p-niv__lejos">
            {juntos.map((x, i) => (
              <li key={i}><b className="mono">{precio(x.v)}</b><span>{x.ques.join(', y ')}. Queda fuera de la escala para que se lea lo cercano.</span></li>
            ))}
          </ul>
        )
      })()}
      {esc.length > 0 && (
        <ul className="p-niv__esc">
          {esc.map((e, i) => {
            const nombre = delCatalogo('escenarios[].tipo', e.tipo)
            const igual = e.rango_min === e.rango_max
            return (
              <li key={i} className={e.rango_max >= 1 ? 'is-alza' : 'is-baja'}>
                <span className="p-niv__mult mono">{igual ? mult(e.rango_max) : `${mult(e.rango_min)} – ${mult(e.rango_max)}`}</span>
                {e.horizonte_dias ? <span className="p-niv__plazo mono">{e.horizonte_dias} días</span> : <span />}
                <span className="p-niv__cond">{nombre ? <b>{nombre}. </b> : null}{prosaDeCliente(e.catalizador ?? '')}</span>
              </li>
            )
          })}
        </ul>
      )}
    </SeccionCliente>
  )
}

export function Cuerpo({ inf, esAnalisis }: { inf: Informe; esAnalisis: boolean }) {
  const vis = useVisuales(inf.id)
  const v = vis.estado === 'ok' ? vis.datos : null
  const movil = useMovil()
  const f = inf.ficha_esencial
  const n = inf.niveles
  const ranges = inf.escenarios.map((e) => ({ tipo: e.tipo, min: e.rango_min, max: e.rango_max }))
  const rv = inf.varas.revenue as VaraRevenue & { no_disponible_motivo?: string }
  const rf = inf.varas.reflexiva
  const ic = (inf as unknown as { informe_cliente?: InformeCliente }).informe_cliente ?? null

  return (
    <>
      {/* ------------ cabecera: símbolo, tier, precio · tesis · cifras · catalizadores · invalidación ------------ */}
      <div className="shell">
        <div className="p-det__head">
          <div>
            <h1 className="p-det__sym">{inf.simbolo}<small>{inf.nombre} · {inf.cadena}</small></h1>
            <div className="p-det__tags">
              <TierBadge tier={inf.tier} size={22} />
              <span className="mono" style={{ color: 'var(--ceniza-2)' }}>{estadoEconomicoLlano(inf.estado_economico, inf.captura_verificada)}</span>
            </div>
          </div>
          <div className="p-det__precio">
            <Dato k="precio de referencia" v={precio(f.precio_y_fecha_referencia.precio_usd)} sub={<>{fecha(f.precio_y_fecha_referencia.fecha)} · {esAnalisis ? 'analizada' : 'publicada'} {fecha(inf.fecha_publicacion)}</>} />
          </div>
        </div>

        {!esAnalisis && <><MarcadorDeGema gemaId={inf.id} horizonteDias={inf.escenarios.find((e) => e.tipo === 'bull')?.horizonte_dias ?? inf.escenarios.find((e) => e.tipo === 'bull_reflexivo')?.horizonte_dias} /><PrediccionGema gemaId={inf.id} simbolo={inf.simbolo} /></>}

        <div className="p-ficha">
          {f.catalizadores.length > 0 && (
            <div className="p-ficha__b">
              <span className="mono">Catalizadores · {f.catalizadores.length}</span>
              <ul>{f.catalizadores.map((c, i) => <li key={i}>{prosaDeCliente(c)}</li>)}</ul>
            </div>
          )}
          <div className="p-ficha__b p-ficha__b--inv">
            <span className="mono">Qué la invalidaría</span>
            {inf.invalidacion?.evaluable ? <InvalidacionEstructurada inv={inf.invalidacion} /> : f.que_la_invalidaria}
          </div>
          <div className="p-ficha__b">
            <NivelEsencial><RiesgoLlano inf={inf} /></NivelEsencial>
            <Avanzado>
              <span className="mono">Riesgo · condiciones del tier, detalle técnico</span>
              <ul className="p-factores" aria-label="Factores del tier">{inf.factores_del_tier.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <p className="p-nota" style={{ marginTop: 8 }}>{f.riesgo_resumen}</p>
              <p className="p-meta-tecnica mono" style={{ color: 'var(--ceniza-2)', fontSize: '0.6rem' }}>{inf.estado_economico} · captura {inf.captura_verificada ? 'verificada' : 'no verificada'} · {inf.fundamentales.via_captura}</p>
            </Avanzado>
          </div>
        </div>

      </div>

      {/* ---- 1 · Qué pasó. La escribe el motor; mientras no llegue, no se muestra. ---- */}
      {ic?.que_paso?.titular && (
        <SeccionCliente n="1" k="Qué pasó" titulo={llano(ic.que_paso.titular)}>
          {(ic.que_paso.parrafos ?? []).map((t, i) => <p key={i} className="p-cli__p">{prosaDeCliente(t)}</p>)}
        </SeccionCliente>
      )}

      {/* ---- 2 · Nuestra lectura ---- */}
      <SeccionCliente n="2" k="Nuestra lectura" titulo={ic?.lectura?.veredicto ? llano(ic.lectura.veredicto) : undefined}>
        {ic?.lectura?.direccion && delCatalogo('lectura.direccion', ic.lectura.direccion) && (
          <p className={`p-cli__dir mono is-${ic.lectura.direccion}`}>
            {delCatalogo('lectura.direccion', ic.lectura.direccion)}
            {ic.lectura.horizonte_dias ? ` · ${ic.lectura.horizonte_dias} días` : ''}
          </p>
        )}
        {ic?.lectura?.parrafos?.length
          ? ic.lectura.parrafos.map((t, i) => <p key={i} className="p-cli__p p-cli__p--grande">{prosaDeCliente(t)}</p>)
          : <Prosa inf={inf} campo="ficha_esencial.tesis_una_linea" texto={f.tesis_una_linea} className="p-cli__p p-cli__p--grande" />}
        <Cifras inf={inf} />
      </SeccionCliente>

      {/* ---- 3 · Lo que el resto no ve. Idem. ---- */}
      {(() => {
        const hs = (ic?.hallazgos?.length ? ic.hallazgos : ic?.hallazgo ? [ic.hallazgo] : []).filter((h) => h?.titular)
        if (!hs.length) return null
        return (
          <SeccionCliente n="3" k="Lo que el resto no ve" titulo={hs.length === 1 ? llano(hs[0].titular!) : undefined}>
            {hs.map((h, i) => (
              <div key={i} className="p-cli__hallazgo">
                {hs.length > 1 && <h3 className="p-cli__ht display">{llano(h.titular!)}</h3>}
                {(h.parrafos ?? []).map((t, j) => <p key={j}>{prosaDeCliente(t)}</p>)}
                {h.por_que_no_se_ve && <p className="p-cli__porque">{prosaDeCliente(h.por_que_no_se_ve)}</p>}
              </div>
            ))}
          </SeccionCliente>
        )
      })()}

      {/* ---- 4 · Niveles ---- */}
      <Niveles inf={inf} nc={ic?.niveles ?? null} />

      {/* ---- 5 · Qué vigilar y qué invalida ---- */}
      <SeccionCliente n="5" k="Qué vigilar y qué invalida">
        <div className="p-cli__vigilar">
          {ic?.vigilar?.senal && (
            <div>
              <span className="mono p-cli__et">Qué vigilar</span>
              <p>{prosaDeCliente(ic.vigilar.senal)}</p>
              {(ic.vigilar.parrafos ?? []).map((t, i) => <p key={i} className="p-cli__vp">{prosaDeCliente(t)}</p>)}
            </div>
          )}
          <div className="p-cli__inval">
            <span className="mono p-cli__et">Qué invalida la lectura</span>
            {inf.invalidacion?.evaluable
              ? <InvalidacionEstructurada inv={inf.invalidacion} />
              : <p>{prosaDeCliente(ic?.invalida?.condicion || f.que_la_invalidaria || '')}</p>}
          </div>
        </div>
        {ic?.riesgos?.length ? (
          <div className="p-advs">
            <div className="p-advs__head"><span className="mono">Lo que podría salir mal</span></div>
            <ul className="p-advs__lista">
              {ic.riesgos.map((t, i) => <li key={i} className="p-adv"><span className="p-adv__texto">{prosaDeCliente(t)}</span></li>)}
            </ul>
          </div>
        ) : <Advertencias items={f.advertencias} />}
      </SeccionCliente>

      <div className="shell">
        <details className="p-avz">
          <summary>Avanzado<span className="mono p-avz__pista">las dos varas, asimetría, riesgo de cola, microestructura y método</span></summary>
          <div className="p-avz__cuerpo">
            {ic?.avanzado && Object.keys(ic.avanzado).length > 0 && (
              <div className="shell p-avz__prosa">
                {Object.entries(ic.avanzado).map(([k, v]) => {
                  const t = prosaDeCliente(v)
                  return t ? <p key={k}><b className="mono">{AVANZADO_LABEL[k] ?? k}</b>{t}</p> : null
                })}
              </div>
            )}
      <div className="shell"><SelectorNivel /></div>

      <div className="shell">
        {/* ------------ tesis ------------ */}
        {/* La tesis ya va en la cabecera; la sección sólo aparece si el motor
            escribió una versión distinta, o si la tesis fue contradicha. */}
        {!esAnalisis && ((inf.tesis && inf.tesis !== f.tesis_una_linea) || inf.tesis_contradicha) && (
          <Seccion id="tesis" titulo="Tesis" esencial={inf.tesis !== f.tesis_una_linea ? inf.tesis ?? undefined : undefined}>
            {inf.tesis_contradicha && <ul style={{ listStyle: 'none', padding: 0, marginTop: 12 }}><Adv>Tesis contradicha: {inf.tesis_contradicha}</Adv></ul>}
          </Seccion>
        )}

        {/* ------------ las dos varas ------------ */}
        <Seccion id="varas" titulo="Las dos varas" esencial={prosaDeCliente(n.varas.esencial.texto)} advertencias={n.varas.esencial.advertencias}>
          {v && v.precio.serie.length > 1 && <PrecioMaximos v={v} fraccion={rf?.fraccion_del_maximo} movil={movil} />}
          <div className="p-varas" style={{ marginTop: 18 }}>
            <VaraRevenueBloque v={rv} esAnalisis={esAnalisis} />
            <div className="p-vara">
              <div className="p-vara__h"><h3>Reflexiva</h3><span className="mono">historial propio de la moneda</span></div>
              <div className="p-datos">
                <Dato k="del máximo histórico" v={rf.fraccion_del_maximo} tono="oro" sub={<>{precio(rf.maximo_valor)} el {fecha(rf.maximo_fecha)}</>} />
                <Dato k="rango" v={`${mult(rf.rango_min)} – ${mult(rf.rango_max)}`} sub="máximos que la moneda ya alcanzó, no una proyección" />
                <Dato k="serie" v={`${num(rf.semanas_de_serie)} sem`} tono="mudo" />
              </div>
              <Escala rangos={[{ tipo: 'bull_reflexivo', min: rf.rango_min, max: rf.rango_max }]} />
              <Avanzado>
                <p className="p-nota">{rf.origen_rango}</p>
                <div className="p-tabla-wrap">
                  <table className="p-tabla">
                    <thead><tr><th>Máximo de ciclo</th><th className="num">precio</th><th className="num">magnitud</th><th className="num">duración</th></tr></thead>
                    <tbody>{rf.ciclos.map((c) => (
                      <tr key={c.fecha}><td>{fecha(c.fecha)}</td><td className="num">{precio(c.precio)}</td><td className="num">{mult(c.magnitud, 1)}</td><td className="num">{num(c.duracion_semanas)} sem</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <FuenteChip fuente={rf.fuente} />
              </Avanzado>
            </div>
            <div className="p-varas__regla">las dos varas no se funden en un número: son dos coordenadas y el peso lo pone el lector</div>
          </div>
        </Seccion>

        {/* ------------ escenarios ------------ */}
        <Seccion id="escenarios" titulo="Escenarios" esencial={prosaDeCliente(n.escenarios.esencial.texto)} advertencias={n.escenarios.esencial.advertencias}>
          {n.escenarios.disponible ? (
            <>
              <div style={{ marginTop: 18 }}><Escala rangos={ranges} /></div>
              <div style={{ marginTop: 22 }}>{inf.escenarios.map((e, i) => <EscenarioFila key={i} e={e} />)}</div>
              <Avanzado>
                {n.escenarios.avanzado.nota_varas && <p className="p-nota p-nota--regla">{n.escenarios.avanzado.nota_varas}</p>}
                {n.escenarios.avanzado.regla_horizonte && <p className="p-nota">{n.escenarios.avanzado.regla_horizonte}</p>}
              </Avanzado>
            </>
          ) : (
            <div style={{ marginTop: 16 }}><Ausente motivo={n.escenarios.motivo_ausencia} /></div>
          )}
        </Seccion>

        {/* ------------ asimetría ------------ */}
        <Seccion id="asimetria" titulo="Asimetría" esencial={prosaDeCliente(n.asimetria.esencial.texto)} advertencias={n.asimetria.esencial.advertencias}>
          {n.asimetria.disponible ? (
            <>
              <div className="p-datos" style={{ marginTop: 18 }}>
                <Dato k="riesgo" v={pct(inf.asimetria.riesgo)} tono="neg" sub={prosaDeCliente(inf.asimetria.riesgo_origen)} />
                <Dato k="recompensa" v={pct(inf.asimetria.recompensa)} tono="pos" sub={prosaDeCliente(inf.asimetria.recompensa_origen)} />
                <Dato k="premio por unidad de riesgo" v={num(inf.asimetria.ratio, 2)} tono="oro" sub={<>a {dias(inf.asimetria.horizonte)} · vara {inf.asimetria.vara_origen}</>} />
              </div>
              <Avanzado>
                <p className="p-nota">Confianza: {inf.asimetria.confianza}</p>
                {inf.asimetria.regla && <p className="p-nota p-nota--regla">{inf.asimetria.regla}</p>}
              </Avanzado>
            </>
          ) : (
            <div style={{ marginTop: 16 }}><Ausente motivo={n.asimetria.motivo_ausencia} /></div>
          )}
        </Seccion>

        {/* ------------ riesgo de cola ------------ */}
        <Seccion id="riesgo" titulo="Riesgo de cola" esencial={prosaDeCliente(n.riesgo.esencial.texto)} advertencias={n.riesgo.esencial.advertencias}>
          <Avanzado>
            <div className="p-varas">
              <div className="p-vara">
                <div className="p-vara__h"><h3>Paramétrico</h3><span className="mono">Student-t</span></div>
                <div className="p-datos">
                  <Dato k="VaR 95 · 1 día" v={pct(inf.riesgo.var95_1d)} tono="neg" />
                  <Dato k="CVaR 95 · 1 día" v={pct(inf.riesgo.cvar95_1d)} tono="neg" />
                  <Dato k="VaR 95 · 7 días" v={pct(inf.riesgo.var95_7d)} tono="neg" />
                  <Dato k="CVaR 95 · 7 días" v={pct(inf.riesgo.cvar95_7d)} tono="neg" />
                </div>
              </div>
              <div className="p-vara">
                <div className="p-vara__h"><h3>Empírico</h3><span className="mono">sin modelo</span></div>
                <div className="p-datos">
                  <Dato k="VaR 95 · 1 día" v={pct(inf.riesgo.var95_1d_empirico)} tono="neg" />
                  <Dato k="CVaR 95 · 1 día" v={pct(inf.riesgo.cvar95_1d_empirico)} tono="neg" />
                  <Dato k="peor día de la ventana" v={pct(inf.riesgo.peor_dia_ventana)} tono="neg" />
                  <Dato k="sigma anualizada" v={pct(inf.riesgo.sigma_anualizada, 0)} tono="mudo" />
                </div>
              </div>
              <div className="p-varas__regla">{inf.riesgo.empirico_vs_parametrico}</div>
            </div>
            <dl className="p-kv">
              <dt>método</dt><dd>{prosaDeCliente(inf.riesgo.metodo)}</dd>
              <dt>ν</dt><dd className="num">{num(inf.riesgo.nu, 2)}</dd>
              <dt>serie</dt><dd className="num">{num(inf.riesgo.dias_serie)} días · confianza {inf.riesgo.confianza}</dd>
              {inf.riesgo.limites_declarados.map((l, i) => <div key={i} style={{ display: 'contents' }}><dt>límite declarado</dt><dd>{l}</dd></div>)}
            </dl>
            <FuenteChip fuente={inf.riesgo.fuente} timestamp={inf.riesgo.timestamp} />
          </Avanzado>
        </Seccion>

        {/* ------------ microestructura ------------ */}
        <Seccion id="micro" titulo="Microestructura" esencial={prosaDeCliente(n.microestructura.esencial.texto)} advertencias={n.microestructura.esencial.advertencias}>
          {v && (v.liquidacion_proyectada.disponible ? <Heatmap liq={v.liquidacion_proyectada} movil={movil} /> : <HeatmapAusente liq={v.liquidacion_proyectada} />)}
          {n.microestructura.disponible ? (
            <Avanzado>
              <div className="p-datos">
                <Dato k="lectura" v={inf.microestructura.lectura} tono="mudo" />
                <Dato k="F/S 30d" v={num(inf.microestructura.fs_30d, 2)} sub={<>24h {num(inf.microestructura.fs_24h, 2)} · 7d {num(inf.microestructura.fs_7d, 2)}</>} />
                <Dato k="OI / mcap" v={pct(inf.microestructura.oi_mcap)} />
                <Dato k="funding actual" v={pct(inf.microestructura.funding_actual, 4)} sub={<>percentil {num(inf.microestructura.funding_percentil, 0)}</>} />
                <Dato k="long/short" v={num(inf.microestructura.long_short, 2)} sub={<>top traders {num(inf.microestructura.long_short_top_traders, 2)}</>} />
                <Dato k="liquidez spot ±2 %" v={usd(inf.microestructura.liquidez_spot_2pct_usd)} sub={<>sobre OI {num(inf.microestructura.liquidez_spot_sobre_oi, 3)}</>} />
              </div>
              {inf.microestructura.condiciones_perp_driven && (
                <div className="p-tabla-wrap">
                  <table className="p-tabla">
                    <thead><tr><th>Condición perp-driven</th><th>cumple</th><th>detalle</th></tr></thead>
                    <tbody>{inf.microestructura.condiciones_perp_driven.map((c) => (
                      <tr key={c.nombre}><td>{c.nombre}</td><td className="mono" style={{ color: c.cumple ? 'var(--rojo-luz)' : 'var(--esmeralda-luz)' }}>{c.cumple ? 'sí' : 'no'}</td><td>{c.detalle}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </Avanzado>
          ) : (
            <div style={{ marginTop: 16 }}><Ausente motivo={n.microestructura.motivo_ausencia} /></div>
          )}
        </Seccion>

        {/* ------------ on-chain ------------ */}
        <Seccion id="onchain" titulo="On-chain" esencial={prosaDeCliente(n.onchain.esencial.texto)} advertencias={n.onchain.esencial.advertencias}>
          {v && <Concentracion v={v} top10Neto={inf.onchain?.concentracion_top10_neta ?? null} />}
          <Avanzado>
            {/* El motor manda [] cuando no hay ninguna entidad etiquetada, así que
                esto puede no ser el objeto. Lo que no hay, no se muestra. */}
            {(() => {
              const et = etiquetadasDe(inf.onchain.entidades_etiquetadas)
              const porTipo = et && et.por_tipo && typeof et.por_tipo === 'object' ? Object.entries(et.por_tipo) : []
              const entidades = Array.isArray(et?.entidades) ? et.entidades : []
              return (
                <>
                  <div className="p-datos">
                    <Dato k="top-10 neto" v={pct(inf.onchain.concentracion_top10_neta)} sub={inf.onchain.cota_superior ? 'cota superior' : undefined} />
                    {inf.onchain.concentracion_top50 !== null && <Dato k="top-50" v={pct(inf.onchain.concentracion_top50)} tono="mudo" />}
                    <Dato k="HHI" v={num(inf.onchain.hhi, 0)} sub={inf.onchain.hhi_etiqueta} />
                    {et && <Dato k="entidades etiquetadas" v={`${et.n_etiquetadas} de ${et.n_etiquetadas + et.n_sin_etiquetar}`} sub={porTipo.length ? porTipo.map(([k, v]) => `${k} ${v}`).join(' · ') : undefined} />}
                    <Dato k="supply de referencia" v={num(inf.onchain.supply_referencia, 0)} tono="mudo" />
                  </div>
                  <p className="p-nota p-nota--regla">{inf.onchain.nota_cota}</p>
                  {entidades.length > 0 && (
                    <div className="p-tabla-wrap">
                      <table className="p-tabla">
                        <thead><tr><th>Entidad</th><th>tipo</th><th>dirección</th></tr></thead>
                        <tbody>{entidades.map((e) => (
                          <tr key={e.direccion}><td>{e.nombre}</td><td className="mono">{e.tipo}</td><td className="mono" style={{ wordBreak: 'break-all' }}>{e.direccion}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </>
              )
            })()}
          </Avanzado>
        </Seccion>

        {/* ------------ fundamentales ------------ */}
        <Seccion id="fundamentales" titulo="Fundamentales" esencial={prosaDeCliente(n.fundamentales.esencial.texto)} advertencias={n.fundamentales.esencial.advertencias}>
          {v && <><RevenueDiario v={v} total30d={inf.fundamentales?.revenue_protocolo_30d} movil={movil} /><TvlComparado v={v} /></>}
          <div className="p-datos" style={{ marginTop: 18 }}>
            <Dato k="puntaje" v={`${inf.fundamentales.puntaje_total} / 40`} tono="oro" />
            <Dato k="ingresos anualizados" v={usd(inf.fundamentales.revenue_protocolo)} sub={<>30d {usd(inf.fundamentales.revenue_protocolo_30d)}</>} />
            <Dato k="a holders" v={usd(inf.fundamentales.revenue_a_holders)} />
            <Dato k="fondos bloqueados" v={usd(inf.fundamentales.tvl)} />
            <Dato k="ingresos sobre capitalización" v={num(inf.fundamentales.revenue_sobre_mcap, 3)} />
          </div>
          <Avanzado>
            <div className="p-rubrica">
              {inf.fundamentales.rubrica.map((r) => (
                <div key={r.dimension} className="p-rubrica__row">
                  <span className="p-rubrica__dim">{r.dimension}</span>
                  <span className="p-rubrica__pts" aria-label={`${r.puntaje} de 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= r.puntaje ? 'is-on' : ''} />)}</span>
                  <span className="p-rubrica__ev">{r.evidencia}</span>
                </div>
              ))}
            </div>
            <dl className="p-kv">
              <dt>captura</dt><dd>{inf.fundamentales.mecanismo_captura.existe ? `${inf.fundamentales.mecanismo_captura.tipo} — ${inf.fundamentales.mecanismo_captura.descripcion}` : 'no existe'} {inf.fundamentales.mecanismo_captura.fuente_url && <a href={inf.fundamentales.mecanismo_captura.fuente_url} target="_blank" rel="noreferrer">fuente</a>}</dd>
              <dt>unlocks</dt><dd>{inf.fundamentales.unlocks.encontrado ? `${fecha(inf.fundamentales.unlocks.fecha)} · ${pct(inf.fundamentales.unlocks.pct_circulante)} del circulante` : 'no encontrado; cuenta como ausente'} {inf.fundamentales.unlocks.fuente_url && <a href={inf.fundamentales.unlocks.fuente_url} target="_blank" rel="noreferrer">fuente</a>}</dd>
              <dt>github</dt><dd>{inf.fundamentales.github.encontrado ? inf.fundamentales.github.repo : 'no encontrado'} {inf.fundamentales.github.fuente_url && <a href={inf.fundamentales.github.fuente_url} target="_blank" rel="noreferrer">repo</a>}</dd>
            </dl>
          </Avanzado>
        </Seccion>

        {/* El detalle del control de calidad interno no va a vista de cliente: su
            redacción es para la mesa de revisión. Se lee en /admin/bandeja. */}

        {/* ------------ benchmark ------------ */}
        {inf.benchmark_al_publicar && (
          <Seccion id="benchmark" titulo="Benchmark al publicar">
            {inf.benchmark_al_publicar.advertencia && <ul style={{ listStyle: 'none', padding: 0 }}><Adv>{inf.benchmark_al_publicar.advertencia}</Adv></ul>}
            <p className="p-nota mono" style={{ fontSize: '0.66rem', textTransform: 'none', letterSpacing: '0.04em', color: 'var(--ceniza-2)' }}>definición {inf.benchmark_al_publicar.estado_definicion} · congelada {fecha(inf.benchmark_al_publicar.congelado_en)}</p>
            <div className="p-bench" style={{ marginTop: 16 }}>
              <div className="p-bench__b">
                <span className="mono">B1 · canasta del universo</span>
                <span className="p-bench__v num">{num(inf.benchmark_al_publicar.b1_n)} monedas</span>
                <p className="p-bench__why">{inf.benchmark_al_publicar.b1_nota}</p>
              </div>
              <div className="p-bench__b"><span className="mono">B2 · regla técnica</span><span className="p-bench__v num">{inf.benchmark_al_publicar.b2_parametros.rapida_dias} / {inf.benchmark_al_publicar.b2_parametros.lenta_dias} días</span><p className="p-bench__why">precio de la gema al publicar: {precio(inf.benchmark_al_publicar.precio_gema_al_publicar)}</p></div>
            </div>
          </Seccion>
        )}

        {/* ------------ metadata de auditoría: sólo en avanzado; las fuentes con fecha, plegadas al pie en ambos ------------ */}
        <Avanzado>
          {inf.senales_sin_fuente.length > 0 && (
            <Seccion id="sin-fuente" titulo="Señales sin fuente">
              <dl className="p-kv" style={{ marginTop: 6 }}>{inf.senales_sin_fuente.map((s) => <div key={s.campo} style={{ display: 'contents' }}><dt>{s.campo}</dt><dd>{s.motivo}</dd></div>)}</dl>
            </Seccion>
          )}
        </Avanzado>
        <FuentesAlPie fuentes={inf.fuentes} />
      </div>
          </div>
        </details>
      </div>
    </>
  )
}

function FuentesAlPie({ fuentes }: { fuentes: Informe['fuentes'] }) {
  const { nivel } = useNivel()
  return <TablaFuentes fuentes={fuentes} detalle={nivel === 'avanzado'} />
}

/* Sólo el titular: lo que ve un visitante de una gema. */
function SoloTitular({ inf }: { inf: Informe }) {
  return (
    <div className="shell">
      <div className="p-det__head">
        <div>
          <h1 className="p-det__sym">{inf.simbolo}<small>{inf.nombre} · {inf.cadena}</small></h1>
          <div className="p-det__tags"><TierBadge tier={inf.tier} size={22} /><span className="mono" style={{ color: 'var(--ceniza-2)' }}>publicada {fecha(inf.fecha_publicacion)}</span></div>
          <RiesgoLlano inf={inf} />
        </div>
      </div>
      <Puerta seccion="gemas.informe" que="La tesis, las dos varas lado a lado, los escenarios con su catalizador, el riesgo de cola, el on-chain, los fundamentales y las objeciones del Escéptico." />
    </div>
  )
}

export function InformeDetalle({ tipo }: { tipo: 'gema' | 'analisis' }) {
  const { id } = useParams()
  const { rol } = useRol()
  const gemas = useGemas()
  const todo = useGemasTodo()
  const analisis = useAnalisis()
  const st = tipo === 'gema' ? gemas : analisis
  const anticipada = tipo === 'gema' && todo.estado === 'ok' ? todo.datos.anticipadas.find((a) => a.id === id) : undefined
  const volver = tipo === 'gema' ? '/gemas' : '/analisis'
  const label = tipo === 'gema' ? 'Gemas' : 'Análisis'
  return (
    <Cargando st={st}>
      {(rows) => {
        const inf = rows.find((r) => r.id === id)
        if (!inf) {
          return (
            <div className="shell">
              <Volver to={volver} label={label} />
              {anticipada
                ? <div style={{ marginTop: 20 }}><Puerta seccion="gemas.anticipado" que={`${anticipada.simbolo} · ${anticipada.nombre} es una gema nueva: el plan Pro la lee desde ya; para tu plan queda disponible el ${fechaHora(anticipada.disponible_desde)}.`} /></div>
                : <div className="p-vacio" style={{ marginTop: 20 }}><EmptyState kind="sin-datos" title="No hay un informe con ese identificador." detail={id} /></div>}
            </div>
          )
        }
        const abierto = tipo === 'analisis' || puede(rol, 'gemas.informe')
        return (
          <ProveedorNivel>
            <div className="shell" style={{ marginBottom: 18 }}><Volver to={volver} label={label} /></div>
            {abierto ? <Cuerpo inf={inf} esAnalisis={tipo === 'analisis'} /> : <SoloTitular inf={inf} />}
          </ProveedorNivel>
        )
      }}
    </Cargando>
  )
}

export const GemaDetalle = () => <InformeDetalle tipo="gema" />
