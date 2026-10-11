/* ============================================================================
   Un spec dibujado con lightweight-charts: un chart, un panel por `paneles[]`,
   eje de tiempo compartido (zoom, arrastre y cruz sincronizados de fábrica),
   series según estilo, marcadores de posiciones, niveles como líneas de precio,
   zonas, eventos y perfiles por precio como primitivas. Sin React dentro: el
   componente le pasa un contenedor y los datos y recibe las leyendas vivas.
   ========================================================================== */
import { AreaSeries, BaselineSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode, createChart, createSeriesMarkers, type IChartApi, type ISeriesApi, type MouseEventParams, type SeriesMarker, type SeriesType, type Time, type UTCTimestamp } from 'lightweight-charts'
import type { Datos, Marcador, SerieDatos } from '../tipos'
import { C, FUENTE_MONO, colorSerie, rgba } from './tema'
import { Banda, Eventos, PerfilPrecio } from './primitivas'
import { fmt } from '../formato'

export interface SerieViva { id: string; etiqueta: string; color: string; unidad: string; panel: string; api: ISeriesApi<SeriesType, Time> | null; ultimo: number | null; formato: SerieDatos['formato'] }
export interface Vivo { chart: IChartApi; series: SerieViva[]; destruir: () => void; alturas: () => number[] }
export interface Opciones { interactivo: boolean; onCruz?: (valores: Map<string, number | null>, t: number | null) => void; intervalo: string; compacto?: boolean }

const t = (s: number) => s as UTCTimestamp
/** Datos ordenados y sin tiempos repetidos: lo exige la librería. */
function limpiar<T extends { time: UTCTimestamp }>(xs: T[]): T[] {
  xs.sort((a, b) => a.time - b.time)
  return xs.filter((x, i) => i === 0 || x.time !== xs[i - 1].time)
}
const ESTILO_NIVEL: Record<string, { color: string; estilo: LineStyle; titulo: string }> = {
  precio_actual: { color: C.hueso, estilo: LineStyle.Solid, titulo: '' },
  stop: { color: C.rojoLuz, estilo: LineStyle.Dashed, titulo: 'Stop' },
  invalidacion: { color: C.rojo, estilo: LineStyle.Dotted, titulo: 'Invalidación' },
  entrada: { color: C.esm, estilo: LineStyle.Dashed, titulo: 'Entrada' },
  objetivo: { color: C.oro, estilo: LineStyle.Dashed, titulo: 'Objetivo' },
  gatillo: { color: C.oroLuz, estilo: LineStyle.LargeDashed, titulo: 'Gatillo' },
  nivel: { color: C.ceniza, estilo: LineStyle.Dotted, titulo: '' },
}

export function dibujar(el: HTMLElement, d: Datos, op: Opciones): Vivo {
  const horas = op.intervalo === '1h' || op.intervalo === '4h'
  const chart = createChart(el, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.ceniza2, fontFamily: FUENTE_MONO, fontSize: 11, attributionLogo: true, panes: { separatorColor: C.hairline, separatorHoverColor: rgba(C.oro, 0.25), enableResize: op.interactivo } },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: rgba(C.hueso, 0.35), width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.roca3 }, horzLine: { color: rgba(C.hueso, 0.35), width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.roca3 } },
    rightPriceScale: { borderColor: C.hairline, scaleMargins: { top: 0.1, bottom: 0.08 }, entireTextOnly: true },
    leftPriceScale: { visible: false, borderColor: C.hairline, scaleMargins: { top: 0.1, bottom: 0.08 } },
    timeScale: { borderColor: C.hairline, timeVisible: horas, secondsVisible: false, rightOffset: 3, minBarSpacing: 1.5, fixLeftEdge: false, lockVisibleTimeRangeOnResize: true },
    localization: { locale: 'es-ES', priceFormatter: (v: number) => fmt(v) },
    handleScroll: op.interactivo ? { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } : false,
    handleScale: op.interactivo ? { axisPressedMouseMove: true, mouseWheel: true, pinch: true } : false,
    kineticScroll: { touch: true, mouse: false },
  })

  const vivas: SerieViva[] = []
  const porPanel = new Map(d.paneles.map((p, i) => [p.id, i]))
  const seriesPorId = new Map(d.series.map((s) => [s.id, s]))
  // la serie principal de precio de cada panel: ancla marcadores, niveles, zonas y perfiles
  const ancla = new Map<string, ISeriesApi<SeriesType, Time>>()
  const indicePorRol: Record<string, number> = {}

  for (const p of d.paneles) {
    const pane = porPanel.get(p.id)!
    const ids = p.series.length ? p.series : d.series.filter((s) => s.panel === p.id).map((s) => s.id)
    for (const id of ids) {
      const s = seriesPorId.get(id); if (!s) continue
      const k = `${p.id}:${s.rol}`; const n = indicePorRol[k] ?? 0; indicePorRol[k] = n + 1
      const color = colorSerie(s.rol, n, s.tipo, s.lado)
      const viva: SerieViva = { id: s.id, etiqueta: s.etiqueta, color, unidad: s.unidad, panel: p.id, api: null, ultimo: s.ultimo?.valor ?? null, formato: s.formato }
      vivas.push(viva)
      if (s.formato !== 'ohlc' && s.formato !== 'valor') continue
      // izq = el eje principal (a la derecha, como en cualquier terminal); der = el segundo eje, a la izquierda
      const priceScaleId = s.eje === 'der' ? 'left' : 'right'
      const principal = s.rol === 'principal'
      const comun = { priceScaleId, priceLineVisible: false, lastValueVisible: principal, crosshairMarkerVisible: true, title: '' }
      let api: ISeriesApi<SeriesType, Time>
      if (s.formato === 'ohlc' && s.estilo === 'velas') {
        api = chart.addSeries(CandlestickSeries, { ...comun, upColor: C.esm, downColor: C.rojo, wickUpColor: C.esm, wickDownColor: C.rojo, borderVisible: false }, pane)
        api.setData(limpiar(s.puntos.map((x) => ({ time: t(x[0]), open: x[1], high: x[2], low: x[3], close: x[4] }))))
      } else {
        const valores = limpiar(s.formato === 'ohlc' ? s.puntos.map((x) => ({ time: t(x[0]), value: x[4] })) : s.puntos.map((x) => ({ time: t(x[0]), value: x[1], signo: x[2] })))
        const esBaseline = s.tipo === 'pnl' || s.tipo === 'pulso_tono' || s.tipo === 'funding'
        if (s.estilo === 'barras') {
          api = chart.addSeries(HistogramSeries, { ...comun, color: rgba(color, 0.55), base: 0 }, pane)
          const conSigno = s.tipo === 'volumen'
          api.setData(valores.map((v) => ({ time: v.time, value: v.value, color: conSigno ? (('signo' in v && (v as { signo?: number }).signo === -1) ? rgba(C.rojo, 0.5) : rgba(C.esm, 0.5)) : s.lado === 'vendedores' ? rgba(C.rojoLuz, 0.55) : s.rol === 'principal' ? rgba(C.esm, 0.62) : rgba(color, 0.5) })))
        } else if (s.estilo === 'area' && esBaseline) {
          api = chart.addSeries(BaselineSeries, { ...comun, baseValue: { type: 'price', price: 0 }, topLineColor: C.esmLuz, topFillColor1: rgba(C.esm, 0.28), topFillColor2: rgba(C.esm, 0.02), bottomLineColor: C.rojoLuz, bottomFillColor1: rgba(C.rojo, 0.02), bottomFillColor2: rgba(C.rojo, 0.28), lineWidth: 2 }, pane)
          api.setData(valores)
        } else if (s.estilo === 'area') {
          api = chart.addSeries(AreaSeries, { ...comun, lineColor: color, topColor: rgba(color, 0.26), bottomColor: rgba(color, 0.0), lineWidth: 2 }, pane)
          api.setData(valores)
        } else {
          api = chart.addSeries(LineSeries, { ...comun, color, lineWidth: principal ? 2 : 1, lineStyle: s.rol === 'benchmark' ? LineStyle.Dashed : LineStyle.Solid, lineVisible: s.estilo !== 'puntos', pointMarkersVisible: s.estilo === 'puntos', pointMarkersRadius: 2.5 }, pane)
          api.setData(valores)
        }
      }
      viva.api = api
      // el eje 2 no se dibuja: la leyenda viva ya dice su valor, y dos ejes a izquierda y derecha se pisan con la leyenda
      if (priceScaleId === 'left') api.priceScale().applyOptions({ visible: false })
      if (p.escala === 'log') api.priceScale().applyOptions({ mode: PriceScaleMode.Logarithmic })
      if (!ancla.has(p.id) && (s.tipo === 'ohlc' || s.tipo === 'cierre') && principal) ancla.set(p.id, api)
      if (!ancla.has(p.id) && principal) ancla.set(p.id, api)
    }
    if (!ancla.has(p.id)) { const v = vivas.find((x) => x.panel === p.id && x.api); if (v?.api) ancla.set(p.id, v.api) }
    // sitio para la leyenda: cuantas más series, más aire arriba
    const nLey = vivas.filter((x) => x.panel === p.id).length
    for (const v of vivas) if (v.panel === p.id && v.api) v.api.priceScale().applyOptions({ scaleMargins: { top: Math.min(0.5, (op.compacto ? 0.2 : 0.14) + (op.compacto ? 0.1 : 0.07) * nLey), bottom: 0.08 } })
  }
  // alturas relativas de los paneles
  const panes = chart.panes()
  d.paneles.forEach((p, i) => { if (panes[i]) panes[i].setStretchFactor(Math.max(1, p.altura)) })

  /* ---------- marcadores de posiciones y del radar ---------- */
  const porSerie = new Map<string, Marcador[]>()
  for (const m of d.marcadores) { const k = porSerie.has(m.serie) ? m.serie : [...ancla.entries()].find(([pid]) => d.paneles.some((p) => p.id === pid && p.series.includes(m.serie)))?.[0] ?? m.serie; if (!porSerie.has(k)) porSerie.set(k, []); porSerie.get(k)!.push(m) }
  for (const [serieId, ms] of porSerie) {
    const api = vivas.find((v) => v.id === serieId)?.api ?? ancla.get(d.series.find((s) => s.id === serieId)?.panel ?? '') ?? ancla.get(d.paneles[0]?.id ?? '')
    if (!api) continue
    const tiempos = (api.data() as { time: UTCTimestamp }[]).map((x) => x.time)
    const ajustar = (x: number) => { let r = tiempos[0] ?? t(x); for (const tt of tiempos) { if (tt <= x) r = tt; else break } return r }
    const marcas: SeriesMarker<Time>[] = ms.map((m) => {
      const precio = m.valor ?? m.precio
      if (m.tipo === 'entrada') return { time: ajustar(m.t), position: 'belowBar', shape: 'arrowUp', color: C.esmLuz, text: 'Compra', size: 1.1 }
      if (m.tipo === 'salida') return { time: ajustar(m.t), position: 'aboveBar', shape: 'arrowDown', color: C.hueso, text: 'Venta', size: 1.1 }
      if (m.tipo === 'stop_historial') return { time: ajustar(m.t), position: 'atPriceMiddle', shape: 'circle', color: C.rojoLuz, size: 0.55, price: precio }
      return { time: ajustar(m.t), position: 'atPriceMiddle', shape: 'circle', color: C.oroLuz, text: 'Radar', size: 0.7, price: precio }
    })
    marcas.sort((a, b) => (a.time as number) - (b.time as number))
    createSeriesMarkers(api, marcas)
  }

  /* ---------- niveles, zonas, eventos y perfiles ---------- */
  for (const n of d.niveles) {
    const api = ancla.get(n.panel); if (!api) continue
    const e = ESTILO_NIVEL[n.tipo] ?? ESTILO_NIVEL.nivel
    const titulo = n.tipo === 'precio_actual' ? '' : n.tipo === 'gatillo' ? (n.etiqueta.match(/^Gatillo #\d+/)?.[0] ?? 'Gatillo') : e.titulo || n.etiqueta.slice(0, 18)
    api.createPriceLine({ price: n.valor ?? n.precio, color: e.color, lineWidth: 1, lineStyle: e.estilo, axisLabelVisible: true, title: titulo, axisLabelColor: e.color, axisLabelTextColor: C.roca })
  }
  const zonasPorPanel = new Map<string, typeof d.zonas>()
  for (const z of d.zonas) { if (!zonasPorPanel.has(z.panel)) zonasPorPanel.set(z.panel, []); zonasPorPanel.get(z.panel)!.push(z) }
  for (const [pid, zs] of zonasPorPanel) ancla.get(pid)?.attachPrimitive(new Banda(zs.map((z) => ({ desde: z.desde, hasta: z.hasta, etiqueta: z.etiqueta, tipo: z.tipo }))))
  if (d.eventos.length) ancla.get(d.paneles[0]?.id ?? '')?.attachPrimitive(new Eventos(d.eventos.map((e) => ({ t: e.t, etiqueta: e.etiqueta }))))
  for (const s of d.series) if (s.formato === 'por_precio' && s.puntos.length) ancla.get(s.panel)?.attachPrimitive(new PerfilPrecio({ puntos: s.puntos, tipo: s.tipo, etiqueta: s.etiqueta }))

  chart.timeScale().fitContent()

  /* ---------- cruz: todas las series a la vez ---------- */
  const alCruz = (p: MouseEventParams<Time>) => {
    if (!op.onCruz) return
    const valores = new Map<string, number | null>()
    if (!p.time) { for (const v of vivas) valores.set(v.id, v.ultimo); op.onCruz(valores, null); return }
    for (const v of vivas) {
      const x = (v.api ? p.seriesData.get(v.api) : undefined) as { close?: unknown; value?: unknown } | undefined
      valores.set(v.id, typeof x?.close === 'number' ? x.close : typeof x?.value === 'number' ? x.value : null)
    }
    op.onCruz(valores, p.time as number)
  }
  chart.subscribeCrosshairMove(alCruz)

  return { chart, series: vivas, alturas: () => chart.panes().map((p) => p.getHeight()), destruir: () => { chart.unsubscribeCrosshairMove(alCruz); chart.remove() } }
}
