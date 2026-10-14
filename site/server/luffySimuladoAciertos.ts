/* ============================================================================
   Simulador de GET /radar/aciertos (CONTRATO-PANEL §8.9, v2.6), con la forma del
   ejemplo real del 14-oct: por modo y versión, el total, las propuestas de Luffy y
   la caja. A diferencia del real de ese día, aquí el radar lleva tres semanas, así
   que el plazo de 7 días ya se cumplió en parte (para probar los dos casos).
   ========================================================================== */
const DIA = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
let semilla = 7
const r = () => { semilla = (semilla * 16807) % 2147483647; return (semilla - 1) / 2147483646 }
const r2 = (v: number) => Math.round(v * 100) / 100

const MODOS = [
  { modo: 'impulso', version: '1', etiqueta: 'Impulso v1', n: 17, monedas: ['KAIA', 'STRK', 'ENA', 'TIA', 'ARB'] },
  { modo: 'legado', version: '0', etiqueta: 'Escáner (antes del radar)', n: 7, monedas: ['STRK', 'OP', 'LDO'] },
  { modo: 'squeeze', version: '1', etiqueta: 'Squeeze v1', n: 24, monedas: ['WAL', 'BLUR', 'SYN', 'ASTER', 'CVX', 'GMX'] },
]
const HZ = [7, 14, 30] as const

type Medida = Record<string, Record<string, unknown>>
function medir(desde: number, hoy: number, base: number): Medida {
  const m: Medida = {}
  for (const h of HZ) {
    const fin = desde + h * DIA
    if (fin > hoy) { m[`${h}d`] = { pendiente: true, fecha: iso(fin) }; continue }
    const ret = r2(base + (r() - 0.5) * 18), btc = r2((r() - 0.5) * 6)
    m[`${h}d`] = { ret_pct: ret, btc_pct: btc, exceso_pct: r2(ret - btc), fecha: iso(fin) }
  }
  const ret = r2(base + (r() - 0.5) * 24), btc = r2((r() - 0.5) * 4)
  m.a_hoy = { fecha: iso(hoy), dias: Math.round((hoy - desde) / DIA), ret_pct: ret, btc_pct: btc, exceso_pct: r2(ret - btc), provisional: true }
  return m
}
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }
function agregar(items: { activo: string; medida: Medida }[]) {
  const out: Record<string, unknown> = {}
  for (const p of ['7d', '14d', '30d', 'a_hoy']) {
    const con = items.filter((x) => !x.medida[p].pendiente)
    const pend = items.length - con.length
    if (!con.length) { out[p] = { n: 0, pendientes: pend }; continue }
    const rets = con.map((x) => x.medida[p].ret_pct as number), exc = con.map((x) => x.medida[p].exceso_pct as number)
    const peor = con.reduce((a, b) => ((a.medida[p].ret_pct as number) < (b.medida[p].ret_pct as number) ? a : b))
    const mejor = con.reduce((a, b) => ((a.medida[p].ret_pct as number) > (b.medida[p].ret_pct as number) ? a : b))
    out[p] = { n: con.length, pendientes: pend, acierto_pct: r2((exc.filter((e) => e > 0).length / con.length) * 100), ret_medio_pct: r2(rets.reduce((a, b) => a + b, 0) / rets.length), ret_mediano_pct: r2(mediana(rets)), exceso_medio_pct: r2(exc.reduce((a, b) => a + b, 0) / exc.length), peor: { activo: peor.activo, ret_pct: peor.medida[p].ret_pct }, mejor: { activo: mejor.activo, ret_pct: mejor.medida[p].ret_pct } }
  }
  return out
}
const es = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}`
function linea(etiqueta: string, n: number, a: Record<string, unknown>, nombre = 'señales') {
  const s = a['7d'] as { n: number; acierto_pct?: number; ret_mediano_pct?: number }
  const h = a.a_hoy as { acierto_pct: number; ret_mediano_pct: number }
  return s.n ? `${etiqueta}: ${n} ${nombre}; a 7 días (${s.n} cumplidas) le ganan a BTC el ${Math.round(s.acierto_pct ?? 0)} %, retorno mediano ${es(s.ret_mediano_pct ?? 0)} %.`
    : `${etiqueta}: ${n} ${nombre}, ningún plazo cumplido todavía; hasta hoy (provisional) le ganan a BTC el ${Math.round(h.acierto_pct)} %, retorno mediano ${es(h.ret_mediano_pct)} %.`
}

export function aciertosSimulados() {
  semilla = 7
  const hoy = Date.now(), inicio = hoy - 21 * DIA
  let id = 300
  const items = MODOS.flatMap((m) => Array.from({ length: m.n }, (_, i) => {
    const t = inicio + Math.floor(r() * 20) * DIA, activo = m.monedas[i % m.monedas.length]
    return { id: id++, fecha: iso(t), activo, modo: m.modo, version: m.version, precio_senal: r2(0.05 + r() * 2), medida: medir(t, hoy, m.modo === 'squeeze' ? -1 : -4) }
  }))
  const por_modo = MODOS.map((m) => {
    const xs = items.filter((x) => x.modo === m.modo), a = agregar(xs)
    return { modo: m.modo, version: m.version, etiqueta: m.etiqueta, senales: xs.length, desde: xs.map((x) => x.fecha).sort()[0], hasta: iso(hoy), ...a, texto: linea(m.etiqueta, xs.length, a) }
  })
  const tot = agregar(items)
  const props = Array.from({ length: 4 }, (_, i) => { const t = hoy - (i * 3 + 1) * DIA; return { id: `c70${i}c3`, fecha: new Date(t).toISOString().slice(0, 16) + '+00:00', activo: ['SYN', 'WAL', 'SYN', 'ENA'][i], estado: i ? 'ejecutada' : 'expirada', mandato: 'hold', precio_propuesta: r2(0.1 + r()), medida: medir(t, hoy, 0.5) } })
  const lu = agregar(props)
  return {
    horizontes_dias: [...HZ],
    radar: { por_modo, total: { senales: items.length, ...tot, texto: linea('Todo el radar', items.length, tot) }, items },
    luffy: { propuestas: props.length, ...lu, texto: linea('Propuestas de entrada de Luffy', props.length, lu, 'propuestas'), items: props },
    caja: { operaciones: [], resumen_real: { operaciones: 0 }, metodo_stop: 'stop fijo a 2 × ATR diario de 14 días bajo la entrada; sale el primer día cuyo mínimo lo toca' },
    lineas: [...por_modo.map((m) => m.texto), linea('Propuestas de entrada de Luffy', props.length, lu, 'propuestas')],
    no_disponibles: [],
    consultado_en: new Date(hoy).toISOString(),
    fuente: 'candidatas, ordenes y bitácora de Mugiwara; velas diarias de BingX (Binance de respaldo)',
    vitrina: { calculado_en: new Date(hoy - 49 * 60_000).toISOString(), edad_s: 2940, cada_s: 21600, estado: 'fresco', duracion_ms: 4385, error: null },
  }
}
