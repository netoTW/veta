import { useEffect, useMemo, useRef } from 'react'
import type { Datos } from '../tipos'
import { BASE_ECHARTS, echarts } from './echarts'
import { C, rgba } from './tema'

/* Lo que cambió cada serie entre el primer y el último punto del rango, lado a
   lado. Es una lectura de los mismos puntos que ya dibujó el gráfico: no inventa
   nada, sólo los compara. */
export function Comparacion({ datos, alto }: { datos: Datos; alto?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const filas = useMemo(() => datos.series
    .filter((s) => (s.formato === 'valor' || s.formato === 'ohlc') && s.puntos.length > 1)
    .map((s) => { const a = s.formato === 'ohlc' ? s.puntos[0][4] : s.puntos[0][1]; const b = s.formato === 'ohlc' ? s.puntos[s.puntos.length - 1][4] : s.puntos[s.puntos.length - 1][1]; return { etiqueta: s.etiqueta, pct: a ? ((b / a) - 1) * 100 : null, panel: datos.paneles.find((p) => p.id === s.panel)?.titulo ?? s.panel } })
    .filter((f) => f.pct !== null && Number.isFinite(f.pct)), [datos])
  useEffect(() => {
    const el = ref.current; if (!el || !filas.length) return
    const ch = echarts.init(el)
    ch.setOption({
      ...BASE_ECHARTS,
      grid: { left: 8, right: 56, top: 6, bottom: 6, containLabel: true },
      tooltip: { ...BASE_ECHARTS.tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: rgba(C.hueso, 0.05) } }, formatter: (ps: { name: string; value: number; dataIndex: number }[]) => { const p = ps[0]; return `${p.name}<br/><b>${p.value >= 0 ? '+' : ''}${p.value.toFixed(1).replace('.', ',')} %</b> · ${filas[p.dataIndex].panel}` } },
      xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${v} %` }, splitLine: { lineStyle: { color: C.grid } }, axisLine: { show: false } },
      yAxis: { type: 'category', data: filas.map((f) => f.etiqueta), inverse: true, axisLabel: { color: C.hueso, width: 190, overflow: 'truncate' }, axisLine: { lineStyle: { color: C.hairline } }, axisTick: { show: false } },
      series: [{ type: 'bar', data: filas.map((f) => ({ value: Math.round((f.pct ?? 0) * 10) / 10, itemStyle: { color: (f.pct ?? 0) >= 0 ? rgba(C.esm, 0.8) : rgba(C.rojoLuz, 0.8) } })), barMaxWidth: 16, label: { show: true, position: 'right', color: C.ceniza, formatter: (p: { value: number }) => `${p.value >= 0 ? '+' : ''}${String(p.value).replace('.', ',')} %` } }],
    })
    const ro = new ResizeObserver(() => ch.resize()); ro.observe(el)
    return () => { ro.disconnect(); ch.dispose() }
  }, [filas])
  if (!filas.length) return null
  return (
    <div className="lf-dist">
      <div className="lf-dist__cab mono"><span>Variación en el rango</span><em>del primer al último punto de cada serie</em></div>
      <div ref={ref} style={{ height: alto ?? Math.max(120, 28 * filas.length + 40) }} />
    </div>
  )
}
