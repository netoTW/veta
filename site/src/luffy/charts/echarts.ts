/* ECharts sólo con lo que se usa: barras, rejilla, tooltip y lienzo. */
import * as echarts from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { C, FUENTE_MONO } from './tema'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])
export { echarts }

export const BASE_ECHARTS = {
  backgroundColor: 'transparent',
  textStyle: { fontFamily: FUENTE_MONO, color: C.ceniza2, fontSize: 11 },
  animationDuration: 420, animationEasing: 'cubicOut' as const, animationDurationUpdate: 320,
  tooltip: { backgroundColor: 'rgba(12,14,16,0.94)', borderColor: C.grano, borderWidth: 1, textStyle: { color: C.hueso, fontFamily: FUENTE_MONO, fontSize: 12 }, extraCssText: 'backdrop-filter: blur(6px); border-radius: 2px;' },
}
