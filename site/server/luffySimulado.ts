/* ============================================================================
   Simulador de mugiwara-api con la forma exacta de CONTRATO-PANEL.md v1.1.

   Para desarrollar sin túnel, para las capturas y para los invariantes. Nada
   de aquí es real: las series salen de un generador con semilla fija, así cada
   corrida pinta lo mismo. Implementa lo que el panel usa: hilos, chat por SSE
   (inicio · paso · texto · grafico · propuesta · fin), propuestas, gráficos
   (datos, spec, catálogo), tableros, historial de posiciones y costo.
   ========================================================================== */
import { Hono } from 'hono'
import { simuladorTerminal2 } from './luffySimuladoTerminal2.ts'

/* ---------- utilidades ---------- */
const ahora = () => new Date().toISOString().replace(/\.\d{3}Z$/, '+00:00')
const DIA = 86_400
const hoy0 = () => Math.floor(Date.now() / 1000 / DIA) * DIA
function azar(semilla: number) {
  let a = semilla >>> 0
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const hex = (n: number, semilla: number) => { const r = azar(semilla); let s = ''; while (s.length < n) s += Math.floor(r() * 16).toString(16); return s }
const redondeo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d

/* ---------- universo ---------- */
const ACTIVOS: Record<string, { nombre: string; precio: number; deriva: number; vol: number; decimales: number; defillama?: { slug: string; categoria: string }; perp: boolean; volumen_24h_usdt: number }> = {
  STONK: { nombre: 'StonkFun', precio: 0.1167, deriva: -0.0012, vol: 0.032, decimales: 4, defillama: { slug: 'stonkfun', categoria: 'Launchpad' }, perp: true, volumen_24h_usdt: 79_000 },
  BTC: { nombre: 'Bitcoin', precio: 112_000, deriva: 0.0006, vol: 0.022, decimales: 0, perp: true, volumen_24h_usdt: 820_000_000 },
  ETH: { nombre: 'Ethereum', precio: 3_900, deriva: 0.0004, vol: 0.03, decimales: 1, perp: true, volumen_24h_usdt: 310_000_000 },
  SOL: { nombre: 'Solana', precio: 196, deriva: 0.001, vol: 0.04, decimales: 2, perp: true, volumen_24h_usdt: 140_000_000 },
  PUMP: { nombre: 'Pump', precio: 0.0062, deriva: -0.002, vol: 0.07, decimales: 5, defillama: { slug: 'pump', categoria: 'Launchpad' }, perp: true, volumen_24h_usdt: 21_000_000 },
  HYPE: { nombre: 'Hyperliquid', precio: 46, deriva: 0.002, vol: 0.045, decimales: 2, defillama: { slug: 'hyperliquid', categoria: 'Dexs' }, perp: true, volumen_24h_usdt: 95_000_000 },
}
const CATEGORIAS = ['Launchpad', 'Dexs', 'Lending', 'Liquid Staking', 'Bridge', 'Derivatives', 'Yield']

/** Velas diarias (o por intervalo) de un activo, siempre las mismas. */
function velas(activo: string, n: number, intervaloS: number): number[][] {
  const a = ACTIVOS[activo] ?? ACTIVOS.SOL
  const r = azar(activo.split('').reduce((s, c) => s * 31 + c.charCodeAt(0), 7) + intervaloS)
  const factor = Math.sqrt(intervaloS / DIA)
  // se camina hacia atrás desde el precio de hoy para que «hoy» sea estable
  const puntos: number[][] = []
  let cierre = a.precio
  const fin = hoy0()
  for (let i = 0; i < n; i++) {
    const t = fin - i * intervaloS
    const abre = cierre * (1 - (a.deriva * factor) + (r() - 0.5) * a.vol * factor * 2)
    const alto = Math.max(abre, cierre) * (1 + r() * a.vol * factor)
    const bajo = Math.min(abre, cierre) * (1 - r() * a.vol * factor)
    const volumen = a.volumen_24h_usdt * (intervaloS / DIA) * (0.6 + r() * 0.9)
    puntos.push([t, redondeo(abre, a.decimales + 1), redondeo(alto, a.decimales + 1), redondeo(bajo, a.decimales + 1), redondeo(cierre, a.decimales + 1), Math.round(volumen)])
    cierre = abre
  }
  return puntos.reverse()
}
const cierres = (v: number[][]) => v.map((p) => [p[0], p[4]])

/** Una serie diaria genérica por tipo: nivel, tendencia y ruido, con semilla por activo+tipo. */
function serieDiaria(activo: string, tipo: string, n: number): number[][] {
  const base: Record<string, [number, number, number]> = {
    ingresos: [820_000, -0.6, 0.35], fees: [1_050_000, -0.55, 0.3], holders_revenue: [410_000, -0.6, 0.4], tvl: [38_000_000, -0.25, 0.08], volumen_dex: [9_500_000, -0.4, 0.5],
    funding: [0.012, 0, 1.4], oi: [4_200_000, 0.3, 0.25], oi_horario: [4_200_000, 0.3, 0.1], long_short: [1.35, 0, 0.3],
    pulso_humanos: [140, 0.4, 0.6], pulso_bots: [60, 0, 0.5], pulso_granjas: [25, 1.2, 0.9], pulso_tono: [0.1, -0.3, 1.0], pulso_velocidad: [1.0, 0.5, 0.4],
    liquidaciones: [180_000, 0.2, 0.9],
  }
  const [nivel, tendencia, ruido] = base[tipo] ?? [1000, 0, 0.3]
  const esc = activo === 'STONK' ? 1 : activo === 'PUMP' ? 2.4 : activo === 'HYPE' ? 6 : activo === 'BTC' ? 400 : 60
  const r = azar(activo.length * 1009 + tipo.length * 7 + tipo.charCodeAt(0))
  const fin = hoy0(), out: number[][] = []
  for (let i = n - 1; i >= 0; i--) {
    const f = i / Math.max(1, n - 1) // 1 al inicio, 0 hoy
    let v = nivel * esc * (1 + tendencia * (1 - f)) * (1 + (r() - 0.5) * ruido)
    if (tipo === 'pulso_tono') v = Math.max(-1, Math.min(1, (tendencia * (1 - f)) + (r() - 0.5) * ruido))
    if (tipo === 'funding') v = (r() - 0.45) * 0.03
    out.push([fin - i * DIA, redondeo(v, tipo === 'funding' || tipo === 'pulso_tono' ? 4 : tipo === 'long_short' || tipo === 'pulso_velocidad' ? 3 : 0)])
  }
  return out
}
function categoriaMediana(categoria: string, metrica: string, n: number): number[][] {
  const r = azar(categoria.length * 131 + metrica.length)
  const fin = hoy0(), out: number[][] = []
  const nivel = metrica === 'tvl' ? 22_000_000 : metrica === 'volumen_dex' ? 4_100_000 : 290_000
  for (let i = n - 1; i >= 0; i--) out.push([fin - i * DIA, Math.round(nivel * (1 + 0.12 * Math.sin(i / 9) + (r() - 0.5) * 0.18))])
  return out
}

/* ---------- posiciones de Pablo ---------- */
function posicionesDe(origen: string) {
  const v = cierres(velas('STONK', 90, DIA))
  const en = v[v.length - 21], sal = v[v.length - 9]
  const precioEntrada = redondeo(en[1] * 0.985, 4), precioSalida = redondeo(sal[1] * 1.03, 4)
  const stop0 = redondeo(precioEntrada * 0.955, 4), stop1 = redondeo(precioEntrada * 1.009, 4)
  const cantidad = 291, vendida = 145
  const pnlReal = redondeo((precioSalida - precioEntrada) * vendida, 2)
  const pablo = {
    activo: 'STONK', origen: 'pablo', estado: 'abierta', mandato: 'swing', abierta_en: new Date(en[0] * 1000 + 83_000_000).toISOString(), cerrada_en: null,
    cantidad: cantidad - vendida, precio_medio: precioEntrada, costo_usdt: redondeo(precioEntrada * (cantidad - vendida), 2), comisiones_usdt: 0.06, pnl_realizado_usdt: pnlReal,
    entradas: [{ t: en[0] + 83_000, hora: new Date((en[0] + 83_000) * 1000).toISOString(), precio: precioEntrada, cantidad, usdt: redondeo(precioEntrada * cantidad, 2), comision_usdt: 0.03, orden_id: 'ord-' + hex(8, 11), id_corto: 'a1b2c3', fill_id: 'fill-' + hex(6, 12) }],
    salidas: [{ t: sal[0] + 40_000, hora: new Date((sal[0] + 40_000) * 1000).toISOString(), precio: precioSalida, cantidad: vendida, usdt: redondeo(precioSalida * vendida, 2), comision_usdt: 0.02, pnl_usdt: pnlReal, orden_id: 'ord-' + hex(8, 13), id_corto: 'b2c3d4', fill_id: 'fill-' + hex(6, 14) }],
    stops: [{ t: en[0] + 83_000, hora: new Date((en[0] + 83_000) * 1000).toISOString(), precio: stop0, accion: 'inicial', id_corto: 'a1b2c3' }, { t: sal[0] + 41_000, hora: new Date((sal[0] + 41_000) * 1000).toISOString(), precio: stop1, accion: 'ajuste', id_corto: 'c3d4e5' }],
    stop_vigente: { precio: stop1, cantidad: cantidad - vendida, orden_id: 'ord-' + hex(8, 15) },
    fuente: 'posiciones (fills reales) + ordenes + bitacora', consultado_en: ahora(),
  }
  const caja = { ...pablo, origen: 'caja', mandato: 'trade', simulado: true, cantidad: 80, entradas: [{ ...pablo.entradas[0], cantidad: 80, usdt: redondeo(precioEntrada * 80, 2), id_corto: 'f6e5d4' }], salidas: [], stops: [pablo.stops[0]], pnl_realizado_usdt: 0 }
  // la caja real (fase 6b): WAL abierta hoy con su stop inicial; STRK cerrada con ganancia
  const w = cierres(velas('WAL', 90, DIA)); const tw = w[w.length - 1][0] + 73_000
  const wal = { activo: 'WAL', origen: 'caja', estado: 'abierta', mandato: 'trade', abierta_en: new Date(tw * 1000).toISOString(), cerrada_en: null, cantidad: 2228.739, precio_medio: 0.03797, costo_usdt: 84.63, comisiones_usdt: 0.085, pnl_realizado_usdt: 0, simulado: false,
    entradas: [{ t: tw, hora: new Date(tw * 1000).toISOString(), precio: 0.03797, cantidad: 2228.739, usdt: 84.63, comision_usdt: 0.085, orden_id: 'o-8801', id_corto: 'c4j4w1', fill_id: 'f-9001' }], salidas: [],
    stops: [{ t: tw, hora: new Date(tw * 1000).toISOString(), precio: 0.0328, accion: 'inicial', id_corto: 'c4j4w1' }], stop_vigente: { precio: 0.0328, cantidad: 2228.739, orden_id: '2109380965351456769' }, fuente: 'posiciones (fills reales) + ordenes + bitacora', consultado_en: ahora() }
  const st = cierres(velas('STRK', 90, DIA)); const te = st[st.length - 2][0] + 40_000, ts = st[st.length - 1][0] + 30_000
  const strk = { activo: 'STRK', origen: 'caja', estado: 'cerrada', mandato: 'trade', abierta_en: new Date(te * 1000).toISOString(), cerrada_en: new Date(ts * 1000).toISOString(), cantidad: 0, precio_medio: 0.0854, costo_usdt: 0, comisiones_usdt: 0.055, pnl_realizado_usdt: 2.95, simulado: false,
    entradas: [{ t: te, hora: new Date(te * 1000).toISOString(), precio: 0.0854, cantidad: 292.8, usdt: 25.0, comision_usdt: 0.025, orden_id: 'o-8771', id_corto: 'c4j4s1', fill_id: 'f-8971' }], salidas: [{ t: ts, hora: new Date(ts * 1000).toISOString(), precio: 0.1008, cantidad: 292.8, usdt: 29.51, comision_usdt: 0.03, pnl_usdt: 2.95, orden_id: 'o-8790', id_corto: 'c4j4s2', fill_id: 'f-8990' }],
    stops: [{ t: te, hora: new Date(te * 1000).toISOString(), precio: 0.079, accion: 'inicial', id_corto: 'c4j4s1' }, { t: te + 40_000, hora: new Date((te + 40_000) * 1000).toISOString(), precio: 0.0985, accion: 'ajuste', id_corto: 'c4j4s3' }], stop_vigente: null, fuente: 'posiciones (fills reales) + ordenes + bitacora', consultado_en: ahora() }
  return origen === 'caja' ? [caja, wal, strk] : origen === 'ambos' ? [pablo, caja, wal, strk] : [pablo]
}

/* ---------- catálogo ---------- */
const CATALOGO_SERIES = [
  { tipo: 'ohlc', grupo: 'mercado', etiqueta: 'Precio (velas)', formato: 'ohlc', unidad: 'USDT', intervalos: ['1h', '4h', '1d', '1w'], requiere: ['activo'], estilos: ['velas', 'linea', 'area'], fuente: 'bingx o binance' },
  { tipo: 'cierre', grupo: 'mercado', etiqueta: 'Precio (cierre)', formato: 'valor', unidad: 'USDT', intervalos: ['1h', '4h', '1d', '1w'], requiere: ['activo'], estilos: ['linea', 'area'], fuente: 'bingx o binance' },
  { tipo: 'volumen', grupo: 'mercado', etiqueta: 'Volumen (USDT)', formato: 'valor', unidad: 'USDT', requiere: ['activo'], estilos: ['barras'], fuente: 'bingx o binance' },
  { tipo: 'volume_profile', grupo: 'mercado', etiqueta: 'Dónde se operó más (perfil de volumen)', formato: 'por_precio', requiere: ['activo'], fuente: 'cálculo propio sobre velas' },
  { tipo: 'funding', grupo: 'apalancamiento', etiqueta: 'Lo que pagan los apalancados (funding, %)', formato: 'valor', unidad: '%', requiere: ['activo'], fuente: 'binance futures (90 d) o coinalyze' },
  { tipo: 'oi', grupo: 'apalancamiento', etiqueta: 'Dinero apalancado abierto (USD)', formato: 'valor', unidad: 'USD', requiere: ['activo'], fuente: 'coinalyze diario; binance futures (30 d)' },
  { tipo: 'oi_horario', grupo: 'apalancamiento', etiqueta: 'Dinero apalancado abierto, cada hora (USD)', formato: 'valor', unidad: 'USD', requiere: ['activo'], fuente: 'historia propia (derivados_snapshots)' },
  { tipo: 'liquidaciones', grupo: 'apalancamiento', etiqueta: 'Liquidaciones diarias (USD)', formato: 'valor', unidad: 'USD', requiere: ['activo'], fuente: 'coinalyze', nota: 'se expande en dos series: <id> (compradores) y <id>:short (vendedores)' },
  { tipo: 'liquidaciones_estimadas', grupo: 'apalancamiento', etiqueta: 'Imán de liquidaciones (estimado por precio)', formato: 'por_precio', requiere: ['activo'], fuente: 'cálculo propio con el apalancamiento de binance' },
  { tipo: 'long_short', grupo: 'apalancamiento', etiqueta: 'Cuentas largas contra cortas (ratio)', formato: 'valor', unidad: 'ratio', requiere: ['activo'], fuente: 'coinalyze diario / historia propia' },
  { tipo: 'ingresos', grupo: 'fundamental', etiqueta: 'Ingresos (USD/día)', formato: 'valor', unidad: 'USD/día', requiere: ['activo'], fuente: 'defillama' },
  { tipo: 'fees', grupo: 'fundamental', etiqueta: 'Comisiones cobradas (USD/día)', formato: 'valor', unidad: 'USD/día', requiere: ['activo'], fuente: 'defillama' },
  { tipo: 'holders_revenue', grupo: 'fundamental', etiqueta: 'Ingresos a holders (USD/día)', formato: 'valor', unidad: 'USD/día', requiere: ['activo'], fuente: 'defillama' },
  { tipo: 'tvl', grupo: 'fundamental', etiqueta: 'Dinero depositado (TVL, USD)', formato: 'valor', unidad: 'USD', requiere: ['activo'], fuente: 'defillama' },
  { tipo: 'volumen_dex', grupo: 'fundamental', etiqueta: 'Volumen DEX (USD/día)', formato: 'valor', unidad: 'USD/día', requiere: ['activo'], fuente: 'defillama' },
  { tipo: 'categoria', grupo: 'fundamental', etiqueta: 'Categoría (mediana, media o suma de los protocolos)', formato: 'valor', requiere: ['metrica'], parametros: { metrica: ['ingresos', 'fees', 'holders_revenue', 'tvl', 'volumen_dex'], categoria: 'auto (la del activo) o un nombre de `categorias`', agregado: ['mediana', 'media', 'suma'] }, fuente: 'defillama' },
  { tipo: 'pulso_humanos', grupo: 'redes', etiqueta: 'Menciones de personas (24 h)', formato: 'valor', unidad: 'menciones', requiere: ['activo'], fuente: 'social_pulso' },
  { tipo: 'pulso_bots', grupo: 'redes', etiqueta: 'Menciones de bots informativos (24 h)', formato: 'valor', unidad: 'menciones', requiere: ['activo'], fuente: 'social_pulso' },
  { tipo: 'pulso_granjas', grupo: 'redes', etiqueta: 'Menciones de granjas (shill coordinado, 24 h)', formato: 'valor', unidad: 'menciones', requiere: ['activo'], fuente: 'social_pulso' },
  { tipo: 'pulso_tono', grupo: 'redes', etiqueta: 'Tono neto (−1 bajista … +1 alcista)', formato: 'valor', unidad: '−1…1', requiere: ['activo'], fuente: 'social_pulso' },
  { tipo: 'pulso_velocidad', grupo: 'redes', etiqueta: 'Velocidad de menciones contra su media de 7 días', formato: 'valor', unidad: '×', requiere: ['activo'], fuente: 'social_pulso' },
  { tipo: 'candidatas', grupo: 'radar', etiqueta: 'Cuándo el radar la marcó (marcadores)', formato: 'marcadores', requiere: ['activo'], fuente: 'candidatas' },
  { tipo: 'gatillos', grupo: 'radar', etiqueta: 'Niveles de tus gatillos', formato: 'niveles', requiere: ['activo'], fuente: 'gatillos' },
  { tipo: 'pnl', grupo: 'cartera', etiqueta: 'Resultado acumulado de la posición (USDT)', formato: 'valor', unidad: 'USDT', requiere: ['activo'], parametros: { origen: ['pablo', 'caja', 'ambos'] }, fuente: 'posiciones + velas' },
  { tipo: 'dataset', grupo: 'luffy', etiqueta: 'Dataset publicado por Luffy', formato: 'valor', requiere: ['dataset'], parametros: { dataset: 'nombre de `datasets`', campo: 'columna (por defecto, valor)' }, fuente: 'datasets (python_libre)' },
]
const ETIQUETA = Object.fromEntries(CATALOGO_SERIES.map((s) => [s.tipo, s.etiqueta]))
const UNIDAD = Object.fromEntries(CATALOGO_SERIES.map((s) => [s.tipo, s.unidad ?? '']))
const FORMATO = Object.fromEntries(CATALOGO_SERIES.map((s) => [s.tipo, s.formato]))
const DATASETS = [{ id: 3, nombre: 'stonk_ingresos_vs_precio_30d', descripcion: 'Ingresos diarios de STONK contra su precio, 30 días (python_libre)', unidad: 'USD', columnas: ['ts', 'valor', 'precio'], filas: 30, hilo_id: 'c0ffee00-0000-4000-8000-000000000002', creado: '2026-10-10T18:02:00+00:00' }]

function catalogo() {
  return {
    series: CATALOGO_SERIES,
    transformaciones: [
      { tipo: 'base100', etiqueta: 'Base 100', parametros: { desde: 'fecha opcional' } },
      { tipo: 'pct_desde', etiqueta: '% de cambio desde una fecha', parametros: { desde: 'fecha opcional' } },
      { tipo: 'ratio', etiqueta: 'Ratio contra otra serie', parametros: { contra: 'id de serie' } },
      { tipo: 'media_movil', etiqueta: 'Promedio móvil', parametros: { ventana: 'entero (7)' } },
      { tipo: 'acumulado', etiqueta: 'Suma acumulada' },
      { tipo: 'log', etiqueta: 'Escala logarítmica (del panel)' },
      { tipo: 'por_tvl', etiqueta: 'Por dólar depositado (serie / TVL)', aplica: ['ingresos', 'fees', 'holders_revenue', 'volumen_dex'] },
      { tipo: 'por_usuario', etiqueta: 'Por usuario activo (si DefiLlama lo tiene)', aplica: ['ingresos', 'fees', 'holders_revenue', 'volumen_dex', 'tvl'] },
    ],
    benchmarks: [
      { id: 'BTC', etiqueta: 'Bitcoin', tipo: 'activo' }, { id: 'ETH', etiqueta: 'Ethereum', tipo: 'activo' },
      { id: 'categoria', etiqueta: 'Mediana de la categoría del protocolo (DefiLlama)', tipo: 'categoria', agregados: ['mediana', 'media', 'suma'] },
      { id: 'par', etiqueta: 'Cualquier otro par de BingX', tipo: 'activo' },
    ],
    activos: Object.entries(ACTIVOS).map(([simbolo, a]) => ({ simbolo, par: `${simbolo}-USDT`, nombre: a.nombre, en_posicion: simbolo === 'STONK', origenes: simbolo === 'STONK' ? ['pablo'] : [], defillama: a.defillama ?? null, perp: a.perp, volumen_24h_usdt: a.volumen_24h_usdt })).sort((x, y) => Number(y.en_posicion) - Number(x.en_posicion) || y.volumen_24h_usdt - x.volumen_24h_usdt),
    categorias: CATEGORIAS, datasets: DATASETS,
    rangos: ['30d', '60d', '90d', '6m', '1y', 'max'], intervalos: ['1h', '4h', '1d', '1w'],
    estilos: ['linea', 'area', 'barras', 'velas', 'puntos'], roles: ['principal', 'benchmark', 'apoyo'], origenes_posiciones: ['pablo', 'caja', 'ambos'],
    consultado_en: ahora(), fuente: 'graficos/catalogo',
  }
}

/* ---------- spec v2: normalización y datos ---------- */
type Transf = { tipo: string; desde?: string; contra?: string; ventana?: number }
interface SerieSpec { id?: string; tipo: string; activo?: string; etiqueta?: string; estilo?: string; rol?: string; eje?: string; transformaciones?: Transf[]; metrica?: string; categoria?: string; agregado?: string; dataset?: string; campo?: string; origen?: string }
interface PanelSpec { id: string; titulo?: string; altura?: number; escala?: string; series: SerieSpec[] }
interface Spec { version?: number; titulo?: string; activos?: string[]; rango?: string; intervalo?: string; paneles?: PanelSpec[]; series?: SerieSpec[]; benchmarks?: string[]; posiciones?: { origen?: string; mostrar?: string[] }; zonas?: { tipo?: string; desde: number; hasta: number; etiqueta?: string }[]; niveles?: { tipo?: string; precio: number; etiqueta?: string }[]; eventos?: { fecha: string; etiqueta?: string }[]; normalizar?: boolean; tipo?: string }

const FUNDAMENTALES = ['ingresos', 'fees', 'holders_revenue', 'tvl', 'volumen_dex']
const INTERVALO_S: Record<string, number> = { '1h': 3600, '4h': 14_400, '1d': DIA, '1w': 7 * DIA }
const ESTILO_DEF: Record<string, string> = { ohlc: 'velas', volumen: 'barras', ingresos: 'barras', fees: 'barras', holders_revenue: 'barras', volumen_dex: 'barras', liquidaciones: 'barras', pnl: 'area', tvl: 'area', oi: 'area', oi_horario: 'area' }
const TITULO_PANEL: Record<string, string> = { precio: 'Precio', volumen: 'Volumen', ingresos: 'Ingresos diarios', fees: 'Comisiones', holders_revenue: 'Ingresos a holders', tvl: 'Dinero depositado', volumen_dex: 'Volumen DEX', funding: 'Funding', oi: 'Dinero apalancado', oi_horario: 'Dinero apalancado (hora)', liquidaciones: 'Liquidaciones', long_short: 'Largos contra cortos', pulso: 'Pulso social', pnl: 'Resultado acumulado', volume_profile: 'Perfil de volumen', liquidaciones_estimadas: 'Imán de liquidaciones', dataset: 'Dataset' }
const panelDe = (tipo: string) => (tipo === 'ohlc' || tipo === 'cierre' || tipo === 'candidatas' || tipo === 'gatillos' || tipo === 'volume_profile' || tipo === 'liquidaciones_estimadas' ? 'precio' : tipo.startsWith('pulso_') ? 'pulso' : tipo === 'categoria' ? 'ingresos' : tipo)

function diasDe(rango: string | undefined): { dias: number; desde: number; hasta: number } {
  const hasta = hoy0()
  const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(rango ?? '')
  if (m) { const d = Math.floor(Date.parse(m[1]) / 1000 / DIA) * DIA, h = Math.floor(Date.parse(m[2]) / 1000 / DIA) * DIA; return { dias: Math.max(2, (h - d) / DIA + 1), desde: d, hasta: h } }
  const dias = ({ '30d': 30, '60d': 60, '90d': 90, '3m': 90, '6m': 180, '1y': 365, max: 420 } as Record<string, number>)[rango ?? '90d'] ?? 90
  return { dias, desde: hasta - (dias - 1) * DIA, hasta }
}

export function normalizar(spec: Spec): Required<Pick<Spec, 'version' | 'activos' | 'rango' | 'intervalo' | 'paneles'>> & Spec {
  const s: Spec = JSON.parse(JSON.stringify(spec))
  const activos = (s.activos?.length ? s.activos : ['STONK']).map((a) => a.toUpperCase())
  const rango = s.rango ?? '90d', intervalo = INTERVALO_S[s.intervalo ?? ''] ? s.intervalo! : '1d'
  let paneles: PanelSpec[] = s.paneles ? s.paneles.map((p) => ({ ...p, series: p.series ?? [] })) : []
  if (!paneles.length) {
    const series = s.series?.length ? s.series : [{ tipo: s.tipo === 'linea' || s.tipo === 'area' ? 'cierre' : 'ohlc', estilo: s.tipo ?? 'velas' }, { tipo: 'volumen' }]
    const porPanel = new Map<string, SerieSpec[]>()
    for (const se of series) { const k = panelDe(se.tipo); if (!porPanel.has(k)) porPanel.set(k, []); porPanel.get(k)!.push(se) }
    paneles = [...porPanel].map(([id, ser]) => ({ id, titulo: TITULO_PANEL[id] ?? id, altura: id === 'precio' ? 3 : 1, escala: 'lineal', series: ser }))
    if (s.normalizar) for (const p of paneles) for (const se of p.series) if (se.tipo === 'cierre' || se.tipo === 'ohlc') se.transformaciones = [...(se.transformaciones ?? []), { tipo: 'base100' }]
  }
  // benchmarks (atajo)
  for (const b of s.benchmarks ?? []) {
    if (b === 'categoria') {
      const pf = paneles.find((p) => p.series.some((x) => FUNDAMENTALES.includes(x.tipo))) ?? paneles[0]
      const metrica = pf.series.find((x) => FUNDAMENTALES.includes(x.tipo))?.tipo ?? 'ingresos'
      if (!pf.series.some((x) => x.tipo === 'categoria')) pf.series.push({ tipo: 'categoria', metrica, categoria: 'auto', agregado: 'mediana', rol: 'benchmark', estilo: 'linea', transformaciones: [{ tipo: 'base100' }] })
    } else if (!paneles[0].series.some((x) => x.activo === b.toUpperCase() && x.rol === 'benchmark')) {
      paneles[0].series.push({ tipo: 'cierre', activo: b.toUpperCase(), rol: 'benchmark', estilo: 'linea', transformaciones: [{ tipo: 'base100' }] })
    }
  }
  // posiciones → panel pnl
  if (s.posiciones?.mostrar?.includes('pnl') && !paneles.some((p) => p.id === 'pnl' || p.series.some((x) => x.tipo === 'pnl'))) paneles.push({ id: 'pnl', titulo: 'Resultado acumulado', altura: 1, escala: 'lineal', series: [{ id: 'pnl', tipo: 'pnl', activo: activos[0], estilo: 'area', origen: s.posiciones.origen ?? 'pablo' }] })
  const usados = new Set<string>()
  for (const p of paneles) {
    p.altura = Math.max(1, Math.min(5, Math.round(p.altura ?? (p.id === 'precio' ? 3 : 1))))
    p.escala = p.escala === 'log' || p.series.some((x) => x.transformaciones?.some((t) => t.tipo === 'log')) ? 'log' : 'lineal'
    p.titulo ??= TITULO_PANEL[p.id] ?? p.id
    for (const se of p.series) {
      se.activo = (se.activo ?? activos[0]).toUpperCase()
      let id = se.id ?? (se.tipo === 'ohlc' || se.tipo === 'cierre' ? se.activo.toLowerCase() : se.tipo === 'categoria' ? 'cat' : se.tipo)
      while (usados.has(id)) id = id + '_2'
      usados.add(id); se.id = id
      se.estilo ??= ESTILO_DEF[se.tipo] ?? 'linea'
      se.rol ??= 'principal'
      se.eje ??= se.rol === 'benchmark' ? 'der' : 'izq'
      se.transformaciones = (se.transformaciones ?? []).filter((t) => t.tipo !== 'log')
    }
  }
  return { ...s, version: 2, activos, rango, intervalo, paneles, titulo: s.titulo }
}

const mediaMovil = (p: number[][], v: number) => p.map((x, i) => { const w = p.slice(Math.max(0, i - v + 1), i + 1); return [x[0], redondeo(w.reduce((a, y) => a + y[1], 0) / w.length, 6)] })
function transformar(puntos: number[][], transf: Transf[], otras: Map<string, number[][]>, unidad: string): { puntos: number[][]; unidad: string } {
  let p = puntos, u = unidad
  for (const t of transf) {
    if (!p.length) break
    if (t.tipo === 'base100' || t.tipo === 'pct_desde') {
      const desde = t.desde ? Math.floor(Date.parse(t.desde) / 1000) : p[0][0]
      const ref = (p.find((x) => x[0] >= desde) ?? p[0])[1] || 1
      p = p.map((x) => [x[0], redondeo(t.tipo === 'base100' ? (x[1] / ref) * 100 : ((x[1] / ref) - 1) * 100, 3)])
      u = t.tipo === 'base100' ? 'base 100' : '%'
    } else if (t.tipo === 'media_movil') p = mediaMovil(p, Math.max(2, Math.round(t.ventana ?? 7)))
    else if (t.tipo === 'acumulado') { let s = 0; p = p.map((x) => [x[0], redondeo(s += x[1], 4)]) }
    else if (t.tipo === 'ratio') { const o = otras.get(t.contra ?? ''); if (o) { const m = new Map(o.map((x) => [x[0], x[1]])); p = p.filter((x) => m.has(x[0]) && m.get(x[0])).map((x) => [x[0], redondeo(x[1] / m.get(x[0])!, 6)]); u = 'ratio' } }
    else if (t.tipo === 'por_tvl') { p = p.map((x, i) => [x[0], redondeo(x[1] / (30_000_000 * (1 + i / 900)), 6)]); u = 'por USD depositado' }
    else if (t.tipo === 'por_usuario') { p = p.map((x) => [x[0], redondeo(x[1] / 1850, 4)]); u = `${unidad} por usuario` }
  }
  return { puntos: p, unidad: u }
}

export function datosDe(entrada: Spec) {
  const spec = normalizar(entrada)
  const { dias, desde, hasta } = diasDe(spec.rango)
  const intervaloS = INTERVALO_S[spec.intervalo]
  const nPuntos = Math.min(5000, Math.ceil((dias * DIA) / intervaloS))
  const consultado = ahora()
  const series: Record<string, unknown>[] = [], paneles: Record<string, unknown>[] = [], no_disponibles: { serie: string; tipo: string; motivo: string }[] = []
  const marcadores: Record<string, unknown>[] = [], niveles: Record<string, unknown>[] = [], zonas: Record<string, unknown>[] = [], eventos: Record<string, unknown>[] = []
  const crudas = new Map<string, number[][]>()
  const listas: { p: PanelSpec; se: SerieSpec; puntos: number[][]; formato: string; unidad: string; extra: Record<string, unknown>; fuente: string }[] = []
  for (const p of spec.paneles) {
    for (const se of p.series) {
      const act = se.activo!, tipo = se.tipo
      let puntos: number[][] = [], formato = FORMATO[tipo] ?? 'valor', unidad = UNIDAD[tipo] ?? '', fuente = 'bingx'
      const extra: Record<string, unknown> = {}
      if (tipo === 'ohlc') { puntos = velas(act, nPuntos, intervaloS); formato = 'ohlc' }
      else if (tipo === 'cierre') puntos = cierres(velas(act, nPuntos, intervaloS))
      else if (tipo === 'volumen') { const v = velas(act, nPuntos, intervaloS); puntos = v.map((x) => [x[0], x[5], x[4] >= x[1] ? 1 : -1]) }
      else if (FUNDAMENTALES.includes(tipo)) {
        const d = ACTIVOS[act]?.defillama
        if (!d) { no_disponibles.push({ serie: se.id!, tipo, motivo: `DefiLlama no tiene protocolo para ${act}` }); continue }
        puntos = serieDiaria(act, tipo, dias); fuente = `defillama https://api.llama.fi/summary/fees/${d.slug}?dataType=daily${tipo === 'ingresos' ? 'Revenue' : 'Fees'}`
        extra.entidad = { slug: d.slug, nombre: ACTIVOS[act].nombre, categoria: d.categoria }
      } else if (tipo === 'categoria') {
        const metrica = se.metrica ?? 'ingresos'
        const cat = !se.categoria || se.categoria === 'auto' ? ACTIVOS[act]?.defillama?.categoria : se.categoria
        if (!cat) { no_disponibles.push({ serie: se.id!, tipo, motivo: `DefiLlama no tiene categoría para ${act}` }); continue }
        puntos = categoriaMediana(cat, metrica, dias); unidad = UNIDAD[metrica]; fuente = `defillama (12 protocolos de ${cat}, ${se.agregado ?? 'mediana'} diaria)`
        extra.categoria = { nombre: cat, agregado: se.agregado ?? 'mediana', n_protocolos: 12, protocolos: ['pump', 'stonkfun', 'bonk', 'moonshot', 'four', 'letsbonk', 'believe', 'zora', 'clanker', 'virtuals', 'daos', 'boop'] }
        se.etiqueta ??= `${se.agregado === 'suma' ? 'Suma' : se.agregado === 'media' ? 'Media' : 'Mediana'} de ${cat}`
      } else if (tipo.startsWith('pulso_') || ['funding', 'oi', 'long_short', 'liquidaciones', 'oi_horario'].includes(tipo)) {
        if (!ACTIVOS[act]?.perp && tipo !== 'pulso_tono' && !tipo.startsWith('pulso_')) { no_disponibles.push({ serie: se.id!, tipo, motivo: `${act} no tiene perpetuo en Binance` }); continue }
        puntos = serieDiaria(act, tipo, tipo === 'oi_horario' ? Math.min(dias * 24, 720) : dias)
        if (tipo === 'oi_horario') puntos = puntos.map((x, i, a) => [hasta - (a.length - 1 - i) * 3600, x[1]])
        fuente = tipo.startsWith('pulso_') ? 'social_pulso' : tipo === 'oi_horario' ? 'historia propia (derivados_snapshots)' : 'coinalyze'
        if (tipo === 'liquidaciones') { extra.lado = 'compradores'; listas.push({ p, se: { ...se, id: `${se.id}:short`, etiqueta: `${se.etiqueta ?? ETIQUETA[tipo]} · vendedores` }, puntos: serieDiaria(act, 'liquidaciones', dias).map((x) => [x[0], Math.round(x[1] * 0.7)]), formato, unidad, extra: { lado: 'vendedores' }, fuente }) }
      } else if (tipo === 'pnl') {
        const pos = posicionesDe(se.origen ?? spec.posiciones?.origen ?? 'pablo').filter((x) => x.activo === act)
        if (!pos.length) { no_disponibles.push({ serie: se.id!, tipo, motivo: `sin posición en ${act}` }); continue }
        const v = cierres(velas(act, dias, DIA)); const po = pos[0]
        puntos = v.filter((x) => x[0] >= po.entradas[0].t - DIA).map((x) => { const vendida = po.salidas.filter((s) => s.t <= x[0]).reduce((a, s) => a + s.cantidad, 0); const cant = po.entradas[0].cantidad - vendida; const real = po.salidas.filter((s) => s.t <= x[0]).reduce((a, s) => a + s.pnl_usdt, 0); return [x[0], redondeo((x[1] - po.precio_medio) * cant + real, 2)] })
        fuente = 'posiciones (fills reales) + bingx (cierres)'
      } else if (tipo === 'candidatas') { formato = 'marcadores'; fuente = 'candidatas'; const v = cierres(velas(act, dias, DIA)); const c = v[Math.max(0, v.length - 31)]; marcadores.push({ serie: se.id, tipo: 'candidata', t: c[0], hora: new Date(c[0] * 1000).toISOString(), precio: redondeo(c[1] * 0.98, 4), etiqueta: 'Radar: impulso v1', modo: 'impulso', version: '1' }) }
      else if (tipo === 'gatillos') { formato = 'niveles'; fuente = 'gatillos'; const gs = GATILLOS_SIM.filter((g) => g.vigilancia.precio?.activo === act && (g.estado === 'activo' || g.estado === 'pausado')); if (gs.length) for (const g of gs) niveles.push({ panel: p.id, serie: se.id, tipo: 'gatillo', precio: g.vigilancia.precio!.nivel, etiqueta: `Gatillo #${g.id_corto}: ${g.texto}`, direccion: g.vigilancia.precio!.direccion, fuente: 'gatillos' }); else { no_disponibles.push({ serie: se.id!, tipo, motivo: `no hay gatillos con nivel de precio sobre ${act}` }); continue } }
      else if (tipo === 'volume_profile' || tipo === 'liquidaciones_estimadas') {
        const v = velas(act, dias, DIA); const lo = Math.min(...v.map((x) => x[3])), hi = Math.max(...v.map((x) => x[2])); const r = azar(tipo.length + act.length)
        puntos = Array.from({ length: 24 }, (_, i) => { const pr = lo + ((hi - lo) * (i + 0.5)) / 24; const base = Math.exp(-((i - 13) ** 2) / 40); return tipo === 'volume_profile' ? [redondeo(pr, 5), Math.round(ACTIVOS[act].volumen_24h_usdt * 6 * base * (0.6 + r()))] : [redondeo(pr, 5), Math.round(1_900_000 * (i < 12 ? base * (0.5 + r()) : 0.15 * r())), Math.round(1_600_000 * (i >= 12 ? base * (0.5 + r()) : 0.12 * r()))] })
        fuente = tipo === 'volume_profile' ? 'cálculo propio sobre velas' : 'cálculo propio con el apalancamiento de binance'
        if (tipo === 'volume_profile') { const top = [...puntos].sort((a, b) => b[1] - a[1])[0]; niveles.push({ panel: p.id, serie: se.id, tipo: 'nivel', precio: top[0], etiqueta: 'Precio donde más se operó', fuente: 'volume_profile' }) }
      } else if (tipo === 'dataset') {
        const ds = DATASETS.find((d) => d.nombre === se.dataset)
        if (!ds) { no_disponibles.push({ serie: se.id!, tipo, motivo: `no existe el dataset «${se.dataset ?? ''}»` }); continue }
        puntos = serieDiaria('STONK', 'ingresos', 30).map((x) => [x[0], Math.round(x[1] * 0.97)]); unidad = ds.unidad; fuente = 'python_libre: ingresos contra precio'
      } else { no_disponibles.push({ serie: se.id!, tipo, motivo: `tipo de serie desconocido: ${tipo}` }); continue }
      if (formato === 'valor' || formato === 'ohlc') puntos = puntos.filter((x) => x[0] >= desde - (intervaloS - 1) && x[0] <= hasta + DIA)
      listas.push({ p, se, puntos, formato, unidad, extra, fuente })
    }
  }
  for (const l of listas) if (l.formato === 'valor') crudas.set(l.se.id!, l.puntos)
  const precioBase100 = new Set<string>()
  for (const l of listas) {
    let { puntos, unidad } = l
    const transf = l.se.transformaciones ?? []
    if (l.formato === 'valor') ({ puntos, unidad } = transformar(puntos, transf, crudas, unidad))
    else if (l.formato === 'ohlc' && transf.some((t) => t.tipo === 'base100')) { const ref = puntos[0]?.[4] || 1; puntos = puntos.map((x) => [x[0], ...x.slice(1, 5).map((v) => redondeo((v / ref) * 100, 3)), x[5]]); unidad = 'base 100'; precioBase100.add(l.p.id) }
    if (l.se.rol === 'principal' && (l.se.tipo === 'cierre') && transf.some((t) => t.tipo === 'base100')) precioBase100.add(l.p.id)
    const etiqueta = l.se.etiqueta ?? (l.se.tipo === 'ohlc' || l.se.tipo === 'cierre' ? l.se.activo! : FUNDAMENTALES.includes(l.se.tipo) ? `${ETIQUETA[l.se.tipo]} · ${ACTIVOS[l.se.activo!]?.nombre ?? l.se.activo}` : ETIQUETA[l.se.tipo] ?? l.se.tipo)
    const sufijo = l.se.etiqueta ? '' : unidad === 'base 100' ? ' (base 100)' : unidad === '%' && transf.some((t) => t.tipo === 'pct_desde') ? ' (% desde el inicio)' : transf.some((t) => t.tipo === 'media_movil') ? ` · media ${transf.find((t) => t.tipo === 'media_movil')?.ventana ?? 7} d` : ''
    series.push({ id: l.se.id, panel: l.p.id, tipo: l.se.tipo, activo: l.se.activo, etiqueta: etiqueta + sufijo, estilo: l.se.estilo, rol: l.se.rol, eje: l.se.eje, formato: l.formato, unidad, n: puntos.length, puntos, ultimo: puntos.length && l.formato !== 'por_precio' ? { t: puntos[puntos.length - 1][0], valor: l.formato === 'ohlc' ? puntos[puntos.length - 1][4] : puntos[puntos.length - 1][1] } : null, transformaciones: transf.map((t) => t.tipo), fuente: l.fuente, consultado_en: consultado, ...l.extra })
  }
  for (const p of spec.paneles) {
    const ids = series.filter((s) => s.panel === p.id).map((s) => s.id as string)
    paneles.push({ id: p.id, titulo: p.titulo, altura: p.altura, escala: p.escala, series: ids, unidad: (series.find((s) => s.panel === p.id && s.rol !== 'benchmark') ?? series.find((s) => s.panel === p.id))?.unidad ?? '' })
  }
  // precio actual, zonas, niveles, eventos: en el panel de precio
  const pPrecio = spec.paneles.find((p) => p.series.some((x) => x.tipo === 'ohlc' || x.tipo === 'cierre'))
  const sPrecio = pPrecio && (series.find((s) => s.panel === pPrecio.id && s.rol === 'principal' && (s.tipo === 'ohlc' || s.tipo === 'cierre')) as { id: string; activo: string; puntos: number[][]; formato: string } | undefined)
  const aEscala = (precio: number) => { if (!sPrecio || !precioBase100.has(pPrecio!.id)) return {}; const ref = velas(sPrecio.activo, nPuntos, intervaloS)[0]?.[4] || 1; return { valor: redondeo((precio / ref) * 100, 3) } }
  if (sPrecio && pPrecio) {
    const act = sPrecio.activo
    niveles.unshift({ panel: pPrecio.id, tipo: 'precio_actual', precio: ACTIVOS[act]?.precio ?? 0, ...aEscala(ACTIVOS[act]?.precio ?? 0), etiqueta: 'Precio actual', fuente: 'bingx' })
    const mostrar = spec.posiciones?.mostrar ?? []
    if (spec.posiciones && mostrar.length) {
      for (const po of posicionesDe(spec.posiciones.origen ?? 'pablo').filter((x) => x.activo === act)) {
        if (mostrar.includes('entradas')) for (const e of po.entradas) marcadores.push({ serie: sPrecio.id, tipo: 'entrada', t: e.t, hora: e.hora, precio: e.precio, ...aEscala(e.precio), cantidad: e.cantidad, usdt: e.usdt, etiqueta: `Compra ${e.usdt.toFixed(2).replace('.', ',')} USDT a ${String(e.precio).replace('.', ',')}`, origen: po.origen, id_corto: e.id_corto })
        if (mostrar.includes('salidas')) for (const s of po.salidas) marcadores.push({ serie: sPrecio.id, tipo: 'salida', t: s.t, hora: s.hora, precio: s.precio, ...aEscala(s.precio), cantidad: s.cantidad, usdt: s.usdt, etiqueta: `Venta ${s.usdt.toFixed(2).replace('.', ',')} USDT a ${String(s.precio).replace('.', ',')} (${s.pnl_usdt >= 0 ? '+' : ''}${s.pnl_usdt.toFixed(2).replace('.', ',')} USDT)`, origen: po.origen, id_corto: s.id_corto })
        if (mostrar.includes('stops_historial')) for (const st of po.stops) marcadores.push({ serie: sPrecio.id, tipo: 'stop_historial', t: st.t, hora: st.hora, precio: st.precio, ...aEscala(st.precio), etiqueta: `${st.accion === 'inicial' ? 'Stop inicial' : st.accion === 'ajuste' ? 'Stop subido a' : 'Stop'} ${String(st.precio).replace('.', ',')}`, origen: po.origen })
        if (mostrar.includes('stop') && po.stop_vigente) niveles.push({ panel: pPrecio.id, tipo: 'stop', precio: po.stop_vigente.precio, ...aEscala(po.stop_vigente.precio), etiqueta: `Stop vigente ${String(po.stop_vigente.precio).replace('.', ',')}`, fuente: 'posiciones', origen: po.origen })
      }
    }
    for (const z of spec.zonas ?? []) zonas.push({ panel: pPrecio.id, tipo: z.tipo ?? 'zona', desde: z.desde, hasta: z.hasta, etiqueta: z.etiqueta ?? 'Zona' })
    for (const n of spec.niveles ?? []) niveles.push({ panel: pPrecio.id, tipo: n.tipo ?? 'nivel', precio: n.precio, ...aEscala(n.precio), etiqueta: n.etiqueta ?? String(n.precio), fuente: 'spec' })
  }
  for (const e of spec.eventos ?? []) eventos.push({ t: Math.floor(Date.parse(e.fecha) / 1000), fecha: e.fecha, etiqueta: e.etiqueta ?? e.fecha })
  const posiciones = spec.posiciones ? posicionesDe(spec.posiciones.origen ?? 'pablo').filter((x) => spec.activos.includes(x.activo)).map((po) => ({ activo: po.activo, origen: po.origen, estado: po.estado, mandato: po.mandato, cantidad: po.cantidad, precio_medio: po.precio_medio, stop_precio: po.stop_vigente?.precio ?? null, precio_actual: ACTIVOS[po.activo]?.precio ?? null, pnl_no_realizado_usdt: redondeo(((ACTIVOS[po.activo]?.precio ?? 0) - po.precio_medio) * po.cantidad, 2), pnl_realizado_usdt: po.pnl_realizado_usdt, fuente: 'posiciones + bingx', consultado_en: consultado })) : []
  const titulo = spec.titulo ?? `${spec.activos.join(', ')}: ${spec.paneles.map((p) => p.titulo).join(' y ').toLowerCase()}`
  return {
    spec: { ...spec, titulo }, titulo,
    rango: { desde: new Date(desde * 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00'), hasta: new Date(hasta * 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00'), intervalo: spec.intervalo, dias },
    paneles, series, marcadores, niveles, zonas, eventos, posiciones, no_disponibles,
    fuentes: series.map((s) => ({ serie: s.id, fuente: s.fuente, consultado_en: consultado })),
    cache: { hit: false, ttl_s: 60 }, consultado_en: consultado, fuente: 'graficos/datos',
  }
}

/* ---------- estado: hilos, specs, tableros, propuestas ---------- */
const H_MONITOR = 'c0ffee00-0000-4000-8000-000000000001', H_STONK = 'c0ffee00-0000-4000-8000-000000000002', H_CAJA = 'c0ffee00-0000-4000-8000-000000000003'
interface Mensaje { id: number; rol: string; contenido: string; ts: string; modelo: string | null; costo_usd: number; tipo_turno?: string; herramientas_usadas: unknown[]; graficos: Record<string, unknown>[]; propuestas: Record<string, unknown>[] }
interface Hilo { id: string; titulo: string; creado: string; actualizado: string; resumen_vivo: string; mensajes: Mensaje[]; costo_usd: number }
const SPECS = new Map<string, Record<string, unknown>>()
const SPEC_STONK = { version: 2, titulo: 'STONK: los ingresos caen 52 % contra la semana anterior', activos: ['STONK'], rango: '90d', intervalo: '1d', paneles: [{ id: 'precio', titulo: 'Precio', altura: 3, escala: 'lineal', series: [{ id: 'stonk', tipo: 'ohlc', activo: 'STONK', estilo: 'velas' }] }, { id: 'ingresos', titulo: 'Ingresos diarios', altura: 2, escala: 'lineal', series: [{ id: 'ing', tipo: 'ingresos', activo: 'STONK', estilo: 'barras' }, { id: 'ing_mm7', tipo: 'ingresos', activo: 'STONK', estilo: 'linea', etiqueta: 'media 7 días', rol: 'apoyo', transformaciones: [{ tipo: 'media_movil', ventana: 7 }] }] }], niveles: [{ tipo: 'invalidacion', precio: 0.153, etiqueta: 'Salir si me equivoco' }], eventos: [{ fecha: new Date((hoy0() - 16 * DIA) * 1000).toISOString().slice(0, 10), etiqueta: 'Votación' }] }
const SPEC_BTC = { version: 2, titulo: 'BTC contra ETH, 60 días', activos: ['BTC'], rango: '60d', intervalo: '4h', paneles: [{ id: 'precio', titulo: 'Precio', altura: 3, escala: 'lineal', series: [{ id: 'btc', tipo: 'ohlc', activo: 'BTC', estilo: 'velas' }] }, { id: 'volumen', titulo: 'Volumen', altura: 1, escala: 'lineal', series: [{ id: 'vol', tipo: 'volumen', activo: 'BTC', estilo: 'barras' }] }, { id: 'funding', titulo: 'Funding', altura: 1, escala: 'lineal', series: [{ id: 'fund', tipo: 'funding', activo: 'BTC', estilo: 'linea' }] }], benchmarks: ['ETH'] }
let especNum = 1
function guardarSpec(spec: Record<string, unknown>, origen: 'chat' | 'laboratorio', hilo_id: string | null, mensaje_id: number | null, fijo?: string) {
  const spec_id = fijo ?? hex(8, 500 + especNum++)
  const titulo = (spec.titulo as string) ?? datosDe(spec as Spec).titulo
  const archivo = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(especNum).padStart(6, '0')}_${((spec.activos as string[])?.[0] ?? 'grafico').toLowerCase()}.png`
  SPECS.set(spec_id, { spec_id, spec, titulo, hilo_id, mensaje_id, archivo, url: `/graficos/${archivo}`, origen, creado: ahora() })
  return SPECS.get(spec_id)!
}
guardarSpec(SPEC_STONK, 'chat', H_STONK, 1204, '9f3a2c1e')
guardarSpec(SPEC_BTC, 'chat', H_MONITOR, 1104, '7b1e4d0a')
const graficoDe = (s: Record<string, unknown>) => ({ spec_id: s.spec_id, archivo: s.archivo, url: s.url, titulo: s.titulo })
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const PROPUESTAS = new Map<string, Record<string, unknown>>()
function nuevaPropuesta(hilo_id: string, par: string, precio: number, stop: number, usdt: number, fijo?: string, vieja = false) {
  const id_corto = fijo ?? hex(6, 900 + PROPUESTAS.size)
  const p = { id: hex(32, 700 + PROPUESTAS.size), id_corto, hilo_id, accion: 'entrada', par, lado: 'compra', tipo: 'limit_escalonado', mandato: 'swing', cantidad_usdt: usdt, precio, stop, precio_referencia: redondeo(precio * 1.004, 4), estado: 'propuesta', expira: new Date(Date.now() + (vieja ? -3 : 15) * 60_000).toISOString(), expirada: vieja, bloque: `ORDEN PROPUESTA #${id_corto}\n${par} · compra ${usdt} USDT · limit escalonado\nprecio ${precio} · stop ${stop} (−${(((precio - stop) / precio) * 100).toFixed(1)} %)\nmandato swing · riesgo ${(usdt * ((precio - stop) / precio)).toFixed(2)} USDT`, origen: 'pablo', propuesta_en: ahora(), detalle: { razon: 'los ingresos del protocolo se sostienen por encima de la mediana de su categoría y el precio volvió a la zona de compra' } }
  PROPUESTAS.set(id_corto, p)
  return p
}
/** Las cifras que Luffy cita en los hilos salen de la misma posición que se dibuja: que el relato y el gráfico coincidan. */
const POS = posicionesDe('pablo')[0]
const c4 = (v: number) => String(redondeo(v, 4)).replace('.', ',')
const resumenP = (p: Record<string, unknown>) => ({ id_corto: p.id_corto, accion: p.accion, par: p.par, lado: p.lado, estado: p.estado, expira: p.expira, bloque: p.bloque, origen: p.origen, mandato: p.mandato })
const HILOS = new Map<string, Hilo>()
{
  const stonk = SPECS.get('9f3a2c1e')!, btc = SPECS.get('7b1e4d0a')!
  const pA = nuevaPropuesta(H_STONK, 'STONK-USDT', 0.1162, 0.1098, 30, 'a1b2c3')
  const pVieja = nuevaPropuesta(H_MONITOR, 'SOL-USDT', 193.4, 184.1, 40, 'e4f5a6', true)
  pVieja.estado = 'expirada'
  HILOS.set(H_MONITOR, { id: H_MONITOR, titulo: 'Monitor', creado: hace(60 * 24 * 9), actualizado: hace(42), costo_usd: 3.21, resumen_vivo: 'Seguimiento diario de la cartera: BTC en rango, SOL rechazada en 196, STONK con ingresos cayendo.', mensajes: [
    { id: 1101, rol: 'usuario', contenido: 'cómo viene el mercado hoy', ts: hace(60 * 24 * 2 + 30), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1102, rol: 'luffy', contenido: '**Veredicto:** mercado sin dirección. BTC lleva seis sesiones entre 108 k y 114 k y el funding está casi en cero: nadie paga por apalancarse.\n\n- **BTC** 112 340 USDT (+0,4 % en 24 h), volumen un 18 % por debajo de la media de 30 días.\n- **ETH** 3 902 USDT, pierde fuerza contra BTC desde el 28-sep.\n- **SOL** rechazó 196 dos veces; si cierra el día por encima, hay continuación.\n\nNo hay nada que hacer hoy. La cartera queda igual.', ts: hace(60 * 24 * 2 + 29), modelo: 'claude-fable-5-1', costo_usd: 0.071, tipo_turno: 'dato', herramientas_usadas: [{ nombre: 'mercado_tickers', entrada: { pares: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'] }, hora: hace(60 * 24 * 2 + 29), ok: true }], graficos: [], propuestas: [] },
    { id: 1103, rol: 'usuario', contenido: 'muéstrame BTC contra ETH en 60 días con el funding', ts: hace(60 * 24 + 5), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1104, rol: 'luffy', contenido: 'Ahí va. ETH en base 100 encima del precio de BTC: desde mediados de septiembre ETH pierde un 9 % relativo. El funding no acompaña a ninguno de los dos: está pegado a cero, así que no es un movimiento apalancado sino de spot.\n\nSi querías una idea: **no hay trade aquí.** Rotación lenta, sin catalizador.', ts: hace(60 * 24 + 4), modelo: 'claude-fable-5-1', costo_usd: 0.142, tipo_turno: 'dato_grafico', herramientas_usadas: [{ nombre: 'velas', entrada: { par: 'BTC-USDT', intervalo: '4h' }, hora: hace(60 * 24 + 4), ok: true }, { nombre: 'graficar', entrada: { spec_id: '7b1e4d0a' }, hora: hace(60 * 24 + 4), ok: true }], graficos: [graficoDe(btc)], propuestas: [] },
    { id: 1105, rol: 'usuario', contenido: 'entra 40 USDT en SOL si vuelve a 193', ts: hace(60 * 5), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1106, rol: 'luffy', contenido: 'Propuesta armada: 40 USDT en SOL-USDT a 193,4 con stop en 184,1 (−4,8 %). Riesgo 1,92 USDT. Vence en 15 minutos.', ts: hace(60 * 5 - 1), modelo: 'claude-fable-5-1', costo_usd: 0.19, tipo_turno: 'orden', herramientas_usadas: [{ nombre: 'proponer_orden', entrada: { par: 'SOL-USDT' }, hora: hace(60 * 5 - 1), ok: true }], graficos: [], propuestas: [resumenP(pVieja)] },
    { id: 1107, rol: 'sistema', contenido: 'propuesta #e4f5a6 expirada sin confirmar', ts: hace(60 * 5 - 16), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
  ] })
  HILOS.set(H_STONK, { id: H_STONK, titulo: 'STONK · ingresos y posición', creado: hace(60 * 24 * 3), actualizado: hace(12), costo_usd: 0.94, resumen_vivo: `STONK: ingresos cayendo contra la categoría; posición swing abierta con stop en ${c4(POS.stop_vigente!.precio)}.`, mensajes: [
    { id: 1201, rol: 'usuario', contenido: `compré 30 USDT de STONK a ${c4(POS.precio_medio)}, ponle el stop`, ts: hace(60 * 24 * 3), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1202, rol: 'ejecucion', contenido: `ENTRADA #a1b2c3 · STONK-USDT · compra 291 a ${c4(POS.precio_medio)} · stop ${c4(POS.stops[0].precio)} colocado`, ts: hace(60 * 24 * 3 - 2), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1203, rol: 'usuario', contenido: '¿cómo viene el revenue de STONK?', ts: hace(14), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1204, rol: 'luffy', contenido: `**Veredicto:** los ingresos de STONK caen un 52 % contra la semana anterior y es la tercera semana seguida de caída.\n\n- Ingresos de ayer: 412 k USD, contra una media de 7 días de 486 k y un pico de 1,1 M el 18-sep.\n- La mediana de su categoría (Launchpad, 12 protocolos) bajó un 11 % en el mismo periodo: **STONK cae más que su categoría**, no es el sector.\n- El precio todavía no lo refleja del todo: 0,1167 contra una entrada en ${c4(POS.precio_medio)}. Vas ${Math.round(((0.1167 / POS.precio_medio) - 1) * 100)} %.\n\n**Lo que haría:** dejar el stop en ${c4(POS.stop_vigente!.precio)} y vigilar el cierre semanal. Si los ingresos no recuperan los 500 k esta semana, salir con lo que haya.`, ts: hace(12), modelo: 'claude-fable-5-1', costo_usd: 0.168, tipo_turno: 'dato_grafico', herramientas_usadas: [{ nombre: 'defillama_serie', entrada: { entidad: 'STONK' }, hora: hace(12), ok: true }, { nombre: 'graficar', entrada: { spec_id: '9f3a2c1e' }, hora: hace(12), ok: true }], graficos: [graficoDe(stonk)], propuestas: [resumenP(pA)] },
  ] })
  HILOS.set(H_CAJA, { id: H_CAJA, titulo: 'Caja · búscame un ×2 en dos semanas', creado: hace(60 * 24 * 1), actualizado: hace(60 * 6), costo_usd: 1.37, resumen_vivo: 'Misión de la caja: 101 USDT, objetivo ×2 en 14 días, candidatas del radar en modo impulso.', mensajes: [
    { id: 1301, rol: 'usuario', contenido: 'búscame un ×2 en dos semanas con los 101 USDT de la caja', ts: hace(60 * 24), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] },
    { id: 1302, rol: 'luffy', contenido: 'Misión aceptada. Radar en modo impulso sobre pares con más de 5 M de volumen diario. Primera lista en una hora; te aviso por aquí y por Telegram.', ts: hace(60 * 24 - 1), modelo: 'claude-fable-5-1', costo_usd: 0.11, tipo_turno: 'caja', herramientas_usadas: [], graficos: [], propuestas: [] },
  ] })
}
let telegramActivo = H_MONITOR
const TABLEROS: Record<string, unknown>[] = [
  { id: 1, nombre: 'STONK ingresos contra su categoría', grupo: 'Fundamentales', spec: { ...SPEC_STONK, benchmarks: ['categoria'], posiciones: { origen: 'pablo', mostrar: ['entradas', 'salidas', 'stop'] } }, orden: 1, creado: hace(60 * 24 * 2), actualizado: hace(60 * 24 * 2) },
  { id: 2, nombre: 'BTC y ETH con funding', grupo: 'Mercado', spec: SPEC_BTC, orden: 2, creado: hace(60 * 24), actualizado: hace(60 * 24) },
]
let tableroId = 3
const resumenHilo = (h: Hilo) => ({ id: h.id, titulo: h.titulo, creado: h.creado, actualizado: h.actualizado, resumen_vivo: h.resumen_vivo, n_mensajes: h.mensajes.length, costo_usd: h.costo_usd, telegram_activo: telegramActivo === h.id })
let mensajeId = 2000
const enCurso = new Map<string, string>()

/* ---------- la app ---------- */
export const luffySimulado = new Hono()
// el terminal v2 (pantalla nueva) tiene su propio simulador, aparte para que el ajuste al contrato sea barato
luffySimulado.route('/', simuladorTerminal2)
const sse = (ev: Record<string, unknown>) => `data: ${JSON.stringify(ev)}\n\n`
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))
const VELOCIDAD = Number(process.env.VETA_SIM_VELOCIDAD || 1) || 1

luffySimulado.get('/salud', (c) => c.json({ ok: true, version: 'simulado', esquema: 'mugiwara', solo_lectura: false, modelo_chat: 'claude-fable-5-1' }))
luffySimulado.get('/hilos', (c) => c.json([...HILOS.values()].sort((a, b) => b.actualizado.localeCompare(a.actualizado)).slice(0, Number(c.req.query('limite') ?? 30) || 30).map(resumenHilo)))
luffySimulado.post('/hilos', async (c) => {
  const { titulo } = await c.req.json().catch(() => ({})) as { titulo?: string }
  if (!titulo?.trim()) return c.json({ detail: 'hace falta un título' }, 422)
  const id = `c0ffee00-0000-4000-8000-${String(Date.now()).slice(-12)}`
  HILOS.set(id, { id, titulo: titulo.trim(), creado: ahora(), actualizado: ahora(), resumen_vivo: '', costo_usd: 0, mensajes: [] })
  return c.json(resumenHilo(HILOS.get(id)!))
})
luffySimulado.get('/hilos/:id', (c) => {
  const h = HILOS.get(c.req.param('id')); if (!h) return c.json({ detail: 'hilo no existe' }, 404)
  const n = Number(c.req.query('n') ?? 50) || 50
  const vig = [...PROPUESTAS.values()].find((p) => p.hilo_id === h.id && p.estado === 'propuesta' && !p.expirada) ?? null
  return c.json({ hilo: { id: h.id, titulo: h.titulo, creado: h.creado, actualizado: h.actualizado, resumen_vivo: h.resumen_vivo }, resumen_vivo: h.resumen_vivo, telegram_activo: telegramActivo === h.id, mensajes: h.mensajes.filter((m) => m.rol !== 'sistema').slice(-n), propuesta_vigente: vig, propuesta_mision: null })
})
luffySimulado.patch('/hilos/:id', async (c) => {
  const h = HILOS.get(c.req.param('id')); if (!h) return c.json({ detail: 'hilo no existe' }, 404)
  const b = await c.req.json().catch(() => ({})) as { titulo?: string; telegram_activo?: boolean }
  if (typeof b.titulo === 'string' && b.titulo.trim()) h.titulo = b.titulo.trim()
  if (b.telegram_activo === true) telegramActivo = h.id
  return c.json(resumenHilo(h))
})
luffySimulado.post('/chat', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { hilo_id?: string; texto?: string; modo?: string; imagenes?: { base64: string; tipo: string; nombre?: string }[] }
  const h = b.hilo_id ? HILOS.get(b.hilo_id) : undefined
  if (!h) return c.json({ detail: 'hilo no existe' }, 404)
  const texto = (b.texto ?? '').trim(); const imagenes = b.imagenes ?? []
  if (!texto && !imagenes.length) return c.json({ detail: { codigo: 'vacio', texto: 'hace falta texto o una imagen' } }, 422)
  if (enCurso.get(h.id) === texto) return c.json({ detail: { codigo: 'en_curso', texto: `Ya lo estoy analizando (Luffy está trabajando en «${texto.slice(0, 40)}»); te llega en cuanto termine.` } }, 409)
  enCurso.set(h.id, texto)
  const t = texto.toLowerCase()
  const pideGrafico = /gr[aá]fic|mu[eé]stra|ver\b|compar|contra/.test(t) || /stonk|revenue|ingres/.test(t)
  const pideOrden = /\b(compra|entra|entrada|orden|vende|venta)\b/.test(t)
  const activo = Object.keys(ACTIVOS).find((a) => t.includes(a.toLowerCase())) ?? 'STONK'
  const stream = new ReadableStream({
    async start(ctl) {
      const enc = new TextEncoder(); const emitir = (ev: Record<string, unknown>) => ctl.enqueue(enc.encode(sse(ev)))
      const mUsuario: Mensaje = { id: ++mensajeId, rol: 'usuario', contenido: texto || `[${imagenes.length} imagen${imagenes.length > 1 ? 'es' : ''}]`, ts: ahora(), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] }
      h.mensajes.push(mUsuario)
      try {
        emitir({ tipo: 'inicio', hilo_id: h.id, modo: b.modo ?? 'auto', hora: ahora() })
        const pasos: [string, string][] = [['leyendo el hilo y la bitácora', 'memoria.cargar({hilo})'], ...(imagenes.length ? [['mirando la imagen que mandaste', 'vision.describir({n: 1})'] as [string, string]] : []), ...(pideGrafico || pideOrden ? [[`revisando ingresos y dinero depositado de ${activo}`, `defillama_serie({entidad: "${activo}"})`], ['revisando derivados', `derivados({par: "${activo}-USDT"})`]] as [string, string][] : []), ...(pideOrden ? [['convocando al Cuant de riesgo', 'agente.cuant_riesgo({par})'], ['armando la propuesta de orden', 'proponer_orden({…})']] as [string, string][] : []), ...(pideGrafico ? [['armando el gráfico', 'graficar({spec})']] as [string, string][] : [])]
        const herramientas: string[] = []
        for (const [paso, evento] of pasos) { emitir({ tipo: 'paso', paso, evento, hora: ahora() }); herramientas.push(evento.split('(')[0]); await espera(650 / VELOCIDAD) }
        emitir({ tipo: 'paso', paso: null, evento: 'modelo.respuesta', hora: ahora() })
        const graficos: Record<string, unknown>[] = [], propuestas: Record<string, unknown>[] = []
        const mId = ++mensajeId
        if (pideGrafico) {
          const spec = activo === 'STONK' ? { ...SPEC_STONK, titulo: 'STONK: ingresos contra la mediana de su categoría', benchmarks: ['categoria'], posiciones: { origen: 'pablo', mostrar: ['entradas', 'salidas', 'stop'] } } : { ...SPEC_BTC, activos: [activo], titulo: `${activo}: precio, volumen y funding, 60 días`, paneles: SPEC_BTC.paneles.map((p) => ({ ...p, series: p.series.map((s) => ({ ...s, activo, id: s.id === 'btc' ? activo.toLowerCase() : s.id })) })), benchmarks: ['BTC'] }
          const g = guardarSpec(spec, 'chat', h.id, mId); graficos.push(graficoDe(g))
          emitir({ tipo: 'grafico', ...graficoDe(g), ruta: `/opt/mugiwara/datos/graficos/${g.archivo}` })
        }
        if (pideOrden) { const pr = ACTIVOS[activo].precio; const p = nuevaPropuesta(h.id, `${activo}-USDT`, redondeo(pr * 0.996, ACTIVOS[activo].decimales + 1), redondeo(pr * 0.945, ACTIVOS[activo].decimales + 1), 30); propuestas.push(resumenP(p)); emitir({ tipo: 'propuesta', ...resumenP(p) }) }
        const respuesta = pideOrden
          ? `**Propuesta lista.** ${activo}-USDT, compra de 30 USDT a ${String(PROPUESTAS.get(propuestas[0].id_corto as string)!.precio).replace('.', ',')} con stop a ${String(PROPUESTAS.get(propuestas[0].id_corto as string)!.stop).replace('.', ',')} (−5,5 %). Riesgo 1,65 USDT, un 1,6 % de la cartera.\n\nEl Cuant da p_toque del stop a 14 días en 31 %: alto pero aceptable para un swing. Si confirmas, la orden entra escalonada en dos tramos. Vence en 15 minutos.`
          : pideGrafico && activo === 'STONK'
            ? `**Veredicto:** STONK cae más que su categoría. Los ingresos llevan tres semanas bajando (−52 % contra la semana anterior) mientras la mediana de Launchpad baja un 11 %: no es el sector, es el protocolo.\n\n- Ingresos de ayer: 412 k USD contra 486 k de media a 7 días.\n- Tu posición: entrada ${c4(POS.precio_medio)}, precio 0,1167, stop vigente ${c4(POS.stop_vigente!.precio)}.\n- La zona de compra de la tesis (0,165–0,175) queda lejos: no hay recompra aquí.\n\nEn el gráfico tienes la mediana de la categoría en base 100 sobre los ingresos y tu posición marcada: entrada, salida parcial y el stop.`
            : pideGrafico
              ? `Ahí va ${activo} con volumen y funding, y BTC en base 100 encima para comparar. ${activo === 'BTC' ? 'Sin dirección: seis sesiones en rango y funding en cero.' : 'Se mueve con BTC, sin nada propio que lo empuje.'}\n\nNo hay trade aquí.`
              : imagenes.length
                ? `Vi la imagen. Es ${imagenes.length > 1 ? 'una serie de capturas' : 'una captura'} de un gráfico de ${activo}: un rebote sobre un soporte que ya se probó dos veces. Con el volumen que muestra no alcanza para una entrada; si el cierre diario queda por encima, lo volvemos a mirar con datos.`
                : `Lo tengo. Sobre «${texto.slice(0, 60)}»: con lo que hay en el hilo no hace falta consultar nada nuevo. ${activo === 'STONK' ? `STONK sigue con el stop en ${c4(POS.stop_vigente!.precio)} y los ingresos a la baja: la decisión no cambia hasta el cierre semanal.` : 'La cartera queda igual.'}\n\nSi quieres cifras frescas, pídemelo y traigo precio y derivados.`
        const partes = respuesta.match(/.{1,18}/gs) ?? []
        for (const p of partes) { emitir({ tipo: 'texto', texto: p }); await espera(28 / VELOCIDAD) }
        const costo = redondeo(0.05 + respuesta.length / 9000 + (pideOrden ? 0.12 : 0), 3)
        h.mensajes.push({ id: mId, rol: 'luffy', contenido: respuesta, ts: ahora(), modelo: 'claude-fable-5-1', costo_usd: costo, tipo_turno: pideOrden ? 'orden' : pideGrafico ? 'dato_grafico' : 'discusion', herramientas_usadas: herramientas.map((n) => ({ nombre: n, entrada: {}, hora: ahora(), ok: true })), graficos, propuestas })
        h.actualizado = ahora(); h.costo_usd = redondeo(h.costo_usd + costo, 3)
        emitir({ tipo: 'fin', mensaje_id: mId, texto: respuesta, modelo: 'claude-fable-5-1', modo: 'chat', tipo_turno: pideOrden ? 'orden' : pideGrafico ? 'dato_grafico' : 'discusion', tokens: { entrada: 1200, salida: Math.round(respuesta.length / 3), cache_lectura: 22_000, cache_escritura: 2100 }, costo_usd: costo, costo_agentes_usd: pideOrden ? 0.04 : 0, busquedas_web: 0, herramientas, graficos, propuestas, propuesta_vigente: propuestas.length ? PROPUESTAS.get(propuestas[0].id_corto as string) : null, propuesta_mision: null, aviso: null, error: null, hora: ahora() })
      } catch (e) {
        emitir({ tipo: 'error', texto: String((e as Error).message) }); emitir({ tipo: 'fin', mensaje_id: null, texto: '', error: String((e as Error).message), hora: ahora() })
      } finally { enCurso.delete(h.id); ctl.close() }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})
luffySimulado.get('/propuestas/vigente', (c) => c.json([...PROPUESTAS.values()].find((p) => p.hilo_id === c.req.query('hilo_id') && p.estado === 'propuesta' && !p.expirada) ?? null))
luffySimulado.get('/propuestas/:id', (c) => { const p = PROPUESTAS.get(c.req.param('id')); return p ? c.json(p) : c.json({ detail: 'propuesta no existe' }, 404) })
luffySimulado.post('/propuestas/:id/confirmar', (c) => {
  const p = PROPUESTAS.get(c.req.param('id')); if (!p) return c.json({ detail: 'propuesta no existe' }, 404)
  if (p.estado !== 'propuesta') return c.json({ detail: { codigo: 'no_pendiente', texto: `la propuesta está ${p.estado}` } }, 409)
  if (p.expirada || Date.parse(p.expira as string) < Date.now()) { p.estado = 'expirada'; return c.json({ ok: false, error: 'la propuesta expiró antes de confirmarse', eventos: ['expirada'], propuesta: p }) }
  if (p.accion === 'declarar') return c.json(confirmarDeclaracion(p))
  p.estado = 'llena'
  const cantidad = Math.floor((Number(p.cantidad_usdt) || 0) / (Number(p.precio) || 1)) || 0
  const texto = p.accion === 'mover_stop' ? `STOP MOVIDO #${p.id_corto} · ${p.par} · stop a ${String(p.stop).replace('.', ',')}` : p.accion === 'cancelar' ? `ORDEN CANCELADA #${p.id_corto} · ${p.par}` : p.accion === 'modificar' ? `ORDEN MODIFICADA #${p.id_corto} · ${p.par}` : `ENTRADA #${p.id_corto} · ${p.par} · compra ${cantidad} a ${String(p.precio).replace('.', ',')} · stop ${String(p.stop).replace('.', ',')} colocado`
  const h = HILOS.get(p.hilo_id as string); if (h) { h.mensajes.push({ id: ++mensajeId, rol: 'ejecucion', contenido: texto, ts: ahora(), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] }); h.actualizado = ahora() }
  return c.json({ ok: true, texto, estado: 'llena', fills: [{ id: hex(12, 31), lado: 'compra', precio: p.precio, cantidad, comision: redondeo((p.cantidad_usdt as number) * 0.001, 3), hora: ahora() }], stop: { id: hex(12, 32), precio: p.stop, cantidad, ok: true }, alertas: [], eventos: ['orden enviada', 'llena en un tramo', 'stop colocado'], reconciliacion: { discrepancias: [], alertas: [], error: null } })
})
luffySimulado.post('/propuestas/:id/rechazar', (c) => {
  const p = PROPUESTAS.get(c.req.param('id')); if (!p) return c.json({ detail: 'propuesta no existe' }, 404)
  if (p.estado !== 'propuesta') return c.json({ detail: { codigo: 'no_pendiente', texto: `la propuesta está ${p.estado}` } }, 409)
  p.estado = 'rechazada'
  return c.json({ ok: true, estado: 'rechazada', propuesta: p })
})
luffySimulado.post('/misiones/:id/activar', (c) => c.json({ ok: true, estado: 'activa', id_corto: c.req.param('id') }))
luffySimulado.post('/misiones/:id/cancelar', (c) => c.json({ ok: true, estado: 'cancelada', id_corto: c.req.param('id') }))
luffySimulado.get('/posiciones/historial', (c) => { const o = c.req.query('origen') ?? 'pablo'; const a = c.req.query('activo'); return c.json({ origen: o, posiciones: posicionesDe(o).filter((p) => !a || p.activo === a.toUpperCase()), consultado_en: ahora(), fuente: 'posiciones + ordenes + bitacora' }) })
luffySimulado.get('/posiciones', (c) => c.json(posicionesDe('pablo').map((p) => ({ activo: p.activo, cantidad: p.cantidad, precio_medio: p.precio_medio, precio_actual: ACTIVOS[p.activo].precio, valor_usdt: redondeo(p.cantidad * ACTIVOS[p.activo].precio, 2), pnl_no_realizado_usdt: redondeo((ACTIVOS[p.activo].precio - p.precio_medio) * p.cantidad, 2), mandato: p.mandato, stop: p.stop_vigente?.precio ?? null, fuente: 'bingx', consultado_en: ahora() }))))
luffySimulado.get('/costo', (c) => c.json(costoSim(Number(c.req.query('dias') ?? 30) || 30)))
luffySimulado.post('/graficos/datos', async (c) => {
  const b = await c.req.json().catch(() => null) as { spec?: Spec } | null
  if (!b?.spec || typeof b.spec !== 'object') return c.json({ detail: { codigo: 'spec_invalido', texto: 'el spec no es válido', errores: [{ loc: ['spec'], msg: 'hace falta un objeto spec' }] } }, 422)
  if (b.spec.paneles && !Array.isArray(b.spec.paneles)) return c.json({ detail: { codigo: 'spec_invalido', texto: 'el spec no es válido', errores: [{ loc: ['spec', 'paneles'], msg: 'tiene que ser una lista' }] } }, 422)
  await espera(120 / VELOCIDAD)
  return c.json(datosDe(b.spec))
})
luffySimulado.get('/graficos/catalogo', (c) => c.json(catalogo()))
luffySimulado.get('/graficos/spec/:id', (c) => { const s = SPECS.get(c.req.param('id')); return s ? c.json(s) : c.json({ detail: 'gráfico no existe' }, 404) })
luffySimulado.post('/graficos/spec', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { spec?: Record<string, unknown>; titulo?: string; hilo_id?: string }
  if (!b.spec) return c.json({ detail: { codigo: 'spec_invalido', texto: 'hace falta spec', errores: [] } }, 422)
  const s = guardarSpec(b.titulo ? { ...b.spec, titulo: b.titulo } : b.spec, 'laboratorio', b.hilo_id ?? null, null)
  return c.json(s)
})
luffySimulado.get('/graficos/:archivo', (c) => c.json({ detail: 'gráfico no existe' }, 404))
luffySimulado.get('/tableros', (c) => c.json([...TABLEROS].sort((a, b) => String(a.grupo ?? '').localeCompare(String(b.grupo ?? '')) || (a.orden as number) - (b.orden as number) || String(a.creado).localeCompare(String(b.creado)))))
luffySimulado.post('/tableros', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { nombre?: string; spec?: Record<string, unknown>; grupo?: string; orden?: number }
  if (!b.nombre?.trim() || !b.spec) return c.json({ detail: { codigo: 'spec_invalido', texto: 'hacen falta nombre y spec', errores: [] } }, 422)
  const t = { id: tableroId++, nombre: b.nombre.trim(), grupo: b.grupo?.trim() || null, spec: b.spec, orden: b.orden ?? Math.max(0, ...TABLEROS.map((x) => x.orden as number)) + 1, creado: ahora(), actualizado: ahora() }
  TABLEROS.push(t); return c.json(t)
})
luffySimulado.put('/tableros/orden', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { ids?: number[] }
  if (!Array.isArray(b.ids)) return c.json({ detail: 'hace falta ids' }, 422)
  b.ids.forEach((id, i) => { const t = TABLEROS.find((x) => x.id === id); if (t) t.orden = i + 1 })
  return c.json({ ok: true })
})
luffySimulado.patch('/tableros/:id', async (c) => {
  const t = TABLEROS.find((x) => x.id === Number(c.req.param('id'))); if (!t) return c.json({ detail: 'tablero no existe' }, 404)
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  for (const k of ['nombre', 'spec', 'grupo', 'orden']) if (b[k] !== undefined) t[k] = b[k]
  t.actualizado = ahora(); return c.json(t)
})
luffySimulado.delete('/tableros/:id', (c) => { const i = TABLEROS.findIndex((x) => x.id === Number(c.req.param('id'))); if (i < 0) return c.json({ detail: 'tablero no existe' }, 404); TABLEROS.splice(i, 1); return c.json({ ok: true }) })
luffySimulado.get('/datasets', (c) => c.json(DATASETS))
luffySimulado.get('/datasets/:nombre', (c) => { const d = DATASETS.find((x) => x.nombre === c.req.param('nombre')); return d ? c.json({ nombre: d.nombre, columnas: d.columnas, unidad: d.unidad, descripcion: d.descripcion, puntos: serieDiaria('STONK', 'ingresos', 30).map((x) => ({ t: x[0], valor: x[1] })), fuente: 'python_libre: ingresos contra precio', consultado_en: ahora() }) : c.json({ detail: 'dataset no existe' }, 404) })
luffySimulado.get('/vigilancia', (c) => c.json([]))
luffySimulado.get('/gatillos', (c) => c.json(GATILLOS_SIM))
luffySimulado.get('/alertas', (c) => c.json(ALERTAS_SIM.slice(0, Number(c.req.query('limite') ?? 20) || 20)))
luffySimulado.notFound((c) => c.json({ detail: 'no existe' }, 404))


/* ============================================================================
   Fase 6b (simulado), con las formas exactas de CONTRATO-PANEL.md v2.1 §8:
   terminal, cartera y exchange, radar, control, oficina e informes. Mismas
   semillas: cada corrida pinta lo mismo. Si el contrato cambia, se cambia
   aquí y en src/luffy/tipos6b.ts.
   ========================================================================== */
Object.assign(ACTIVOS, {
  WAL: { nombre: 'Walrus', precio: 0.03809, deriva: 0.002, vol: 0.045, decimales: 4, perp: true, volumen_24h_usdt: 1_850_000 },
  STRK: { nombre: 'Starknet', precio: 0.104, deriva: -0.001, vol: 0.05, decimales: 4, defillama: { slug: 'starknet', categoria: 'Chain' }, perp: true, volumen_24h_usdt: 42_000_000 },
  KAIA: { nombre: 'Kaia', precio: 0.0498, deriva: -0.0015, vol: 0.04, decimales: 4, perp: true, volumen_24h_usdt: 9_300_000 },
  CFX: { nombre: 'Conflux', precio: 0.0612, deriva: 0.003, vol: 0.06, decimales: 4, perp: true, volumen_24h_usdt: 31_000_000 },
  C98: { nombre: 'Coin98', precio: 0.0412, deriva: 0.0025, vol: 0.055, decimales: 4, defillama: { slug: 'coin98', categoria: 'Dexs' }, perp: true, volumen_24h_usdt: 6_100_000 },
  CYBER: { nombre: 'Cyber', precio: 1.42, deriva: 0.002, vol: 0.05, decimales: 3, perp: true, volumen_24h_usdt: 8_700_000 },
  OGN: { nombre: 'Origin', precio: 0.0591, deriva: 0.001, vol: 0.05, decimales: 4, perp: true, volumen_24h_usdt: 4_200_000 },
})
const pct6 = (a: number, b: number) => (b ? redondeo(((a / b) - 1) * 100, 2) : null)
const cambio6 = (sym: string, dias: number) => { const v = cierres(velas(sym, dias + 1, DIA)); return v.length > dias ? pct6(v[v.length - 1][1], v[v.length - 1 - dias][1]) : null }
const vsBtc6 = (sym: string, dias: number) => { const a = cambio6(sym, dias), b = cambio6('BTC', dias); return a === null || b === null ? null : redondeo(a - b, 2) }
const diaAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
const isoDia = (n: number) => `${diaAtras(n)}T00:00:00+00:00`

/* ---------- radar: modos y candidatas ---------- */
const hz = (n: number, acierto: number | null, mediana: number | null) => ({ n, cobertura_pct: n ? 100 : 0, exceso_medio_pct: mediana, mediana_pct: mediana, acierto_pct: acierto })
type ModoSim = { id: string; version: string; estado: 'propuesto' | 'activo' | 'retirado'; origen: string; hipotesis: string; familias_obligatorias: string[]; apoyo: { familias: string[]; minimo: number }; etiquetas_relevantes: string[]; regimen: string; horizontes_dias: number[]; cadencia: string; invalidacion: string | null; universo: Record<string, unknown>; motivo: string | null; creado_en: string; estudio: { estado: string; resumen: string } | null; linea_estudio: string | null; rendimiento_vivo: Record<string, unknown> | null }
const MODOS_SIM: ModoSim[] = [
  { id: 'squeeze', version: '1', estado: 'activo', origen: 'investigacion', hipotesis: 'Short squeeze: cortos apilados a nivel extremo y el precio aguanta; cuando cubren, sube rápido.', familias_obligatorias: ['squeeze'], apoyo: { familias: ['posicionamiento', 'catalizadores'], minimo: 0 }, etiquetas_relevantes: ['granja_o_bots'], regimen: 'cualquiera', horizontes_dias: [7, 14, 30], cadencia: '1h', invalidacion: 'el OI cae a la mitad sin que el precio suba', universo: {}, motivo: null, creado_en: isoDia(2), estudio: { estado: 'verificacion', resumen: '212 casos desde 2024: acierto 58 % a 7 días, mediana +3,2 %.' }, linea_estudio: 'Lo que dijo el estudio de este modo: en 212 casos, 58 % terminó arriba a 7 días (mediana +3,2 %).', rendimiento_vivo: { emitidas: 3, descartadas: 0, primera: diaAtras(1), ultima: diaAtras(0), horizontes: { analizar_7d: hz(0, null, null) } } },
  { id: 'impulso', version: '1', estado: 'activo', origen: 'investigacion', hipotesis: 'Volumen que se multiplica con precio que acompaña y sin granjas detrás.', familias_obligatorias: ['impulso', 'atencion'], apoyo: { familias: ['preparacion'], minimo: 1 }, etiquetas_relevantes: ['granja_o_bots', 'shill_coordinado'], regimen: 'risk_on', horizontes_dias: [7, 14, 30], cadencia: '4h', invalidacion: null, universo: {}, motivo: null, creado_en: isoDia(3), estudio: { estado: 'verificado', resumen: '369 casos: no le gana al azar (acierto 49 %).' }, linea_estudio: 'Lo que dijo el estudio de este modo: en 369 casos no le ganó al azar (49 % arriba a 7 días).', rendimiento_vivo: { emitidas: 14, descartadas: 5, primera: diaAtras(3), ultima: diaAtras(0), horizontes: { analizar_7d: hz(4, 50, 0.6) } } },
  { id: 'pre_catalizador', version: '1', estado: 'activo', origen: 'luffy', hipotesis: 'Votación, listado o desbloqueo fechado en los próximos 7 días con atención creciente.', familias_obligatorias: ['catalizadores'], apoyo: { familias: ['atencion'], minimo: 1 }, etiquetas_relevantes: [], regimen: 'cualquiera', horizontes_dias: [7, 14], cadencia: '1h', invalidacion: 'el catalizador se posterga', universo: {}, motivo: null, creado_en: isoDia(1), estudio: { estado: 'verificacion', resumen: '88 casos: acierto 54,5 % a 7 días.' }, linea_estudio: 'Lo que dijo el estudio de este modo: en 88 casos, 54,5 % arriba a 7 días.', rendimiento_vivo: { emitidas: 2, descartadas: 1, primera: diaAtras(1), ultima: diaAtras(0), horizontes: {} } },
  { id: 'ingresos_vs_precio', version: '1', estado: 'propuesto', origen: 'luffy', hipotesis: 'Los ingresos del protocolo suben y el precio todavía no.', familias_obligatorias: ['fundamento'], apoyo: { familias: ['impulso'], minimo: 0 }, etiquetas_relevantes: [], regimen: 'cualquiera', horizontes_dias: [14, 30], cadencia: '1d', invalidacion: 'los ingresos vuelven a su media de 30 días', universo: {}, motivo: 'propuesto por Luffy tras el caso STONK', creado_en: isoDia(0), estudio: { estado: 'pendiente', resumen: '140 casos: acierto 56,4 % a 14 días.' }, linea_estudio: 'Lo que dijo el estudio de este modo: en 140 casos, 56,4 % arriba a 14 días.', rendimiento_vivo: null },
]
const FAMILIAS = ['impulso', 'preparacion', 'fundamento', 'posicionamiento', 'atencion', 'catalizadores', 'squeeze', 'onchain']
const ETIQUETAS_LLANO: Record<string, string> = { granja_o_bots: 'La mayoría de lo que se habla de este activo lo escriben bots', shill_coordinado: 'Hay cuentas que publican lo mismo a la vez: promoción coordinada', pump_reciente: 'Ya subió mucho en pocos días', desbloqueo_cerca: 'Se liberan tokens pronto' }
function familiasDe(sym: string) {
  const r = azar(sym.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0))
  const z = () => redondeo((r() - 0.4) * 4, 1)
  const sq = sym === 'WAL' ? 'cargado' : sym === 'OGN' ? 'ignicion' : null
  const def = !!ACTIVOS[sym]?.defillama
  const f: Record<string, { valor: number | string | null; z: number | null; cumple: boolean; cumple_inverso: boolean; etiqueta: string; detalle: Record<string, unknown>; motivo: string | null }> = {
    impulso: { valor: vsBtc6(sym, 30), z: z(), cumple: (vsBtc6(sym, 30) ?? 0) > 8, cumple_inverso: false, etiqueta: 'Fuerza relativa a BTC (30 d)', detalle: { ret_30d_pct: cambio6(sym, 30), ret_btc_30d_pct: cambio6('BTC', 30) }, motivo: null },
    preparacion: { valor: redondeo(r() * 100, 0), z: z(), cumple: false, cumple_inverso: false, etiqueta: 'Compresión de volatilidad', detalle: { atr_pctl_90d: redondeo(r() * 100, 0) }, motivo: null },
    fundamento: def ? { valor: redondeo(r() * 2, 2), z: z(), cumple: sym === 'STRK', cumple_inverso: sym === 'STONK', etiqueta: 'Ingresos y dinero depositado', detalle: { ingresos_7d_vs_30d: redondeo(0.5 + r(), 2) }, motivo: null } : { valor: null, z: null, cumple: false, cumple_inverso: false, etiqueta: 'Ingresos y dinero depositado', detalle: {}, motivo: `DefiLlama no tiene un protocolo confirmado para ${sym}` },
    posicionamiento: { valor: sym === 'WAL' ? 98 : redondeo(r() * 80, 0), z: sym === 'WAL' ? 3.4 : z(), cumple: sym === 'WAL', cumple_inverso: false, etiqueta: 'Posicionamiento apalancado', detalle: { oi_pctl_30d: sym === 'WAL' ? 98 : 40, funding_pctl_90d: sym === 'WAL' ? 2 : 50 }, motivo: null },
    atencion: { valor: redondeo(r() * 3, 1), z: z(), cumple: ['CFX', 'C98', 'CYBER', 'KAIA'].includes(sym), cumple_inverso: false, etiqueta: 'Menciones de personas contra su media', detalle: { humanos_24h: Math.round(10 + r() * 60), bots_pct: Math.round(r() * 60) }, motivo: null },
    catalizadores: { valor: sym === 'STRK' ? 1 : 0, z: 0, cumple: sym === 'STRK', cumple_inverso: false, etiqueta: 'Hechos con fecha', detalle: { agenda: [], anuncios_7d: [] }, motivo: sym === 'STRK' ? null : 'sin catalizador concreto' },
    squeeze: { valor: sq, z: null, cumple: sq === 'cargado', cumple_inverso: false, etiqueta: 'Short squeeze', detalle: sq ? { estado: sq, oi_pctl: 98, funding: -0.041, basis_pct: -0.3 } : {}, motivo: sq ? null : 'sin cortos apilados' },
    onchain: { valor: null, z: null, cumple: false, cumple_inverso: false, etiqueta: 'Movimientos en cadena', detalle: {}, motivo: 'sólo lo calcula el Investigador a pedido' },
  }
  // v2.2 (CONTRATO-PANEL §7): `frase` llana para toda familia, `detalle` vacío, lo técnico en `detalle_tecnico`
  const FRASE: Record<string, (x: typeof f[string]) => string> = {
    impulso: (x) => `Va ${x.valor !== null ? `${Number(x.valor) > 0 ? '+' : ''}${String(x.valor).replace('.', ',')} %` : 'sin cifra'} contra BTC en 30 días${x.cumple ? ': le saca ventaja clara.' : ': sin ventaja que destaque.'}`,
    preparacion: (x) => `La volatilidad está en el percentil ${x.valor} de 90 días${x.cumple ? ': comprimida, como antes de un movimiento.' : '.'}`,
    fundamento: (x) => (x.valor === null ? 'No hay ingresos ni dinero depositado que medir para esta moneda.' : `Los ingresos de 7 días van a ${String(x.valor).replace('.', ',')} veces su media de 30${x.cumple_inverso ? ': caen mientras el precio sube.' : '.'}`),
    posicionamiento: (x) => `El dinero apalancado abierto está en el percentil ${x.valor} de 30 días${x.cumple ? ': muy cargado.' : '.'}`,
    atencion: (x) => `Las personas que la nombran van a ${String(x.valor).replace('.', ',')} veces su media${x.cumple ? ': atención real creciendo.' : '.'}`,
    catalizadores: (x) => (x.cumple ? 'Tiene un hecho con fecha dentro de la ventana.' : 'Sin hecho con fecha en la ventana.'),
    squeeze: (x) => (x.valor === 'cargado' ? 'Hay cortos apilados pagando por mantenerse: combustible para una subida brusca.' : x.valor === 'ignicion' ? 'El squeeze se encendió: los cortos están cerrando.' : 'Sin cortos apilados.'),
    onchain: () => 'Lo calcula el Investigador cuando se le pide.',
  }
  for (const [k, x] of Object.entries(f)) Object.assign(x, { frase: FRASE[k]?.(x) ?? x.etiqueta, detalle_tecnico: x.detalle, detalle: {} })
  return f
}
const CANDIDATAS_BASE = [
  { id: 412, activo: 'WAL', modo: 'squeeze', dias: 1, score: 2.1, decision: 'analizar', p: 0.81, por_que: 'cortos apilados a nivel extremo y el precio aguanta', etiquetas: ['granja_o_bots'] },
  { id: 418, activo: 'CFX', modo: 'impulso', dias: 1, score: 1.4, decision: 'analizar', p: 0.55, por_que: 'volumen ×3,8 con precio que acompaña', etiquetas: [] },
  { id: 417, activo: 'C98', modo: 'impulso', dias: 2, score: 1.1, decision: 'analizar', p: 0.42, por_que: 'volumen alto, confluencia floja', etiquetas: ['shill_coordinado'] },
  { id: 409, activo: 'CYBER', modo: 'impulso', dias: 2, score: 1.0, decision: 'descartar', p: 0.3, por_que: 'atención de bots', etiquetas: ['granja_o_bots'] },
  { id: 395, activo: 'STRK', modo: 'pre_catalizador', dias: 5, score: 1.9, decision: 'analizar', p: 0.74, por_que: 'votación de buyback en 4 días con atención creciente', etiquetas: ['pump_reciente'] },
  { id: 371, activo: 'KAIA', modo: 'impulso', dias: 9, score: 1.2, decision: 'analizar', p: 0.5, por_que: 'impulso con granjas', etiquetas: ['granja_o_bots'] },
  { id: 350, activo: 'OGN', modo: 'squeeze', dias: 12, score: 1.6, decision: 'analizar', p: 0.66, por_que: 'squeeze en ignición', etiquetas: [] },
  { id: 300, activo: 'STONK', modo: 'impulso', dias: 30, score: 0.9, decision: 'analizar', p: 0.45, por_que: 'impulso tras la votación', etiquetas: ['desbloqueo_cerca'] },
]
function candidata(x: typeof CANDIDATAS_BASE[number]) {
  const v = cierres(velas(x.activo, 45, DIA)), b = cierres(velas('BTC', 45, DIA)); const i = Math.max(0, v.length - 1 - x.dias)
  const seguimiento: Record<string, { fecha: string; ret_pct: number | null; ret_btc_pct: number | null; exceso_pct: number | null }> = {}
  for (const d of [7, 14, 30]) { const listo = x.dias >= d; const r = listo ? pct6(v[i + d][1], v[i][1]) : null, rb = listo ? pct6(b[i + d][1], b[i][1]) : null; seguimiento[`${d}d`] = { fecha: diaAtras(x.dias - d), ret_pct: r, ret_btc_pct: rb, exceso_pct: r !== null && rb !== null ? redondeo(r - rb, 2) : null } }
  const fam = familiasDe(x.activo); const modo = MODOS_SIM.find((m) => m.id === x.modo)!
  return { id: x.id, fecha: diaAtras(x.dias), activo: x.activo, modo: x.modo, version: modo.version, score: x.score, rango: 1, decision: x.decision, p_merece: x.p, por_que: x.por_que, precio_ref: redondeo(v[i][1], 5), btc_ref: Math.round(b[i][1]),
    confluencia: { cumple: true, score: x.score, obligatorias: modo.familias_obligatorias.filter((f) => fam[f]?.cumple), obligatorias_todas: modo.familias_obligatorias, obligatorias_faltan: modo.familias_obligatorias.filter((f) => !fam[f]?.cumple), apoyo: modo.apoyo.familias.filter((f) => fam[f]?.cumple), apoyo_todas: modo.apoyo.familias, n_apoyo: modo.apoyo.familias.filter((f) => fam[f]?.cumple).length, minimo_apoyo: modo.apoyo.minimo ?? null, sin_dato: modo.apoyo.familias.filter((f) => fam[f]?.valor === null) },
    familias: Object.fromEntries(Object.entries(fam).map(([k, f]) => [k, { valor: f.valor, z: f.z, cumple: f.cumple, cumple_inverso: f.cumple_inverso, etiqueta: f.etiqueta, frase: (f as { frase?: string }).frase ?? null, motivo: f.motivo, detalle: {} }])),
    etiquetas: x.etiquetas.map((e) => ({ etiqueta: e, fuerte: e === 'granja_o_bots', detalle: e === 'granja_o_bots' ? '61 % de las menciones son bots' : '', llano: ETIQUETAS_LLANO[e] ?? e })),
    regimen: 'risk_on', corrida_ts: `${diaAtras(x.dias)}T20:02:00+00:00`, hilo_id: null, seguimiento, linea_estudio: modo.linea_estudio }
}

/* ---------- gatillos (la fila de la tabla, como /gatillos) ---------- */
type GatilloSim = { id: number; id_corto: string; texto: string; condicion: string; accion: string; avisar: boolean; vigilancia: { cuentas?: string[]; activos?: string[]; exchanges?: string[]; palabras?: string[]; precio?: { activo: string; nivel: number; direccion: 'sube' | 'baja' } }; estado: 'activo' | 'pausado' | 'cumplido' | 'cancelado'; hilo_id: string | null; en_curso: string | null; ultimo_despertar: string | null; despertares: number; resultado: string | null; creado: string; actualizado: string; cumplido_en: string | null; cada_min: number }
const minIso = (min: number) => hace(min).slice(0, 16)
const GATILLOS_SIM: GatilloSim[] = [
  { id: 7, id_corto: 'g7a1b2', texto: 'si STONK toca 0,15 vende la mitad', condicion: 'STONK cotiza en 0,15 o más', accion: 'vender el 50 % de la posición a market', avisar: true, vigilancia: { activos: ['STONK'], precio: { activo: 'STONK', nivel: 0.15, direccion: 'sube' } }, estado: 'activo', hilo_id: H_STONK, en_curso: null, ultimo_despertar: null, despertares: 0, resultado: null, creado: minIso(60 * 24 * 3), actualizado: minIso(60 * 24 * 3), cumplido_en: null, cada_min: 5 },
  { id: 9, id_corto: 'g9w4l1', texto: 'si WAL cierra una hora sobre 0,0389 con volumen, sube el stop a 0,038', condicion: 'vela de 1 h de WAL cierra sobre 0,0389 con volumen sobre su media', accion: 'mover el stop de la caja a 0,038', avisar: false, vigilancia: { activos: ['WAL'], precio: { activo: 'WAL', nivel: 0.0389, direccion: 'sube' } }, estado: 'activo', hilo_id: H_CAJA, en_curso: null, ultimo_despertar: minIso(40), despertares: 3, resultado: null, creado: minIso(60 * 5), actualizado: minIso(40), cumplido_en: null, cada_min: 1 },
  { id: 10, id_corto: 'g10wgr', texto: 'avísame si las granjas pasan del 30 % de las menciones de WAL', condicion: 'granjas > 30 % de las menciones de WAL en 24 h', accion: 'avisar a Pablo', avisar: true, vigilancia: { activos: ['WAL'], cuentas: ['walrusprotocol'], palabras: ['wal', 'walrus'] }, estado: 'activo', hilo_id: H_CAJA, en_curso: null, ultimo_despertar: minIso(120), despertares: 6, resultado: null, creado: minIso(60 * 5), actualizado: minIso(120), cumplido_en: null, cada_min: 15 },
  { id: 4, id_corto: 'g4s0l9', texto: 'si SOL vuelve a 193 avísame para entrar 40 USDT', condicion: 'SOL cotiza en 193 o menos', accion: 'proponer entrada de 40 USDT con stop', avisar: true, vigilancia: { activos: ['SOL'], precio: { activo: 'SOL', nivel: 193, direccion: 'baja' } }, estado: 'pausado', hilo_id: H_MONITOR, en_curso: null, ultimo_despertar: minIso(60 * 30), despertares: 2, resultado: null, creado: minIso(60 * 24 * 2), actualizado: minIso(60 * 30), cumplido_en: null, cada_min: 5 },
  { id: 2, id_corto: 'g2b7c0', texto: 'si BTC pierde 108 k avísame y revisamos stops', condicion: 'BTC bajo 108 000', accion: 'avisar y revisar los stops', avisar: true, vigilancia: { activos: ['BTC'], precio: { activo: 'BTC', nivel: 108_000, direccion: 'baja' } }, estado: 'cumplido', hilo_id: H_MONITOR, en_curso: null, ultimo_despertar: minIso(60 * 24 * 6), despertares: 1, resultado: 'avisado; stops revisados, sin cambios', creado: minIso(60 * 24 * 9), actualizado: minIso(60 * 24 * 6), cumplido_en: minIso(60 * 24 * 6), cada_min: 5 },
]

/* ---------- cartera ---------- */
type PosSim = { activo: string; origen: string; mandato: string; declarada?: boolean; simulado: boolean; cantidad: number; precio_medio: number; pnl_realizado_usdt: number; comisiones_usdt: number; stop: { precio: number; orden_id: string | null; cantidad: number } | null; abierta_en: string; tesis: string | null; invalidacion: string | null; hilo_id: string | null }
const CARTERA_SIM: { pablo: { declarado_usdt: number; efectivo_usdt: number; posiciones: PosSim[] }; caja: { capital_asignado_usdt: number; efectivo_usdt: number; posiciones: PosSim[] } } = {
  pablo: { declarado_usdt: 2300, efectivo_usdt: 2188.69, posiciones: [] },
  caja: { capital_asignado_usdt: 101, efectivo_usdt: 16.29, posiciones: [
    { activo: 'WAL', origen: 'caja', mandato: 'trade', simulado: false, cantidad: 2228.739, precio_medio: 0.038008, pnl_realizado_usdt: 0, comisiones_usdt: 0.085, stop: { precio: 0.0328, orden_id: '2109380965351456769', cantidad: 2228.739 }, abierta_en: '2026-10-11T20:29:46+00:00', tesis: 'Squeeze cargado en WAL: cortos atrapados y pulso sano.', invalidacion: 'el OI cae a la mitad sin que el precio suba', hilo_id: H_CAJA },
  ] },
}
const CERRADAS_SIM = {
  pablo: [{ activo: 'SOL', origen: 'pablo', mandato: 'trade', abierta_en: '2026-10-10T08:44:55+00:00', cerrada_en: '2026-10-10T08:58:53+00:00', pnl_realizado_usdt: -0.0596, comisiones_usdt: 0.0598, costo_usdt: 29.9, motivo_cierre: 'cierre total a market (fin de la prueba)' }],
  caja: [
    { activo: 'STRK', origen: 'caja', mandato: 'trade', abierta_en: '2026-10-10T15:49:00+00:00', cerrada_en: '2026-10-11T19:49:00+00:00', pnl_realizado_usdt: 2.95, comisiones_usdt: 0.055, costo_usdt: 25, motivo_cierre: 'objetivo tocado antes de la votación' },
    { activo: 'KAIA', origen: 'caja', mandato: 'trade', abierta_en: '2026-10-10T21:49:00+00:00', cerrada_en: '2026-10-10T22:49:00+00:00', pnl_realizado_usdt: -1.9, comisiones_usdt: 0.048, costo_usdt: 25, motivo_cierre: 'stop ejecutado en 0,0525' },
  ],
}
function posCartera(p: PosSim, totalPos: number) {
  const precio = ACTIVOS[p.activo]?.precio ?? null
  const valor = precio !== null ? redondeo(p.cantidad * precio, 2) : null
  const costo = redondeo(p.cantidad * p.precio_medio, 2)
  const sinStop = (p.mandato === 'swing' || p.mandato === 'trade') && !p.stop
  return { activo: p.activo, origen: p.origen, mandato: p.mandato, declarada: !!p.declarada, simulado: p.simulado, cantidad: p.cantidad, precio_medio: p.precio_medio, costo_usdt: costo, precio_actual: precio, valor_usdt: valor,
    pnl_no_realizado_usdt: valor !== null ? redondeo(valor - costo, 2) : null, pnl_no_realizado_pct: precio !== null ? pct6(precio, p.precio_medio) : null, pnl_realizado_usdt: p.pnl_realizado_usdt, comisiones_usdt: p.comisiones_usdt,
    stop: p.stop ? { ...p.stop, distancia_pct: precio !== null ? pct6(p.stop.precio, precio) : null } : null, sin_stop: sinStop, peso_pct: totalPos && valor !== null ? redondeo((valor / totalPos) * 100, 1) : null,
    abierta_en: p.abierta_en, tesis: p.tesis, invalidacion: p.invalidacion, hilo_id: p.hilo_id, fuente: p.declarada ? 'posiciones (declarada) + bingx:ticker' : 'posiciones (fills reales) + bingx:ticker' }
}
function cartera6(origen: 'pablo' | 'caja') {
  const c = CARTERA_SIM[origen]
  const valorPos = redondeo(c.posiciones.reduce((a, p) => a + p.cantidad * (ACTIVOS[p.activo]?.precio ?? 0), 0), 2)
  const posiciones = c.posiciones.map((p) => posCartera(p, valorPos))
  const total = redondeo(c.efectivo_usdt + valorPos, 2)
  const cerradas = CERRADAS_SIM[origen]
  const out: Record<string, unknown> = {
    origen, simulado: false,
    capital: { ...(origen === 'pablo' ? { declarado_usdt: CARTERA_SIM.pablo.declarado_usdt } : { capital_asignado_usdt: CARTERA_SIM.caja.capital_asignado_usdt }), efectivo_usdt: c.efectivo_usdt, valor_posiciones_usdt: valorPos, valor_total_usdt: total, exposicion_pct: total ? redondeo((valorPos / total) * 100, 1) : 0, fuente: origen === 'pablo' ? 'perfil.capital_total_usdt (declarado por Pablo) + bingx:balances' : 'libro de la caja + bingx' },
    posiciones, cerradas_recientes: cerradas,
    pnl: { realizado_total_usdt: redondeo(cerradas.reduce((a, x) => a + x.pnl_realizado_usdt, 0) + c.posiciones.reduce((a, p) => a + p.pnl_realizado_usdt, 0), 4), no_realizado_total_usdt: redondeo(posiciones.reduce((a, p) => a + (p.pnl_no_realizado_usdt ?? 0), 0), 2), comisiones_total_usdt: redondeo(cerradas.reduce((a, x) => a + x.comisiones_usdt, 0) + c.posiciones.reduce((a, p) => a + p.comisiones_usdt, 0), 4), desde: '2026-10-10' },
    consultado_en: ahora(), fuente: 'posiciones (fills reales y declaradas) + bingx',
  }
  if (origen === 'caja') out.mision = mision()
  return out
}
const MOVIMIENTOS_SIM: { id: number; fecha: string; usdt: number; tipo: 'aporte' | 'retiro'; nota: string | null; origen: string }[] = [
  { id: 1, fecha: '2026-10-01', usdt: 2300, tipo: 'aporte', nota: 'capital inicial declarado', origen: 'pablo' },
  { id: 2, fecha: '2026-10-10', usdt: 101, tipo: 'aporte', nota: 'capital asignado a la caja', origen: 'caja' },
]
let movId = 3
function curva6(origen: string, rango: string) {
  const { dias, desde } = diasDe(rango)
  const movs = MOVIMIENTOS_SIM.filter((m) => m.origen === origen)
  const inicio = Date.parse(origen === 'caja' ? '2026-10-10' : '2026-10-01') / 1000
  const r = azar(origen === 'caja' ? 77 : 33)
  const puntos: { t: number; fecha: string; valor_total_usdt: number; aportes_acum_usdt: number; rendimiento_usdt: number; rendimiento_pct: number; drawdown_pct: number }[] = []
  let rend = 0, picoRend = 0
  for (let i = 0; i < dias; i++) {
    const t = desde + i * DIA; if (t < inicio) continue
    const fecha = new Date(t * 1000).toISOString().slice(0, 10)
    const aportes = movs.filter((m) => m.fecha <= fecha).reduce((a, m) => a + (m.tipo === 'aporte' ? m.usdt : -m.usdt), 0)
    rend = redondeo(rend + (r() - 0.47) * aportes * (origen === 'caja' ? 0.012 : 0.003), 2)
    picoRend = Math.max(picoRend, rend)
    const valor = redondeo(aportes + rend, 2)
    puntos.push({ t, fecha, valor_total_usdt: valor, aportes_acum_usdt: aportes, rendimiento_usdt: rend, rendimiento_pct: aportes ? redondeo((rend / aportes) * 100, 2) : 0, drawdown_pct: aportes ? redondeo(((rend - picoRend) / aportes) * 100, 2) : 0 })
  }
  const ini = puntos[0], fin = puntos[puntos.length - 1]
  return { origen, rango, puntos, movimientos: movs, resumen: ini ? { desde: ini.fecha, valor_inicial_usdt: ini.valor_total_usdt, valor_final_usdt: fin.valor_total_usdt, rendimiento_usdt: fin.rendimiento_usdt, rendimiento_pct: fin.rendimiento_pct, max_drawdown_pct: Math.min(...puntos.map((p) => p.drawdown_pct)), aportes_usdt: movs.filter((m) => m.tipo === 'aporte').reduce((a, m) => a + m.usdt, 0), retiros_usdt: movs.filter((m) => m.tipo === 'retiro').reduce((a, m) => a + m.usdt, 0) } : null, ...(puntos.length ? {} : { no_disponibles: [{ motivo: 'sin snapshots en el rango' }] }), consultado_en: ahora(), fuente: origen === 'caja' ? 'caja_snapshots + movimientos_capital' : 'portafolio_snapshots + movimientos_capital' }
}
/** Lo que pasa al confirmar una declaración: la posición se crea con un fill declarado; no se envía nada al exchange. */
function confirmarDeclaracion(p: Record<string, unknown>) {
  p.estado = 'llena'
  const d = (p.detalle as { declaracion?: { activo?: string; cantidad?: number; precio_medio?: number; mandato?: string; fecha?: string; tesis?: string; invalidacion?: string } }).declaracion ?? {}
  const sym = String(d.activo ?? '').toUpperCase().replace(/-USDT$/, '')
  const ya = CARTERA_SIM.pablo.posiciones.find((x) => x.activo === sym)
  if (ya) { const n = ya.cantidad + Number(d.cantidad); ya.precio_medio = redondeo((ya.cantidad * ya.precio_medio + Number(d.cantidad) * Number(d.precio_medio)) / n, 6); ya.cantidad = n; ya.declarada = true }
  else CARTERA_SIM.pablo.posiciones.unshift({ activo: sym, origen: 'pablo', mandato: d.mandato ?? 'hold', declarada: true, simulado: false, cantidad: Number(d.cantidad), precio_medio: Number(d.precio_medio), pnl_realizado_usdt: 0, comisiones_usdt: 0, stop: null, abierta_en: d.fecha ? `${d.fecha}T00:00:00+00:00` : ahora(), tesis: d.tesis ?? null, invalidacion: d.invalidacion ?? null, hilo_id: (p.hilo_id as string) ?? null })
  const texto = `DECLARADA #${p.id_corto} · ${sym} · ${d.cantidad} a ${String(d.precio_medio).replace('.', ',')} · mandato ${d.mandato ?? 'hold'} · fill declarado-${p.id_corto}`
  const h = HILOS.get(p.hilo_id as string); if (h) { h.mensajes.push({ id: ++mensajeId, rol: 'ejecucion', contenido: texto, ts: ahora(), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] }); h.actualizado = ahora() }
  return { ok: true, texto, estado: 'llena', fills: [{ id: `declarado-${p.id_corto}`, lado: 'compra', precio: Number(d.precio_medio), cantidad: Number(d.cantidad), comision: 0, hora: d.fecha ?? ahora(), declarado: true }], stop: null, alertas: [], eventos: ['posición declarada'], reconciliacion: { discrepancias: [], alertas: [], error: null } }
}
function hiloTerminal(sym: string) {
  const titulo = `Terminal · ${sym}`
  const ya = [...HILOS.values()].find((h) => h.titulo === titulo)
  if (ya) return { hilo_id: ya.id, titulo, nuevo: false }
  const id = `c0ffee00-0000-4000-9000-${String(Date.now()).slice(-12)}`
  HILOS.set(id, { id, titulo, creado: ahora(), actualizado: ahora(), resumen_vivo: `Hilo del terminal de ${sym}.`, costo_usd: 0, mensajes: [] })
  return { hilo_id: id, titulo, nuevo: true }
}
function propuestaPanel(campos: Record<string, unknown>, bloque: string, sym: string) {
  const id_corto = hex(6, 1400 + PROPUESTAS.size)
  const h = hiloTerminal(sym)
  const p: Record<string, unknown> = { id: hex(32, 1500 + PROPUESTAS.size), id_corto, hilo_id: h.hilo_id, lado: '', tipo: '', mandato: null, cantidad_usdt: null, precio: null, stop: null, precio_referencia: ACTIVOS[sym]?.precio ?? null, estado: 'propuesta', expira: new Date(Date.now() + 10 * 60_000).toISOString(), expirada: false, origen: 'pablo', propuesta_en: ahora(), ...campos, bloque: bloque.replace('#ID', `#${id_corto}`), detalle: { origen_propuesta: 'panel', ...(campos.detalle as object ?? {}) } }
  PROPUESTAS.set(id_corto, p)
  return p
}

/* ---------- exchange ---------- */
const ORDENES_SIM = [
  { id: '2109380965351456769', par: 'WAL-USDT', lado: 'venta', tipo: 'TAKE_STOP_MARKET', estado: 'NEW', precio: 0.03797, precio_stop: 0.0328, cantidad: 2228.73, ejecutada: 0, total_usdt: 0, precio_promedio: null, comision: 0, hora: '2026-10-11T20:29:47+00:00', client_id: 'mw2276a2s', propuesta: { id_corto: '2276a2', accion: 'entrada', origen: 'caja', rol: 'stop' as const } },
  { id: '2109380965351456771', par: 'SOL-USDT', lado: 'compra', tipo: 'LIMIT', estado: 'NEW', precio: 193.4, precio_stop: null, cantidad: 0.2068, ejecutada: 0, total_usdt: 0, precio_promedio: null, comision: 0, hora: hace(60 * 4), client_id: null, propuesta: null },
]
const FILLS_SIM = [
  { id: 'f-9001', orden_id: 'o-8801', par: 'WAL-USDT', lado: 'compra', precio: 0.03797, cantidad: 2228.739, total_usdt: 84.63, comision: 0.085, comision_activo: 'USDT', maker: false, hora: '2026-10-11T20:29:46+00:00', propuesta: { id_corto: '2276a2', origen: 'caja' } },
  { id: 'f-8990', orden_id: 'o-8790', par: 'STRK-USDT', lado: 'venta', precio: 0.1008, cantidad: 292.8, total_usdt: 29.51, comision: 0.03, comision_activo: 'USDT', maker: true, hora: '2026-10-11T19:49:00+00:00', propuesta: { id_corto: 'c4j4s2', origen: 'caja' } },
  { id: 'f-8971', orden_id: 'o-8771', par: 'STRK-USDT', lado: 'compra', precio: 0.0854, cantidad: 292.8, total_usdt: 25.0, comision: 0.025, comision_activo: 'USDT', maker: false, hora: '2026-10-10T15:49:00+00:00', propuesta: { id_corto: 'c4j4s1', origen: 'caja' } },
  { id: 'f-8800', orden_id: 'o-8600', par: 'SOL-USDT', lado: 'venta', precio: 104.34, cantidad: 0.2866, total_usdt: 29.9, comision: 0.0299, comision_activo: 'USDT', maker: false, hora: '2026-10-10T08:58:53+00:00', propuesta: { id_corto: 'b5c6d7', origen: 'pablo' } },
  { id: 'f-8790', orden_id: 'o-8590', par: 'SOL-USDT', lado: 'compra', precio: 104.55, cantidad: 0.2866, total_usdt: 29.96, comision: 0.0299, comision_activo: 'USDT', maker: false, hora: '2026-10-10T08:44:55+00:00', propuesta: { id_corto: 'a4b5c6', origen: 'pablo' } },
]

/* ---------- caja ---------- */
const MISION = { id: '69ed37', estado: 'activa', objetivo: 'Caja en real con los 101 USDT. Misión: la máxima rentabilidad en 14 días con candidatas del radar.', objetivo_pct: 10, avance_pct: 0.11, falta_pct: 9.89, horizonte: '2026-10-15 20:28 UTC', perdida_max_pct: 15, perdida_max_usdt: 15.15, perdida_actual_usdt: 0, riesgo_por_operacion_pct: 5, universo_permitido: [] as string[], universo_vetado: [] as string[], permite_sin_stop: false, cerrar_al_perder: true, presupuesto_api_usd: 15, gasto_api_usd: 1.84, max_ordenes_dia: 6, capital_inicial_usdt: 101, simulado: false, plan: 'rotar entre candidatas del radar; nada sin stop; no rotar antes de 24 h salvo stop', hilo_id: H_CAJA, motivo_pausa: null as string | null, activada_en: '2026-10-11 20:28' }
function mision() { const restan = (Date.parse('2026-10-15T20:28:00Z') - Date.now()) / 86_400_000; return { ...MISION, tiempo_restante: { dias: redondeo(Math.max(0, restan), 1), vencida: restan < 0 } } }
const DECISIONES_SIM = [
  { fecha: hace(60 * 2), activo: 'CAJA', tipo: 'observacion', accion: 'esperar', tesis: 'WAL sigue plana sobre la entrada; el radar no trajo candidatas nuevas. 16 USDT en espera.', cifras: {}, orden: null, modo: null, modo_version: null, hilo_id: H_CAJA },
  { fecha: hace(60 * 4), activo: 'CAJA', tipo: 'observacion', accion: 'esperar', tesis: 'Sin ruptura de 0,0386–0,0389 ni caída a 0,034. Candidatas idénticas a hace dos horas.', cifras: {}, orden: null, modo: null, modo_version: null, hilo_id: H_CAJA },
  { fecha: '2026-10-11T20:29:46+00:00', activo: 'WAL', tipo: 'entrada', accion: 'entrar', tesis: 'Squeeze cargado en WAL: OI en el percentil 98, funding −0,041 %, pulso sano.', cifras: { stop: 0.0328, usdt: 84.63 }, orden: { id_corto: '2276a2', estado: 'llena' }, modo: 'squeeze', modo_version: '1', hilo_id: H_CAJA },
  { fecha: '2026-10-11T19:49:00+00:00', activo: 'STRK', tipo: 'salida', accion: 'salir', tesis: 'Objetivo +18 % tocado antes de la votación; se cobra.', cifras: { pnl_usdt: 2.95 }, orden: { id_corto: 'c4j4s2', estado: 'llena' }, modo: 'pre_catalizador', modo_version: '1', hilo_id: H_CAJA },
  { fecha: '2026-10-11T04:52:00+00:00', activo: 'STRK', tipo: 'ajuste_stop', accion: 'mover_stop', tesis: 'Stop subido a 0,0985 tras +12 %: asegura +1 USDT.', cifras: { stop: 0.0985 }, orden: { id_corto: 'c4j4s3', estado: 'llena' }, modo: null, modo_version: null, hilo_id: H_CAJA },
  { fecha: '2026-10-10T22:49:00+00:00', activo: 'KAIA', tipo: 'salida', accion: 'salir', tesis: 'El stop en 0,0525 saltó en el exchange.', cifras: { pnl_usdt: -1.9 }, orden: null, modo: 'impulso', modo_version: '1', hilo_id: H_CAJA },
]
function caja6(n: number) {
  const c = cartera6('caja') as { capital: { efectivo_usdt: number; valor_posiciones_usdt: number; valor_total_usdt: number }; posiciones: ReturnType<typeof posCartera>[]; pnl: { realizado_total_usdt: number; no_realizado_total_usdt: number } }
  return {
    estado: { capital_asignado_usdt: CARTERA_SIM.caja.capital_asignado_usdt, efectivo_usdt: c.capital.efectivo_usdt, valor_posiciones_usdt: c.capital.valor_posiciones_usdt, valor_total_usdt: c.capital.valor_total_usdt, pnl_realizado_usdt: c.pnl.realizado_total_usdt, pnl_no_realizado_usdt: c.pnl.no_realizado_total_usdt, pnl_total_pct: pct6(c.capital.valor_total_usdt + c.pnl.realizado_total_usdt, CARTERA_SIM.caja.capital_asignado_usdt), ordenes_hoy: 1, simulado: false, exchange: 'bingx',
      posiciones: c.posiciones.map((p) => ({ activo: p.activo, mandato: p.mandato, cantidad: p.cantidad, precio_medio: p.precio_medio, precio_actual: p.precio_actual, valor_usdt: p.valor_usdt, pnl_no_realizado_usdt: p.pnl_no_realizado_usdt, pnl_no_realizado_pct: p.pnl_no_realizado_pct, stop_precio: p.stop?.precio ?? null, stop_orden_id: p.stop?.orden_id ?? null, distancia_stop_pct: p.stop?.distancia_pct ?? null, sin_stop: p.sin_stop, tesis: p.tesis, abierta_en: p.abierta_en })),
      consultado_en: ahora(), fuente: 'libro de la caja + bingx' },
    mision: MISION.estado === 'cancelada' ? null : mision(),
    decisiones: DECISIONES_SIM.slice(0, n),
    ciclos: { ultimo: hace(60 * 2), cada_h: 2, proximo: new Date(Date.now() + 2 * 3600_000 - 120 * 60_000 + 10 * 60_000).toISOString(), sin_novedades_seguidos: 2 },
    rendimiento: { modo: 'real', posiciones_cerradas: 2, simuladas_excluidas: 2, pnl_realizado_total_usdt: 1.05, tasa_acierto_pct: 50, peor_caida_pct: -1.9, curva: [], por_mision: [{ id: '95faad', estado: 'liquidada', simulado: true, resultado_pct: 1.05 }] },
    consultado_en: ahora(), fuente: 'libro de la caja + misiones + bitacora (origen caja)',
  }
}

/* ---------- control ---------- */
const MANUAL_SIM = {
  vigente: { id: 3, version: '1.2', origen: 'revision', resumen: '[1. Lo que ya se aprendió con datos] el impulso solo no le gana al azar; el squeeze sí, con muestra chica.', creada: '2026-10-11T19:20:00+00:00', texto: '# Manual de operación de Luffy v1.2\n\n## 1. Lo que ya se aprendió con datos\n- El impulso solo no le gana al azar (369 casos).\n\n## 3. Stops\n- Todo swing o trade lleva stop en el exchange.' },
  versiones: [{ id: 3, version: '1.2', origen: 'revision', resumen: 'Lo aprendido con el estudio de eventos; stops del trade más cortos.', vigente: true, creada: '2026-10-11T19:20:00+00:00' }, { id: 2, version: '1.1', origen: 'pablo', resumen: 'La caja en real: límites de la misión y pánico.', vigente: false, creada: '2026-10-10T21:00:00+00:00' }, { id: 1, version: '1.0', origen: 'inicial', resumen: 'Primera versión.', vigente: false, creada: '2026-10-10T03:00:00+00:00' }],
  propuestas_pendientes: [{ id: 7, revision_id: 2, seccion: '4. Caja', texto_nuevo: 'Una posición de la caja no se rota antes de 24 h salvo que salte el stop o la misión cambie.', motivo: 'KAIA y STRK: las rotaciones rápidas costaron comisiones sin ventaja medida.', creada: hace(60 * 7) }],
}
const DIFFS: Record<string, string> = {
  '1.1|1.2': '--- v1.1\n+++ v1.2\n@@ 1. Lo que ya se aprendió con datos @@\n+- El impulso solo no le gana al azar (369 casos).\n@@ 3. Stops @@\n-- El stop del trade va a 2 ATR.\n+- El stop del trade va a 1,5 ATR.',
  '1.0|1.1': '--- v1.0\n+++ v1.1\n@@ 4. Caja @@\n+- La caja opera en real con su capital asignado.\n+- Pánico: cierra todo y avisa.',
}
function costoSim(dias: number) {
  const r = azar(42)
  const por_dia = Array.from({ length: dias }, (_, i) => { const l = redondeo(1.2 + r() * 2.6, 2), j = redondeo(0.03 + r() * 0.12, 2); return { dia: new Date(Date.now() - (dias - 1 - i) * 86_400_000).toISOString().slice(0, 10), luffy_usd: l, jev_usd: j, total_usd: redondeo(l + j, 2), turnos: Math.round(10 + r() * 30) } })
  return { desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), costo_usd: 27.41, luffy_usd: 27.41, total_usd: 30.24, respuestas: 96,
    jev: { desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), costo_usd: 2.83, llamadas: 13_434, por_proposito: [{ proposito: 'clasificar_sonnet', modelo: 'claude-sonnet-5', n: 4, costo_usd: 1.3 }, { proposito: 'clasificar_post', modelo: 'jev-1.13.0', n: 12_224, costo_usd: 0.68 }, { proposito: 'clasificar_haiku', modelo: 'claude-haiku-4-5', n: 6, costo_usd: 0.62 }, { proposito: 'validacion', modelo: 'jev-1.13.0', n: 800, costo_usd: 0.04 }], por_modelo: [{ modelo: 'claude-sonnet-5', n: 4, costo_usd: 1.3 }, { modelo: 'claude-haiku-4-5', n: 7, costo_usd: 0.79 }, { modelo: 'jev-1.13.0', n: 13_423, costo_usd: 0.74 }] },
    por_modelo: [{ modelo: 'claude-fable-5-1', costo_usd: 26.9, n: 80 }, { modelo: 'claude-sonnet-5', costo_usd: 0.51, n: 16 }],
    presupuesto: { presupuesto_api_usd: 140, aviso_usd: 100, degradar_usd: 125 },
    por_tipo: [{ tipo_turno: 'analisis_entrada', etiqueta: 'análisis de entrada', n: 14, costo_usd: 9.8, promedio_usd: 0.7, iteraciones: 6.2 }, { tipo_turno: 'dato_grafico', etiqueta: 'dato con gráfico', n: 22, costo_usd: 8.1, promedio_usd: 0.37, iteraciones: 3.1 }, { tipo_turno: 'discusion', etiqueta: 'discusión', n: 41, costo_usd: 4.2, promedio_usd: 0.1, iteraciones: 1 }, { tipo_turno: 'monitor', etiqueta: 'monitor', n: 18, costo_usd: 3.9, promedio_usd: 0.22, iteraciones: 2.4 }, { tipo_turno: 'caja', etiqueta: 'ciclo de la caja', n: 6, costo_usd: 1.41, promedio_usd: 0.24, iteraciones: 2.8 }],
    por_dia, agentes: [{ quien: 'cuant', n: 22, costo_usd: 3.1 }, { quien: 'investigador', n: 6, costo_usd: 4.8 }, { quien: 'estratega', n: 2, costo_usd: 0.9 }],
    estilo: { turnos: 120, reescritos: 4, tasa_pct: 3.3, costo_usd: 0.21 }, tamano_bd: { total_mb: 412.5, tablas: [{ tabla: 'social_posts', mb: 210.3 }] },
    umbrales: { presupuesto_api_usd: 140, aviso_usd: 100, degradar_usd: 125, estado: 'normal' } }
}
const TIPOS_ALERTA = ['stop_cerca', 'sin_stop', 'stop_ejecutado', 'btc_1h', 'gasto_api', 'catalizador', 'granja', 'shill_coordinado', 'discrepancia', 'listados_caida', 'fuente_caida']
const ALERTAS_SIM = Array.from({ length: 37 }, (_, i) => {
  const r = azar(900 + i); const tipo = TIPOS_ALERTA[Math.floor(r() * TIPOS_ALERTA.length)]; const activo = ['WAL', 'STONK', 'SOL', null, 'BTC', 'STRK'][Math.floor(r() * 6)]
  const sev = tipo === 'stop_ejecutado' || tipo === 'sin_stop' ? 'alta' : tipo === 'stop_cerca' || tipo === 'granja' || tipo === 'btc_1h' ? 'media' : 'baja'
  const texto = tipo === 'stop_cerca' ? `${activo ?? 'WAL'} a ${(1 + r() * 4).toFixed(1).replace('.', ',')} % del stop` : tipo === 'granja' ? `${activo ?? 'WAL'}: granjas al ${Math.round(20 + r() * 30)} % de las menciones` : tipo === 'btc_1h' ? `BTC se movió ${(1.5 + r() * 2).toFixed(1).replace('.', ',')} % en una hora` : tipo === 'fuente_caida' ? 'Upbit: 429 de Cloudflare; respaldo de mercados activo' : tipo === 'gasto_api' ? `gasto del mes al ${Math.round(20 + r() * 20)} % del presupuesto` : tipo === 'stop_ejecutado' ? `Stop de ${activo ?? 'KAIA'} ejecutado` : tipo === 'catalizador' ? `${activo ?? 'STRK'}: votación en ${Math.round(1 + r() * 6)} días` : `${tipo.replace(/_/g, ' ')}${activo ? ` en ${activo}` : ''}`
  return { id: 912 - i, clave: `${tipo}:${activo ?? 'global'}`, tipo, activo, severidad: sev, texto, valor: null, datos: {}, enviada_en: hace(14 * i + 3), canal: 'telegram', atendida: i > 6 }
})

/* ---------- oficina ---------- */
const FUENTES_SIM = [
  { nombre: 'bingx', etiqueta: 'BingX', estado: 'al_dia', ultima_lectura: hace(1), detalle: 'velas y cuenta' },
  { nombre: 'binance_futures', etiqueta: 'Binance Futures', estado: 'al_dia', ultima_lectura: hace(3), detalle: 'snapshot horario 363/363 perps' },
  { nombre: 'coinalyze', etiqueta: 'Coinalyze', estado: 'al_dia', ultima_lectura: hace(60 * 2), detalle: 'diario 01:40 UTC' },
  { nombre: 'defillama', etiqueta: 'DefiLlama', estado: 'atrasada', ultima_lectura: hace(95), detalle: 'la última lectura tardó 41 s' },
  { nombre: 'x', etiqueta: 'X (crawler)', estado: 'al_dia', ultima_lectura: hace(8), detalle: 'cada 25 min · 1 204 posts hoy' },
  { nombre: 'telegram_fuente', etiqueta: 'Telegram (canales)', estado: 'apagada', detalle: 'sin TG_API_ID/TG_API_HASH' },
  { nombre: 'listados', etiqueta: 'Listados', estado: 'al_dia', ultima_lectura: hace(4) },
  { nombre: 'snapshot', etiqueta: 'Snapshot', estado: 'al_dia', ultima_lectura: hace(44), detalle: '390 votaciones, 0 relevantes' },
  { nombre: 'tally', etiqueta: 'Tally', estado: 'apagada', detalle: 'sin TALLY_API_KEY' },
  { nombre: 'upbit', etiqueta: 'Upbit', estado: 'caida', ultima_lectura: '2026-10-11T18:00:00+00:00', detalle: '429 de Cloudflare desde Contabo; respaldo de mercados activo' },
  { nombre: 'motor_veta', etiqueta: 'Motor VETA', estado: 'al_dia', ultima_lectura: hace(31) },
]
const AGENTES_SIM = [
  { nombre: 'cuant', etiqueta: 'Cuant', ultima_actividad: hace(60 * 6), llamadas_24h: 12, costo_24h_usd: 1.9, en_curso: false },
  { nombre: 'investigador', etiqueta: 'Investigador', ultima_actividad: hace(60 * 3), llamadas_24h: 2, costo_24h_usd: 1.6, en_curso: false },
  { nombre: 'estratega', etiqueta: 'Estratega', ultima_actividad: hace(60 * 24), llamadas_24h: 0, costo_24h_usd: 0, en_curso: false },
  { nombre: 'jev', etiqueta: 'Jev (clasificación)', ultima_actividad: hace(0), llamadas_24h: 7034, costo_24h_usd: 0.41, en_curso: true },
]
const TRABAJOS_SIM = [['reconciliacion', 'Reconciliación (Pablo y caja)', '15 min'], ['alertas', 'Alertas', '5 min'], ['crawler', 'Crawler de X', '25 min ± azar'], ['pulso', 'Pulso social', '30 min'], ['escaner', 'Escáner', '4 h'], ['radar_squeeze', 'Radar squeeze', '1 h'], ['listados', 'Listados', '5 min'], ['gobernanza', 'Gobernanza', '60 min'], ['caja', 'Ciclo de la caja', '2 h'], ['informe', 'Informe diario', '08:00 Chile'], ['snapshot_derivados', 'Snapshot de derivados', '1 h']].map(([nombre, etiqueta, cada], i) => ({ nombre, etiqueta, cada, ultima: hace(3 + i * 7), proxima: new Date(Date.now() + (5 + i * 4) * 60_000).toISOString(), estado: 'ok' }))
let eventoId = 50_400
const GUION_EVENTOS: Record<string, unknown>[] = [
  { tipo: 'fuente_leida', proceso: 'social', fuente: 'x', n: 48, ok: true, detalle: 'crawler' }, { tipo: 'jev', proceso: 'social', proposito: 'clasificar_post', n: 48, costo_usd: 0.002, modelo: 'jev-1.13.0' },
  { tipo: 'herramienta', proceso: 'api', nombre: 'exchange_ticker', quien: 'luffy', ok: true, duracion_s: 0.4, fuente: 'bingx', hilo_id: H_MONITOR },
  { tipo: 'radar_ciclo', proceso: 'monitor', modo: 'squeeze', n_evaluados: 363, n_candidatas: 1, duracion_s: 12.4 }, { tipo: 'fuente_leida', proceso: 'monitor', fuente: 'binance_futures', n: 363, ok: true },
  { tipo: 'turno_abierto', proceso: 'api', hilo_id: H_MONITOR, quien: 'luffy', modo: 'chat', origen: 'pablo', canal: 'panel' }, { tipo: 'herramienta', proceso: 'api', nombre: 'derivados', quien: 'luffy', ok: true, duracion_s: 1.2, fuente: 'binance_futures', hilo_id: H_MONITOR, activos: ['WAL'] }, { tipo: 'agente_convocado', proceso: 'api', agente: 'cuant', hilo_id: H_MONITOR },
  { tipo: 'herramienta', proceso: 'api', nombre: 'defillama_serie', quien: 'cuant', ok: true, duracion_s: 2.1, fuente: 'defillama', hilo_id: H_MONITOR, activos: ['WAL'] }, { tipo: 'agente_terminado', proceso: 'api', agente: 'cuant', costo_usd: 0.11, duracion_s: 18, ok: true },
  { tipo: 'turno_cerrado', proceso: 'api', hilo_id: H_MONITOR, tipo_turno: 'dato_grafico', modelo: 'claude-fable-5-1', costo_usd: 0.17, herramientas: 3, duracion_s: 34, mensaje_id: 1300 },
  { tipo: 'caja_ciclo', proceso: 'monitor', motivo: 'programado', corrio: false, propuestas: 0, costo_usd: 0 }, { tipo: 'reconciliacion', proceso: 'monitor', origen: 'caja', discrepancias: 0, eventos: 0 },
  { tipo: 'fuente_leida', proceso: 'monitor', fuente: 'defillama', n: 0, ok: false, detalle: 'tiempo agotado' }, { tipo: 'alerta', proceso: 'monitor', alerta_id: 913, activo: 'WAL', severidad: 'media' },
  { tipo: 'gatillo', proceso: 'social', id_corto: 'g10wgr', evento: 'despertado' }, { tipo: 'fuente_leida', proceso: 'social', fuente: 'snapshot', n: 390, ok: true },
  // la oficina rehecha: más trabajo de agentes y eventos que nombran monedas (`activos`, pedido a Mugiwara en v2.3)
  { tipo: 'agente_convocado', proceso: 'api', agente: 'investigador', hilo_id: H_MONITOR }, { tipo: 'herramienta', proceso: 'api', nombre: 'web_buscar', quien: 'investigador', ok: true, duracion_s: 3.1, fuente: 'web', hilo_id: H_MONITOR },
  { tipo: 'fuente_leida', proceso: 'social', fuente: 'x', n: 31, ok: true, detalle: '31 nuevos', activos: ['STRK', 'WAL'] }, { tipo: 'jev', proceso: 'social', proposito: 'clasificar_post', n: 31, costo_usd: 0.001, modelo: 'jev-1.13.0' },
  { tipo: 'agente_terminado', proceso: 'api', agente: 'investigador', costo_usd: 0.42, duracion_s: 41, ok: true },
  { tipo: 'agente_convocado', proceso: 'api', agente: 'estratega', hilo_id: H_MONITOR }, { tipo: 'radar_ciclo', proceso: 'monitor', modo: 'impulso', n_evaluados: 241, n_candidatas: 1, duracion_s: 9.8, activos: ['CFX'] },
  { tipo: 'agente_terminado', proceso: 'api', agente: 'estratega', costo_usd: 0.31, duracion_s: 27, ok: true }, { tipo: 'alerta', proceso: 'monitor', alerta_id: 914, activo: 'STRK', severidad: 'media' },
  { tipo: 'fuente_leida', proceso: 'social', fuente: 'upbit', grupo: 'listados', n: 0, ok: false, detalle: '429' }, { tipo: 'jev', proceso: 'social', proposito: 'clasificar_post', n: 12, costo_usd: 0.0004, modelo: 'jev-1.13.0' },
]

/* ---------- informes ---------- */
const INFORMES_SIM = [0, 1, 2, 3, 5, 6].map((n, i) => ({ id: 41 - i, fecha: diaAtras(n), tipo: 'diario', costo_usd: 0.19, enviado: true, resumen: n === 0 ? 'Cartera: STONK sin cambios. Caja: WAL en squeeze, plana sobre la entrada.' : n === 1 ? 'La caja entra en WAL; STRK cobrada antes de la votación.' : n === 2 ? 'KAIA: el stop saltó; el radar trae CFX y C98.' : 'Mercado sin dirección; nada que hacer.', hilo_id: H_MONITOR, creado: `${diaAtras(n)}T11:00:00+00:00` }))
const BITACORA_SIM = [
  { id: 'b-51', fecha: '2026-10-11T20:29:46.123456+00:00', activo: 'WAL', tipo: 'entrada', origen: 'caja', mandato: 'trade', tesis: 'Squeeze cargado en WAL: cortos atrapados y pulso sano.', cifras: { stop: 0.0328 }, agentes_consultados: ['cuant'], resultado: null, cerrada: null, modo: 'squeeze', modo_version: '1', hilo_id: H_CAJA, orden_id: '2109380965351456768' },
  { id: 'b-50', fecha: '2026-10-11T19:49:00.000000+00:00', activo: 'STRK', tipo: 'salida', origen: 'caja', mandato: 'trade', tesis: 'Cobrar el +18 % antes de la votación.', cifras: { pnl_usdt: 2.95 }, agentes_consultados: [], resultado: '+2,95 USDT', cerrada: '2026-10-11T19:49:00+00:00', modo: 'pre_catalizador', modo_version: '1', hilo_id: H_CAJA, orden_id: 'o-8790' },
  { id: 'b-47', fecha: '2026-10-10T22:49:00.000000+00:00', activo: 'KAIA', tipo: 'salida', origen: 'caja', mandato: 'trade', tesis: 'Stop ejecutado.', cifras: { pnl_usdt: -1.9 }, agentes_consultados: [], resultado: '−1,90 USDT', cerrada: '2026-10-10T22:49:00+00:00', modo: 'impulso', modo_version: '1', hilo_id: H_CAJA, orden_id: null },
  { id: 'b-40', fecha: '2026-10-09T12:00:00.000000+00:00', activo: 'STONK', tipo: 'observacion', origen: 'pablo', mandato: 'hold', tesis: 'Ingresos cayendo más que su categoría.', cifras: {}, agentes_consultados: ['cuant'], resultado: null, cerrada: null, modo: null, modo_version: null, hilo_id: H_STONK, orden_id: null },
]
const TEORIAS_SIM = [
  { id: 't-12', titulo: 'Los cortos de WAL cubren si rompe 0,0389', hipotesis: 'Con OI en el percentil 98 y funding negativo, una ruptura con volumen fuerza la cobertura.', razonamiento: 'Liquidaciones de cortos apiladas arriba; precio que no cae.', como_probar: 'Vela de 1 h sobre 0,0389 con volumen ≥ 2× su media.', evidencia_favor: [{ texto: 'OI +25 % en un día con precio estable', fuente: 'binance_futures', hora: hace(60 * 6) }], evidencia_contra: [{ texto: '61 % de las menciones son bots', fuente: 'jev', hora: hace(60 * 3) }], estado: 'abierta', confianza: 'media', activos: ['WAL'], creada: hace(60 * 6), revisada: hace(60 * 2), hilo_origen: H_CAJA },
  { id: 't-11', titulo: 'STONK refleja la caída de ingresos antes del desbloqueo', hipotesis: 'Si los ingresos no recuperan 500 k/día antes del desbloqueo, el precio baja.', razonamiento: 'El mercado descuenta el flujo del protocolo.', como_probar: 'Ingresos diarios contra precio hasta el desbloqueo.', evidencia_favor: [], evidencia_contra: [], estado: 'abierta', confianza: 'baja', activos: ['STONK'], creada: hace(60 * 24 * 2), revisada: hace(60 * 24), hilo_origen: H_STONK },
  { id: 't-9', titulo: 'SOL continúa si cierra sobre 196', hipotesis: 'Dos rechazos en 196; un cierre diario arriba abre continuación.', razonamiento: '', como_probar: '', evidencia_favor: [], evidencia_contra: [{ texto: 'tercer rechazo en 196', fuente: 'bingx', hora: hace(60 * 24 * 4) }], estado: 'refutada', confianza: null, activos: ['SOL'], creada: hace(60 * 24 * 5), revisada: hace(60 * 24 * 4), hilo_origen: H_MONITOR },
]

/* ---------- 8.1 terminal ---------- */
function fila6(sym: string) {
  const a = ACTIVOS[sym]; const cands = CANDIDATAS_BASE.filter((c) => c.activo === sym && c.dias <= 1 && c.decision === 'analizar')
  const pos = (['pablo', 'caja'] as const).flatMap((o) => CARTERA_SIM[o].posiciones.filter((p) => p.activo === sym).map((p) => ({ origen: o, cantidad: p.cantidad, pnl_no_realizado_pct: pct6(a.precio, p.precio_medio), simulado: p.simulado, mandato: p.mandato })))
  const cat = catalizadores6(sym)[0] ?? null
  return { simbolo: sym, par: `${sym}-USDT`, nombre: a.nombre, precio: a.precio, cambio_24h_pct: cambio6(sym, 1), vs_btc_7d_pct: vsBtc6(sym, 7), vs_btc_30d_pct: vsBtc6(sym, 30), volumen_24h_usdt: a.volumen_24h_usdt, modos_hoy: [...new Set(cands.map((c) => c.modo))], squeeze: sym === 'WAL' ? 'cargado' : sym === 'OGN' ? 'ignicion' : null, posiciones: pos, gatillos: GATILLOS_SIM.filter((g) => (g.vigilancia.activos ?? []).includes(sym) && (g.estado === 'activo' || g.estado === 'pausado')).length, vigilancia: ['STONK', 'WAL', 'SOL', 'STRK'].includes(sym), candidata_hoy: cands.length > 0, proximo_catalizador: cat ? { fecha: cat.fecha, titulo: cat.titulo, tipo: cat.tipo, dias: cat.dias } : null, hora_precio: ahora() }
}
function catalizadores6(sym: string) {
  return sym === 'STRK' ? [{ fecha: isoDia(-4), dias: 4, titulo: 'Votación (snapshot): buyback del 2 % del tesoro', tipo: 'votacion', fuente: 'snapshot', url: 'https://snapshot.box/#/s:starknet', estado: 'active' }]
    : sym === 'WAL' ? [{ fecha: isoDia(-6), dias: 6, titulo: 'Votación (snapshot): parámetros del staking', tipo: 'votacion', fuente: 'snapshot', url: 'https://snapshot.box/#/s:walrus', estado: 'active' }, { fecha: diaAtras(-8), dias: 8, titulo: 'Mainnet v2', tipo: 'agenda', fuente: 'motor', impacto: 'alto' }]
    : sym === 'STONK' ? [{ fecha: diaAtras(-9), dias: 9, titulo: 'Desbloqueo del equipo (1,8 % del circulante)', tipo: 'agenda', fuente: 'motor', impacto: 'medio' }] : []
}
/** v2.2: la hora de la vitrina del servidor, con su ciclo. */
function vitrina(cada_s: number) { const edad = Math.round(Math.random() * cada_s * 0.6); return { calculado_en: new Date(Date.now() - edad * 1000).toISOString(), edad_s: edad, cada_s, estado: 'fresco', duracion_ms: 120 + Math.round(Math.random() * 400), error: null } }
function ficha6(sym: string, rango: string) {
  const a = ACTIVOS[sym]
  const cats = catalizadores6(sym)
  const secciones = [
    { id: 'precio', titulo: 'Precio y volumen, con lo nuestro encima', plantilla: 'precio', version: '1', spec: { version: 2, activos: [sym], rango, intervalo: '1d', paneles: [{ id: 'precio', altura: 3, escala: 'lineal', series: [{ id: 'p', tipo: 'ohlc', estilo: 'velas' }, { id: 'radar', tipo: 'candidatas', estilo: 'puntos' }, { id: 'gat', tipo: 'gatillos' }] }, { id: 'volumen', altura: 1, series: [{ id: 'v', tipo: 'volumen', estilo: 'barras' }] }], posiciones: { origen: 'ambos', mostrar: ['entradas', 'salidas', 'stop', 'stops_historial'] }, eventos: cats.map((x) => ({ fecha: x.fecha.slice(0, 10), etiqueta: x.titulo.split(':')[0] })) } },
    { id: 'derivados', titulo: 'Apalancamiento: dinero abierto, lo que pagan, liquidaciones y largos contra cortos', plantilla: 'derivados', version: '1', spec: { version: 2, activos: [sym], rango, paneles: [{ id: 'precio', altura: 2, series: [{ id: 'p', tipo: 'cierre' }] }, { id: 'oi', altura: 1, series: [{ id: 'oi', tipo: 'oi', estilo: 'area' }] }, { id: 'funding', altura: 1, series: [{ id: 'f', tipo: 'funding', estilo: 'barras' }] }, { id: 'liq', altura: 1, series: [{ id: 'liq', tipo: 'liquidaciones', estilo: 'barras' }] }, { id: 'ls', altura: 1, series: [{ id: 'ls', tipo: 'long_short', estilo: 'linea' }] }] } },
    { id: 'fundamento', titulo: 'Ingresos y dinero depositado contra su categoría', plantilla: 'fundamento', version: '1', spec: { version: 2, activos: [sym], rango, benchmarks: ['categoria'], paneles: [{ id: 'ingresos', altura: 2, series: [{ id: 'ing', tipo: 'ingresos', estilo: 'barras' }] }, { id: 'tvl', altura: 1, series: [{ id: 'tvl', tipo: 'tvl', estilo: 'area' }] }] } },
    { id: 'atencion', titulo: 'Quién habla: personas, bots informativos y granjas', plantilla: 'atencion', version: '1', spec: { version: 2, activos: [sym], rango, paneles: [{ id: 'precio', altura: 2, series: [{ id: 'p', tipo: 'cierre' }] }, { id: 'pulso', altura: 2, series: [{ id: 'h', tipo: 'pulso_humanos', estilo: 'area' }, { id: 'b', tipo: 'pulso_bots', estilo: 'linea' }, { id: 'g', tipo: 'pulso_granjas', estilo: 'linea' }] }, { id: 'tono', altura: 1, series: [{ id: 't', tipo: 'pulso_tono', estilo: 'linea' }] }] } },
  ]
  const fam = familiasDe(sym)
  const modos_cumplidos = CANDIDATAS_BASE.filter((c) => c.activo === sym && c.dias <= 1).map((c) => { const m = MODOS_SIM.find((x) => x.id === c.modo)!; const cd = candidata(c); return { modo: c.modo, version: m.version, confluencia: cd.confluencia, linea_estudio: m.linea_estudio, candidata_id: c.id, decision: c.decision, p_merece: c.p } })
  const etiquetas = [...new Set(CANDIDATAS_BASE.filter((c) => c.activo === sym).flatMap((c) => c.etiquetas))].map((e) => ({ etiqueta: e, fuerte: e === 'granja_o_bots', detalle: e === 'granja_o_bots' ? '61 % de las menciones son bots' : '', llano: ETIQUETAS_LLANO[e] ?? e }))
  return {
    activo: sym, par: `${sym}-USDT`, nombre: a.nombre, rango,
    precio: { ultimo: a.precio, cambio_24h_pct: cambio6(sym, 1), hora: ahora(), fuente: 'bingx:ticker' },
    secciones,
    radar: { familias: fam, modos_cumplidos, etiquetas, regimen: { lectura: 'risk_on', detalle: 'BTC sobre su media de 50 días y el funding agregado positivo' }, consultado_en: ahora(), fuente: 'radar: perfil_activo (familias por código) + candidatas + modos' },
    catalizadores: cats,
    bitacora: BITACORA_SIM.filter((b) => b.activo === sym),
    teorias: TEORIAS_SIM.filter((t) => t.activos.includes(sym)),
    posiciones: posicionesDe('ambos').filter((p) => p.activo === sym),
    gatillos: GATILLOS_SIM.filter((g) => (g.vigilancia.activos ?? []).includes(sym) && g.estado !== 'cancelado'),
    hilos: [...HILOS.values()].filter((h) => h.titulo.includes(sym)).map((h) => ({ id: h.id, titulo: h.titulo, actualizado: h.actualizado })),
    no_disponibles: a.defillama ? [] : [{ seccion: 'fundamento', motivo: fam.fundamento.motivo ?? 'sin protocolo en DefiLlama' }],
    consultado_en: ahora(), fuente: 'terminal/ficha',
  }
}
luffySimulado.get('/terminal/universo', (c) => {
  const filtro = c.req.query('filtro') ?? 'todo', q = (c.req.query('q') ?? '').trim().toUpperCase(), limite = Number(c.req.query('limite') ?? 300) || 300
  let filas = Object.keys(ACTIVOS).map(fila6)
  if (filtro === 'mis_posiciones') filas = filas.filter((f) => f.posiciones.some((p) => p.origen === 'pablo'))
  else if (filtro === 'caja') filas = filas.filter((f) => f.posiciones.some((p) => p.origen === 'caja'))
  else if (filtro === 'candidatas') filas = filas.filter((f) => CANDIDATAS_BASE.some((x) => x.activo === f.simbolo && x.dias <= 7))
  else if (filtro === 'vigilancia') filas = filas.filter((f) => f.vigilancia)
  else if (filtro === 'gatillos') filas = filas.filter((f) => f.gatillos > 0)
  if (q) filas = filas.filter((f) => f.simbolo.includes(q) || (f.nombre ?? '').toUpperCase().includes(q))
  filas.sort((x, y) => (y.volumen_24h_usdt ?? 0) - (x.volumen_24h_usdt ?? 0))
  filas = filas.slice(0, limite)
  return c.json({ filtro, q: q || null, n: filas.length, activos: filas, fuentes: { precio: 'bingx:ticker', vs_btc: 'velas 1d (bingx)', radar: 'candidatas (hoy)', squeeze: 'radar squeeze (última corrida horaria)', catalizadores: 'agenda del motor + listados + gobernanza' }, consultado_en: ahora(), fuente: 'terminal/universo' })
})
luffySimulado.get('/terminal/plantillas', (c) => c.json({ plantillas: ficha6('{activo}' in ACTIVOS ? '{activo}' : 'BTC', '90d').secciones.map((s) => ({ id: s.id, version: s.version, titulo: s.titulo, descripcion: s.titulo, spec: JSON.parse(JSON.stringify(s.spec).replace(/"BTC"/g, '"{activo}"')) })), consultado_en: ahora(), fuente: 'graficos/plantillas' }))
luffySimulado.get('/terminal/plantillas/:id', (c) => { const sym = (c.req.query('activo') ?? 'BTC').toUpperCase().replace(/-USDT$/, ''); if (!ACTIVOS[sym]) return c.json({ detail: 'activo no existe' }, 404); const s = ficha6(sym, c.req.query('rango') ?? '90d').secciones.find((x) => x.id === c.req.param('id')); return s ? c.json(s) : c.json({ detail: 'plantilla no existe' }, 404) })
const FICHAS_CALIENTES = new Set(['WAL', 'STONK', 'STRK', 'CFX', 'KAIA', 'BTC', 'ETH', 'SOL'])
luffySimulado.get('/terminal/:activo', (c) => {
  const sym = c.req.param('activo').toUpperCase().replace(/-USDT$/, ''); if (!ACTIVOS[sym]) return c.json({ detail: `${sym} no está en el universo` }, 404)
  const f = ficha6(sym, c.req.query('rango') ?? '90d')
  // v2.2: una moneda que nadie abrió vuelve al instante como ficha parcial; a los 3 s ya está
  if (!FICHAS_CALIENTES.has(sym)) { FICHAS_CALIENTES.add(sym); return c.json({ ...f, pendiente: true, reintentar_en_s: 3, radar: null, catalizadores: [], bitacora: [], teorias: [], posiciones: [], gatillos: [], hilos: [], no_disponibles: [{ seccion: 'ficha', motivo: 'se está calculando: vuelve en unos segundos' }], vitrina: { ...vitrina(600), estado: 'pendiente' } }) }
  return c.json({ ...f, vitrina: vitrina(sym === 'WAL' ? 180 : 600) })
})
luffySimulado.post('/terminal/:activo/hilo', (c) => { const sym = c.req.param('activo').toUpperCase().replace(/-USDT$/, ''); if (!ACTIVOS[sym]) return c.json({ detail: 'no existe' }, 404); return c.json(hiloTerminal(sym)) })

/* ---------- 8.2 cartera y exchange ---------- */
luffySimulado.get('/cartera', (c) => c.json(cartera6(c.req.query('origen') === 'caja' ? 'caja' : 'pablo')))
luffySimulado.get('/cartera/curva', (c) => c.json(curva6(c.req.query('origen') === 'caja' ? 'caja' : 'pablo', c.req.query('rango') ?? '90d')))
luffySimulado.get('/cartera/movimientos', (c) => { const o = c.req.query('origen'); return c.json({ movimientos: MOVIMIENTOS_SIM.filter((m) => !o || m.origen === o) }) })
luffySimulado.post('/cartera/movimientos', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { fecha?: string; usdt?: number; tipo?: string; nota?: string; origen?: string }
  if (!b.fecha || !(Number(b.usdt) > 0) || (b.tipo !== 'aporte' && b.tipo !== 'retiro')) return c.json({ detail: { codigo: 'movimiento_invalido', texto: 'hacen falta fecha, usdt > 0 y tipo aporte o retiro' } }, 422)
  const m = { id: movId++, fecha: b.fecha, usdt: Number(b.usdt), tipo: b.tipo as 'aporte' | 'retiro', nota: b.nota ?? null, origen: b.origen === 'caja' ? 'caja' : 'pablo' }
  MOVIMIENTOS_SIM.push(m); return c.json(m)
})
luffySimulado.delete('/cartera/movimientos/:id', (c) => { const i = MOVIMIENTOS_SIM.findIndex((m) => m.id === Number(c.req.param('id'))); if (i < 0) return c.json({ detail: 'movimiento no existe' }, 404); MOVIMIENTOS_SIM.splice(i, 1); return c.json({ ok: true }) })
luffySimulado.post('/posiciones/declarar', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { activo?: string; cantidad?: number; precio_medio?: number; fecha?: string; mandato?: string; tesis?: string; invalidacion?: string }
  if (!b.activo || !(Number(b.cantidad) > 0) || !(Number(b.precio_medio) > 0)) return c.json({ detail: { codigo: 'declaracion_invalida', texto: 'hacen falta activo, cantidad y precio medio' } }, 422)
  const sym = b.activo.toUpperCase().replace(/-USDT$/, '')
  const p = propuestaPanel({ accion: 'declarar', par: `${sym}-USDT`, lado: 'compra', tipo: 'declaracion', mandato: b.mandato ?? 'hold', cantidad_usdt: redondeo(Number(b.cantidad) * Number(b.precio_medio), 2), precio: Number(b.precio_medio), detalle: { declaracion: b } },
    `DECLARACIÓN PROPUESTA #ID\n${sym} · ${b.cantidad} a ${b.precio_medio} desde ${b.fecha ?? 'hoy'} · mandato ${b.mandato ?? 'hold'}\nNo envía nada al exchange: registra la tenencia como posición con un fill declarado.`, sym)
  return c.json(p)
})
luffySimulado.get('/exchange/ordenes', (c) => {
  const estado = c.req.query('estado') === 'historial' ? 'historial' : 'abiertas'
  const ordenes = estado === 'abiertas' ? ORDENES_SIM.filter((o) => o.estado === 'NEW') : FILLS_SIM.map((f) => ({ id: f.orden_id, par: f.par, lado: f.lado, tipo: 'LIMIT', estado: 'FILLED', precio: f.precio, precio_stop: null, cantidad: f.cantidad, ejecutada: f.cantidad, total_usdt: f.total_usdt, precio_promedio: f.precio, comision: f.comision, hora: f.hora, client_id: null, propuesta: f.propuesta ? { ...f.propuesta, accion: f.lado === 'compra' ? 'entrada' : 'cerrar', rol: 'orden' as const } : null }))
  const par = c.req.query('par')
  return c.json({ estado, ordenes: ordenes.filter((o) => !par || o.par.startsWith(par.toUpperCase())), consultado_en: ahora(), fuente: 'bingx' })
})
luffySimulado.get('/exchange/fills', (c) => { const par = c.req.query('par'); const lim = Number(c.req.query('limite') ?? 100) || 100; const fs = FILLS_SIM.filter((f) => !par || f.par.startsWith(par.toUpperCase())).sort((a, b) => b.hora.localeCompare(a.hora)); return c.json({ par: par ?? null, pares: [...new Set(fs.map((f) => f.par))], fills: fs.slice(0, lim), no_disponibles: [], consultado_en: ahora(), fuente: 'bingx:myTrades', vitrina: vitrina(30) }) })
luffySimulado.get('/exchange/comisiones', (c) => {
  const desde = c.req.query('desde') ?? diaAtras(30), hasta = c.req.query('hasta') ?? diaAtras(0), origen = c.req.query('origen') ?? 'pablo'
  const fs = FILLS_SIM.filter((f) => f.propuesta?.origen === origen && f.hora.slice(0, 10) >= desde && f.hora.slice(0, 10) <= hasta)
  const por = new Map<string, { activo: string; comision_usdt: number; n_fills: number; volumen_usdt: number }>()
  for (const f of fs) { const a = f.par.split('-')[0]; const x = por.get(a) ?? { activo: a, comision_usdt: 0, n_fills: 0, volumen_usdt: 0 }; x.comision_usdt = redondeo(x.comision_usdt + f.comision, 4); x.n_fills++; x.volumen_usdt = redondeo(x.volumen_usdt + f.total_usdt, 2); por.set(a, x) }
  return c.json({ periodo: { desde, hasta }, origen, total_usdt: redondeo(fs.reduce((a, f) => a + f.comision, 0), 4), n_fills: fs.length, por_activo: [...por.values()], tasas: [...new Set(fs.map((f) => f.par))].map((par) => ({ par, maker_pct: 0.1, taker_pct: 0.1 })), consultado_en: ahora(), fuente: 'posiciones.fills (comision_usdt) + bingx:commissionRate' })
})
luffySimulado.post('/exchange/propuestas', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const accion = String(b.accion ?? '')
  const par = String(b.par ?? ORDENES_SIM.find((o) => o.id === b.orden_id)?.par ?? '').toUpperCase()
  const sym = par.split('-')[0]
  const err = (t: string) => c.json({ detail: { codigo: 'propuesta_invalida', texto: t, errores: [] } }, 422)
  if (!['entrada', 'cerrar', 'mover_stop', 'cancelar', 'modificar', 'cambio_mandato'].includes(accion)) return err('acción desconocida')
  if (accion !== 'cancelar' && accion !== 'modificar' && !ACTIVOS[sym]) return err('par desconocido')
  const viva = [...PROPUESTAS.values()].find((p) => p.par === par && p.estado === 'propuesta' && Date.parse(p.expira as string) > Date.now() && (p.detalle as { origen_propuesta?: string })?.origen_propuesta === 'panel')
  if (viva && accion !== 'cancelar') return c.json({ detail: { codigo: 'propuesta_viva', texto: `ya hay una propuesta viva para ${par}: #${viva.id_corto}`, propuesta: viva } }, 409)
  let props: Record<string, unknown>[] = []
  if (accion === 'entrada') {
    if ((b.mandato === 'swing' || b.mandato === 'trade') && !(Number(b.stop) > 0)) return err('el stop es obligatorio en swing y trade')
    props = [propuestaPanel({ accion, par, lado: 'compra', tipo: String(b.tipo ?? 'market'), mandato: b.mandato, cantidad_usdt: Number(b.cantidad_usdt), precio: Number(b.precio) || null, stop: Number(b.stop) || null }, `ORDEN PROPUESTA #ID\n${par} · compra ${b.cantidad_usdt} USDT · ${b.tipo}${b.precio ? ` a ${b.precio}` : ''}${b.stop ? ` · stop ${b.stop}` : ''}\nmandato ${b.mandato} · ${b.tesis ?? ''}`, sym)]
  } else if (accion === 'cerrar') props = [propuestaPanel({ accion, par, lado: 'venta', tipo: String(b.tipo ?? 'market'), precio: Number(b.precio) || null }, `CERRAR #ID\n${par} · ${b.pct_posicion} % de la posición · ${b.tipo}${b.precio ? ` a ${b.precio}` : ''}\n${b.razon ?? ''}`, sym)]
  else if (accion === 'mover_stop') {
    const vigente = [...CARTERA_SIM.pablo.posiciones, ...CARTERA_SIM.caja.posiciones].find((p) => p.activo === sym)?.stop?.precio ?? null
    const afloja = !!b.afloja || (vigente !== null && Number(b.stop) < vigente)
    props = [propuestaPanel({ accion, par, lado: 'venta', tipo: 'stop', stop: Number(b.stop) }, `MOVER STOP #ID\n${par} · stop ${vigente ?? '—'} → ${b.stop}\n${afloja ? 'AFLOJA STOP: queda más lejos del precio que el vigente' : 'sube el stop: asegura parte del resultado'}\n${b.razon ?? ''}`, sym)]
  } else if (accion === 'cancelar') {
    const o = ORDENES_SIM.find((x) => x.id === b.orden_id); if (!o && !b.id_corto) return err('hace falta orden_id o id_corto')
    props = [propuestaPanel({ accion, par: o?.par ?? par, tipo: 'cancelar' }, `CANCELAR ORDEN #ID\norden ${b.orden_id ?? b.id_corto} · ${o?.par ?? par}\n${b.razon ?? ''}`, (o?.par ?? par).split('-')[0] || 'BTC')]
  } else if (accion === 'modificar') {
    const o = ORDENES_SIM.find((x) => x.id === b.orden_id); if (!o) return err('orden no existe')
    const s0 = o.par.split('-')[0]
    const p1 = propuestaPanel({ accion: 'cancelar', par: o.par, tipo: 'cancelar' }, `CANCELAR ORDEN #ID (1 de 2)\norden ${o.id} · ${o.par}`, s0)
    const p2 = propuestaPanel({ accion: 'entrada', par: o.par, lado: o.lado, tipo: 'limit', precio: Number(b.precio) || o.precio, detalle: { reemplaza_a: o.id } }, `ORDEN NUEVA #ID (2 de 2)\n${o.par} · ${o.lado} ${b.cantidad ?? o.cantidad} a ${b.precio ?? o.precio}\nreemplaza a ${o.id}`, s0)
    props = [p1, p2]
  } else props = [propuestaPanel({ accion, par, tipo: 'cambio_mandato', mandato: b.mandato }, `CAMBIO DE MANDATO #ID\n${par} → ${b.mandato}${b.stop ? ` · stop ${b.stop}` : ''}\n${b.razon ?? ''}`, sym)]
  return c.json({ propuestas: props, propuesta: props[0], hilo_id: props[0].hilo_id })
})

/* ---------- 8.3 radar ---------- */
luffySimulado.get('/radar/candidatas', (c) => {
  const modo = c.req.query('modo') || null, dias = Number(c.req.query('dias') ?? 7) || 7, activo = c.req.query('activo')?.toUpperCase(), desc = c.req.query('incluir_descartadas') === 'true'
  const cs = CANDIDATAS_BASE.filter((x) => (!modo || x.modo === modo) && x.dias <= dias && (!activo || x.activo === activo) && (desc || x.decision !== 'descartar')).map(candidata)
  return c.json({ desde: diaAtras(dias), hasta: diaAtras(0), modo, candidatas: cs, consultado_en: ahora(), fuente: 'candidatas (señales por código + Jev)' })
})
luffySimulado.get('/radar/modos', (c) => c.json({ modos: MODOS_SIM, familias: FAMILIAS, historia_propia: { derivados_horarios: { desde: '2026-10-11T00:00+00:00', n: 363 }, anuncios_listados: { n: 12, desde: '2026-10-09' }, gobernanza: { n: 390, abiertas: 4, fuentes: { snapshot: { ok: true }, tally: { ok: false, motivo: 'sin TALLY_API_KEY (apagado)' } } } }, regimen: { lectura: 'risk_on' }, consultado_en: ahora(), fuente: 'modos + candidatas + historia propia' }))
luffySimulado.post('/modos/:id/:version/decidir', async (c) => {
  const m = MODOS_SIM.find((x) => x.id === c.req.param('id') && x.version === c.req.param('version')); if (!m) return c.json({ detail: 'modo no existe' }, 404)
  if (m.estado !== 'propuesto') return c.json({ detail: { codigo: 'no_propuesto', texto: `el modo está ${m.estado}` } }, 409)
  const b = await c.req.json().catch(() => ({})) as { aprobar?: boolean; motivo?: string }
  m.estado = b.aprobar ? 'activo' : 'retirado'; m.motivo = b.motivo ?? m.motivo
  return c.json({ ok: true, modo: m })
})

/* ---------- 8.4 control ---------- */
luffySimulado.get('/caja', (c) => c.json(caja6(Number(c.req.query('decisiones') ?? 30) || 30)))
luffySimulado.post('/misiones/:id/pausar', (c) => { if (c.req.param('id') !== MISION.id) return c.json({ detail: 'misión no existe' }, 404); MISION.estado = 'pausada'; MISION.motivo_pausa = 'pausada desde el panel'; return c.json({ ok: true, estado: 'pausada', id_corto: MISION.id }) })
luffySimulado.post('/misiones/:id/reanudar', (c) => { if (c.req.param('id') !== MISION.id) return c.json({ detail: 'misión no existe' }, 404); MISION.estado = 'activa'; MISION.motivo_pausa = null; return c.json({ ok: true, estado: 'activa', id_corto: MISION.id }) })
luffySimulado.post('/misiones/:id/cancelar', (c) => { if (c.req.param('id') === MISION.id) MISION.estado = 'cancelada'; return c.json({ ok: true, estado: 'cancelada', id_corto: c.req.param('id') }) })
luffySimulado.post('/panico', (c) => c.json({ ok: true, texto: 'PÁNICO · se cerraron las posiciones de la caja a market (simulado)', eventos: ['WAL vendida a market'] }))
luffySimulado.patch('/gatillos/:id', async (c) => { const id = c.req.param('id'); const g = GATILLOS_SIM.find((x) => String(x.id) === id || x.id_corto === id); if (!g) return c.json({ detail: 'gatillo no existe' }, 404); const b = await c.req.json().catch(() => ({})) as { estado?: string }; if (b.estado === 'pausado' || b.estado === 'activo') { g.estado = b.estado; g.actualizado = minIso(0) } return c.json(g) })
luffySimulado.delete('/gatillos/:id', (c) => { const id = c.req.param('id'); const g = GATILLOS_SIM.find((x) => String(x.id) === id || x.id_corto === id); if (!g) return c.json({ detail: 'gatillo no existe' }, 404); g.estado = 'cancelado'; return c.json({ ok: true }) })
luffySimulado.get('/manual', (c) => c.json({ ...MANUAL_SIM, consultado_en: ahora(), fuente: 'manual_versiones + manual_propuestas' }))
luffySimulado.get('/manual/diff', (c) => { const d = c.req.query('desde') ?? '', h = c.req.query('hasta') ?? ''; return c.json({ desde: d, hasta: h, unificado: DIFFS[`${d}|${h}`] ?? `--- v${d}\n+++ v${h}\n(sin cambios de texto)` }) })
luffySimulado.get('/manual/versiones/:version', (c) => { const v = MANUAL_SIM.versiones.find((x) => x.version === c.req.param('version')); return v ? c.json({ ...v, texto: `# Manual de operación de Luffy v${v.version}\n…` }) : c.json({ detail: 'versión no existe' }, 404) })
luffySimulado.post('/manual/propuestas/:id/decidir', async (c) => {
  const i = MANUAL_SIM.propuestas_pendientes.findIndex((x) => x.id === Number(c.req.param('id'))); if (i < 0) return c.json({ detail: { codigo: 'ya_decidida', texto: 'la propuesta ya se decidió o no existe' } }, 409)
  const b = await c.req.json().catch(() => ({})) as { aprobar?: boolean }
  const p = MANUAL_SIM.propuestas_pendientes.splice(i, 1)[0]
  if (!b.aprobar) return c.json({ ok: true, estado: 'rechazada' })
  for (const v of MANUAL_SIM.versiones) v.vigente = false
  MANUAL_SIM.versiones.unshift({ id: 4, version: '1.3', origen: 'revision', resumen: `${p.seccion}: ${p.texto_nuevo}`, vigente: true, creada: ahora() })
  DIFFS['1.2|1.3'] = `--- v1.2\n+++ v1.3\n@@ ${p.seccion} @@\n+- ${p.texto_nuevo}`
  return c.json({ ok: true, estado: 'aprobada', version: '1.3' })
})
luffySimulado.get('/alertas/feed', (c) => {
  const lim = Number(c.req.query('limite') ?? 50) || 50, antes = Number(c.req.query('antes_de') ?? 0) || 0
  const tipo = c.req.query('tipo'), activo = c.req.query('activo')?.toUpperCase(), sev = c.req.query('severidad')
  const todas = ALERTAS_SIM.filter((a) => (!antes || a.id < antes) && (!tipo || a.tipo === tipo) && (!activo || a.activo === activo) && (!sev || a.severidad === sev))
  const items = todas.slice(0, lim)
  return c.json({ items, siguiente: todas.length > lim ? items[items.length - 1].id : null, tipos: TIPOS_ALERTA, consultado_en: ahora(), fuente: 'alertas' })
})
luffySimulado.patch('/alertas/:id', (c) => { const a = ALERTAS_SIM.find((x) => x.id === Number(c.req.param('id'))); if (!a) return c.json({ detail: 'alerta no existe' }, 404); a.atendida = true; return c.json(a) })

/* ---------- 8.5 oficina ---------- */
luffySimulado.get('/oficina/estado', (c) => c.json({ luffy: { en_curso: [...enCurso.keys()].map((id) => ({ hilo_id: id, titulo: HILOS.get(id)?.titulo ?? '', desde: ahora(), modo: 'chat', canal: 'panel' })), ultimo_turno: hace(12), turnos_24h: 41, costo_24h_usd: 29.8 }, agentes: AGENTES_SIM, fuentes: FUENTES_SIM, trabajos: TRABAJOS_SIM, eventos_ultimo_id: eventoId, consultado_en: ahora(), fuente: 'llamadas_modelo + jev_llamadas + eventos + estado de cada fuente' }))
const eventosStream = (c: { req: { raw: Request; query: (k: string) => string | undefined } }) => {
  const maxS = Number(c.req.query('max_s') ?? 0) || 0
  let i = 0
  const stream = new ReadableStream({
    start(ctl) {
      const enc = new TextEncoder(); const t0 = Date.now()
      const enviar = (e: Record<string, unknown>) => { try { ctl.enqueue(enc.encode(sse(e))) } catch { /* cerrado */ } }
      const tick = () => { if (maxS && Date.now() - t0 > maxS * 1000) { cerrar(); return } enviar({ id: ++eventoId, hora: ahora(), ...GUION_EVENTOS[i++ % GUION_EVENTOS.length] }) }
      const latido = () => enviar({ tipo: 'latido', hora: ahora() })
      tick(); const a = setInterval(tick, 2200 / VELOCIDAD), l = setInterval(latido, 25_000)
      const cerrar = () => { clearInterval(a); clearInterval(l); try { ctl.close() } catch { /* ya */ } }
      c.req.raw.signal.addEventListener('abort', cerrar)
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
}
luffySimulado.get('/eventos', (c) => eventosStream(c))
/* la historia de la oficina (las hojas, los turnos para repetir y el grosor de los hilos): el guion repetido en las últimas 20 h */
const HISTORIA_OFI: Record<string, unknown>[] = (() => {
  const n = 300, t0 = Date.now() - 20 * 3600_000, out: Record<string, unknown>[] = []
  let t = t0, enTurno = false
  for (let k = 0; k < n; k++) {
    const e = GUION_EVENTOS[k % GUION_EVENTOS.length]
    if (e.tipo === 'turno_abierto') enTurno = true
    t += enTurno ? 7_000 : 4 * 60_000
    if (e.tipo === 'turno_cerrado') enTurno = false
    out.push({ id: eventoId - n + k, hora: new Date(t).toISOString().replace(/\.\d{3}Z$/, '+00:00'), ...e })
  }
  return out
})()
luffySimulado.get('/eventos/recientes', (c) => { const desde = Number(c.req.query('desde_id') ?? 0) || 0, limite = Math.min(1000, Number(c.req.query('limite') ?? 200) || 200); const items = HISTORIA_OFI.filter((e) => (e.id as number) > desde).slice(0, limite); return c.json({ items, ultimo_id: items.length ? items[items.length - 1].id : desde, consultado_en: ahora(), fuente: 'eventos' }) })

/* ---------- 8.6 informes ---------- */
luffySimulado.get('/informes', (c) => { const lim = Number(c.req.query('limite') ?? 30) || 30; return c.json({ items: INFORMES_SIM.slice(0, lim), siguiente: null }) })
luffySimulado.get('/informes/:fecha', (c) => {
  const f = c.req.param('fecha'); const inf = INFORMES_SIM.find((x) => x.fecha === f); if (!inf) return c.json({ detail: 'no hay informe de ese día' }, 404)
  const g = guardarSpec({ ...SPEC_BTC, titulo: 'BTC: precio, volumen y funding' }, 'chat', H_MONITOR, null, `inf${f.replace(/-/g, '').slice(-5)}`)
  const texto = `**Cartera.** STONK sin cambios: 146 a 0,1031; los ingresos siguen a la baja.\n\n**Caja.** WAL abierta a 0,03801 con stop 0,0328; plazo de rotación 24–36 h. 16 USDT libres.\n\n**Radar.** CFX y C98 en impulso sin cortos atrapados; STRK con votación en 4 días.\n\n**Mercado.** BTC lleva seis sesiones entre 108 k y 114 k con el funding en cero.`
  return c.json({ ...inf, modelo: 'claude-sonnet-5', texto, secciones: texto.split('\n\n').map((p) => { const m = /^\*\*([^*]+?)\.\*\*\s*(.*)$/s.exec(p); return { titulo: m?.[1] ?? '', texto: m?.[2] ?? p } }), cifras: { capital: { valor_total_usdt: 2205.73 }, pnl: { no_realizado_usdt: 1.99 }, posiciones: [], btc: { precio: 112_340 }, caja: { valor_usdt: 101.12 }, gasto_api: { mes_usd: 30.24 }, candidatas_escaner: [], alertas_recientes: [], agenda_motor: [] }, graficos: [{ spec_id: g.spec_id, titulo: g.titulo, url: g.url }], fuente: 'informes (texto de Sonnet sobre cifras por código: datos.recopilar)' })
})
luffySimulado.get('/revisiones', (c) => c.json({ items: [{ id: 2, desde: '2026-09-27', hasta: '2026-10-11', texto: 'Tres operaciones de la caja: +2,95 STRK, −1,90 KAIA, WAL abierta. Lo que se aprende: las rotaciones rápidas costaron comisiones sin ventaja medida.', datos: {}, costo_usd: 0.42, hilo_id: H_CAJA, creada: '2026-10-11T19:00:00+00:00', propuestas: [{ id: 7, seccion: '4. Caja', estado: MANUAL_SIM.propuestas_pendientes.some((p) => p.id === 7) ? 'pendiente' : 'decidida', motivo: 'rotaciones rápidas' }] }], siguiente: null }))
luffySimulado.get('/bitacora', (c) => { const a = c.req.query('activo')?.toUpperCase(), t = c.req.query('tipo'), o = c.req.query('origen'), antes = c.req.query('antes_de'); const lim = Number(c.req.query('limite') ?? 50) || 50; const todas = BITACORA_SIM.filter((b) => (!a || b.activo === a) && (!t || b.tipo === t) && (!o || b.origen === o) && (!antes || b.fecha < antes.replace(' ', '+'))); const items = todas.slice(0, lim); return c.json({ items, siguiente: todas.length > lim ? items[items.length - 1].fecha : null, tipos: ['entrada', 'salida', 'observacion', 'ajuste_stop', 'rechazo'] }) })
luffySimulado.get('/teorias', (c) => { const e = c.req.query('estado'), a = c.req.query('activo')?.toUpperCase(); return c.json({ items: TEORIAS_SIM.filter((t) => (!e || t.estado === e) && (!a || t.activos.includes(a))), siguiente: null }) })
