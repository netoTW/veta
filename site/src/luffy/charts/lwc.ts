/* ============================================================================
   Un spec dibujado con lightweight-charts: un chart, un panel por `paneles[]`
   con series que dibujar (un panel que llegó vacío por falta de datos no abre
   un hueco: su motivo ya va en la nota), eje de tiempo compartido (zoom,
   arrastre y cruz sincronizados de fábrica), series según estilo, marcadores
   de posiciones, niveles como líneas de precio, zonas, eventos y perfiles por
   precio como primitivas. Sin React dentro: el componente le pasa un
   contenedor y los datos y recibe las leyendas vivas.

   Rótulos: un solo rótulo de último precio por panel (el nivel «precio actual»
   cuando existe; si no, el último valor de la serie principal). Los demás
   niveles llevan su etiqueta sobre la línea, nunca encima de los números del eje.
   Las series en otra escala (eje 2: base 100, %, ratio) van en su propio eje, a
   la izquierda; las leyendas se corren para no pisarlo.
   ========================================================================== */
import { AreaSeries, BaselineSeries, CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, PriceScaleMode, createChart, createSeriesMarkers, type Coordinate, type IChartApi, type IPaneApi, type ISeriesApi, type MouseEventParams, type SeriesMarker, type SeriesType, type Time, type UTCTimestamp } from 'lightweight-charts'
import type { Datos, Marcador, SerieDatos } from '../tipos'
import { C, FUENTE_MONO, colorSerie, rgba } from './tema'
import { Banda, Eventos, PerfilPrecio, Rotulos, type Rotulo } from './primitivas'
import { fmt } from '../formato'

export interface SerieViva { id: string; etiqueta: string; color: string; unidad: string; panel: string; api: ISeriesApi<SeriesType, Time> | null; ultimo: number | null; formato: SerieDatos['formato'] }
export interface PanelVivo { id: string; indice: number }
export interface Vivo {
  chart: IChartApi; series: SerieViva[]; paneles: PanelVivo[]
  /** El stop vigente de la cartera, si el panel lo trae: para arrastrarlo y proponer moverlo. */
  stop: StopVivo | null
  /** Las etiquetas de los marcadores de una vela (compra, venta, radar, stop): se leen al pasar la cruz, nunca encima de las velas. */
  marcasEn: (t: number) => string[]
  /** Altura de cada pane, en el orden de `paneles`. */
  alturas: () => number[]
  /** Ancho del eje de la izquierda (eje 2) de cada pane, para correr la leyenda. */
  anchosIzq: () => number[]
  /** Reserva arriba de cada pane el sitio de su leyenda (altura en px) para que los datos no queden debajo. */
  fijarMargenes: (alturasLeyenda: number[]) => void
  destruir: () => void
}
export interface Opciones { interactivo: boolean; onCruz?: (valores: Map<string, number | null>, t: number | null) => void; intervalo: string; compacto?: boolean }
/** El stop vigente, arrastrable: su línea, la serie que lo ancla y cómo leer y escribir su coordenada. */
export interface StopVivo { activo: string; precio: number; panel: string; y: () => number | null; precioEn: (y: number) => number | null; mover: (precio: number) => void }

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
const dibujable = (s: SerieDatos) => (s.formato === 'ohlc' || s.formato === 'valor') && s.puntos.length > 0

export function dibujar(el: HTMLElement, d: Datos, op: Opciones): Vivo {
  const horas = op.intervalo === '1h' || op.intervalo === '4h'
  const chart = createChart(el, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: C.ceniza2, fontFamily: FUENTE_MONO, fontSize: 11, attributionLogo: false, panes: { separatorColor: C.hairline, separatorHoverColor: rgba(C.oro, 0.25), enableResize: op.interactivo } },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    crosshair: { mode: CrosshairMode.Normal, vertLine: { color: rgba(C.hueso, 0.35), width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.roca3 }, horzLine: { color: rgba(C.hueso, 0.35), width: 1, style: LineStyle.Dashed, labelBackgroundColor: C.roca3 } },
    rightPriceScale: { borderColor: C.hairline, scaleMargins: { top: 0.12, bottom: 0.08 }, entireTextOnly: true },
    leftPriceScale: { visible: false, borderColor: C.hairline, scaleMargins: { top: 0.12, bottom: 0.08 }, entireTextOnly: true },
    timeScale: { borderColor: C.hairline, timeVisible: horas, secondsVisible: false, rightOffset: 3, minBarSpacing: 1.5, fixLeftEdge: false, lockVisibleTimeRangeOnResize: true },
    localization: { locale: 'es-ES', priceFormatter: (v: number) => fmt(v) },
    handleScroll: op.interactivo ? { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false } : false,
    handleScale: op.interactivo ? { axisPressedMouseMove: true, mouseWheel: true, pinch: true } : false,
    kineticScroll: { touch: true, mouse: false },
  })

  const vivas: SerieViva[] = []
  const seriesPorId = new Map(d.series.map((s) => [s.id, s]))
  const conPrecioActual = new Set(d.niveles.filter((n) => n.tipo === 'precio_actual').map((n) => n.panel))
  // la serie principal de precio de cada panel: ancla marcadores, niveles, zonas y perfiles
  const ancla = new Map<string, ISeriesApi<SeriesType, Time>>()
  const paneles: PanelVivo[] = []
  const indicePorRol: Record<string, number> = {}

  for (const p of d.paneles) {
    const ids = (p.series.length ? p.series : d.series.filter((s) => s.panel === p.id).map((s) => s.id)).filter((id) => { const s = seriesPorId.get(id); return s && dibujable(s) })
    if (!ids.length) continue
    const pane = paneles.length
    paneles.push({ id: p.id, indice: pane })
    for (const id of ids) {
      const s = seriesPorId.get(id)!
      const k = `${p.id}:${s.rol}`; const n = indicePorRol[k] ?? 0; indicePorRol[k] = n + 1
      const color = colorSerie(s.rol, n, s.tipo, s.lado)
      const viva: SerieViva = { id: s.id, etiqueta: s.etiqueta, color, unidad: s.unidad, panel: p.id, api: null, ultimo: s.ultimo?.valor ?? null, formato: s.formato }
      vivas.push(viva)
      // izq = el eje principal (a la derecha, como en cualquier terminal); der = el segundo eje, a la izquierda
      const priceScaleId = s.eje === 'der' ? 'left' : 'right'
      const principal = s.rol === 'principal'
      const comun = { priceScaleId, priceLineVisible: false, lastValueVisible: principal && !conPrecioActual.has(p.id), crosshairMarkerVisible: s.formato !== 'ohlc', title: '' }
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
      if (priceScaleId === 'left') api.priceScale().applyOptions({ visible: true, borderColor: C.hairline })
      if (p.escala === 'log') api.priceScale().applyOptions({ mode: PriceScaleMode.Logarithmic })
      if (!ancla.has(p.id) && (s.tipo === 'ohlc' || s.tipo === 'cierre') && principal) ancla.set(p.id, api)
    }
    if (!ancla.has(p.id)) { const v = vivas.find((x) => x.panel === p.id && x.api && d.series.find((s) => s.id === x.id)?.rol === 'principal') ?? vivas.find((x) => x.panel === p.id && x.api); if (v?.api) ancla.set(p.id, v.api) }
  }
  // alturas relativas de los paneles
  const panes = chart.panes()
  for (const pv of paneles) { const p = d.paneles.find((x) => x.id === pv.id); if (p && panes[pv.indice]) panes[pv.indice].setStretchFactor(Math.max(1, p.altura)) }

  /* ---------- marcadores de posiciones y del radar ---------- */
  const porTiempo = new Map<number, string[]>()
  const porSerie = new Map<string, Marcador[]>()
  for (const m of d.marcadores) { if (!porSerie.has(m.serie)) porSerie.set(m.serie, []); porSerie.get(m.serie)!.push(m) }
  for (const [serieId, ms] of porSerie) {
    const api = vivas.find((v) => v.id === serieId)?.api ?? ancla.get(d.series.find((s) => s.id === serieId)?.panel ?? '') ?? ancla.get(paneles[0]?.id ?? '')
    if (!api) continue
    const tiempos = (api.data() as { time: UTCTimestamp }[]).map((x) => x.time)
    // el marcador cae en la vela que estaba abierta en ese momento
    const ajustar = (x: number) => { let r = tiempos[0] ?? t(x); for (const tt of tiempos) { if (tt <= x) r = tt; else break } return r }
    // sólo la forma sobre el gráfico: el texto se montaba sobre las velas. La etiqueta va a la cruz.
    const marcas: SeriesMarker<Time>[] = ms.map((m) => {
      const precio = m.valor ?? m.precio
      const tt = ajustar(m.t)
      const lista = porTiempo.get(tt as number) ?? []; lista.push(m.etiqueta); porTiempo.set(tt as number, lista)
      if (m.tipo === 'entrada') return { time: tt, position: 'belowBar', shape: 'arrowUp', color: C.esmLuz, size: 1.1 }
      if (m.tipo === 'salida') return { time: tt, position: 'aboveBar', shape: 'arrowDown', color: C.hueso, size: 1.1 }
      if (m.tipo === 'stop_historial') return { time: tt, position: 'atPriceMiddle', shape: 'circle', color: C.rojoLuz, size: 0.55, price: precio }
      return { time: tt, position: 'belowBar', shape: 'circle', color: C.oroLuz, size: 0.7 }
    })
    marcas.sort((a, b) => (a.time as number) - (b.time as number))
    createSeriesMarkers(api, marcas)
  }

  /* ---------- niveles, zonas, eventos y perfiles ---------- */
  const rotulosPorPanel = new Map<string, Rotulo[]>()
  let stop: StopVivo | null = null
  for (const n of d.niveles) {
    const api = ancla.get(n.panel); if (!api) continue
    const e = ESTILO_NIVEL[n.tipo] ?? ESTILO_NIVEL.nivel
    const actual = n.tipo === 'precio_actual'
    const precio = n.valor ?? n.precio
    const linea = api.createPriceLine({ price: precio, color: e.color, lineWidth: 1, lineStyle: e.estilo, axisLabelVisible: actual, title: '', axisLabelColor: e.color, axisLabelTextColor: C.roca })
    if (n.tipo === 'stop' && !stop && !n.valor) {
      const activo = d.series.find((x) => x.panel === n.panel && x.activo)?.activo ?? d.spec.activos[0]
      stop = { activo, precio: n.precio, panel: n.panel, y: () => api.priceToCoordinate(linea.options().price), precioEn: (y) => api.coordinateToPrice(y as Coordinate), mover: (p) => linea.applyOptions({ price: p }) }
    }
    if (actual) continue
    const corto = n.tipo === 'gatillo' ? (n.etiqueta.match(/^Gatillo #\d+/)?.[0] ?? 'Gatillo') : e.titulo || n.etiqueta.replace(/\s[\d.,]+$/, '').slice(0, 26)
    if (!rotulosPorPanel.has(n.panel)) rotulosPorPanel.set(n.panel, [])
    rotulosPorPanel.get(n.panel)!.push({ precio, texto: `${corto} ${fmt(n.precio)}`.toUpperCase(), color: e.color })
  }
  for (const [pid, rs] of rotulosPorPanel) ancla.get(pid)?.attachPrimitive(new Rotulos(rs))
  const zonasPorPanel = new Map<string, typeof d.zonas>()
  for (const z of d.zonas) { if (!zonasPorPanel.has(z.panel)) zonasPorPanel.set(z.panel, []); zonasPorPanel.get(z.panel)!.push(z) }
  for (const [pid, zs] of zonasPorPanel) ancla.get(pid)?.attachPrimitive(new Banda(zs.map((z) => ({ desde: z.desde, hasta: z.hasta, etiqueta: z.etiqueta, tipo: z.tipo }))))
  if (d.eventos.length) ancla.get(paneles[0]?.id ?? '')?.attachPrimitive(new Eventos(d.eventos.map((e) => ({ t: e.t, etiqueta: e.etiqueta }))))
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

  const anchoIzq = (pane: IPaneApi<Time> | undefined) => { try { const ps = (pane as { priceScale?: (id: string) => { width: () => number; options: () => { visible?: boolean } } } | undefined)?.priceScale?.('left'); return ps && ps.options().visible ? ps.width() : 0 } catch { return 0 } }
  return {
    chart, series: vivas, paneles, stop, marcasEn: (t) => porTiempo.get(t) ?? [],
    alturas: () => paneles.map((pv) => chart.panes()[pv.indice]?.getHeight() ?? 0),
    anchosIzq: () => paneles.map((pv) => anchoIzq(chart.panes()[pv.indice])),
    fijarMargenes: (alturasLeyenda) => {
      paneles.forEach((pv, i) => {
        const alto = chart.panes()[pv.indice]?.getHeight() ?? 0
        if (!alto) return
        const top = Math.min(0.6, Math.max(0.08, ((alturasLeyenda[i] ?? 0) + 12) / alto))
        for (const v of vivas) if (v.panel === pv.id && v.api) v.api.priceScale().applyOptions({ scaleMargins: { top, bottom: 0.08 } })
      })
    },
    destruir: () => { chart.unsubscribeCrosshairMove(alCruz); chart.remove() },
  }
}
