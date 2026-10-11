/* ============================================================================
   Primitivas de lightweight-charts: lo que la librería no trae y el contrato pide.
     Banda     una zona de precio (zona de compra, de riesgo) como franja
     Eventos   líneas verticales con etiqueta en una fecha
     Perfil    histograma horizontal por precio (perfil de volumen, imán de liquidaciones)
   Cada una calcula coordenadas en updateAllViews y sólo pinta en draw.
   ========================================================================== */
import type { Coordinate, IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, PrimitivePaneViewZOrder, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { C, FUENTE_MONO, rgba } from './tema'

type Serie = ISeriesApi<SeriesType, Time>
abstract class Base implements ISeriesPrimitive<Time> {
  protected chart: IChartApi | null = null
  protected serie: Serie | null = null
  protected pedir: (() => void) | null = null
  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart as IChartApi; this.serie = p.series; this.pedir = p.requestUpdate; this.updateAllViews() }
  detached() { this.chart = null; this.serie = null; this.pedir = null }
  abstract updateAllViews(): void
  abstract paneViews(): readonly IPrimitivePaneView[]
}
class Vista implements IPrimitivePaneView {
  private z: PrimitivePaneViewZOrder
  private pintar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  constructor(z: PrimitivePaneViewZOrder, pintar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) { this.z = z; this.pintar = pintar }
  zOrder() { return this.z }
  renderer(): IPrimitivePaneRenderer { return { draw: (t: CanvasRenderingTarget2D) => t.useMediaCoordinateSpace(({ context, mediaSize }) => { context.save(); this.pintar(context, mediaSize.width, mediaSize.height); context.restore() }) } }
}

/* ---------- banda ---------- */
export interface Zona { desde: number; hasta: number; etiqueta: string; tipo: string }
export class Banda extends Base {
  private ys: { y1: number; y2: number; z: Zona }[] = []
  private vista = new Vista('bottom', (ctx, w) => {
    for (const { y1, y2, z } of this.ys) {
      const compra = /compra|entrada|acumul/i.test(z.tipo), riesgo = /venta|riesgo|invalid/i.test(z.tipo)
      const col = compra ? C.esm : riesgo ? C.rojo : C.ceniza
      ctx.fillStyle = rgba(col, compra ? 0.11 : 0.08); ctx.fillRect(0, Math.min(y1, y2), w, Math.abs(y2 - y1))
      ctx.strokeStyle = rgba(col, 0.45); ctx.lineWidth = 1; ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.moveTo(0, y2); ctx.lineTo(w, y2); ctx.stroke(); ctx.setLineDash([])
      ctx.font = `500 10px ${FUENTE_MONO}`; ctx.fillStyle = compra ? C.esmLuz : riesgo ? C.rojoLuz : C.ceniza; ctx.textBaseline = 'bottom'
      ctx.fillText(z.etiqueta.toUpperCase(), 8, Math.min(y1, y2) - 3)
    }
  })
  private zonas: Zona[]
  constructor(zonas: Zona[]) { super(); this.zonas = zonas }
  updateAllViews() { if (!this.serie) return; this.ys = this.zonas.flatMap((z) => { const y1 = this.serie!.priceToCoordinate(z.hasta), y2 = this.serie!.priceToCoordinate(z.desde); return y1 === null || y2 === null ? [] : [{ y1, y2, z }] }) }
  paneViews() { return [this.vista] }
}

/* ---------- eventos ---------- */
export interface Evento { t: number; etiqueta: string }
export class Eventos extends Base {
  private xs: { x: number; e: Evento }[] = []
  private vista = new Vista('top', (ctx, _w, h) => {
    ctx.font = `500 10px ${FUENTE_MONO}`; ctx.textBaseline = 'top'
    for (const { x, e } of this.xs) {
      ctx.strokeStyle = rgba(C.oro, 0.55); ctx.lineWidth = 1; ctx.setLineDash([2, 4])
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); ctx.setLineDash([])
      const txt = e.etiqueta.toUpperCase(); const tw = ctx.measureText(txt).width
      ctx.fillStyle = rgba(C.roca, 0.85); ctx.fillRect(x + 4, 4, tw + 10, 15)
      ctx.fillStyle = C.oroLuz; ctx.fillText(txt, x + 9, 6)
    }
  })
  private eventos: Evento[]
  constructor(eventos: Evento[]) { super(); this.eventos = eventos }
  updateAllViews() { if (!this.chart) return; const ts = this.chart.timeScale(); this.xs = this.eventos.flatMap((e) => { const x = ts.timeToCoordinate(e.t as UTCTimestamp); return x === null ? [] : [{ x, e }] }) }
  paneViews() { return [this.vista] }
}

/* ---------- perfil por precio ---------- */
export interface Perfil { puntos: number[][]; tipo: 'volume_profile' | 'liquidaciones_estimadas' | string; etiqueta: string }
export class PerfilPrecio extends Base {
  private barras: { y: number; alto: number; a: number; b: number }[] = []
  private max = 1
  private vista = new Vista('bottom', (ctx, w) => {
    const ancho = Math.min(220, w * 0.28)
    const liq = this.perfil.tipo === 'liquidaciones_estimadas'
    for (const { y, alto, a, b } of this.barras) {
      const wa = (a / this.max) * ancho, wb = (b / this.max) * ancho
      ctx.fillStyle = liq ? rgba(C.esm, 0.32) : rgba(C.hueso, 0.16)
      ctx.fillRect(w - wa, y - alto / 2, wa, Math.max(1, alto))
      if (liq && wb > 0) { ctx.fillStyle = rgba(C.rojoLuz, 0.32); ctx.fillRect(w - wa - wb, y - alto / 2, wb, Math.max(1, alto)) }
    }
    ctx.font = `500 10px ${FUENTE_MONO}`; ctx.fillStyle = C.ceniza2; ctx.textAlign = 'right'; ctx.textBaseline = 'top'
    ctx.fillText(this.perfil.etiqueta.toUpperCase(), w - 6, 6)
  })
  private perfil: Perfil
  constructor(perfil: Perfil) { super(); this.perfil = perfil }
  updateAllViews() {
    if (!this.serie) return
    const p = this.perfil.puntos.filter((x) => x.length >= 2)
    if (!p.length) { this.barras = []; return }
    this.max = Math.max(1, ...p.map((x) => (x[1] ?? 0) + (x[2] ?? 0)))
    const ys = p.map((x) => this.serie!.priceToCoordinate(x[0]))
    const alto = ys.length > 1 ? Math.abs(((ys[1] ?? 0) as number) - ((ys[0] ?? 0) as number)) * 0.82 : 6
    this.barras = p.flatMap((x, i) => { const y = ys[i] as Coordinate | null; return y === null ? [] : [{ y, alto, a: x[1] ?? 0, b: x[2] ?? 0 }] })
  }
  paneViews() { return [this.vista] }
}
