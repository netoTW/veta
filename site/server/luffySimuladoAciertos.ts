/* ============================================================================
   Simulador de GET /radar/aciertos (CONTRATO-PANEL §8.9, v2.6 y v2.7), con la forma
   del ejemplo real del 14-oct: por modo y versión, el total, las propuestas de Luffy
   y la caja contra mantener. A diferencia del real de ese día, aquí el radar lleva
   tres semanas, así que el plazo de 7 días ya se cumplió en parte (para probar los
   dos casos). v2.7: cada plazo trae la mediana del universo que el radar no marcó.
   La caja trae los casos que hay que saber dibujar: una abierta, dos simuladas y una
   en la que el stop por volatilidad saltó.
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
const UNIVERSO_N = 214

type Medida = Record<string, Record<string, unknown>>
function conUniverso(x: Record<string, unknown>) {
  const u = r2((r() - 0.55) * 8)
  x.universo_pct = u; x.universo_n = UNIVERSO_N - Math.floor(r() * 12); x.exceso_universo_pct = r2((x.ret_pct as number) - u)
}
function medir(desde: number, hoy: number, base: number): Medida {
  const m: Medida = {}
  for (const h of HZ) {
    const fin = desde + h * DIA
    if (fin > hoy) { m[`${h}d`] = { pendiente: true, fecha: iso(fin) }; continue }
    const ret = r2(base + (r() - 0.5) * 18), btc = r2((r() - 0.5) * 6)
    m[`${h}d`] = { ret_pct: ret, btc_pct: btc, exceso_pct: r2(ret - btc), fecha: iso(fin) }
    conUniverso(m[`${h}d`])
  }
  const ret = r2(base + (r() - 0.5) * 24), btc = r2((r() - 0.5) * 4)
  m.a_hoy = { fecha: iso(hoy), dias: Math.round((hoy - desde) / DIA), ret_pct: ret, btc_pct: btc, exceso_pct: r2(ret - btc), provisional: true }
  conUniverso(m.a_hoy)
  return m
}
const mediana = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2 }
function agregar(items: { activo: string; medida: Medida }[]) {
  const out: Record<string, unknown> = {}
  for (const p of ['7d', '14d', '30d', 'a_hoy']) {
    const con = items.filter((x) => !x.medida[p].pendiente)
    const pend = items.length - con.length
    if (!con.length) { out[p] = { n: 0, pendientes: pend, plazo: pend ? 'pendiente' : 'sin_datos' }; continue }
    const rets = con.map((x) => x.medida[p].ret_pct as number), exc = con.map((x) => x.medida[p].exceso_pct as number), exu = con.map((x) => x.medida[p].exceso_universo_pct as number)
    const peor = con.reduce((a, b) => ((a.medida[p].ret_pct as number) < (b.medida[p].ret_pct as number) ? a : b))
    const mejor = con.reduce((a, b) => ((a.medida[p].ret_pct as number) > (b.medida[p].ret_pct as number) ? a : b))
    out[p] = {
      n: con.length, pendientes: pend, plazo: pend ? 'parcial' : 'cumplido',
      acierto_vs_universo_pct: r2((exu.filter((e) => e > 0).length / con.length) * 100), exceso_universo_medio_pct: r2(exu.reduce((a, b) => a + b, 0) / exu.length), exceso_universo_mediano_pct: r2(mediana(exu)), universo_n_mediano: UNIVERSO_N - 6,
      acierto_pct: r2((exc.filter((e) => e > 0).length / con.length) * 100), ret_medio_pct: r2(rets.reduce((a, b) => a + b, 0) / rets.length), ret_mediano_pct: r2(mediana(rets)), exceso_medio_pct: r2(exc.reduce((a, b) => a + b, 0) / exc.length),
      peor: { activo: peor.activo, ret_pct: peor.medida[p].ret_pct }, mejor: { activo: mejor.activo, ret_pct: mejor.medida[p].ret_pct },
    }
  }
  return out
}
const es = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}`
function linea(etiqueta: string, n: number, a: Record<string, unknown>, nombre = 'señales') {
  const s = a['7d'] as { n: number; acierto_pct?: number; ret_mediano_pct?: number; acierto_vs_universo_pct?: number; exceso_universo_mediano_pct?: number }
  const h = a.a_hoy as { acierto_pct: number; ret_mediano_pct: number; acierto_vs_universo_pct: number; exceso_universo_mediano_pct: number }
  const x = s.n ? s : h
  const cab = s.n ? `${etiqueta}: ${n} ${nombre}; a 7 días (${s.n} con el plazo cumplido)` : `${etiqueta}: ${n} ${nombre}, ningún plazo cumplido; hasta hoy (provisional)`
  return `${cab} le ganó a la mediana de lo que no marcó el ${Math.round(x.acierto_vs_universo_pct ?? 0)} % (diferencia mediana ${es(x.exceso_universo_mediano_pct ?? 0)} %) y a BTC el ${Math.round(x.acierto_pct ?? 0)} %, retorno mediano ${es(x.ret_mediano_pct ?? 0)} %.`
}

/* ---------- la caja contra mantener ---------- */
function mantener(desde: number, hoy: number, precio: number, sendas: number[], stop: number | null) {
  // `sendas`: el retorno de cada día desde la compra (%); con stop, sale el primer día que lo toca
  const out: Record<string, Record<string, unknown>> = {}
  const salto = stop === null ? -1 : sendas.findIndex((v) => precio * (1 + v / 100) <= stop)
  for (const h of [...HZ, null]) {
    const dias = h ?? Math.round((hoy - desde) / DIA)
    const k = h ? `${h}d` : 'a_hoy'
    if (h && desde + h * DIA > hoy) { out[k] = { pendiente: true, fecha: iso(desde + h * DIA) }; continue }
    if (salto >= 0 && salto < dias) { out[k] = { ret_pct: r2(((stop as number) / precio - 1) * 100), salio_por_stop: iso(desde + (salto + 1) * DIA) }; continue }
    out[k] = { ret_pct: sendas[Math.min(dias, sendas.length) - 1], fecha: iso(desde + dias * DIA) }
  }
  return out
}
function cajaSimulada(hoy: number) {
  const ops = [
    // real, cerrada, el stop por volatilidad no saltó; la moneda siguió subiendo
    { id: '2276a2', activo: 'WAL', mision: '69ed37', simulado: false, hace: 18, precio: 0.03797, usdt: 84.71, stop_caja: 0.0328, atr: 9.2, tesis: 'Squeeze cargado en WAL: los cortos apalancados pagan 36 % anual por mantenerse (funding en el percentil 2 de 90 d), el dinero apalancado abierto está en el percentil 98 de 30 d y subió 25 % en un día con el precio plano, mientras el volumen neto spot triplica su media. En régimen risk-on y con beta ', real: { ret_pct: -3.79, pnl_usdt: -3.38, dias: 0.9, ventas: 1, salida: 0.03653 }, deriva: 3.2 },
    // real, cerrada; con stop por volatilidad sale al cuarto día
    { id: '0674b1', activo: 'SKL', mision: '69ed37', simulado: false, hace: 9, precio: 0.0054, usdt: 59.67, stop_caja: 0.00478, atr: 10.46, tesis: 'SKL sube 47 % en 30 d y 19 % contra BTC en 7 d con compra real en spot.', real: { ret_pct: -0.93, pnl_usdt: -0.6707, dias: 0.6, ventas: 1, salida: 0.00535 }, deriva: -6.5 },
    // real, abierta
    { id: '16bddb', activo: 'ENA', mision: '7a11c0', simulado: false, hace: 2, precio: 0.412, usdt: 90, stop_caja: 0.37, atr: 8.1, tesis: 'Impulso con volumen creciente y cortos apilados en ENA.', real: null, deriva: 1.1 },
    // simuladas
    { id: '928e1d', activo: 'STRK', mision: '95faad', simulado: true, hace: 19, precio: 0.10295, usdt: 30, stop_caja: 0.0854, atr: 14.44, tesis: 'Misión ×2: jugada de impulso con combustible de cortos.', real: { ret_pct: 10.06, pnl_usdt: 2.9518, dias: 0.9, ventas: 2, salida: 0.11330629 }, deriva: -2.4 },
    { id: '6282d2', activo: 'KAIA', mision: '95faad', simulado: true, hace: 19, precio: 0.0567, usdt: 25, stop_caja: 0.0467, atr: 12.63, tesis: 'Misión ×2: ingresos del protocolo +230 % semana a semana y cortos muy cargados.', real: { ret_pct: -7.41, pnl_usdt: -1.8981, dias: 1, ventas: 1, salida: 0.0525 }, deriva: -1.5 },
  ]
  const operaciones = ops.map((o) => {
    const desde = hoy - o.hace * DIA, stop = r2(o.precio * (1 - 2 * o.atr / 100) * 1e8) / 1e8
    const sendas: number[] = []; let v = 0
    for (let i = 0; i < Math.max(1, o.hace); i++) { v = r2(v + o.deriva + (r() - 0.5) * 6); sendas.push(v) }
    return {
      id: o.id, activo: o.activo, mision: o.mision, simulado: o.simulado, fecha: new Date(desde).toISOString().slice(0, 16) + '+00:00',
      precio_entrada: o.precio, usdt: o.usdt, stop_caja: o.stop_caja, tesis: o.tesis.slice(0, 300),
      real: o.real ? { fecha: new Date(desde + o.real.dias * DIA).toISOString().slice(0, 16) + '+00:00', precio_salida: o.real.salida, ret_pct: o.real.ret_pct, pnl_usdt: o.real.pnl_usdt, dias: o.real.dias, ventas: o.real.ventas } : { abierta: true },
      atr_pct: o.atr, stop_volatilidad: stop,
      mantener_sin_stop: mantener(desde, hoy, o.precio, sendas, null),
      mantener_stop_volatilidad: mantener(desde, hoy, o.precio, sendas, stop),
    }
  })
  const reales = operaciones.filter((o) => !o.simulado)
  const media = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => typeof x === 'number'); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : null }
  const resumen: Record<string, unknown> = { operaciones: reales.length, real_medio_pct: media(reales.map((o) => (o.real as { ret_pct?: number }).ret_pct)) }
  for (const k of ['7d', '14d', '30d', 'a_hoy']) {
    resumen[`sin_stop_${k}_medio_pct`] = media(reales.map((o) => o.mantener_sin_stop[k].ret_pct as number | undefined))
    resumen[`stop_vol_${k}_medio_pct`] = media(reales.map((o) => o.mantener_stop_volatilidad[k].ret_pct as number | undefined))
  }
  return { operaciones, resumen_real: resumen, metodo_stop: 'stop fijo a 2 × ATR diario de 14 días bajo la entrada; sale el primer día cuyo mínimo lo toca' }
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
    universo: { monedas_con_velas: UNIVERSO_N, que_es: 'las monedas que sigue el radar (BingX líquido y las del motor) que no marcó ese día; retorno mediano del mismo período' },
    radar: { por_modo, total: { senales: items.length, ...tot, texto: linea('Todo el radar', items.length, tot) }, items },
    luffy: { propuestas: props.length, ...lu, texto: linea('Propuestas de entrada de Luffy', props.length, lu, 'propuestas'), items: props },
    caja: cajaSimulada(hoy),
    lineas: [...por_modo.map((m) => m.texto), linea('Propuestas de entrada de Luffy', props.length, lu, 'propuestas')],
    no_disponibles: [],
    consultado_en: new Date(hoy).toISOString(),
    fuente: 'candidatas, ordenes y bitácora de Mugiwara; velas diarias de BingX (Binance de respaldo)',
    vitrina: { calculado_en: new Date(hoy - 49 * 60_000).toISOString(), edad_s: 2940, cada_s: 21600, estado: 'fresco', duracion_ms: 4385, error: null },
  }
}
