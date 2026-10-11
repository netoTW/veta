import { useEffect, useRef } from 'react'
import type { SerieDatos } from '../tipos'
import { BASE_ECHARTS, echarts } from './echarts'
import { C, rgba } from './tema'
import { fmt } from '../formato'

/* Una serie `por_precio` (perfil de volumen, imán de liquidaciones) como barras
   horizontales por nivel de precio: aquí se leen las cifras que el perfil encima
   del precio sólo insinúa. */
export function Distribucion({ serie, alto = 240 }: { serie: SerieDatos; alto?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const ch = echarts.init(el, undefined, { renderer: 'canvas' })
    const p = [...serie.puntos].sort((a, b) => a[0] - b[0])
    const liq = serie.tipo === 'liquidaciones_estimadas'
    const precios = p.map((x) => fmt(x[0]))
    ch.setOption({
      ...BASE_ECHARTS,
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      tooltip: { ...BASE_ECHARTS.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: rgba(C.hueso, 0.05) } }, valueFormatter: (v: number) => fmt(v, 'USD') },
      xAxis: { type: 'value', axisLabel: { formatter: (v: number) => fmt(v) }, splitLine: { lineStyle: { color: C.grid } }, axisLine: { show: false } },
      yAxis: { type: 'category', data: precios, axisLabel: { color: C.ceniza }, axisLine: { lineStyle: { color: C.hairline } }, axisTick: { show: false } },
      series: liq
        ? [{ name: 'Compradores que se liquidarían', type: 'bar', stack: 'liq', data: p.map((x) => x[1]), itemStyle: { color: rgba(C.esm, 0.75) }, barCategoryGap: '25%' }, { name: 'Vendedores que se liquidarían', type: 'bar', stack: 'liq', data: p.map((x) => x[2] ?? 0), itemStyle: { color: rgba(C.rojoLuz, 0.7) } }]
        : [{ name: serie.etiqueta, type: 'bar', data: p.map((x) => x[1]), itemStyle: { color: rgba(C.hueso, 0.55) }, barCategoryGap: '25%' }],
    })
    const ro = new ResizeObserver(() => ch.resize()); ro.observe(el)
    return () => { ro.disconnect(); ch.dispose() }
  }, [serie])
  return (
    <div className="lf-dist">
      <div className="lf-dist__cab mono"><span>{serie.etiqueta}</span><em>{serie.fuente}</em></div>
      <div ref={ref} style={{ height: alto }} />
    </div>
  )
}
