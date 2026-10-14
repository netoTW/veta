/* ============================================================================
   El gasto en la oficina (CONTRATO-PANEL §8.4, v2.3): `GET /oficina/gasto` trae hoy,
   7 días y el mes por origen y por agente, la serie diaria y los umbrales; lo de las
   pruebas de las sesiones va aparte y no cuenta para los umbrales.

   Las llamadas de un origen o de un agente (lo que se ve al tocarlos):
   `GET /oficina/gasto/llamadas?periodo=hoy|siete_dias|mes&origen=&agente=&limite=60`
   (v2.4). Desde la v2.6 el servidor corta el período en hora de Chile, igual que las
   barras: lo que llega se muestra tal cual. Todo lo de la forma vive aquí, con un
   adaptador tolerante: un campo que
   falta queda vacío, nunca un cero inventado.
   ========================================================================== */
import { pedir, qs } from '../api6b'

export type Periodo = 'hoy' | 'siete_dias' | 'mes'
export interface Parte { clave: string; etiqueta: string; costo_usd: number; llamadas: number | null; inferido_usd: number; pct: number | null }
export interface Tramo { desde: string | null; uso_real_usd: number | null; pruebas_usd: number; por_origen: Parte[]; por_agente: Parte[]; por_agente_pruebas: Parte[] }
export interface Gasto {
  hoy: Tramo; siete_dias: Tramo; mes: Tramo
  serie: { dia: string; uso_real_usd: number; pruebas_usd: number; por_origen: Record<string, number> }[]
  umbrales: { presupuesto_usd: number | null; aviso_usd: number | null; degradar_usd: number | null; usado_mes_usd: number | null; estado: 'normal' | 'aviso' | 'degradado'; restante_usd: number | null; nota: string | null }
  origenes: Record<string, string>
  nota: string | null; consultado_en: string | null
}
export interface Llamada { hora: string; origen: string; agente: string; agente_etiqueta: string | null; hilo_titulo: string | null; modelo: string | null; costo_usd: number; tokens: { entrada: number | null; salida: number | null; cache: number | null } | null; hilo_id: string | null; mensaje_id: number | null; tipo_turno: string | null; inferido: boolean }

type C = Record<string, unknown>
const obj = (v: unknown): C => (v && typeof v === 'object' && !Array.isArray(v) ? (v as C) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)

const partes = (v: unknown, k: 'origen' | 'agente'): Parte[] => arr(v).flatMap((x) => { const o = obj(x), c = str(o[k]); return c ? [{ clave: c, etiqueta: str(o.etiqueta) ?? c, costo_usd: num(o.costo_usd) ?? 0, llamadas: num(o.llamadas), inferido_usd: num(o.inferido_usd) ?? 0, pct: num(o.pct) }] : [] }).sort((a, b) => b.costo_usd - a.costo_usd)
const tramo = (v: unknown): Tramo => { const o = obj(v); return { desde: str(o.desde), uso_real_usd: num(o.uso_real_usd), pruebas_usd: num(o.pruebas_usd) ?? 0, por_origen: partes(o.por_origen, 'origen'), por_agente: partes(o.por_agente, 'agente'), por_agente_pruebas: partes(o.por_agente_pruebas, 'agente') } }

export function adaptarGasto(c: unknown): Gasto {
  const o = obj(c), u = obj(o.umbrales)
  const est = str(u.estado)
  return {
    hoy: tramo(o.hoy), siete_dias: tramo(o.siete_dias), mes: tramo(o.mes),
    serie: arr(o.serie_diaria).flatMap((x) => { const d = obj(x), dia = str(d.dia); if (!dia) return []; const po: Record<string, number> = {}; for (const [k, v] of Object.entries(obj(d.por_origen))) if (typeof v === 'number') po[k] = v; return [{ dia, uso_real_usd: num(d.uso_real_usd) ?? 0, pruebas_usd: num(d.pruebas_usd) ?? 0, por_origen: po }] }).sort((a, b) => a.dia.localeCompare(b.dia)),
    umbrales: { presupuesto_usd: num(u.presupuesto_api_usd), aviso_usd: num(u.aviso_usd), degradar_usd: num(u.degradar_usd), usado_mes_usd: num(u.usado_mes_usd), estado: est === 'aviso' || est === 'degradado' ? est : 'normal', restante_usd: num(u.restante_usd), nota: str(u.nota) },
    origenes: Object.fromEntries(arr(o.origenes).flatMap((x) => { const d = obj(x); return str(d.origen) ? [[str(d.origen)!, str(d.etiqueta) ?? str(d.origen)!]] : [] })),
    nota: str(o.nota), consultado_en: str(o.consultado_en),
  }
}
const adaptarLlamadas = (c: unknown): { items: Llamada[]; mas: boolean } => ({ mas: !!str(obj(c).siguiente), items: arr(obj(c).items).flatMap((x) => {
  const o = obj(x), h = str(o.hora); if (!h) return []
  const t = o.tokens ? obj(o.tokens) : null
  return [{ hora: h, origen: str(o.origen) ?? '', agente: str(o.agente) ?? str(o.quien) ?? '', agente_etiqueta: str(o.agente_etiqueta), hilo_titulo: str(o.hilo_titulo), modelo: str(o.modelo), costo_usd: num(o.costo_usd) ?? 0, tokens: t ? { entrada: num(t.entrada), salida: num(t.salida), cache: num(t.cache_lectura) } : null, hilo_id: str(o.hilo_id), mensaje_id: num(o.mensaje_id), tipo_turno: str(o.tipo_turno), inferido: o.inferido === true }]
}) })

export const gastoApi = {
  gasto: (signal?: AbortSignal) => pedir<unknown>('/oficina/gasto', { signal }).then(adaptarGasto),
  llamadas: (periodo: Periodo, f: { origen?: string; agente?: string }, signal?: AbortSignal) => pedir<unknown>(`/oficina/gasto/llamadas${qs({ periodo, origen: f.origen, agente: f.agente, limite: 60 })}`, { signal }).then(adaptarLlamadas),
}

/** Los umbrales son del mes: para hoy y 7 días se llevan al ritmo (la parte de días que le toca a cada tramo). */
export function umbralesDe(g: Gasto, p: Periodo): { aviso: number | null; degradar: number | null; presupuesto: number | null; ritmo: boolean } {
  const u = g.umbrales
  if (p === 'mes') return { aviso: u.aviso_usd, degradar: u.degradar_usd, presupuesto: u.presupuesto_usd, ritmo: false }
  const hoy = new Date(), dias = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate(), k = (p === 'hoy' ? 1 : 7) / dias
  const x = (v: number | null) => (v === null ? null : v * k)
  return { aviso: x(u.aviso_usd), degradar: x(u.degradar_usd), presupuesto: x(u.presupuesto_usd), ritmo: true }
}
