/* Varios gráficos que se mueven juntos: la cruz, el zoom y el rango visible.
   Cada ficha del terminal crea una Sincronia y cada Grafico de la ficha se
   registra con su chart y su serie ancla. Un gráfico que llega después (los de abajo cargan
   al acercarse, los derivados al abrirse) toma el rango de los que ya están. El rango sólo lo
   reparte el primero (el del precio) o el que la persona está tocando: los ajustes solos de los
   demás (su fitContent, un cambio de tamaño) no se reparten, para que una serie corta (47 horas de
   largos contra cortos, unas semanas de comisiones) no encoja ni corra a todos. */
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'

interface Miembro { chart: IChartApi; serie: ISeriesApi<SeriesType, Time> | null }
export class Sincronia {
  private miembros = new Set<Miembro>()
  private aplicando = false
  registrar(chart: IChartApi, serie: ISeriesApi<SeriesType, Time> | null): () => void {
    const m: Miembro = { chart, serie }
    const previo = [...this.miembros][0]
    this.miembros.add(m)
    // mientras se acomoda, el recién llegado no manda: toma el rango del primero
    let callado = !!previo
    // los dos siguen en la ficha: un gráfico que se rehízo o se fue no se toca (la librería lo da por destruido)
    let cuadro = 0, espera: ReturnType<typeof setTimeout> | null = null
    if (previo) {
      const tomar = () => { if (!this.miembros.has(m) || !this.miembros.has(previo)) return; try { const r = previo.chart.timeScale().getVisibleRange(); if (r) chart.timeScale().setVisibleRange(r) } catch { /* fuera de sus datos */ } }
      tomar(); cuadro = requestAnimationFrame(() => { tomar(); espera = setTimeout(() => { tomar(); callado = false }, 120) })
    }
    // ¿la persona está sobre este gráfico? (ratón, lápiz o dedo)
    let encima = false
    const el = chart.chartElement()
    const sobre = () => { encima = true }, fuera = () => { encima = false }
    el.addEventListener('pointerenter', sobre); el.addEventListener('pointerdown', sobre); el.addEventListener('pointerleave', fuera); el.addEventListener('wheel', sobre, { passive: true })
    const alRango = (r: { from: Time; to: Time } | null) => { if (!r || this.aplicando || callado || !(encima || [...this.miembros][0] === m)) return; this.aplicando = true; try { for (const o of this.miembros) if (o !== m) { try { o.chart.timeScale().setVisibleRange(r) } catch { /* fuera de sus datos */ } } } finally { this.aplicando = false } }
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
    return () => { try { chart.timeScale().unsubscribeVisibleTimeRangeChange(alRango); chart.unsubscribeCrosshairMove(alCruz) } catch { /* ya destruido */ } el.removeEventListener('pointerenter', sobre); el.removeEventListener('pointerdown', sobre); el.removeEventListener('pointerleave', fuera); el.removeEventListener('wheel', sobre); cancelAnimationFrame(cuadro); if (espera) clearTimeout(espera); this.miembros.delete(m) }
  }
}
