/* Varios gráficos que se mueven juntos: la cruz, el zoom y el rango visible.
   Cada ficha del terminal crea una Sincronia y cada Grafico de la ficha se
   registra con su chart y su serie ancla. */
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'

interface Miembro { chart: IChartApi; serie: ISeriesApi<SeriesType, Time> | null }
export class Sincronia {
  private miembros = new Set<Miembro>()
  private aplicando = false
  registrar(chart: IChartApi, serie: ISeriesApi<SeriesType, Time> | null): () => void {
    const m: Miembro = { chart, serie }
    this.miembros.add(m)
    const alRango = (r: { from: Time; to: Time } | null) => { if (!r || this.aplicando) return; this.aplicando = true; try { for (const o of this.miembros) if (o !== m) { try { o.chart.timeScale().setVisibleRange(r) } catch { /* fuera de sus datos */ } } } finally { this.aplicando = false } }
    const alCruz = (p: MouseEventParams<Time>) => {
      for (const o of this.miembros) {
        if (o === m) continue
        if (!p.time || !o.serie) { o.chart.clearCrosshairPosition(); continue }
        const datos = o.serie.data() as { time: UTCTimestamp; value?: number; close?: number }[]
        let d: typeof datos[number] | null = null
        for (const x of datos) { if (x.time <= (p.time as number)) d = x; else break }
        if (d) { const v = typeof d.close === 'number' ? d.close : typeof d.value === 'number' ? d.value : null; if (v !== null) o.chart.setCrosshairPosition(v, d.time, o.serie) }
      }
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(alRango)
    chart.subscribeCrosshairMove(alCruz)
    return () => { try { chart.timeScale().unsubscribeVisibleTimeRangeChange(alRango); chart.unsubscribeCrosshairMove(alCruz) } catch { /* ya destruido */ } this.miembros.delete(m) }
  }
}
