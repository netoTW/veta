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
import type { Advertencia, Escenario, Informe, Invalidacion, Objecion, VaraRevenue } from '../../lib/contrato'
import { EmptyState } from '../../ui/EmptyState'
import { Cifras, Prosa, RiesgoLlano } from '../cifras'
import { estadoEconomicoLlano } from '../../lib/lenguaje'

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
      <p className="p-inval__texto">{inv.texto}</p>
      <span className="p-inval__meta">
        <span>fuente {inv.fuente || '—'}</span>
      </span>
    </div>
  )
}

/** Sólo se ve en esencial (el complemento de <Avanzado>). */
function NivelEsencial({ children }: { children: React.ReactNode }) {
  const { nivel } = useNivel()
  return nivel === 'esencial' ? <>{children}</> : null
}

/* ---------- secciones ---------- */
function Seccion({ id, titulo, calidad, esencial, advertencias, children }: {
  id: string; titulo: string; calidad?: string; esencial?: string; advertencias?: Advertencia[]; children?: React.ReactNode
}) {
  return (
    <section className="p-seccion" id={id} aria-labelledby={`${id}-h`}>
      <div className="p-seccion__head">
        <h2 className="p-seccion__titulo" id={`${id}-h`}>{titulo}</h2>
        {calidad && <span className={`mono p-seccion__calidad is-${calidad}`}>calidad {calidad}</span>}
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
        <div className="p-vara__h"><h3>Por revenue</h3><span className="mono">valuación relativa</span></div>
        <Ausente motivo={v.no_disponible_motivo ?? 'sin valuación relativa disponible'} />
        {esAnalisis && <p className="p-nota">Sin comparables no hay magnitud, y una magnitud sin respaldo no se publica.</p>}
      </div>
    )
  }
  return (
    <div className="p-vara">
      <div className="p-vara__h"><h3>Por revenue</h3><span className="mono">{v.metrica}</span></div>
      <div className="p-datos">
        <Dato k="esta moneda" v={num(v.multiplo_moneda, 3)} tono="oro" />
        <Dato k="mediana de pares" v={num(v.mediana, 3)} sub={<>p25 {num(v.p25, 3)} · p75 {num(v.p75, 3)}</>} />
        <Dato k="brecha" v={v.hay_brecha ? `${mult(v.rango_min)} – ${mult(v.rango_max)}` : 'no hay'} tono={v.hay_brecha ? 'pos' : 'mudo'} sub={v.hay_brecha ? 'lo que implicaría cerrar la brecha' : 'cotiza en línea con sus pares'} />
      </div>
      {v.objetada_por_esceptico && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <Adv>Brecha objetada por el Escéptico: {v.objecion_citada}</Adv>
        </ul>
      )}
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
          <p className="p-nota">Criterio: {v.criterio}</p>
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
            <div><span className="mono">De dónde sale la magnitud</span>{e.magnitud_origen}</div>
            <div><span className="mono">Confianza del horizonte</span>{e.confianza_horizonte}</div>
          </>
        )}
      </div>
    </div>
  )
}

function ObjecionFila({ o }: { o: Objecion }) {
  const { nivel } = useNivel()
  const urls = o.fuente.split('|').map((s) => s.trim()).filter((s) => /^https?:/.test(s))
  return (
    <div className="p-obj">
      <span className={`p-obj__cambia p-obj__cambia--${o.que_conclusion_cambia}`}>cambia<br />{o.que_conclusion_cambia}</span>
      <div className="p-obj__b">
        <p className="p-obj__t">{o.objecion}</p>
        {nivel === 'avanzado' && (
          <>
            <p className="p-obj__ev"><span className="mono">Evidencia</span>{o.evidencia}</p>
            <p className="p-obj__ev"><span className="mono">Cambio propuesto</span>{o.cambio_propuesto}</p>
            {urls.length > 0 && <p className="p-obj__fuente">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{u}</a>).reduce<React.ReactNode[]>((acc, x, i) => (i ? [...acc, ' · ', x] : [x]), [])}</p>}
            {!urls.length && <p className="p-obj__ev"><span className="mono">Fuente</span>{o.fuente}</p>}
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

export function Cuerpo({ inf, esAnalisis }: { inf: Informe; esAnalisis: boolean }) {
  const vis = useVisuales(inf.id)
  const v = vis.estado === 'ok' ? vis.datos : null
  const movil = useMovil()
  const f = inf.ficha_esencial
  const n = inf.niveles
  const cal = inf.calidad_por_seccion
  const ranges = inf.escenarios.map((e) => ({ tipo: e.tipo, min: e.rango_min, max: e.rango_max }))
  const rv = inf.varas.revenue as VaraRevenue & { no_disponible_motivo?: string }
  const rf = inf.varas.reflexiva

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
            <Prosa inf={inf} campo="ficha_esencial.tesis_una_linea" texto={f.tesis_una_linea} className="p-det__tesis" />
          </div>
          <div className="p-det__precio">
            <Dato k="precio de referencia" v={precio(f.precio_y_fecha_referencia.precio_usd)} sub={<>{fecha(f.precio_y_fecha_referencia.fecha)} · {esAnalisis ? 'analizada' : 'publicada'} {fecha(inf.fecha_publicacion)}</>} />
          </div>
        </div>

        <Cifras inf={inf} />
        {!esAnalisis && <><MarcadorDeGema gemaId={inf.id} horizonteDias={inf.escenarios.find((e) => e.tipo === 'bull')?.horizonte_dias ?? inf.escenarios.find((e) => e.tipo === 'bull_reflexivo')?.horizonte_dias} /><PrediccionGema gemaId={inf.id} simbolo={inf.simbolo} /></>}

        <div className="p-ficha">
          <div className="p-ficha__b">
            <span className="mono">Catalizadores · {f.catalizadores.length}</span>
            {f.catalizadores.length ? <ul>{f.catalizadores.map((c, i) => <li key={i}>{c}</li>)}</ul> : 'ninguno identificado'}
          </div>
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

        <Advertencias items={f.advertencias} />
      </div>

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
        <Seccion id="varas" titulo="Las dos varas" calidad={cal['3_estructura_mercado']} esencial={n.varas.esencial.texto} advertencias={n.varas.esencial.advertencias}>
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
        <Seccion id="escenarios" titulo="Escenarios" esencial={n.escenarios.esencial.texto} advertencias={n.escenarios.esencial.advertencias}>
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
        <Seccion id="asimetria" titulo="Asimetría" esencial={n.asimetria.esencial.texto} advertencias={n.asimetria.esencial.advertencias}>
          {n.asimetria.disponible ? (
            <>
              <div className="p-datos" style={{ marginTop: 18 }}>
                <Dato k="riesgo" v={pct(inf.asimetria.riesgo)} tono="neg" sub={inf.asimetria.riesgo_origen} />
                <Dato k="recompensa" v={pct(inf.asimetria.recompensa)} tono="pos" sub={inf.asimetria.recompensa_origen} />
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
        <Seccion id="riesgo" titulo="Riesgo de cola" calidad={cal['4_riesgo_cola']} esencial={n.riesgo.esencial.texto} advertencias={n.riesgo.esencial.advertencias}>
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
              <dt>método</dt><dd>{inf.riesgo.metodo}</dd>
              <dt>ν</dt><dd className="num">{num(inf.riesgo.nu, 2)}</dd>
              <dt>serie</dt><dd className="num">{num(inf.riesgo.dias_serie)} días · confianza {inf.riesgo.confianza}</dd>
              {inf.riesgo.limites_declarados.map((l, i) => <div key={i} style={{ display: 'contents' }}><dt>límite declarado</dt><dd>{l}</dd></div>)}
            </dl>
            <FuenteChip fuente={inf.riesgo.fuente} timestamp={inf.riesgo.timestamp} />
          </Avanzado>
        </Seccion>

        {/* ------------ microestructura ------------ */}
        <Seccion id="micro" titulo="Microestructura" esencial={n.microestructura.esencial.texto} advertencias={n.microestructura.esencial.advertencias}>
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
        <Seccion id="onchain" titulo="On-chain" calidad={cal['6_onchain']} esencial={n.onchain.esencial.texto} advertencias={n.onchain.esencial.advertencias}>
          {v && <Concentracion v={v} top10Neto={inf.onchain?.concentracion_top10_neta ?? null} />}
          <Avanzado>
            <div className="p-datos">
              <Dato k="top-10 neto" v={pct(inf.onchain.concentracion_top10_neta)} sub={inf.onchain.cota_superior ? 'cota superior' : undefined} />
              <Dato k="top-50" v={inf.onchain.concentracion_top50 === null ? 'no calculable' : pct(inf.onchain.concentracion_top50)} tono="mudo" />
              <Dato k="HHI" v={num(inf.onchain.hhi, 0)} sub={inf.onchain.hhi_etiqueta} />
              <Dato k="entidades etiquetadas" v={`${inf.onchain.entidades_etiquetadas.n_etiquetadas} de ${inf.onchain.entidades_etiquetadas.n_etiquetadas + inf.onchain.entidades_etiquetadas.n_sin_etiquetar}`} sub={Object.entries(inf.onchain.entidades_etiquetadas.por_tipo).map(([k, v]) => `${k} ${v}`).join(' · ')} />
              <Dato k="supply de referencia" v={num(inf.onchain.supply_referencia, 0)} tono="mudo" />
            </div>
            <p className="p-nota p-nota--regla">{inf.onchain.nota_cota}</p>
            {inf.onchain.entidades_etiquetadas.entidades.length > 0 && (
              <div className="p-tabla-wrap">
                <table className="p-tabla">
                  <thead><tr><th>Entidad</th><th>tipo</th><th>dirección</th></tr></thead>
                  <tbody>{inf.onchain.entidades_etiquetadas.entidades.map((e) => (
                    <tr key={e.direccion}><td>{e.nombre}</td><td className="mono">{e.tipo}</td><td className="mono" style={{ wordBreak: 'break-all' }}>{e.direccion}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Avanzado>
        </Seccion>

        {/* ------------ fundamentales ------------ */}
        <Seccion id="fundamentales" titulo="Fundamentales" calidad={cal['5_fundamentales']} esencial={n.fundamentales.esencial.texto} advertencias={n.fundamentales.esencial.advertencias}>
          {v && <><RevenueDiario v={v} total30d={inf.fundamentales?.revenue_protocolo_30d} movil={movil} /><TvlComparado v={v} /></>}
          <div className="p-datos" style={{ marginTop: 18 }}>
            <Dato k="puntaje" v={`${inf.fundamentales.puntaje_total} / 40`} tono="oro" />
            <Dato k="revenue anualizado" v={usd(inf.fundamentales.revenue_protocolo)} sub={<>30d {usd(inf.fundamentales.revenue_protocolo_30d)}</>} />
            <Dato k="a holders" v={usd(inf.fundamentales.revenue_a_holders)} />
            <Dato k="TVL" v={usd(inf.fundamentales.tvl)} />
            <Dato k="revenue / mcap" v={num(inf.fundamentales.revenue_sobre_mcap, 3)} />
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

        {/* ------------ escéptico ------------ */}
        <Seccion id="esceptico" titulo="Objeciones del Escéptico">
          <p className="p-esencial">{inf.esceptico.objeciones.length} objeciones · {inf.esceptico.objeciones.filter((o) => o.que_conclusion_cambia === 'tier').length} cambiarían el tier · {inf.esceptico.objeciones.filter((o) => o.que_conclusion_cambia === 'tesis').length} la tesis{inf.esceptico.rechaza ? ' · RECHAZA' : ''}</p>
          <div style={{ marginTop: 16 }}>{inf.esceptico.objeciones.map((o, i) => <ObjecionFila key={i} o={o} />)}</div>
          {inf.esceptico.veredicto_bull && (
            <div style={{ marginTop: 20 }}>
              <span className="mono" style={{ color: 'var(--ceniza-2)', display: 'block', marginBottom: 8 }}>Veredicto sobre el escenario alcista · comparables {inf.esceptico.comparables_son_comparables ? 'son comparables' : 'NO son comparables'}</span>
              <blockquote className="p-cita">{inf.esceptico.veredicto_bull}</blockquote>
            </div>
          )}
        </Seccion>

        {/* ------------ benchmark ------------ */}
        {inf.benchmark_al_publicar && (
          <Seccion id="benchmark" titulo="Benchmark al publicar">
            {inf.benchmark_al_publicar.advertencia && <ul style={{ listStyle: 'none', padding: 0 }}><Adv>{inf.benchmark_al_publicar.advertencia}</Adv></ul>}
            <p className="p-nota mono" style={{ fontSize: '0.66rem', textTransform: 'none', letterSpacing: '0.04em', color: 'var(--ceniza-2)' }}>definición {inf.benchmark_al_publicar.estado_definicion} · congelada {fecha(inf.benchmark_al_publicar.congelado_en)}</p>
            <div className="p-bench" style={{ marginTop: 16 }}>
              <div className="p-bench__b">
                <span className="mono">B1 · canasta del universo</span>
                {inf.benchmark_al_publicar.b1_n > 0
                  ? <span className="p-bench__v num">{num(inf.benchmark_al_publicar.b1_n)} monedas</span>
                  : <span className="p-bench__v is-nomedible">No medible</span>}
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
