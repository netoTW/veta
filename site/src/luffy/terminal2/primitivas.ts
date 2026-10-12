/* ============================================================================
   Terminal v2 · lo que se dibuja sobre el panel de precio y la librería no trae.
     MapaLiq     el mapa de liquidaciones en franjas por nivel: cortos en esmeralda,
                 largos en rojo, intensidad según densidad y rótulo en las densas
     Perfil      el perfil de volumen al costado, con su punto de mayor volumen en oro
     RielRadar   las marcas del radar como rombos al pie del panel (nunca sobre las
                 velas), con su rótulo
   Mismo patrón que charts/primitivas.ts: coordenadas en updateAllViews, pintar en draw.
   Cada una se prende y se apaga sin rehacer el gráfico (`visible`).
   ========================================================================== */
import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, PrimitivePaneViewZOrder, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { C, FUENTE_MONO, rgba } from '../charts/tema'
import { fmt } from '../formato'
import type { NivelLiq } from './contrato'
/** en un gráfico angosto (el teléfono) los rótulos van cortos para no pisarse */
const angosto = (w: number) => w < 560

abstract class Base implements ISeriesPrimitive<Time> {
  protected chart: IChartApi | null = null
  protected serie: ISeriesApi<SeriesType, Time> | null = null
  protected pedir: (() => void) | null = null
  visible = true
  attached(p: SeriesAttachedParameter<Time>) { this.chart = p.chart as IChartApi; this.serie = p.series; this.pedir = p.requestUpdate; this.updateAllViews() }
  detached() { this.chart = null; this.serie = null; this.pedir = null }
  mostrar(v: boolean) { this.visible = v; this.pedir?.() }
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

/* ---------- el mapa de liquidaciones ---------- */
export class MapaLiq extends Base {
  private ys: { y1: number; y2: number; n: NivelLiq }[] = []
  private niveles: NivelLiq[]
  private vista = new Vista('bottom', (ctx, w) => {
    if (!this.visible) return
    ctx.font = `500 10px ${FUENTE_MONO}`; ctx.textBaseline = 'bottom'
    for (const { y1, y2, n } of this.ys) {
      const corto = n.lado === 'cortos', col = corto ? C.esm : C.rojo
      const top = Math.min(y1, y2), alto = Math.max(6, Math.abs(y2 - y1))
      ctx.fillStyle = rgba(col, 0.07 + 0.2 * n.intensidad); ctx.fillRect(0, top + Math.abs(y2 - y1) / 2 - alto / 2, w, alto)
      if (n.densa || (n.intensidad >= 0.5 && !angosto(w))) {
        const txt = angosto(w) ? `${corto ? 'CORTOS' : 'LARGOS'}${n.monto_usd ? ` ~${fmt(n.monto_usd)}` : ''}` : `LIQ. ${corto ? 'CORTOS' : 'LARGOS'}${n.densa ? ' · DENSA' : ''}${n.monto_usd ? ` · ~${fmt(n.monto_usd)}` : ''}`
        ctx.fillStyle = corto ? C.esmLuz : C.rojoLuz; ctx.fillText(txt, 8, top + Math.abs(y2 - y1) / 2 - alto / 2 - 2)
      }
    }
  })
  constructor(niveles: NivelLiq[]) { super(); this.niveles = niveles }
  updateAllViews() { if (!this.serie) return; this.ys = this.niveles.flatMap((n) => { const y1 = this.serie!.priceToCoordinate(n.hasta), y2 = this.serie!.priceToCoordinate(n.desde); return y1 === null || y2 === null ? [] : [{ y1, y2, n }] }) }
  paneViews() { return [this.vista] }
}

/* ---------- el perfil de volumen, al costado ---------- */
export class Perfil extends Base {
  private barras: { y: number; alto: number; v: number; poc: boolean }[] = []
  private max = 1
  private niveles: [number, number][]
  private poc: number | null
  private vista = new Vista('bottom', (ctx, w) => {
    const ancho = Math.min(150, w * 0.16)
    for (const b of this.barras) {
      const wb = (b.v / this.max) * ancho
      ctx.fillStyle = b.poc ? rgba(C.oro, 0.34) : rgba(C.hueso, 0.08)
      ctx.fillRect(w - wb, b.y - b.alto / 2, wb, Math.max(1, b.alto))
    }
  })
  constructor(niveles: [number, number][], poc: number | null) { super(); this.niveles = niveles; this.poc = poc }
  updateAllViews() {
    if (!this.serie || !this.niveles.length) { this.barras = []; return }
    this.max = Math.max(1, ...this.niveles.map((x) => x[1]))
    const ys = this.niveles.map((x) => this.serie!.priceToCoordinate(x[0]))
    const alto = ys.length > 1 && ys[0] !== null && ys[1] !== null ? Math.abs((ys[1] as number) - (ys[0] as number)) - 2 : 6
    const masCerca = this.poc === null ? -1 : this.niveles.reduce((m, x, i) => (Math.abs(x[0] - this.poc!) < Math.abs(this.niveles[m][0] - this.poc!) ? i : m), 0)
    this.barras = this.niveles.flatMap((x, i) => { const y = ys[i]; return y === null ? [] : [{ y: y as number, alto, v: x[1], poc: i === masCerca }] })
  }
  paneViews() { return [this.vista] }
}

/* ---------- el riel del radar ---------- */
export class RielRadar extends Base {
  private xs: { x: number; n: number }[] = []
  private marcas: Map<number, number>
  private vista = new Vista('top', (ctx, w, h) => {
    if (!this.visible) return
    const y = h - 9
    ctx.strokeStyle = rgba(C.hueso, 0.06); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y - 9); ctx.lineTo(w, y - 9); ctx.stroke()
    ctx.font = `500 10px ${FUENTE_MONO}`; ctx.textBaseline = 'middle'
    for (const { x, n } of this.xs) {
      ctx.fillStyle = C.oro; ctx.beginPath(); ctx.moveTo(x, y - 4.5); ctx.lineTo(x + 4.5, y); ctx.lineTo(x, y + 4.5); ctx.lineTo(x - 4.5, y); ctx.closePath(); ctx.fill()
      if (n > 1) { ctx.fillStyle = C.oroLuz; ctx.fillText(String(n), x + 7, y) }
    }
  })
  constructor(marcas: Map<number, number>) { super(); this.marcas = marcas }
  updateAllViews() { if (!this.chart) return; const ts = this.chart.timeScale(); this.xs = [...this.marcas].flatMap(([t, n]) => { const x = ts.timeToCoordinate(t as UTCTimestamp); return x === null ? [] : [{ x, n }] }) }
  paneViews() { return [this.vista] }
}

/* ---------- los catalizadores: una línea punteada con su nombre ---------- */
export class Verticales extends Base {
  private xs: { x: number; e: string }[] = []
  private eventos: { t: number; etiqueta: string }[]
  private vista = new Vista('top', (ctx, w, h) => {
    if (!this.visible) return
    ctx.font = `500 10px ${FUENTE_MONO}`; ctx.textBaseline = 'top'
    for (const { x, e } of this.xs) {
      ctx.strokeStyle = rgba(C.oroLuz, 0.7); ctx.lineWidth = 1; ctx.setLineDash([1, 3])
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h - 20); ctx.stroke(); ctx.setLineDash([])
      // el nombre, abajo: arriba quedan los rótulos de los gatillos y del mapa
      const txt = e.toUpperCase(), tw = ctx.measureText(txt).width, y = h - 44
      // del lado donde entra: si no cabe a la derecha de la línea, a la izquierda
      const x0 = x + tw + 16 > w ? x - tw - 14 : x + 4
      ctx.fillStyle = rgba(C.roca, 0.85); ctx.fillRect(x0, y, tw + 10, 15)
      ctx.fillStyle = C.oroLuz; ctx.fillText(txt, x0 + 5, y + 2)
    }
  })
  constructor(eventos: { t: number; etiqueta: string }[]) { super(); this.eventos = eventos }
  updateAllViews() { if (!this.chart) return; const ts = this.chart.timeScale(); this.xs = this.eventos.flatMap((e) => { const x = ts.timeToCoordinate(e.t as UTCTimestamp); return x === null ? [] : [{ x, e: e.etiqueta }] }) }
  paneViews() { return [this.vista] }
}

/* ---------- los rótulos de stop y gatillos, a la derecha (antes del perfil), como en la maqueta ---------- */
export class RotulosDer extends Base {
  private items: { y: number; texto: string; color: string }[] = []
  private rotulos: { precio: number; texto: string; color: string }[]
  private vista = new Vista('top', (ctx, w, h) => {
    if (!this.visible) return
    ctx.font = `500 10px ${FUENTE_MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right'
    const x = w - Math.min(150, w * 0.16) - 10, puestos: number[] = []
    for (const it of this.items) {
      if (it.y < 6 || it.y > h - 6) continue
      const texto = angosto(w) ? it.texto.replace(/^GATILLO #/, 'G#').replace(/^STOP [A-ZÁÉÍÓÚ]+/, 'STOP') : it.texto
      let yy = it.y - 9
      for (let i = 0; i < 6 && puestos.some((p) => Math.abs(p - yy) < 13); i++) yy -= 13
      puestos.push(yy)
      const tw = ctx.measureText(texto).width
      ctx.fillStyle = rgba(C.roca, 0.86); ctx.fillRect(x - tw - 6, yy - 7, tw + 12, 14)
      ctx.fillStyle = it.color; ctx.fillText(texto, x, yy)
    }
  })
  constructor(rotulos: { precio: number; texto: string; color: string }[]) { super(); this.rotulos = rotulos }
  updateAllViews() { if (!this.serie) return; this.items = this.rotulos.flatMap((r) => { const y = this.serie!.priceToCoordinate(r.precio); return y === null ? [] : [{ y, texto: r.texto, color: r.color }] }).sort((a, b) => a.y - b.y) }
  paneViews() { return [this.vista] }
}
