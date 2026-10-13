/* ============================================================================
   Simulador del gasto en la oficina (CONTRATO-PANEL §8.4 v2.3, `GET /oficina/gasto`)
   y de las llamadas de un origen o un agente (`GET /oficina/gasto/llamadas`, pedido a
   Mugiwara; todavía no está en el contrato). Determinista: el mismo día dibuja lo
   mismo. Lo usan el simulador entero y, con VETA_SIMULAR=gasto, el puente contra la
   API real mientras Mugiwara despliega su ruta.
   ========================================================================== */
import { Hono } from 'hono'

const ORIGENES: [string, string, number][] = [['caja', 'Caja autónoma', 0.34], ['telegram', 'Pablo en Telegram', 0.24], ['panel', 'Pablo en el panel', 0.12], ['monitor', 'Monitor e informe diario', 0.1], ['radar', 'Radar y escáner', 0.08], ['programado', 'Clasificación, narrativas y resúmenes', 0.07], ['gatillo', 'Gatillos', 0.03], ['fuente_telegram', 'Grupos de Telegram (lectura de la fuente)', 0.01], ['terminal', 'Pablo en el CLI', 0.01]]
const AGENTES: [string, string, number][] = [['luffy', 'Luffy', 0.74], ['cuant', 'Cuant', 0.06], ['investigador', 'Investigador', 0.07], ['estratega', 'Estratega', 0.03], ['estilo', 'Reescritura de estilo', 0.02], ['resumen', 'Resúmenes', 0.02], ['informe', 'Informe diario', 0.01], ['jev', 'Jev', 0.02], ['haiku', 'Haiku por lotes', 0.01], ['radar', 'Sonnet del radar', 0.01], ['telegram_grupos', 'Lectura de grupos de Telegram', 0.01]]
const r2 = (v: number) => Math.round(v * 100) / 100
/* el día en hora de Chile (UTC−3) */
const diaChile = (t: number) => new Date(t - 3 * 3600_000).toISOString().slice(0, 10)
function azar(s: string) { let a = [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 7); return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

function serie() {
  const out: { dia: string; uso_real_usd: number; pruebas_usd: number; por_origen: Record<string, number> }[] = []
  for (let k = 29; k >= 0; k--) {
    const dia = diaChile(Date.now() - k * 86_400_000), r = azar(dia)
    // hoy va por la parte del día que pasó
    const parte = k === 0 ? Math.max(0.15, ((Date.now() - 3 * 3600_000) % 86_400_000) / 86_400_000) : 1
    const total = (2.6 + r() * 2.2) * parte, pruebas = r() < 0.35 ? r2((1 + r() * 9) * parte) : 0
    const por_origen: Record<string, number> = {}
    for (const [o, , w] of ORIGENES) por_origen[o] = r2(total * w * (0.7 + r() * 0.6))
    if (pruebas) por_origen.prueba = pruebas
    out.push({ dia, uso_real_usd: r2(Object.entries(por_origen).filter(([k2]) => k2 !== 'prueba').reduce((a, [, v]) => a + v, 0)), pruebas_usd: pruebas, por_origen })
  }
  return out
}
function tramo(dias: ReturnType<typeof serie>, desde: string) {
  const uso = dias.reduce((a, d) => a + d.uso_real_usd, 0), pruebas = dias.reduce((a, d) => a + d.pruebas_usd, 0)
  const por_origen = ORIGENES.map(([o, etiqueta]) => { const c = dias.reduce((a, d) => a + (d.por_origen[o] ?? 0), 0); return { origen: o, etiqueta, costo_usd: r2(c), llamadas: Math.round(c * 7.5), inferido_usd: 0, pct: r2((c / (uso || 1)) * 100) } }).filter((x) => x.costo_usd > 0)
  const por_agente = AGENTES.map(([a, etiqueta, w]) => ({ agente: a, etiqueta, costo_usd: r2(uso * w), llamadas: Math.round(uso * w * (a === 'jev' ? 900 : 7)), inferido_usd: 0, pct: r2(w * 100) }))
  return { desde, uso_real_usd: r2(uso), pruebas_usd: r2(pruebas), total_usd: r2(uso + pruebas), por_origen, por_agente, por_agente_pruebas: pruebas ? [{ agente: 'juez', etiqueta: 'Juez del banco', costo_usd: r2(pruebas * 0.6), llamadas: 40, inferido_usd: 0, pct: 60 }, { agente: 'luffy', etiqueta: 'Luffy', costo_usd: r2(pruebas * 0.4), llamadas: 22, inferido_usd: 0, pct: 40 }] : [] }
}

export const simuladorGasto = new Hono()
simuladorGasto.get('/oficina/gasto', (c) => {
  const s = serie(), hoy = diaChile(Date.now()), mes = hoy.slice(0, 7)
  const delMes = s.filter((d) => d.dia.startsWith(mes)), usadoMes = r2(delMes.reduce((a, d) => a + d.uso_real_usd, 0))
  const umbral = { presupuesto_api_usd: 140, aviso_usd: 100, degradar_usd: 125 }
  return c.json({
    hoy: tramo(s.slice(-1), `${hoy}T00:00:00-03:00`), siete_dias: tramo(s.slice(-7), `${s[s.length - 7].dia}T00:00:00-03:00`), mes: tramo(delMes, `${mes}-01T00:00:00-03:00`),
    serie_diaria: s,
    umbrales: { ...umbral, usado_mes_usd: usadoMes, estado: usadoMes >= umbral.degradar_usd ? 'degradado' : usadoMes >= umbral.aviso_usd ? 'aviso' : 'normal', restante_usd: r2(umbral.presupuesto_api_usd - usadoMes), nota: 'los umbrales miran el uso real del mes (sin pruebas)' },
    origenes: [...ORIGENES.map(([origen, etiqueta]) => ({ origen, etiqueta })), { origen: 'prueba', etiqueta: 'Pruebas de las sesiones' }],
    nota: 'Antes del 12-oct las llamadas no guardaban su origen: se infirió del hilo, el modo y el propósito.',
    consultado_en: new Date().toISOString(), fuente: 'simulador', vitrina: { calculado_en: new Date().toISOString(), edad_s: 5, cada_s: 60, estado: 'fresco', duracion_ms: 20, error: null },
  })
})
simuladorGasto.get('/oficina/gasto/llamadas', (c) => {
  const origen = c.req.query('origen'), agente = c.req.query('agente'), periodo = c.req.query('periodo') ?? 'hoy', limite = Math.min(200, Number(c.req.query('limite') ?? 60) || 60)
  const horas = periodo === 'mes' ? 24 * 12 : periodo === 'siete_dias' ? 24 * 7 : 12
  const r = azar(`${origen}|${agente}|${periodo}`)
  const items = Array.from({ length: Math.min(limite, 24) }, (_, i) => {
    const o = origen ?? ORIGENES[Math.floor(r() * ORIGENES.length)][0], a = agente ?? (o === 'programado' ? 'haiku' : r() < 0.8 ? 'luffy' : 'cuant')
    const caro = a === 'luffy' || a === 'investigador'
    const etiqueta = AGENTES.find(([k]) => k === a)?.[1] ?? a
    return { hora: new Date(Date.now() - (i + r()) * (horas / 24) * 3600_000).toISOString(), origen: o, agente: a, agente_etiqueta: etiqueta, hilo_titulo: o === 'caja' ? 'Caja · la misión del mes' : null, modelo: caro ? 'claude-fable-5-1' : a === 'haiku' ? 'claude-haiku-4-5' : 'claude-sonnet-5', costo_usd: r2((caro ? 0.08 + r() * 0.5 : 0.002 + r() * 0.02) * 100) / 100, tokens: { entrada: Math.round(800 + r() * 4000), cache_lectura: caro ? Math.round(20000 + r() * 30000) : 0, salida: Math.round(120 + r() * 900) }, hilo_id: 'c0ffee00-0000-4000-8000-000000000001', mensaje_id: 1300 + i, tipo_turno: o === 'caja' ? 'caja' : o === 'radar' ? 'radar' : 'dato_grafico', inferido: r() < 0.1 }
  })
  return c.json({ items, siguiente: items.length >= Math.min(limite, 24) ? items[items.length - 1].hora : null, periodo, origen: origen ?? null, agente: agente ?? null, consultado_en: new Date().toISOString(), fuente: 'simulador' })
})

/* la línea de un turno (v2.3, `GET /oficina/turnos/{mensaje_id}`), la del turno del guion de la oficina. Aparte del
   gasto: esta ruta ya existe en Mugiwara, así que sólo la responde el simulador entero (nunca delante de la API real). */
export const simuladorTurnos = new Hono()
simuladorTurnos.get('/oficina/turnos/:id', (c) => {
  const id = Number(c.req.param('id'))
  const ini = Date.now() - 40_000, h = (s: number) => new Date(ini + s * 1000).toISOString()
  const pasos = [
    { tipo: 'modelo', hora: h(2.8), t_s: 2.8, quien: 'luffy', modelo: 'claude-fable-5-1', iteracion: 1, tokens: { entrada: 2100, cache_lectura: 41000, cache_escritura: 0, salida: 310 }, costo_usd: 0.061 },
    { tipo: 'herramienta', hora: h(3.2), t_s: 3.2, quien: 'luffy', nombre: 'exchange_ticker', fuente: 'bingx', ok: true, duracion_s: 0.4 },
    { tipo: 'herramienta', hora: h(4.1), t_s: 4.1, quien: 'luffy', nombre: 'derivados', fuente: 'binance_futures', ok: true, duracion_s: 1.2, activos: ['WAL'] },
    { tipo: 'modelo', hora: h(7.5), t_s: 7.5, quien: 'luffy', modelo: 'claude-fable-5-1', iteracion: 2, costo_usd: 0.044 },
    { tipo: 'agente_convocado', hora: h(8), t_s: 8, quien: 'cuant' },
    { tipo: 'herramienta', hora: h(9.4), t_s: 9.4, quien: 'cuant', nombre: 'defillama_serie', fuente: 'defillama', ok: true, duracion_s: 2.1 },
    { tipo: 'modelo', hora: h(14), t_s: 14, quien: 'cuant', modelo: 'claude-sonnet-5', iteracion: 1, costo_usd: 0.012 },
    { tipo: 'agente_terminado', hora: h(18), t_s: 18, quien: 'cuant', costo_usd: 0.012, duracion_s: 10, ok: true, turnos: 1 },
    { tipo: 'modelo', hora: h(31), t_s: 31, quien: 'luffy', modelo: 'claude-fable-5-1', iteracion: 3, costo_usd: 0.053 },
  ]
  return c.json({ mensaje_id: id, hilo_id: 'c0ffee00-0000-4000-8000-000000000001', canal: 'panel', tipo_turno: 'dato_grafico', modelo: 'claude-fable-5-1', inicio: h(0), fin: h(34), duracion_s: 34, costo_usd: 0.17, costo_llamadas_usd: 0.17, n_herramientas: 3, agentes: [{ agente: 'cuant', convocado_en: h(8), terminado_en: h(18), duracion_s: 10, costo_usd: 0.012, herramientas: ['defillama_serie'] }], pasos, completo: true, nota: null, consultado_en: new Date().toISOString(), fuente: 'simulador' })
})
