/* ============================================================================
   Terminal v2 · los gráficos (lightweight-charts), sin React dentro.

   Pocos y pensados para una pregunta cada uno:
     A  precio     ¿quién mueve el precio y dónde está la fuerza? velas, perfil de
                   volumen al costado, mapa de liquidaciones, marcas de las capas
        flujo      delta acumulado del spot y de los futuros, con el interés abierto tenue
     B  fundamento ¿el negocio crece más rápido que el precio? fees, revenue y holders
                   revenue por semana (de tenue a intenso), cap. y su categoría en base 100
     C  redes      ¿entra gente real? menciones apiladas (personas, bots, granjas) con el
                   precio encima; y el tono de las personas en su franja
        cadena     flujo con exchanges: entra en rojo (arriba), sale en esmeralda (abajo)
        derivados  uno por serie, cada uno con su eje: interés abierto, funding por
                   intervalo, liquidaciones por lado, largos contra cortos
   Todos comparten eje de tiempo, cruz y zoom por la Sincronia de la ficha. Cada
   constructor devuelve las series vivas (para la leyenda con la cruz) y, el de
   precio, `capas()` para prender y apagar sin rehacer el gráfico.
   ========================================================================== */
import { AreaSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart, createSeriesMarkers, type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesType, type Time, type UTCTimestamp } from 'lightweight-charts'
import { C, FUENTE_MONO, rgba } from '../charts/tema'
import { fmt } from '../formato'
import { MapaLiq, Perfil, RielRadar, RotulosDer, Verticales } from './primitivas'
import type { Capa, Ficha2, Punto } from './contrato'

export interface SerieV { id: string; etiqueta: string; color: string; api: ISeriesApi<SeriesType, Time>; unidad: string; forma: 'linea' | 'barra' | 'vela'; /** para las apiladas: el valor propio, no el acumulado que se dibuja */ valor?: (t: number | null) => number | null }
export interface Vivo2 { chart: IChartApi; series: SerieV[]; ancla: ISeriesApi<SeriesType, Time>; capas?: (c: Set<Capa>) => void; /** el precio en vivo mueve la vela en curso */ alPrecio?: (p: number) => void; destruir: () => void }
const tt = (s: number) => s as UTCTimestamp
const orden = <T extends { time: UTCTimestamp }>(xs: T[]) => { xs.sort((a, b) => a.time - b.time); return xs.filter((x, i) => !i || x.time !== xs[i - 1].time) }
const lineas = (ps: Punto[]) => orden(ps.map(([t, v]) => ({ time: tt(t), value: v })))
export const esTelefono = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 760px)').matches

function crear(el: HTMLElement, o: { horas?: boolean; izq?: boolean; margen?: { top: number; bottom: number } } = {}): IChartApi {
  const tel = esTelefono()
  return createChart(el, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.ceniza, fontFamily: FUENTE_MONO, fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(236,230,216,0.05)', style: LineStyle.Dashed } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: rgba(C.hueso, 0.35), width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.roca3 }, horzLine: { color: rgba(C.hueso, 0.3), width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.roca3 } },
    rightPriceScale: { borderColor: C.hairline, scaleMargins: o.margen ?? { top: 0.1, bottom: 0.08 }, entireTextOnly: true, minimumWidth: 64 },
    leftPriceScale: { visible: !!o.izq, borderColor: C.hairline, scaleMargins: o.margen ?? { top: 0.1, bottom: 0.08 }, entireTextOnly: true },
    timeScale: { borderColor: C.hairline, timeVisible: !!o.horas, secondsVisible: false, rightOffset: 2, minBarSpacing: 1.2, lockVisibleTimeRangeOnResize: true },
    localization: { locale: 'es-ES', priceFormatter: (v: number) => fmt(v) },
    // en el teléfono, arrastrar el dedo mueve la cruz (y se lee el tooltip con todas las series); el zoom es con dos dedos
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: !tel, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    kineticScroll: { touch: false, mouse: false },
  })
}

/* ---------- A · precio ---------- */
export function precio(el: HTMLElement, f: Ficha2, op: { capas: Set<Capa>; comparar: { puntos: Punto[]; etiqueta: string } | null }): Vivo2 {
  const chart = crear(el, { margen: { top: 0.08, bottom: 0.12 } })
  const m = f.movimiento
  const velas = chart.addSeries(CandlestickSeries, { upColor: C.esm, downColor: C.rojo, wickUpColor: C.esm, wickDownColor: C.rojo, borderVisible: false, priceLineVisible: false, lastValueVisible: false }, 0)
  velas.setData(orden(m.velas.map((v) => ({ time: tt(v.t), open: v.o, high: v.h, low: v.l, close: v.c }))))
  const series: SerieV[] = [{ id: 'precio', etiqueta: 'Precio', color: C.hueso, api: velas, unidad: '', forma: 'vela' }]
  const ultimo = m.velas[m.velas.length - 1]?.c ?? null
  const actual = ultimo !== null ? velas.createPriceLine({ price: ultimo, color: rgba(C.hueso, 0.55), lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: '', axisLabelColor: C.hueso, axisLabelTextColor: C.roca }) : null
  // la vela en curso: la última se estira con cada precio; pasado su período, abre la siguiente
  let enCurso = m.velas.length ? { ...m.velas[m.velas.length - 1] } : null
  const periodo = m.velas.length > 1 ? m.velas[m.velas.length - 1].t - m.velas[m.velas.length - 2].t : 86_400
  const alPrecio = (p: number) => {
    if (!enCurso) return
    const ahora = Date.now() / 1000
    if (ahora >= enCurso.t + periodo) enCurso = { t: enCurso.t + periodo, o: enCurso.c, h: Math.max(enCurso.c, p), l: Math.min(enCurso.c, p), c: p, v: null }
    else enCurso = { ...enCurso, h: Math.max(enCurso.h, p), l: Math.min(enCurso.l, p), c: p }
    try { velas.update({ time: tt(enCurso.t), open: enCurso.o, high: enCurso.h, low: enCurso.l, close: enCurso.c }) } catch { /* fuera de orden: se ignora */ }
    actual?.applyOptions({ price: p })
  }
  // «comparar contra»: la otra serie reescalada al precio de esta moneda al inicio del rango
  if (op.comparar?.puntos.length && m.velas.length) {
    const base = op.comparar.puntos.find((p) => p[0] >= m.velas[0].t) ?? op.comparar.puntos[0]
    const k = m.velas[0].c / base[1]
    const cmp = chart.addSeries(LineSeries, { color: C.oroLuz, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0)
    cmp.setData(lineas(op.comparar.puntos.filter((p) => p[0] >= m.velas[0].t).map(([t, v]) => [t, v * k] as Punto)))
    series.push({ id: 'comparar', etiqueta: op.comparar.etiqueta, color: C.oroLuz, api: cmp, unidad: '', forma: 'linea' })
  }
  velas.attachPrimitive(new Perfil(m.perfil.niveles, m.perfil.poc))
  const liq = new MapaLiq(m.liquidaciones?.niveles ?? []); velas.attachPrimitive(liq)
  const radarPorDia = new Map<number, number>()
  const dias = m.velas.map((v) => v.t)
  const enVela = (t: number) => { let r = dias[0] ?? t; for (const d of dias) { if (d <= t) r = d; else break } return r }
  for (const x of m.marcas.filter((x) => x.tipo === 'radar')) { const d = enVela(x.t); radarPorDia.set(d, (radarPorDia.get(d) ?? 0) + 1) }
  const riel = new RielRadar(radarPorDia); velas.attachPrimitive(riel)
  const cats = new Verticales(m.marcas.filter((x) => x.tipo === 'catalizador').map((x) => ({ t: enVela(x.t), etiqueta: x.etiqueta }))); velas.attachPrimitive(cats)
  let marcas: ISeriesMarkersPluginApi<Time> | null = null
  let lineasPrecio: IPriceLine[] = []
  let rotulos: RotulosDer | null = null
  const capas = (c: Set<Capa>) => {
    liq.mostrar(c.has('liquidaciones')); riel.mostrar(c.has('radar')); cats.mostrar(c.has('catalizadores'))
    // las entradas y salidas: sólo la forma bajo la vela; su texto se lee en la cruz
    const ms = c.has('posiciones') ? m.marcas.filter((x) => x.tipo === 'entrada' || x.tipo === 'salida').map((x) => ({ time: tt(enVela(x.t)), position: x.tipo === 'entrada' ? 'belowBar' as const : 'aboveBar' as const, shape: x.tipo === 'entrada' ? 'arrowUp' as const : 'arrowDown' as const, color: x.tipo === 'entrada' ? C.esmLuz : C.hueso, size: 1.1 })).sort((a, b) => (a.time as number) - (b.time as number)) : []
    if (!marcas) marcas = createSeriesMarkers(velas, ms); else marcas.setMarkers(ms)
    for (const l of lineasPrecio) velas.removePriceLine(l)
    if (rotulos) { velas.detachPrimitive(rotulos); rotulos = null }
    const ns = m.niveles.filter((n) => c.has(n.capa))
    lineasPrecio = ns.map((n) => velas.createPriceLine({ price: n.precio, color: n.tipo === 'stop' ? C.rojoLuz : n.tipo === 'gatillo' ? C.oro : C.esm, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: '' }))
    if (ns.length) { rotulos = new RotulosDer(ns.map((n) => ({ precio: n.precio, texto: `${n.etiqueta} · ${fmt(n.precio)}`.toUpperCase(), color: n.tipo === 'stop' ? C.rojoLuz : C.oroLuz }))); velas.attachPrimitive(rotulos) }
  }
  capas(op.capas)
  chart.timeScale().fitContent()
  return { chart, series, ancla: velas, capas, alPrecio, destruir: () => chart.remove() }
}

/* ---------- A · flujo: delta acumulado e interés abierto ---------- */
export function flujo(el: HTMLElement, f: Ficha2): Vivo2 {
  const m = f.movimiento
  const chart = crear(el, { izq: m.interes_abierto.length > 0, margen: { top: 0.14, bottom: 0.06 } })
  const series: SerieV[] = []
  if (m.interes_abierto.length) {
    const oi = chart.addSeries(AreaSeries, { priceScaleId: 'left', lineColor: rgba(C.ceniza, 0.4), topColor: rgba(C.ceniza, 0.16), bottomColor: rgba(C.ceniza, 0.02), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    oi.setData(lineas(m.interes_abierto)); series.push({ id: 'oi', etiqueta: 'Interés abierto', color: C.ceniza, api: oi, unidad: 'US$', forma: 'barra' })
  }
  const spot = chart.addSeries(LineSeries, { color: C.esmLuz, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
  spot.setData(lineas(m.delta_spot)); series.unshift({ id: 'spot', etiqueta: 'Delta acumulado spot', color: C.esmLuz, api: spot, unidad: 'US$', forma: 'linea' })
  if (m.delta_futuros.length) {
    const fut = chart.addSeries(LineSeries, { color: C.oro, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    fut.setData(lineas(m.delta_futuros)); series.splice(1, 0, { id: 'fut', etiqueta: 'Delta acumulado futuros', color: C.oro, api: fut, unidad: 'US$', forma: 'linea' })
  }
  chart.timeScale().fitContent()
  return { chart, series, ancla: spot, destruir: () => chart.remove() }
}

/* ---------- derivados en detalle: uno por serie, cada uno con su eje ---------- */
export type Derivado = 'interes' | 'funding' | 'liquidaciones' | 'largos_cortos'
export function derivado(el: HTMLElement, f: Ficha2, cual: Derivado): Vivo2 | null {
  const d = f.movimiento.derivados
  if (!d) return null
  const chart = crear(el, { horas: cual === 'funding', margen: { top: 0.1, bottom: 0.1 } })
  const series: SerieV[] = []
  if (cual === 'interes') {
    const s = chart.addSeries(AreaSeries, { lineColor: C.hueso, topColor: rgba(C.hueso, 0.18), bottomColor: rgba(C.hueso, 0.01), lineWidth: 2, priceLineVisible: false, lastValueVisible: true })
    s.setData(lineas(d.interes_abierto)); series.push({ id: 'oi', etiqueta: 'Interés abierto', color: C.hueso, api: s, unidad: 'US$', forma: 'linea' })
  } else if (cual === 'funding') {
    // positivo arriba (pagan los largos), negativo abajo (pagan los cortos); el valor real de cada intervalo, en %
    const s = chart.addSeries(HistogramSeries, { base: 0, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: 'custom', formatter: (v: number) => `${fmt(v)} %`, minMove: 0.0001 } })
    s.setData(orden(d.funding.map((x) => ({ time: tt(x.t), value: x.v, color: x.v >= 0 ? rgba(C.esm, 0.75) : rgba(C.rojoLuz, 0.75) }))))
    series.push({ id: 'funding', etiqueta: 'Funding por intervalo', color: C.esmLuz, api: s, unidad: '%', forma: 'barra' })
  } else if (cual === 'liquidaciones') {
    const cortos = chart.addSeries(HistogramSeries, { base: 0, color: rgba(C.esm, 0.7), priceLineVisible: false, lastValueVisible: false })
    cortos.setData(orden(d.liquidaciones.map((x) => ({ time: tt(x.t), value: x.cortos }))))
    const largos = chart.addSeries(HistogramSeries, { base: 0, color: rgba(C.rojoLuz, 0.7), priceLineVisible: false, lastValueVisible: false })
    largos.setData(orden(d.liquidaciones.map((x) => ({ time: tt(x.t), value: -x.largos }))))
    series.push({ id: 'cortos', etiqueta: 'Cortos liquidados', color: C.esmLuz, api: cortos, unidad: 'US$', forma: 'barra' }, { id: 'largos', etiqueta: 'Largos liquidados', color: C.rojoLuz, api: largos, unidad: 'US$ (abajo)', forma: 'barra' })
  } else {
    const cu = chart.addSeries(LineSeries, { color: C.hueso, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    cu.setData(orden(d.largos_cortos.flatMap((x) => (x.cuentas === null ? [] : [{ time: tt(x.t), value: x.cuentas }]))))
    cu.createPriceLine({ price: 1, color: rgba(C.oro, 0.6), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: '', axisLabelColor: C.oro, axisLabelTextColor: C.roca })
    const po = chart.addSeries(LineSeries, { color: C.oroLuz, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
    po.setData(orden(d.largos_cortos.flatMap((x) => (x.posiciones === null ? [] : [{ time: tt(x.t), value: x.posiciones }]))))
    series.push({ id: 'cuentas', etiqueta: 'Cuentas', color: C.hueso, api: cu, unidad: '', forma: 'linea' }, { id: 'posiciones', etiqueta: 'Posiciones', color: C.oroLuz, api: po, unidad: '', forma: 'linea' })
  }
  chart.timeScale().fitContent()
  return { chart, series, ancla: series[0].api, destruir: () => chart.remove() }
}

/* ---------- B · fundamento ---------- */
export function fundamento(el: HTMLElement, f: Ficha2): Vivo2 {
  const fu = f.fundamento
  const chart = crear(el, { izq: true, margen: { top: 0.08, bottom: 0.02 } })
  // anidadas de tenue a intenso: las fees contienen al revenue, que contiene lo que llega al token
  const capa = (id: string, etiqueta: string, color: string, k: 'fees' | 'revenue' | 'holders') => {
    const s = chart.addSeries(HistogramSeries, { color, base: 0, priceLineVisible: false, lastValueVisible: false })
    s.setData(orden(fu.semanas.flatMap((w) => (w[k] === null ? [] : [{ time: tt(w.t), value: w[k]! }]))))
    return { id, etiqueta, color, api: s, unidad: 'US$', forma: 'barra' as const }
  }
  const series: SerieV[] = [capa('fees', 'Fees (pagan los usuarios)', '#2B3035', 'fees'), capa('revenue', 'Revenue (se queda el protocolo)', C.esmSombra, 'revenue'), capa('holders', 'Holders revenue (llega al token)', C.esmLuz, 'holders')]
  series[2].api.applyOptions({ color: rgba(C.esmLuz, 0.85) })
  if (fu.cap_base100.length) {
    const mc = chart.addSeries(LineSeries, { priceScaleId: 'left', color: C.hueso, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    mc.setData(lineas(fu.cap_base100)); series.push({ id: 'cap', etiqueta: 'Capitalización, base 100', color: C.hueso, api: mc, unidad: 'base 100', forma: 'linea' })
  }
  if (fu.categoria_base100.length) {
    const ca = chart.addSeries(LineSeries, { priceScaleId: 'left', color: C.oro, lineWidth: 1, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false })
    ca.setData(lineas(fu.categoria_base100)); series.push({ id: 'cat', etiqueta: 'Mediana de su categoría, base 100', color: C.oro, api: ca, unidad: 'base 100', forma: 'linea' })
  }
  chart.timeScale().fitContent()
  return { chart, series, ancla: series[0].api, destruir: () => chart.remove() }
}

/* ---------- C · redes ---------- */
export function redes(el: HTMLElement, f: Ficha2): Vivo2 {
  const r = f.redes
  const chart = crear(el, { izq: r.precio.length > 0, margen: { top: 0.08, bottom: 0.02 } })
  // apiladas: se dibuja cada total de abajo hacia arriba, el más alto primero
  const pila = (color: string, valor: (x: (typeof r.menciones)[number]) => number) => {
    const s = chart.addSeries(HistogramSeries, { color, base: 0, priceLineVisible: false, lastValueVisible: false })
    s.setData(orden(r.menciones.map((x) => ({ time: tt(x.t), value: valor(x) }))))
    return s
  }
  const g = pila(C.rojo, (x) => x.personas + x.bots + x.granjas)
  const b = pila('#3A3F43', (x) => x.personas + x.bots)
  const p = pila(C.esm, (x) => x.personas)
  const en = (t: number | null) => { const xs = r.menciones; if (!xs.length) return null; if (t === null) return xs[xs.length - 1]; let x: (typeof xs)[number] | null = null; for (const m of xs) { if (m.t <= t) x = m; else break } return x }
  const series: SerieV[] = [
    { id: 'personas', etiqueta: 'Personas', color: C.esm, api: p, unidad: '', forma: 'barra', valor: (t) => en(t)?.personas ?? null },
    { id: 'bots', etiqueta: 'Bots informativos', color: C.ceniza, api: b, unidad: '', forma: 'barra', valor: (t) => en(t)?.bots ?? null },
    { id: 'granjas', etiqueta: 'Granjas y shill', color: C.rojoLuz, api: g, unidad: '', forma: 'barra', valor: (t) => en(t)?.granjas ?? null },
  ]
  if (r.precio.length) {
    const pr = chart.addSeries(LineSeries, { priceScaleId: 'left', color: C.hueso, lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    pr.setData(lineas(r.precio)); series.push({ id: 'precio', etiqueta: 'Precio', color: C.hueso, api: pr, unidad: '', forma: 'linea' })
  }
  chart.timeScale().fitContent()
  return { chart, series, ancla: p, destruir: () => chart.remove() }
}
export function tono(el: HTMLElement, f: Ficha2): Vivo2 {
  const chart = crear(el, { margen: { top: 0.1, bottom: 0.1 } })
  chart.applyOptions({ timeScale: { visible: false }, rightPriceScale: { visible: true, ticksVisible: false } })
  const s = chart.addSeries(HistogramSeries, { base: 0, priceLineVisible: false, lastValueVisible: false })
  s.setData(orden(f.redes.tono.map(([t, v]) => ({ time: tt(t), value: v, color: v >= 0 ? rgba(C.esm, 0.8) : rgba(C.rojo, 0.85) }))))
  chart.timeScale().fitContent()
  return { chart, series: [{ id: 'tono', etiqueta: 'Tono de las personas', color: C.esmLuz, api: s, unidad: '−1…1', forma: 'barra' }], ancla: s, destruir: () => chart.remove() }
}

/* ---------- 5 · flujo con exchanges ---------- */
export function cadena(el: HTMLElement, f: Ficha2): Vivo2 {
  const chart = crear(el, { margen: { top: 0.08, bottom: 0.08 } })
  const entra = chart.addSeries(HistogramSeries, { base: 0, color: rgba(C.rojo, 0.85), priceLineVisible: false, lastValueVisible: false })
  entra.setData(orden(f.onchain.flujo.map((x) => ({ time: tt(x.t), value: x.entra }))))
  const sale = chart.addSeries(HistogramSeries, { base: 0, color: rgba(C.esm, 0.85), priceLineVisible: false, lastValueVisible: false })
  sale.setData(orden(f.onchain.flujo.map((x) => ({ time: tt(x.t), value: -x.sale }))))
  entra.createPriceLine({ price: 0, color: rgba(C.hueso, 0.2), lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: '' })
  chart.timeScale().fitContent()
  return { chart, series: [{ id: 'entra', etiqueta: 'Entra a exchanges', color: C.rojoLuz, api: entra, unidad: f.activo, forma: 'barra' }, { id: 'sale', etiqueta: 'Sale de exchanges', color: C.esmLuz, api: sale, unidad: `${f.activo} (abajo)`, forma: 'barra' }], ancla: entra, destruir: () => chart.remove() }
}

/** El valor de una serie en un tiempo (lo que lee la leyenda con la cruz): el último punto hasta ahí. */
export function valorEn(s: SerieV, t: number | null): number | null {
  if (s.valor) return s.valor(t)
  const datos = s.api.data() as unknown as { time: number; value?: number; close?: number }[]
  if (!datos.length) return null
  let d = datos[datos.length - 1]
  if (t !== null) { let x: typeof d | null = null; for (const p of datos) { if (p.time <= t) x = p; else break } if (!x) return null; d = x }
  return typeof d.close === 'number' ? d.close : typeof d.value === 'number' ? Math.abs(d.value) * (s.unidad.includes('abajo') ? 1 : Math.sign(d.value) || 1) : null
}
