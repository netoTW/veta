/* ============================================================================
   Simulador de mugiwara-api con la forma exacta de CONTRATO-PANEL.md v1.1.

   Para desarrollar sin túnel, para las capturas y para los invariantes. Nada
   de aquí es real: las series salen de un generador con semilla fija, así cada
   corrida pinta lo mismo. Implementa lo que el panel usa: hilos, chat por SSE
   (inicio · paso · texto · grafico · propuesta · fin), propuestas, gráficos
   (datos, spec, catálogo), tableros, historial de posiciones y costo.
   ========================================================================== */
import { Hono } from 'hono'

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
      else if (tipo === 'gatillos') { formato = 'niveles'; fuente = 'gatillos'; const gs = GATILLOS_SIM.filter((g) => g.activo === act && g.estado === 'activo' && g.precio !== null); if (gs.length) for (const g of gs) niveles.push({ panel: p.id, serie: se.id, tipo: 'gatillo', precio: g.precio, etiqueta: `Gatillo #${g.id}: ${g.texto}`, direccion: g.direccion, fuente: 'gatillos' }); else { no_disponibles.push({ serie: se.id!, tipo, motivo: `no hay gatillos con precio sobre ${act}` }); continue } }
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
  if (p.accion === 'declarar') {
    p.estado = 'llena'
    const d = (p.detalle as { declaracion?: { activo?: string; cantidad?: number; precio_medio?: number; mandato?: string; fecha?: string } }).declaracion ?? {}
    const sym = String(d.activo ?? '').toUpperCase()
    const ya = CARTERA_SIM.pablo.posiciones.find((x) => x.activo === sym)
    if (ya) Object.assign(ya, { cantidad: Number(d.cantidad), precio_medio: Number(d.precio_medio), mandato: d.mandato ?? ya.mandato, declarada: true, estado: 'abierta' })
    else CARTERA_SIM.pablo.posiciones.unshift({ activo: sym, mandato: d.mandato ?? 'hold', cantidad: Number(d.cantidad), precio_medio: Number(d.precio_medio), costo_usdt: redondeo(Number(d.cantidad) * Number(d.precio_medio), 2), pnl_realizado_usdt: 0, stop_precio: null, abierta_en: d.fecha ? `${d.fecha}T00:00:00+00:00` : ahora(), declarada: true, estado: 'abierta' })
    const texto = `DECLARADA #${p.id_corto} · ${sym} · ${d.cantidad} a ${String(d.precio_medio).replace('.', ',')} · mandato ${d.mandato ?? 'hold'}`
    const h = HILOS.get(p.hilo_id as string); if (h) { h.mensajes.push({ id: ++mensajeId, rol: 'ejecucion', contenido: texto, ts: ahora(), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] }); h.actualizado = ahora() }
    return c.json({ ok: true, texto, estado: 'llena', fills: [], stop: null, alertas: [], eventos: ['posición declarada'], reconciliacion: { discrepancias: [], alertas: [], error: null } })
  }
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
luffySimulado.get('/costo', (c) => { const r = azar(42); const dias = Array.from({ length: 12 }, (_, i) => ({ fecha: new Date(Date.now() - (11 - i) * 86_400_000).toISOString().slice(0, 10), luffy_usd: redondeo(1.2 + r() * 2.6, 2), jev_usd: redondeo(0.3 + r() * 0.9, 2) })); return c.json({ desde: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), costo_usd: 27.41, total_usd: 33.98, tokens_entrada: 165_735, tokens_salida: 87_282, tokens_cache_lectura: 5_514_994, tokens_cache_escritura: 1_025_446, respuestas: 96, por_modelo: [{ modelo: 'claude-fable-5-1', costo_usd: 26.9, n: 80 }, { modelo: 'claude-sonnet-5', costo_usd: 0.51, n: 16 }], luffy: { total_usd: 27.41, por_tipo_turno: [{ tipo: 'discusion', usd: 9.8, n: 41 }, { tipo: 'dato_grafico', usd: 8.1, n: 22 }, { tipo: 'orden', usd: 4.2, n: 9 }, { tipo: 'monitor', usd: 3.9, n: 18 }, { tipo: 'caja', usd: 1.41, n: 6 }] }, jev: { total_usd: 6.57, por_modelo: [{ modelo: 'jev', usd: 2.78, n: 12_521 }, { modelo: 'claude-haiku-5-5', usd: 2.1, n: 611 }, { modelo: 'claude-sonnet-5', usd: 1.69, n: 44 }] }, por_dia: dias, presupuesto: { presupuesto_api_usd: 140, aviso_usd: 100, degradar_usd: 125 } }) })
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
luffySimulado.get('/gatillos', (c) => c.json(GATILLOS_SIM.filter((g) => g.estado !== 'borrado')))
luffySimulado.get('/alertas', (c) => {
  if (!c.req.query('pagina')) return c.json(ALERTAS_SIM.slice(0, Number(c.req.query('limite') ?? 20) || 20))
  const pagina = Math.max(1, Number(c.req.query('pagina')) || 1), por = Math.max(1, Number(c.req.query('por_pagina') ?? 25) || 25); const sev = c.req.query('severidad'), tipo = c.req.query('tipo')
  const todas = ALERTAS_SIM.filter((a) => (!sev || a.severidad === sev) && (!tipo || a.tipo === tipo))
  return c.json({ alertas: todas.slice((pagina - 1) * por, pagina * por), total: todas.length, pagina, por_pagina: por })
})
luffySimulado.notFound((c) => c.json({ detail: 'no existe' }, 404))

/* ============================================================================
   Fase 6b (simulado): terminal, cartera, exchange, caja, radar, control,
   oficina e informes, con la forma de src/luffy/tipos6b.ts (supuesta hasta
   CONTRATO-PANEL.md v2). Mismas semillas: cada corrida pinta lo mismo.
   ========================================================================== */
Object.assign(ACTIVOS, {
  WAL: { nombre: 'Walrus', precio: 0.0375, deriva: 0.002, vol: 0.045, decimales: 4, perp: true, volumen_24h_usdt: 15_840_000 },
  STRK: { nombre: 'Starknet', precio: 0.104, deriva: -0.001, vol: 0.05, decimales: 4, defillama: { slug: 'starknet', categoria: 'Chain' }, perp: true, volumen_24h_usdt: 42_000_000 },
  KAIA: { nombre: 'Kaia', precio: 0.0498, deriva: -0.0015, vol: 0.04, decimales: 4, perp: true, volumen_24h_usdt: 9_300_000 },
  CFX: { nombre: 'Conflux', precio: 0.0612, deriva: 0.003, vol: 0.06, decimales: 4, perp: true, volumen_24h_usdt: 31_000_000 },
  C98: { nombre: 'Coin98', precio: 0.0412, deriva: 0.0025, vol: 0.055, decimales: 4, defillama: { slug: 'coin98', categoria: 'Dexs' }, perp: true, volumen_24h_usdt: 6_100_000 },
  CYBER: { nombre: 'Cyber', precio: 1.42, deriva: 0.002, vol: 0.05, decimales: 3, perp: true, volumen_24h_usdt: 8_700_000 },
  OGN: { nombre: 'Origin', precio: 0.0591, deriva: 0.001, vol: 0.05, decimales: 4, perp: true, volumen_24h_usdt: 4_200_000 },
})
const pct = (a: number, b: number) => (b ? redondeo(((a / b) - 1) * 100, 2) : null)
const cambio = (sym: string, dias: number) => { const v = cierres(velas(sym, dias + 1, DIA)); return v.length > dias ? pct(v[v.length - 1][1], v[v.length - 1 - dias][1]) : null }
const vsBtc = (sym: string, dias: number) => { const a = cambio(sym, dias), b = cambio('BTC', dias); return a === null || b === null ? null : redondeo(a - b, 2) }
const MODOS_SIM = [
  { id: 'impulso', version: '1', nombre: 'Impulso', descripcion: 'Volumen que se multiplica con precio que acompaña y sin granjas detrás.', estado: 'activo' as 'activo' | 'propuesto' | 'retirado', receta: ['volumen 24 h ≥ 3× su media de 30 d', 'cambio 24 h entre +8 % y +40 %', 'menciones humanas ≥ 2× su media', 'granjas < 20 % de las menciones'], estudio: { n: 369, acierto_pct: 49.1, retorno_mediano_pct: 0.4, horizonte_d: 7 }, track: { n: 14, acierto_pct: 42.9, retorno_mediano_pct: -1.1 }, creado: '2026-10-09T10:00:00+00:00' },
  { id: 'squeeze', version: '2', nombre: 'Squeeze cargado', descripcion: 'Cortos atrapados: OI alto, funding negativo y precio que no cae.', estado: 'activo' as 'activo' | 'propuesto' | 'retirado', receta: ['OI / volumen ≥ 0,6', 'funding ≤ −0,01 %', 'precio por encima de su media de 7 d', 'liquidaciones de cortos arriba ≥ 3× las de largos abajo'], estudio: { n: 212, acierto_pct: 58.0, retorno_mediano_pct: 3.2, horizonte_d: 7 }, track: { n: 6, acierto_pct: 66.7, retorno_mediano_pct: 4.1 }, creado: '2026-10-10T18:00:00+00:00' },
  { id: 'pre_catalizador', version: '1', nombre: 'Pre-catalizador', descripcion: 'Votación, listado o desbloqueo fechado en los próximos 7 días con atención creciente.', estado: 'activo' as 'activo' | 'propuesto' | 'retirado', receta: ['catalizador fechado en ≤ 7 d', 'menciones humanas creciendo 3 días seguidos', 'sin desbloqueo > 2 % del circulante en 30 d'], estudio: { n: 88, acierto_pct: 54.5, retorno_mediano_pct: 2.1, horizonte_d: 7 }, track: { n: 3, acierto_pct: 33.3, retorno_mediano_pct: -0.8 }, creado: '2026-10-11T09:00:00+00:00' },
  { id: 'ingresos_vs_precio', version: '1', nombre: 'Ingresos contra precio', descripcion: 'Los ingresos del protocolo suben y el precio todavía no.', estado: 'propuesto' as 'activo' | 'propuesto' | 'retirado', receta: ['ingresos 7 d ≥ 1,5× ingresos 7 d anteriores', 'precio 7 d ≤ +5 %', 'TVL estable o creciendo'], estudio: { n: 140, acierto_pct: 56.4, retorno_mediano_pct: 2.7, horizonte_d: 14 }, track: null, creado: '2026-10-12T01:00:00+00:00' },
]
const CANDIDATAS_SIM = [
  { activo: 'WAL', modo: 'squeeze', version: '2', dias: 1, etiquetas: ['squeeze cargado', 'pulso sano'], jev: { juicio: 'conversación orgánica, sin shill', confianza: 0.82 } },
  { activo: 'CFX', modo: 'impulso', version: '1', dias: 1, etiquetas: ['impulso', 'sin cortos atrapados'], jev: { juicio: 'ruido de bots informativos, pocas personas', confianza: 0.61 } },
  { activo: 'C98', modo: 'impulso', version: '1', dias: 2, etiquetas: ['impulso', 'confluencia floja'], jev: { juicio: 'shill coordinado parcial', confianza: 0.55 } },
  { activo: 'CYBER', modo: 'impulso', version: '1', dias: 2, etiquetas: ['impulso'], jev: null },
  { activo: 'STRK', modo: 'pre_catalizador', version: '1', dias: 5, etiquetas: ['votación en 4 d', 'pump reciente'], jev: { juicio: 'anuncio real de gobernanza', confianza: 0.9 } },
  { activo: 'KAIA', modo: 'impulso', version: '1', dias: 9, etiquetas: ['impulso', 'granjas'], jev: { juicio: 'shill coordinado', confianza: 0.88 } },
  { activo: 'OGN', modo: 'squeeze', version: '2', dias: 12, etiquetas: ['squeeze ignición'], jev: { juicio: 'orgánico', confianza: 0.7 } },
  { activo: 'STONK', modo: 'ingresos_vs_precio', version: '1', dias: 30, etiquetas: ['ingresos cayendo'], jev: { juicio: 'personas reales, tono negativo', confianza: 0.76 } },
]
const GATILLOS_SIM: { id: number; activo: string | null; texto: string; estado: 'activo' | 'pausado' | 'disparado' | 'borrado'; precio: number | null; direccion: string | null; ultimo_disparo: string | null; cada_min: number | null; creado: string; hilo_id: string | null }[] = [
  { id: 7, activo: 'STONK', texto: 'si STONK toca 0,15, vender la mitad', estado: 'activo', precio: 0.15, direccion: 'sube', ultimo_disparo: null, cada_min: 5, creado: hace(60 * 24 * 3), hilo_id: H_STONK },
  { id: 9, activo: 'WAL', texto: 'si WAL cierra una hora sobre 0,0389 con volumen, subir el stop a 0,038', estado: 'activo', precio: 0.0389, direccion: 'sube', ultimo_disparo: null, cada_min: 1, creado: hace(60 * 5), hilo_id: H_CAJA },
  { id: 10, activo: 'WAL', texto: 'si las granjas superan el 30 % de las menciones de WAL, avisar', estado: 'activo', precio: null, direccion: null, ultimo_disparo: hace(60 * 2), cada_min: 15, creado: hace(60 * 5), hilo_id: H_CAJA },
  { id: 4, activo: 'SOL', texto: 'si SOL vuelve a 193, avisar para entrar 40 USDT', estado: 'pausado', precio: 193, direccion: 'baja', ultimo_disparo: hace(60 * 30), cada_min: 5, creado: hace(60 * 24 * 2), hilo_id: H_MONITOR },
  { id: 2, activo: 'BTC', texto: 'si BTC pierde 108 k, avisar y revisar stops', estado: 'disparado', precio: 108_000, direccion: 'baja', ultimo_disparo: hace(60 * 24 * 6), cada_min: 5, creado: hace(60 * 24 * 9), hilo_id: H_MONITOR },
]
const CARTERA_SIM = {
  pablo: { efectivo_usdt: 2_188.69, simulado: false, posiciones: [
    { activo: 'STONK', mandato: 'swing', cantidad: 146, precio_medio: 0.1031, costo_usdt: 15.05, pnl_realizado_usdt: 0.98, stop_precio: 0.104, abierta_en: hace(60 * 24 * 3), declarada: true, estado: 'abierta' },
    { activo: 'SOL', mandato: 'trade', cantidad: 0, precio_medio: 101.11, costo_usdt: 0, pnl_realizado_usdt: -0.0596, stop_precio: null, abierta_en: '2026-10-10T08:54:51+00:00', declarada: false, estado: 'cerrada' },
  ] },
  caja: { efectivo_usdt: 16.4, simulado: false, posiciones: [
    { activo: 'WAL', mandato: 'trade', cantidad: 2228.739, precio_medio: 0.03797, costo_usdt: 84.63, pnl_realizado_usdt: 0, stop_precio: 0.0328, abierta_en: hace(60 * 6), declarada: false, estado: 'abierta' },
    { activo: 'STRK', mandato: 'trade', cantidad: 0, precio_medio: 0.0854, costo_usdt: 0, pnl_realizado_usdt: 2.95, stop_precio: null, abierta_en: hace(60 * 24 * 1.5), declarada: false, estado: 'cerrada' },
    { activo: 'KAIA', mandato: 'trade', cantidad: 0, precio_medio: 0.0525, costo_usdt: 0, pnl_realizado_usdt: -1.9, stop_precio: null, abierta_en: hace(60 * 24 * 1.2), declarada: false, estado: 'cerrada' },
  ] },
}
function cartera(origen: string) {
  const c = origen === 'caja' ? CARTERA_SIM.caja : CARTERA_SIM.pablo
  const posiciones = c.posiciones.map((p) => {
    const precio = ACTIVOS[p.activo]?.precio ?? null
    const valor = precio !== null ? redondeo(p.cantidad * precio, 2) : null
    const pnl = precio !== null ? redondeo((precio - p.precio_medio) * p.cantidad, 2) : null
    return { ...p, par: `${p.activo}-USDT`, precio_actual: precio, valor_usdt: valor, pnl_no_realizado_usdt: pnl, pnl_no_realizado_pct: precio !== null && p.cantidad ? pct(precio, p.precio_medio) : null, stop_distancia_pct: precio !== null && p.stop_precio ? pct(p.stop_precio, precio) : null, peso_pct: null as number | null, simulado: c.simulado }
  })
  const valorPos = posiciones.reduce((a, p) => a + (p.valor_usdt ?? 0), 0)
  const total = redondeo(c.efectivo_usdt + valorPos, 2)
  for (const p of posiciones) p.peso_pct = total ? redondeo(((p.valor_usdt ?? 0) / total) * 100, 1) : null
  return { origen, simulado: c.simulado, efectivo_usdt: c.efectivo_usdt, valor_total_usdt: total, exposicion_pct: total ? redondeo((valorPos / total) * 100, 1) : 0, posiciones, exposicion: posiciones.filter((p) => p.valor_usdt).map((p) => ({ activo: p.activo, pct: p.peso_pct ?? 0 })), pnl_realizado_total_usdt: redondeo(posiciones.reduce((a, p) => a + p.pnl_realizado_usdt, 0), 2), consultado_en: ahora(), fuente: 'posiciones + bingx' }
}
function curvaCapital(origen: string, rango: string) {
  const { dias, desde } = diasDe(rango)
  const base = origen === 'caja' ? 101 : 2300
  const r = azar(origen === 'caja' ? 77 : 33)
  const puntos: { t: number; capital: number; aportes: number; drawdown_pct: number }[] = []
  let cap = base, pico = base
  for (let i = 0; i < dias; i++) {
    const t = desde + i * DIA
    cap = redondeo(cap * (1 + (r() - 0.49) * (origen === 'caja' ? 0.03 : 0.006)), 2)
    if (origen === 'caja' && i < dias - 2) cap = base
    pico = Math.max(pico, cap)
    puntos.push({ t, capital: cap, aportes: base, drawdown_pct: redondeo(((cap / pico) - 1) * 100, 2) })
  }
  return { origen, rango, puntos, max_drawdown_pct: redondeo(Math.min(...puntos.map((p) => p.drawdown_pct)), 2), rendimiento_pct: pct(puntos[puntos.length - 1].capital, base), consultado_en: ahora() }
}
const ORDENES_SIM = [
  { id: '2109380965351456769', par: 'WAL-USDT', lado: 'venta', tipo: 'stop_market', precio: null, cantidad: 2228.739, llena: 0, estado: 'abierta', creada: hace(60 * 6), es_stop: true, stop_precio: 0.0328 },
  { id: '2109380965351456770', par: 'STONK-USDT', lado: 'venta', tipo: 'stop_market', precio: null, cantidad: 146, llena: 0, estado: 'abierta', creada: hace(60 * 24 * 2), es_stop: true, stop_precio: 0.104 },
  { id: '2109380965351456771', par: 'SOL-USDT', lado: 'compra', tipo: 'limit', precio: 193.4, cantidad: 0.2068, llena: 0, estado: 'abierta', creada: hace(60 * 4), es_stop: false, stop_precio: null },
]
const CAJA_DECISIONES = [
  { ciclo: 14, hora: hace(60 * 2), accion: 'esperar', activo: 'WAL', porque: 'WAL sigue plana sobre la entrada; el radar no trajo candidatas nuevas. 16 USDT en espera.' },
  { ciclo: 13, hora: hace(60 * 4), accion: 'esperar', activo: 'WAL', porque: 'Sin ruptura de 0,0386–0,0389 ni caída a 0,034. Candidatas idénticas a hace dos horas.' },
  { ciclo: 12, hora: hace(60 * 6), accion: 'entrar', activo: 'WAL', porque: 'Squeeze cargado: OI/volumen 0,71, funding −0,018 %, pulso sano. 85 USDT a 0,03797, stop 0,0328.' },
  { ciclo: 11, hora: hace(60 * 8), accion: 'salir', activo: 'STRK', porque: 'Objetivo +18 % tocado antes de la votación; se cobra. +2,95 USDT.' },
  { ciclo: 9, hora: hace(60 * 20), accion: 'mover_stop', activo: 'STRK', porque: 'Stop subido a 0,0985 tras +12 %: asegura +1 USDT.' },
  { ciclo: 6, hora: hace(60 * 29), accion: 'salir', activo: 'KAIA', porque: 'El stop en 0,0525 saltó en el exchange. −1,90 USDT.' },
]
const FUENTES_SIM = [
  { id: 'bingx', nombre: 'BingX', salud: 'al_dia' as const, ultima_lectura: hace(1) },
  { id: 'binance', nombre: 'Binance futuros', salud: 'al_dia' as const, ultima_lectura: hace(3) },
  { id: 'defillama', nombre: 'DefiLlama', salud: 'atrasada' as const, ultima_lectura: hace(95), detalle: 'la última lectura tardó 41 s; reintenta cada 30 min' },
  { id: 'coinalyze', nombre: 'Coinalyze', salud: 'al_dia' as const, ultima_lectura: hace(12) },
  { id: 'x', nombre: 'X (crawler)', salud: 'al_dia' as const, ultima_lectura: hace(2) },
  { id: 'telegram', nombre: 'Telegram', salud: 'al_dia' as const, ultima_lectura: hace(0) },
  { id: 'snapshot', nombre: 'Snapshot', salud: 'al_dia' as const, ultima_lectura: hace(44) },
  { id: 'tally', nombre: 'Tally', salud: 'caida' as const, ultima_lectura: null, detalle: 'sin TALLY_API_KEY: apagado' },
  { id: 'motor', nombre: 'Motor VETA', salud: 'al_dia' as const, ultima_lectura: hace(31) },
]
const AGENTES_SIM = [
  { id: 'cuant_riesgo', nombre: 'Cuant de riesgo', estado: 'ocioso' as const, ultima_actividad: 'p_toque del stop de WAL a 7 d: 31 %', hora: hace(6 * 60) },
  { id: 'cuant_micro', nombre: 'Cuant de microestructura', estado: 'ocioso' as const, ultima_actividad: 'libro de WAL: 1,1 M USD de largos liquidables abajo', hora: hace(6 * 60) },
  { id: 'investigador', nombre: 'Investigador', estado: 'ocioso' as const, ultima_actividad: 'votación de STRK: buyback del 2 % del tesoro', hora: hace(3 * 60) },
  { id: 'estratega', nombre: 'Estratega', estado: 'ocioso' as const, ultima_actividad: 'revisión quincenal de la caja', hora: hace(60 * 24) },
  { id: 'jev', nombre: 'Jev (clasificador)', estado: 'trabajando' as const, ultima_actividad: 'clasificando 212 posts de X', hora: hace(0) },
]
const MANUAL_SIM = { version_vigente: '1.7', versiones: [
  { version: '1.7', fecha: '2026-10-11T19:20:00+00:00', resumen: 'Gatillos con ritmo propio de lectura; tope de lecturas por hora.' },
  { version: '1.6', fecha: '2026-10-10T21:00:00+00:00', resumen: 'La caja en real: límites de la misión y pánico.' },
  { version: '1.5', fecha: '2026-10-10T14:00:00+00:00', resumen: 'Mandatos hold / swing / trade y cómo se mide cada uno.' },
], propuestas: [
  { id: 'mp-21', fecha: hace(60 * 7), resumen: 'Regla nueva: no rotar una posición de la caja antes de 24 h salvo stop.', diff: '@@ §4 Caja @@\n+ Una posición de la caja no se rota antes de 24 h salvo que salte el stop\n+ o la misión cambie. Rotar por una candidata nueva exige ventaja medida.', estado: 'pendiente' as 'pendiente' | 'aprobada' | 'rechazada', hilo_id: H_CAJA },
  { id: 'mp-20', fecha: hace(60 * 24 * 2), resumen: 'Frescura: precio ≤ 5 min para cualquier orden.', diff: '@@ §2.1 @@\n- precio y libro 10 min para decidir\n+ precio y libro 5 min para decidir', estado: 'aprobada' as 'pendiente' | 'aprobada' | 'rechazada', hilo_id: H_MONITOR },
] }
const ALERTAS_SIM = Array.from({ length: 37 }, (_, i) => { const r = azar(900 + i); const sev = (['alta', 'media', 'baja', 'baja', 'media'] as const)[i % 5]; const tipos = ['precio', 'granjas', 'fuente', 'stop', 'gatillo', 'presupuesto']; const activos = ['WAL', 'STONK', 'SOL', null, 'BTC', 'STRK']; const tipo = tipos[Math.floor(r() * tipos.length)]; const activo = activos[Math.floor(r() * activos.length)]; return { id: 400 - i, hora: hace(14 * i + 3), severidad: sev, tipo, activo, texto: tipo === 'precio' ? `${activo ?? 'BTC'} se movió ${(2 + r() * 6).toFixed(1).replace('.', ',')} % en una hora` : tipo === 'granjas' ? `${activo ?? 'WAL'}: granjas al ${Math.round(20 + r() * 30)} % de las menciones` : tipo === 'fuente' ? 'DefiLlama tardó 41 s en responder' : tipo === 'stop' ? `stop de ${activo ?? 'KAIA'} a ${(1 + r() * 4).toFixed(1).replace('.', ',')} % del precio` : tipo === 'gatillo' ? `gatillo #${7 + (i % 3)} leyó X: nada nuevo` : `gasto del mes al ${Math.round(50 + r() * 30)} % del presupuesto` } })
const diaAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

/* ---------- terminal ---------- */
function filaUniverso(sym: string) {
  const a = ACTIVOS[sym]
  const cands = CANDIDATAS_SIM.filter((c) => c.activo === sym && c.dias <= 3)
  const pos = [...CARTERA_SIM.pablo.posiciones.map((p) => ({ ...p, origen: 'pablo' })), ...CARTERA_SIM.caja.posiciones.map((p) => ({ ...p, origen: 'caja' }))].find((p) => p.activo === sym && p.estado === 'abierta')
  const gat = GATILLOS_SIM.filter((g) => g.activo === sym && g.estado === 'activo').length
  const cat = sym === 'STRK' ? { fecha: diaAtras(-4), etiqueta: 'Votación: buyback del 2 % del tesoro' } : sym === 'STONK' ? { fecha: diaAtras(-9), etiqueta: 'Desbloqueo del equipo (1,8 % del circulante)' } : null
  return { simbolo: sym, par: `${sym}-USDT`, nombre: a.nombre, precio: a.precio, cambio_24h_pct: cambio(sym, 1), vs_btc_7d_pct: vsBtc(sym, 7), vs_btc_30d_pct: vsBtc(sym, 30), modos: [...new Set(cands.map((c) => c.modo))], squeeze: sym === 'WAL' ? 'cargado' as const : sym === 'OGN' ? 'ignicion' as const : null, posicion: pos ? { origen: pos.origen, estado: pos.estado } : null, gatillos: gat, catalizador: cat, en_vigilancia: ['STONK', 'WAL', 'SOL', 'STRK'].includes(sym), candidata: cands.length > 0, volumen_24h_usdt: a.volumen_24h_usdt }
}
luffySimulado.get('/terminal/universo', (c) => {
  const filtro = c.req.query('filtro') ?? 'todo', q = (c.req.query('q') ?? '').trim().toUpperCase()
  let filas = Object.keys(ACTIVOS).map(filaUniverso)
  if (filtro === 'mis_posiciones') filas = filas.filter((f) => f.posicion?.origen === 'pablo')
  else if (filtro === 'caja') filas = filas.filter((f) => f.posicion?.origen === 'caja' || CARTERA_SIM.caja.posiciones.some((p) => p.activo === f.simbolo))
  else if (filtro === 'candidatas') filas = filas.filter((f) => CANDIDATAS_SIM.some((x) => x.activo === f.simbolo))
  else if (filtro === 'vigilancia') filas = filas.filter((f) => f.en_vigilancia)
  else if (filtro === 'gatillos') filas = filas.filter((f) => f.gatillos > 0)
  if (q) filas = filas.filter((f) => f.simbolo.includes(q) || f.nombre.toUpperCase().includes(q))
  filas.sort((x, y) => Number(!!y.posicion) - Number(!!x.posicion) || Number(y.candidata) - Number(x.candidata) || (y.volumen_24h_usdt ?? 0) - (x.volumen_24h_usdt ?? 0))
  return c.json({ filas, consultado_en: ahora(), fuente: 'terminal/universo (bingx, radar, posiciones, gatillos, catalizadores)' })
})
function fichaTerminal(sym: string) {
  const a = ACTIVOS[sym]
  const origenPos = CARTERA_SIM.caja.posiciones.some((p) => p.activo === sym) ? 'caja' : 'pablo'
  const secciones = [
    { id: 'precio', titulo: 'Precio y volumen', plantilla: { nombre: 'precio_volumen', version: '1' }, spec: { version: 2, titulo: `${sym}: precio y volumen`, activos: [sym], rango: '90d', intervalo: '1d', paneles: [{ id: 'precio', titulo: 'Precio', altura: 3, escala: 'lineal', series: [{ id: sym.toLowerCase(), tipo: 'ohlc', activo: sym, estilo: 'velas' }, { id: 'cand', tipo: 'candidatas', activo: sym }, { id: 'gat', tipo: 'gatillos', activo: sym }] }, { id: 'volumen', titulo: 'Volumen', altura: 1, escala: 'lineal', series: [{ id: 'vol', tipo: 'volumen', activo: sym, estilo: 'barras' }] }], posiciones: { origen: origenPos, mostrar: ['entradas', 'salidas', 'stop', 'stops_historial'] }, eventos: sym === 'STRK' ? [{ fecha: diaAtras(-4), etiqueta: 'Votación' }] : sym === 'STONK' ? [{ fecha: diaAtras(-9), etiqueta: 'Desbloqueo' }] : [] } },
    { id: 'derivados', titulo: 'Derivados', plantilla: { nombre: 'derivados', version: '1' }, spec: { version: 2, titulo: `${sym}: dinero apalancado, funding y liquidaciones`, activos: [sym], rango: '60d', intervalo: '1d', paneles: [{ id: 'oi', titulo: 'Dinero apalancado abierto', altura: 2, escala: 'lineal', series: [{ id: 'oi', tipo: 'oi', activo: sym, estilo: 'area' }] }, { id: 'funding', titulo: 'Funding', altura: 1, escala: 'lineal', series: [{ id: 'fund', tipo: 'funding', activo: sym, estilo: 'linea' }] }, { id: 'liq', titulo: 'Liquidaciones', altura: 1, escala: 'lineal', series: [{ id: 'liq', tipo: 'liquidaciones', activo: sym, estilo: 'barras' }] }, { id: 'ls', titulo: 'Largos contra cortos', altura: 1, escala: 'lineal', series: [{ id: 'ls', tipo: 'long_short', activo: sym, estilo: 'linea' }] }] } },
    { id: 'fundamento', titulo: 'Fundamento contra la categoría', plantilla: { nombre: 'fundamento_categoria', version: '1' }, spec: { version: 2, titulo: `${sym}: ingresos y TVL contra la mediana de su categoría`, activos: [sym], rango: '90d', intervalo: '1d', paneles: [{ id: 'ingresos', titulo: 'Ingresos diarios', altura: 2, escala: 'lineal', series: [{ id: 'ing', tipo: 'ingresos', activo: sym, estilo: 'barras' }, { id: 'cat', tipo: 'categoria', metrica: 'ingresos', categoria: 'auto', agregado: 'mediana', activo: sym, rol: 'benchmark', estilo: 'linea', eje: 'der', transformaciones: [{ tipo: 'base100' }] }] }, { id: 'tvl', titulo: 'Dinero depositado', altura: 1, escala: 'lineal', series: [{ id: 'tvl', tipo: 'tvl', activo: sym, estilo: 'area' }] }] } },
    { id: 'atencion', titulo: 'Atención: personas, bots y granjas', plantilla: { nombre: 'atencion', version: '1' }, spec: { version: 2, titulo: `${sym}: menciones de personas, bots y granjas`, activos: [sym], rango: '30d', intervalo: '1d', paneles: [{ id: 'pulso', titulo: 'Menciones en 24 h', altura: 2, escala: 'lineal', series: [{ id: 'hum', tipo: 'pulso_humanos', activo: sym, estilo: 'area' }, { id: 'bots', tipo: 'pulso_bots', activo: sym, estilo: 'linea', rol: 'apoyo' }, { id: 'granjas', tipo: 'pulso_granjas', activo: sym, estilo: 'linea', rol: 'apoyo' }] }, { id: 'tono', titulo: 'Tono', altura: 1, escala: 'lineal', series: [{ id: 'tono', tipo: 'pulso_tono', activo: sym, estilo: 'area' }] }] } },
  ]
  const no_disponibles: { seccion: string; motivo: string }[] = []
  if (!a.defillama) { no_disponibles.push({ seccion: 'fundamento', motivo: `DefiLlama no tiene protocolo para ${sym}` }) }
  const cands = CANDIDATAS_SIM.filter((x) => x.activo === sym)
  const radar = cands.length ? {
    familias: [
      { nombre: 'Volumen', cumple: true, cifras: [{ k: 'volumen 24 h / media 30 d', v: `${(2.4 + azar(sym.length)() * 2).toFixed(1).replace('.', ',')}×` }, { k: 'cambio 24 h', v: `${(cambio(sym, 1) ?? 0).toFixed(1).replace('.', ',')} %` }] },
      { nombre: 'Apalancamiento', cumple: sym === 'WAL' || sym === 'OGN', cifras: [{ k: 'OI / volumen', v: sym === 'WAL' ? '0,71' : '0,22' }, { k: 'funding', v: sym === 'WAL' ? '−0,018 %' : '+0,004 %' }] },
      { nombre: 'Atención', cumple: sym !== 'KAIA', cifras: [{ k: 'menciones humanas 24 h', v: sym === 'WAL' ? '9' : '41' }, { k: 'granjas', v: sym === 'KAIA' ? '38 %' : '0 %' }] },
      { nombre: 'Catalizadores', cumple: sym === 'STRK' || sym === 'STONK', cifras: [{ k: 'próximo', v: sym === 'STRK' ? `votación ${diaAtras(-4)}` : sym === 'STONK' ? `desbloqueo ${diaAtras(-9)}` : 'ninguno fechado' }] },
    ],
    modos: MODOS_SIM.map((m) => ({ id: m.id, version: m.version, nombre: m.nombre, cumple: cands.some((x) => x.modo === m.id), estudio: m.estudio })),
    etiquetas: [...new Set(cands.flatMap((x) => x.etiquetas))], ultima_marca: hace(60 * 24 * Math.min(...cands.map((x) => x.dias))),
  } : null
  const catalizadores = sym === 'STRK' ? [{ fecha: diaAtras(-4), tipo: 'votacion', etiqueta: 'Votación: buyback del 2 % del tesoro', fuente: 'snapshot', url: 'https://snapshot.org' }] : sym === 'STONK' ? [{ fecha: diaAtras(-9), tipo: 'desbloqueo', etiqueta: 'Desbloqueo del equipo: 1,8 % del circulante', fuente: 'agenda del motor' }] : sym === 'WAL' ? [{ fecha: diaAtras(-12), tipo: 'listado', etiqueta: 'Listado en un exchange coreano (rumor verificado a medias)', fuente: 'investigador' }] : []
  const notas = sym === 'WAL' ? [{ fecha: hace(60 * 6), tipo: 'bitacora' as const, texto: 'Entrada de la caja: squeeze cargado con pulso sano. Stop 0,0328, plazo 24–36 h para exigir avance.', hilo_id: H_CAJA }, { fecha: hace(60 * 2), tipo: 'teoria' as const, texto: 'Los cortos atrapados cubren si rompe 0,0389 con volumen; sin volumen, el techo se defiende.', estado: 'abierta', hilo_id: H_CAJA }] : sym === 'STONK' ? [{ fecha: hace(12), tipo: 'bitacora' as const, texto: 'Ingresos cayendo tres semanas seguidas; la categoría aguanta. Stop en 0,143 y vigilar el cierre semanal.', hilo_id: H_STONK }, { fecha: hace(60 * 24 * 2), tipo: 'teoria' as const, texto: 'Si los ingresos no recuperan 500 k/día antes del desbloqueo, el precio lo refleja.', estado: 'abierta', hilo_id: H_STONK }] : []
  const posiciones = ['pablo', 'caja'].flatMap((o) => cartera(o).posiciones.filter((p) => p.activo === sym).map((p) => ({ activo: p.activo, origen: o, estado: p.estado, mandato: p.mandato, cantidad: p.cantidad, precio_medio: p.precio_medio, stop_precio: p.stop_precio, precio_actual: p.precio_actual, pnl_no_realizado_usdt: p.pnl_no_realizado_usdt, pnl_realizado_usdt: p.pnl_realizado_usdt, simulado: p.simulado, fuente: 'posiciones + bingx', consultado_en: ahora() })))
  return { activo: sym, nombre: a.nombre, par: `${sym}-USDT`, precio: a.precio, cambio_24h_pct: cambio(sym, 1), secciones, radar, catalizadores, notas, posiciones, gatillos: GATILLOS_SIM.filter((g) => g.activo === sym && g.estado !== 'borrado'), no_disponibles, consultado_en: ahora() }
}
luffySimulado.get('/terminal/:activo', (c) => { const sym = c.req.param('activo').toUpperCase(); if (!ACTIVOS[sym]) return c.json({ detail: `${sym} no está en el universo` }, 404); return c.json(fichaTerminal(sym)) })
luffySimulado.post('/terminal/:activo/preguntar', (c) => {
  const sym = c.req.param('activo').toUpperCase(); if (!ACTIVOS[sym]) return c.json({ detail: 'no existe' }, 404)
  const existente = [...HILOS.values()].find((h) => h.titulo === `${sym} · terminal`)
  if (existente) return c.json({ hilo_id: existente.id, titulo: existente.titulo, nuevo: false })
  const id = `c0ffee00-0000-4000-8000-${String(Date.now()).slice(-12)}`
  HILOS.set(id, { id, titulo: `${sym} · terminal`, creado: ahora(), actualizado: ahora(), resumen_vivo: `Ficha del terminal de ${sym} como contexto.`, costo_usd: 0, mensajes: [{ id: ++mensajeId, rol: 'sistema', contenido: `[ficha del terminal de ${sym}]`, ts: ahora(), modelo: null, costo_usd: 0, herramientas_usadas: [], graficos: [], propuestas: [] }] })
  return c.json({ hilo_id: id, titulo: `${sym} · terminal`, nuevo: true })
})

/* ---------- cartera y exchange ---------- */
luffySimulado.get('/cartera', (c) => c.json(cartera(c.req.query('origen') === 'caja' ? 'caja' : 'pablo')))
luffySimulado.get('/cartera/curva', (c) => c.json(curvaCapital(c.req.query('origen') === 'caja' ? 'caja' : 'pablo', c.req.query('rango') ?? '90d')))
luffySimulado.post('/posiciones/declarar', async (c) => {
  const b = await c.req.json().catch(() => ({})) as { activo?: string; cantidad?: number; precio_medio?: number; fecha?: string; mandato?: string }
  if (!b.activo || !(Number(b.cantidad) > 0) || !(Number(b.precio_medio) > 0)) return c.json({ detail: { codigo: 'declaracion_invalida', texto: 'hacen falta activo, cantidad y precio medio' } }, 422)
  const sym = b.activo.toUpperCase(); const id_corto = hex(6, 1200 + PROPUESTAS.size)
  const p = { id: hex(32, 1300 + PROPUESTAS.size), id_corto, hilo_id: H_MONITOR, accion: 'declarar', par: `${sym}-USDT`, lado: 'compra', tipo: 'declaracion', mandato: b.mandato ?? 'hold', cantidad_usdt: redondeo(Number(b.cantidad) * Number(b.precio_medio), 2), precio: Number(b.precio_medio), stop: null, precio_referencia: ACTIVOS[sym]?.precio ?? null, estado: 'propuesta', expira: new Date(Date.now() + 30 * 60_000).toISOString(), expirada: false, bloque: `DECLARACIÓN PROPUESTA #${id_corto}\n${sym} · ${b.cantidad} a ${b.precio_medio} (${b.fecha ?? 'sin fecha'}) · mandato ${b.mandato ?? 'hold'}\nNo envía nada al exchange: registra la tenencia como posición con su precio medio.`, origen: 'pablo', propuesta_en: ahora(), detalle: { declaracion: b } }
  PROPUESTAS.set(id_corto, p); return c.json(p)
})
luffySimulado.get('/exchange/ordenes', (c) => c.json({ abiertas: ORDENES_SIM.filter((o) => o.estado === 'abierta'), consultado_en: ahora(), fuente: 'bingx' }))
luffySimulado.get('/exchange/historial', (c) => {
  const dias = Number(c.req.query('dias') ?? 30) || 30
  const fills = [
    { id: 'f-9001', par: 'WAL-USDT', lado: 'compra', precio: 0.03797, cantidad: 2228.739, comision_usdt: 0.085, hora: hace(60 * 6), orden_id: 'o-8801' },
    { id: 'f-8990', par: 'STRK-USDT', lado: 'venta', precio: 0.1008, cantidad: 292.8, comision_usdt: 0.03, hora: hace(60 * 8), orden_id: 'o-8790' },
    { id: 'f-8971', par: 'STRK-USDT', lado: 'compra', precio: 0.0854, cantidad: 292.8, comision_usdt: 0.025, hora: hace(60 * 36), orden_id: 'o-8771' },
    { id: 'f-8950', par: 'KAIA-USDT', lado: 'venta', precio: 0.0525, cantidad: 440.46, comision_usdt: 0.023, hora: hace(60 * 29), orden_id: 'o-8750' },
    { id: 'f-8930', par: 'KAIA-USDT', lado: 'compra', precio: 0.0568, cantidad: 440.46, comision_usdt: 0.025, hora: hace(60 * 30), orden_id: 'o-8730' },
    { id: 'f-8800', par: 'SOL-USDT', lado: 'venta', precio: 104.34, cantidad: 0.0953, comision_usdt: 0.01, hora: '2026-10-10T19:31:00+00:00', orden_id: 'o-8600' },
    { id: 'f-8790', par: 'SOL-USDT', lado: 'compra', precio: 101.11, cantidad: 0.0953, comision_usdt: 0.01, hora: '2026-10-10T08:54:51+00:00', orden_id: 'o-8590' },
  ].filter((f) => Date.parse(f.hora) > Date.now() - dias * 86_400_000)
  const ordenes = fills.map((f) => ({ id: f.orden_id, par: f.par, lado: f.lado, tipo: f.lado === 'venta' && f.par !== 'STRK-USDT' ? 'stop_market' : 'limit', precio: f.precio, cantidad: f.cantidad, llena: f.cantidad, estado: 'llena', creada: f.hora, es_stop: f.lado === 'venta' && f.par === 'KAIA-USDT', stop_precio: null }))
  const porPar = new Map<string, number>(); for (const f of fills) porPar.set(f.par, redondeo((porPar.get(f.par) ?? 0) + f.comision_usdt, 3))
  return c.json({ ordenes, fills, comisiones: { periodo: `${dias} d`, total_usdt: redondeo(fills.reduce((a, f) => a + f.comision_usdt, 0), 3), por_par: [...porPar].map(([par, usdt]) => ({ par, usdt })) }, consultado_en: ahora() })
})
luffySimulado.post('/exchange/proponer', async (c) => {
  const b = await c.req.json().catch(() => ({})) as Record<string, unknown>
  const accion = String(b.accion ?? '')
  if (!['cancelar', 'modificar', 'mover_stop', 'orden'].includes(accion)) return c.json({ detail: { codigo: 'accion_invalida', texto: 'acción desconocida' } }, 422)
  const id_corto = hex(6, 1400 + PROPUESTAS.size)
  const par = String(b.par ?? (b.activo ? `${String(b.activo).toUpperCase()}-USDT` : ORDENES_SIM.find((o) => o.id === b.orden_id)?.par ?? '?'))
  const bloque = accion === 'mover_stop' ? `MOVER STOP #${id_corto}\n${par} · stop a ${b.stop}\n${Number(b.stop) < (ACTIVOS[par.split('-')[0]]?.precio ?? 0) * 0.9 ? 'AFLOJA STOP: queda más lejos del precio que el vigente' : 'sube el stop: asegura parte del resultado'}`
    : accion === 'cancelar' ? `CANCELAR ORDEN #${id_corto}\norden ${b.orden_id} · ${par}` : accion === 'modificar' ? `MODIFICAR ORDEN #${id_corto}\norden ${b.orden_id} · ${par}${b.precio ? ` · precio ${b.precio}` : ''}${b.cantidad ? ` · cantidad ${b.cantidad}` : ''}` : `ORDEN PROPUESTA #${id_corto}\n${par} · ${b.lado} ${b.cantidad_usdt ? `${b.cantidad_usdt} USDT` : `${b.cantidad ?? '?'}`} · ${b.tipo}${b.precio ? ` a ${b.precio}` : ''}${b.stop ? ` · stop ${b.stop}` : ''}`
  const p = { id: hex(32, 1500 + PROPUESTAS.size), id_corto, hilo_id: H_MONITOR, accion: accion === 'orden' ? 'entrada' : accion === 'cancelar' ? 'cancelar' : accion, par, lado: String(b.lado ?? (accion === 'mover_stop' ? 'venta' : '')), tipo: String(b.tipo ?? accion), mandato: String(b.mandato ?? 'swing'), cantidad_usdt: Number(b.cantidad_usdt ?? 0) || null, precio: Number(b.precio ?? 0) || null, stop: Number(b.stop ?? 0) || null, precio_referencia: ACTIVOS[par.split('-')[0]]?.precio ?? null, estado: 'propuesta', expira: new Date(Date.now() + 15 * 60_000).toISOString(), expirada: false, bloque, origen: 'pablo', propuesta_en: ahora(), detalle: { pedido: b } }
  PROPUESTAS.set(id_corto, p); return c.json(p)
})

/* ---------- caja ---------- */
const MISION = { id_corto: 'm1s10n', texto: 'La máxima rentabilidad en 14 días con 101 USDT. Candidatas del radar en impulso y squeeze.', estado: 'activa', creada: hace(60 * 24 * 1.3), plazo_hasta: new Date(Date.now() + 12.7 * 86_400_000).toISOString(), objetivo: '×2 en 14 días' }
luffySimulado.get('/caja', (c) => { const ca = cartera('caja'); return c.json({ simulado: false, mision: MISION, presupuesto_api: { usado_usd: 4.37, tope_usd: 20 }, limites: [{ k: 'riesgo por operación', v: '≤ 15 % del efectivo' }, { k: 'posiciones a la vez', v: '2' }, { k: 'rotación', v: 'no antes de 24 h salvo stop' }, { k: 'horizonte', v: '14 días' }], efectivo_usdt: ca.efectivo_usdt, valor_total_usdt: ca.valor_total_usdt, posiciones: ca.posiciones, decisiones: CAJA_DECISIONES, consultado_en: ahora() }) })
luffySimulado.post('/caja/mision/:id/:accion', (c) => { const a = c.req.param('accion'); if (!['pausar', 'reanudar', 'cancelar'].includes(a)) return c.json({ detail: 'acción desconocida' }, 404); MISION.estado = a === 'pausar' ? 'pausada' : a === 'reanudar' ? 'activa' : 'cancelada'; return c.json({ ok: true, estado: MISION.estado }) })

/* ---------- radar ---------- */
luffySimulado.get('/radar/candidatas', (c) => {
  const modo = c.req.query('modo'), dias = Number(c.req.query('dias') ?? 30) || 30
  const candidatas = CANDIDATAS_SIM.filter((x) => (!modo || modo === 'todos' || x.modo === modo) && x.dias <= dias).map((x) => { const v = cierres(velas(x.activo, 40, DIA)); const i = Math.max(0, v.length - 1 - x.dias); const marca = v[i][1]; const seg = (d: number) => (x.dias >= d ? pct(v[Math.min(v.length - 1, i + d)][1], marca) : null); const sb = (d: number) => { const s = seg(d), b = x.dias >= d ? pct(cierres(velas('BTC', 40, DIA))[Math.min(39, i + d)][1], cierres(velas('BTC', 40, DIA))[i][1]) : null; return s === null || b === null ? null : redondeo(s - b, 2) }; const ficha = fichaTerminal(x.activo); return { activo: x.activo, nombre: ACTIVOS[x.activo].nombre, fecha: hace(60 * 24 * x.dias), modo: x.modo, version: x.version, familias: ficha.radar?.familias ?? [], jev: x.jev, etiquetas: x.etiquetas, precio_marca: redondeo(marca, ACTIVOS[x.activo].decimales + 1), seguimiento: { d7_pct: seg(7), d14_pct: seg(14), d30_pct: seg(30), vs_btc_d7_pct: sb(7), vs_btc_d14_pct: sb(14), vs_btc_d30_pct: sb(30) } } })
  return c.json({ candidatas, modos: MODOS_SIM.map((m) => m.id), consultado_en: ahora() })
})
luffySimulado.get('/radar/modos', (c) => c.json({ modos: MODOS_SIM, consultado_en: ahora() }))
luffySimulado.post('/modos/:id/:version/decidir', async (c) => { const m = MODOS_SIM.find((x) => x.id === c.req.param('id') && x.version === c.req.param('version')); if (!m) return c.json({ detail: 'modo no existe' }, 404); const b = await c.req.json().catch(() => ({})) as { decision?: string }; if (m.estado !== 'propuesto') return c.json({ detail: { codigo: 'no_pendiente', texto: `el modo está ${m.estado}` } }, 409); m.estado = b.decision === 'aprobar' ? 'activo' : 'retirado'; return c.json({ ok: true, estado: m.estado }) })

/* ---------- control ---------- */
luffySimulado.patch('/gatillos/:id', async (c) => { const g = GATILLOS_SIM.find((x) => x.id === Number(c.req.param('id'))); if (!g) return c.json({ detail: 'gatillo no existe' }, 404); const b = await c.req.json().catch(() => ({})) as { estado?: string }; if (b.estado === 'pausado' || b.estado === 'activo') g.estado = b.estado; return c.json(g) })
luffySimulado.delete('/gatillos/:id', (c) => { const g = GATILLOS_SIM.find((x) => x.id === Number(c.req.param('id'))); if (!g) return c.json({ detail: 'gatillo no existe' }, 404); g.estado = 'borrado'; return c.json({ ok: true }) })
luffySimulado.get('/manual', (c) => c.json({ ...MANUAL_SIM, consultado_en: ahora() }))
luffySimulado.get('/manual/diff', (c) => c.json({ de: c.req.query('de'), a: c.req.query('a'), diff: '@@ §3 Gatillos @@\n- cada gatillo lee X cada 5 min\n+ cada gatillo lee X a su propio ritmo (cada_min), con tope total por hora\n@@ §4 Caja @@\n+ pánico: cierra todo y avisa' }))
luffySimulado.post('/manual/propuestas/:id/decidir', async (c) => { const p = MANUAL_SIM.propuestas.find((x) => x.id === c.req.param('id')); if (!p) return c.json({ detail: 'propuesta no existe' }, 404); const b = await c.req.json().catch(() => ({})) as { decision?: string }; if (p.estado !== 'pendiente') return c.json({ detail: { codigo: 'no_pendiente', texto: `ya está ${p.estado}` } }, 409); p.estado = b.decision === 'aprobar' ? 'aprobada' : 'rechazada'; if (p.estado === 'aprobada') { MANUAL_SIM.version_vigente = '1.8'; MANUAL_SIM.versiones.unshift({ version: '1.8', fecha: ahora(), resumen: p.resumen }) } return c.json({ ok: true, estado: p.estado }) })

/* ---------- oficina ---------- */
luffySimulado.get('/oficina/estado', (c) => c.json({ luffy: { estado: enCurso.size ? 'pensando' : 'ocioso', hilo_id: [...enCurso.keys()][0] ?? null, hilo_titulo: enCurso.size ? HILOS.get([...enCurso.keys()][0])?.titulo ?? null : null, desde: enCurso.size ? ahora() : null }, agentes: AGENTES_SIM, fuentes: FUENTES_SIM, corriendo: [{ que: 'clasificación social (Jev): 212 posts', desde: hace(1) }, { que: 'gatillo #9 leyendo X', desde: hace(0) }], consultado_en: ahora() }))
luffySimulado.get('/eventos', (c) => {
  const guion = [
    () => ({ tipo: 'fuente', fuente: 'x', ok: true, n: 48 }), () => ({ tipo: 'herramienta', herramienta: 'exchange_ticker', fuente: 'bingx' }),
    () => ({ tipo: 'radar_ciclo', detalle: 'ciclo 31: 2 candidatas en impulso, 1 en squeeze' }), () => ({ tipo: 'fuente', fuente: 'coinalyze', ok: true, n: 12 }),
    () => ({ tipo: 'agente_convocado', agente: 'cuant_micro' }), () => ({ tipo: 'fuente', fuente: 'binance', ok: true, n: 6 }), () => ({ tipo: 'agente_terminado', agente: 'cuant_micro', costo_usd: 0.02 }),
    () => ({ tipo: 'caja_ciclo', detalle: 'ciclo 15: esperar (WAL plana)' }), () => ({ tipo: 'fuente', fuente: 'defillama', ok: false }), () => ({ tipo: 'alerta', severidad: 'baja', texto: 'DefiLlama tardó 41 s' }),
    () => ({ tipo: 'fuente', fuente: 'telegram', ok: true, n: 1 }), () => ({ tipo: 'turno_abierto', hilo_id: H_MONITOR, hilo_titulo: 'Monitor', tipo_turno: 'monitor' }), () => ({ tipo: 'herramienta', herramienta: 'mercado_tickers', fuente: 'bingx' }), () => ({ tipo: 'turno_cerrado', hilo_id: H_MONITOR, hilo_titulo: 'Monitor', tipo_turno: 'monitor', costo_usd: 0.07 }),
  ]
  let i = 0
  const stream = new ReadableStream({
    start(ctl) {
      const enc = new TextEncoder()
      const tick = () => { try { ctl.enqueue(enc.encode(sse({ hora: ahora(), ...guion[i % guion.length]() }))); i++ } catch { /* cerrado */ } }
      tick(); const id = setInterval(tick, 2200 / VELOCIDAD)
      c.req.raw.signal.addEventListener('abort', () => { clearInterval(id); try { ctl.close() } catch { /* ya */ } })
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' } })
})

/* ---------- informes ---------- */
const INFORMES_SIM = [0, 1, 2, 3, 5, 6].map((n) => ({ fecha: diaAtras(n), titulo: n === 0 ? 'Mercado sin dirección; WAL en squeeze; STONK con ingresos cayendo' : n === 1 ? 'La caja entra en WAL; STRK cobrada antes de la votación' : n === 2 ? 'KAIA: el stop saltó; el radar trae CFX y C98' : n === 3 ? 'SOL rechazada en 196; nada que hacer' : n === 5 ? 'BTC pierde 108 k y recupera; stops revisados' : 'Semana tranquila; ingresos de STONK a la baja', resumen: 'Cartera sin cambios; una decisión de la caja; dos alertas de precio.' }))
luffySimulado.get('/informes', (c) => c.json({ informes: INFORMES_SIM, revisiones: [{ fecha: diaAtras(1), titulo: 'Revisión quincenal de la caja · 1', resumen: 'Tres operaciones: +2,95 STRK, −1,90 KAIA, WAL abierta. Lección: no rotar antes de 24 h.' }], bitacora: [{ id: 51, fecha: hace(60 * 6), activo: 'WAL', tipo: 'entrada', tesis: 'Squeeze cargado con pulso sano; cortos atrapados.', resultado: null }, { id: 50, fecha: hace(60 * 8), activo: 'STRK', tipo: 'salida', tesis: 'Cobrar el +18 % antes de la votación.', resultado: '+2,95 USDT' }, { id: 47, fecha: hace(60 * 29), activo: 'KAIA', tipo: 'salida', tesis: 'Stop ejecutado.', resultado: '−1,90 USDT' }, { id: 40, fecha: hace(60 * 24 * 3), activo: 'STONK', tipo: 'observacion', tesis: 'Ingresos cayendo más que su categoría.', resultado: null }], teorias: [{ id: 12, fecha: hace(60 * 2), activo: 'WAL', texto: 'Los cortos cubren si rompe 0,0389 con volumen.', estado: 'abierta' }, { id: 11, fecha: hace(60 * 24 * 2), activo: 'STONK', texto: 'Si los ingresos no recuperan 500 k/día antes del desbloqueo, el precio lo refleja.', estado: 'abierta' }, { id: 9, fecha: hace(60 * 24 * 5), activo: 'SOL', texto: 'Continuación si cierra sobre 196.', estado: 'refutada' }], consultado_en: ahora() }))
luffySimulado.get('/informes/:fecha', (c) => {
  const f = c.req.param('fecha'); const inf = INFORMES_SIM.find((x) => x.fecha === f); if (!inf) return c.json({ detail: 'no hay informe de ese día' }, 404)
  const g = guardarSpec({ ...SPEC_BTC, titulo: 'BTC: precio, volumen y funding' }, 'chat', H_MONITOR, null)
  const g2 = guardarSpec({ ...SPEC_STONK, titulo: 'STONK: ingresos contra su categoría' , benchmarks: ['categoria'] }, 'chat', H_STONK, null)
  return c.json({ fecha: f, titulo: inf.titulo, secciones: [
    { titulo: 'Mercado', texto: 'BTC lleva seis sesiones entre 108 k y 114 k con el funding en cero: nadie paga por apalancarse. ETH pierde fuerza relativa.', cifras: [{ k: 'BTC', v: '112 340 USDT · +0,4 %' }, { k: 'funding BTC', v: '0,006 %' }, { k: 'ETH / BTC 7 d', v: '−2,1 %' }], graficos: [{ spec_id: g.spec_id as string, titulo: g.titulo as string }] },
    { titulo: 'Cartera', texto: 'STONK sigue con el stop en 0,143 y los ingresos a la baja. SOL cerrada en −0,06 USDT.', cifras: [{ k: 'STONK', v: '146 a 0,1031 · +13 %' }, { k: 'efectivo', v: '2 188,69 USDT' }], graficos: [{ spec_id: g2.spec_id as string, titulo: g2.titulo as string }] },
    { titulo: 'Caja', texto: 'WAL abierta a 0,03797 con stop 0,0328; plazo de rotación 24–36 h. 16 USDT libres.', cifras: [{ k: 'valor', v: '101,5 USDT' }, { k: 'realizado', v: '+1,05 USDT' }], graficos: [] },
    { titulo: 'Radar', texto: 'CFX y C98 en impulso sin cortos atrapados; STRK con votación en 4 días.', cifras: [{ k: 'candidatas', v: '3 nuevas' }], graficos: [] },
  ], consultado_en: ahora() })
})
