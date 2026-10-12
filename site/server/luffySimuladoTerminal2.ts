/* ============================================================================
   Simulador del terminal v2 (la pantalla de PROMPT-TERMINAL-v2-veta.md), aparte del
   resto del simulador para que el ajuste al contrato real sea barato.

   La forma es la PROVISIONAL de src/luffy/terminal2/contrato.ts, armada con
   PROMPT-TERMINAL-v2-mugiwara.md mientras Mugiwara no publica su sección. Los datos
   son deterministas por moneda y rango (la misma moneda dibuja siempre lo mismo),
   con WAL completa (posición de la caja, gatillos, squeeze, mapa calibrado), una
   moneda sin perpetuo (KMNO: lo de derivados va a `no_disponibles` con su motivo)
   y una que no se opera en BingX (HYPE).

   Lo usan el simulador entero (VETA_LUFFY=simulado) y, con VETA_TERMINAL2=simulado,
   también el puente contra la API real: así la pantalla se puede mirar antes de que
   Mugiwara tenga sus rutas.
   ========================================================================== */
import { Hono } from 'hono'

const DIA = 86_400
const hoy0 = () => Math.floor(Date.now() / 1000 / DIA) * DIA
const DIAS: Record<string, number> = { '30d': 30, '90d': 90, '6m': 182, '1y': 365, max: 540 }
const r2 = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d
/** un número dentro de un texto, como lo escribe Mugiwara: coma decimal */
const es = (v: number) => v.toLocaleString('es-ES', { maximumSignificantDigits: 3 })

/** Un generador con semilla: la misma moneda da siempre los mismos números. */
function azar(semilla: string) {
  let a = [...semilla].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0), 1779033703)
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const normal = (r: () => number) => (r() + r() + r() + r() - 2) / 1.15

interface Moneda { simbolo: string; nombre: string; descripcion: string; categoria: string; precio: number; cap: number; fdv: number; perp: boolean; bingx: boolean; filtros: string[]; modos: string[]; squeeze: 'cargado' | 'ignicion' | null; posicion: null | { origen: 'pablo' | 'caja'; precio_medio: number; cantidad: number }; gatillos: { id_corto: string; nivel: number; direccion: string }[]; cadena: string }
const MONEDAS: Moneda[] = [
  { simbolo: 'WAL', nombre: 'Walrus', descripcion: 'almacenamiento descentralizado', categoria: 'Almacenamiento', precio: 0.0375, cap: 58e6, fdv: 187e6, perp: true, bingx: true, filtros: ['caja', 'candidatas', 'gatillos'], modos: ['squeeze'], squeeze: 'cargado', posicion: { origen: 'caja', precio_medio: 0.038, cantidad: 2100 }, gatillos: [{ id_corto: '9', nivel: 0.0389, direccion: 'sube' }, { id_corto: '11', nivel: 0.0341, direccion: 'baja' }], cadena: 'Sui' },
  { simbolo: 'STONK', nombre: 'StonkFun', descripcion: 'plataforma de lanzamiento de tokens', categoria: 'Launchpad', precio: 0.1167, cap: 41e6, fdv: 116e6, perp: true, bingx: true, filtros: ['mis_posiciones', 'gatillos'], modos: [], squeeze: null, posicion: { origen: 'pablo', precio_medio: 0.142, cantidad: 3000 }, gatillos: [{ id_corto: '4', nivel: 0.098, direccion: 'baja' }], cadena: 'Solana' },
  { simbolo: 'SYN', nombre: 'Synapse', descripcion: 'puente entre cadenas', categoria: 'Puentes', precio: 0.198, cap: 39e6, fdv: 49e6, perp: true, bingx: true, filtros: ['vigilancia'], modos: [], squeeze: null, posicion: null, gatillos: [], cadena: 'Ethereum' },
  { simbolo: 'CFX', nombre: 'Conflux', descripcion: 'cadena de capa 1', categoria: 'Capa 1', precio: 0.0612, cap: 312e6, fdv: 330e6, perp: true, bingx: true, filtros: ['candidatas'], modos: ['impulso'], squeeze: null, posicion: null, gatillos: [], cadena: 'Conflux' },
  { simbolo: 'ASTER', nombre: 'Aster', descripcion: 'exchange de perpetuos descentralizado', categoria: 'Derivados', precio: 1.08, cap: 1.7e9, fdv: 8.4e9, perp: true, bingx: true, filtros: ['candidatas'], modos: ['pre_catalizador'], squeeze: null, posicion: null, gatillos: [], cadena: 'BNB Chain' },
  { simbolo: 'KMNO', nombre: 'Kamino', descripcion: 'préstamos y liquidez en Solana', categoria: 'Préstamos', precio: 0.0441, cap: 92e6, fdv: 441e6, perp: false, bingx: true, filtros: ['vigilancia'], modos: [], squeeze: null, posicion: null, gatillos: [], cadena: 'Solana' },
  { simbolo: 'S', nombre: 'Sonic', descripcion: 'cadena de capa 1', categoria: 'Capa 1', precio: 0.31, cap: 980e6, fdv: 1.2e9, perp: true, bingx: true, filtros: ['candidatas'], modos: ['impulso'], squeeze: null, posicion: null, gatillos: [], cadena: 'Sonic' },
  { simbolo: 'HYPE', nombre: 'Hyperliquid', descripcion: 'exchange de perpetuos en cadena propia', categoria: 'Derivados', precio: 38.4, cap: 12.8e9, fdv: 38.4e9, perp: true, bingx: false, filtros: [], modos: [], squeeze: null, posicion: null, gatillos: [], cadena: 'Hyperliquid' },
  { simbolo: 'ZK', nombre: 'ZKsync', descripcion: 'red de capa 2 de Ethereum', categoria: 'Capa 2', precio: 0.061, cap: 420e6, fdv: 1.27e9, perp: true, bingx: true, filtros: [], modos: [], squeeze: null, posicion: null, gatillos: [], cadena: 'Ethereum' },
  { simbolo: 'PENGU', nombre: 'Pudgy Penguins', descripcion: 'marca de coleccionables y memes', categoria: 'Memes', precio: 0.021, cap: 1.3e9, fdv: 1.9e9, perp: true, bingx: true, filtros: [], modos: [], squeeze: null, posicion: null, gatillos: [], cadena: 'Solana' },
]

/** La fila de la lista, con las mismas cifras que el encabezado de la ficha. */
function fila(m: Moneda) {
  const r = azar(`${m.simbolo}|fila`)
  const f = ficha(m, '90d')
  const cierres = (f.movimiento.velas as number[][]).map((v) => v[4])
  const ult = cierres[cierres.length - 1], c7 = cierres[cierres.length - 8], c1 = cierres[cierres.length - 2]
  return {
    simbolo: m.simbolo, nombre: m.nombre, precio: ult, cambio_24h_pct: r2((ult / c1 - 1) * 100, 1), vs_btc_7d_pct: r2((ult / c7 - 1) * 100 - 1.4, 1),
    vs_btc_30d_pct: r2((ult / cierres[cierres.length - 31] - 1) * 100 - 3.1, 1), volumen_cambio_pct: r2((r() - 0.3) * 140, 0),
    oi_cambio_pct: m.perp ? r2((r() - 0.35) * 60, 0) : null, funding_pct: m.perp ? r2((r() - 0.55) * 0.04, 4) : null,
    squeeze: m.squeeze, modos: m.modos, categoria: m.categoria, cap_usd: m.cap, operable_bingx: m.bingx,
    posiciones: m.posicion ? [{ origen: m.posicion.origen, simulado: false }] : [], gatillos: m.gatillos.length, filtros: m.filtros,
  }
}

const cifra = (id: string, etiqueta: string, valor: number | null, unidad: string, extra: Record<string, unknown> = {}) => ({ id, etiqueta, valor, unidad, ...extra })

function ficha(m: Moneda, rango: string) {
  const n = DIAS[rango] ?? 90
  const r = azar(`${m.simbolo}|${rango}`), t0 = hoy0() - (n - 1) * DIA
  // el precio: una caminata que termina en el precio de hoy, con un tramo de caída, uno lateral y uno de subida
  let lc = 0; const lcs: number[] = []
  for (let i = 0; i < n; i++) { const k = i / n; lc += (k < 0.3 ? -0.009 : k < 0.6 ? 0.002 : k < 0.88 ? 0.011 : 0.003) + 0.028 * normal(r); lcs.push(lc) }
  const kk = Math.log(m.precio) - lcs[n - 1]
  const cl = lcs.map((v) => Math.exp(v + kk)), op = cl.map((c, i) => (i ? cl[i - 1] : c * 0.99))
  const hi = cl.map((c, i) => Math.max(c, op[i]) * (1 + 0.022 * r())), lo = cl.map((c, i) => Math.min(c, op[i]) * (1 - 0.022 * r()))
  const vol = cl.map((_, i) => m.cap * 0.25 * (0.4 + r() * 0.6 + (i > n * 0.87 ? 0.7 : 0)))
  const prec = (v: number) => Number(v.toPrecision(5))
  const velas = cl.map((c, i) => [t0 + i * DIA, prec(op[i]), prec(hi[i]), prec(lo[i]), prec(c), Math.round(vol[i])])
  const ult = cl[n - 1]
  // perfil de volumen por nivel de precio
  const pmin = Math.min(...lo), pmax = Math.max(...hi), nb = 24, bins = new Array(nb).fill(0)
  cl.forEach((c, i) => { bins[Math.min(nb - 1, Math.floor(((c - pmin) / (pmax - pmin)) * nb))] += vol[i] })
  const paso = (pmax - pmin) / nb, poc = bins.indexOf(Math.max(...bins))
  const perfil = { niveles: bins.map((v, b) => [prec(pmin + (b + 0.5) * paso), Math.round(v)]), poc: prec(pmin + (poc + 0.5) * paso) }
  // el mapa de liquidaciones (sólo con perpetuo): bloques de cortos arriba y de largos abajo
  const liq = m.perp ? {
    niveles: [[1.045, 'cortos', 1, 4.1e6], [1.083, 'cortos', 0.55, 1.8e6], [1.14, 'cortos', 0.3, 0.6e6], [0.94, 'largos', 0.9, 3.2e6], [0.9, 'largos', 0.5, 1.2e6], [0.855, 'largos', 0.3, 0.5e6]]
      .map(([k, lado, i, monto]) => ({ precio: prec(ult * (k as number)), desde: prec(ult * (k as number) * 0.994), hasta: prec(ult * (k as number) * 1.006), lado, intensidad: i, monto_usd: Math.round((monto as number) * (m.cap / 58e6) ** 0.5), densa: (i as number) >= 0.9 })),
    calidad: { calibrado: true, datos: 'liquidaciones de Binance y Bybit de 90 días contra el nivel estimado', vs_azar: m.simbolo === 'WAL' ? 1.9 : r2(1.2 + r() * 0.9, 1) },
  } : null
  // marcas y niveles de las capas
  const marcas: Record<string, unknown>[] = []
  const niveles: Record<string, unknown>[] = []
  if (m.posicion) {
    const ti = t0 + Math.floor(n * 0.93) * DIA
    marcas.push({ t: ti, tipo: 'entrada', capa: 'posiciones', precio: m.posicion.precio_medio, etiqueta: `Entrada ${m.posicion.origen === 'caja' ? 'de la caja' : 'de Pablo'} · ${m.posicion.precio_medio}` })
    niveles.push({ tipo: 'stop', capa: 'posiciones', precio: prec(m.posicion.precio_medio * 0.863), etiqueta: `Stop ${m.posicion.origen === 'caja' ? 'caja' : 'Pablo'}` })
  }
  for (const g of m.gatillos) niveles.push({ tipo: 'gatillo', capa: 'gatillos', precio: g.nivel, etiqueta: `Gatillo #${g.id_corto}` })
  marcas.push({ t: t0 + Math.floor(n * 0.69) * DIA, tipo: 'catalizador', capa: 'catalizadores', precio: null, etiqueta: m.simbolo === 'WAL' ? 'Anuncio de listado' : 'Votación de gobernanza' })
  if (m.modos.length || m.squeeze) {
    marcas.push({ t: t0 + Math.floor(n * 0.64) * DIA, tipo: 'radar', capa: 'radar', precio: null, etiqueta: 'Impulso v1' })
    marcas.push({ t: t0 + Math.floor(n * 0.93) * DIA, tipo: 'radar', capa: 'radar', precio: null, etiqueta: m.squeeze ? 'Squeeze cargado v2' : `${m.modos[0]} v1` })
  }
  // delta acumulado del spot y de los futuros, interés abierto
  let s = 0, f = 0; const dspot: number[][] = [], dfut: number[][] = [], oi: number[][] = []
  for (let i = 0; i < n; i++) {
    const k = i / n
    s += (r() - 0.5) * 1.0 + (k > 0.55 && k < 0.88 ? 0.12 : 0); f += (r() - 0.5) * 1.0 + (k > 0.78 ? 0.55 : 0.05)
    dspot.push([t0 + i * DIA, Math.round(s * m.cap * 0.002)])
    if (m.perp) { dfut.push([t0 + i * DIA, Math.round(f * m.cap * 0.004)]); oi.push([t0 + i * DIA, Math.round(m.cap * (0.08 + k * 0.05 + (k > 0.87 ? 0.02 : 0) + r() * 0.008))]) }
  }
  const derivados = m.perp ? {
    interes_abierto: oi,
    // funding por intervalo de 8 h, en % (positivo: los largos pagan)
    funding: Array.from({ length: n * 3 }, (_, i) => [t0 + i * 8 * 3600, r2((Math.sin(i / 9) * 0.6 + normal(r) * 0.5 - (i > n * 2.6 ? 1.1 : 0)) * 0.012, 4), 8]),
    liquidaciones: Array.from({ length: n }, (_, i) => [t0 + i * DIA, Math.round(m.cap * 0.004 * r() * (i > n * 0.9 ? 0.6 : 1)), Math.round(m.cap * 0.004 * r() * (i > n * 0.9 ? 2.4 : 1))]),
    largos_cortos: Array.from({ length: n }, (_, i) => [t0 + i * DIA, r2(1.05 - (i / n) * 0.3 + normal(r) * 0.05, 2), r2(1.0 - (i / n) * 0.2 + normal(r) * 0.04, 2)]),
  } : null
  const ret = (d: number) => r2((ult / cl[Math.max(0, n - 1 - d)] - 1) * 100, 1)
  const sinPerp = 'sin perpetuo: no hay futuros para esta moneda'
  const no_disponibles: { seccion: string; campo?: string; motivo: string }[] = []
  if (!m.perp) {
    no_disponibles.push({ seccion: 'movimiento', campo: 'liquidaciones', motivo: 'sin perpetuo: no hay mapa de liquidaciones' }, { seccion: 'movimiento', campo: 'delta_futuros', motivo: sinPerp }, { seccion: 'movimiento', campo: 'derivados', motivo: sinPerp })
    for (const id of ['fut_spot', 'funding', 'oi_cap', 'largos_cortos', 'liq_24h', 'squeeze']) no_disponibles.push({ seccion: 'movimiento', campo: id, motivo: sinPerp })
    no_disponibles.push({ seccion: 'oportunidad', campo: 'oi_7d', motivo: sinPerp })
  }
  if (m.cadena === 'Conflux' || m.cadena === 'Hyperliquid' || m.cadena === 'Sonic') no_disponibles.push({ seccion: 'onchain', motivo: `la cadena ${m.cadena} no la cubren Helius, Etherscan, Blockscout ni el indexador del motor` })
  // fundamento por semana
  const semanas = Math.max(4, Math.floor(n / 7))
  const sem: number[][] = [], capb: number[][] = [], catb: number[][] = []
  const tw0 = hoy0() - (semanas - 1) * 7 * DIA
  for (let i = 0; i < semanas; i++) {
    const fees = Math.round(9000 * (m.cap / 58e6) * (1 + i * 0.07 * (90 / n)) * (0.9 + r() * 0.2))
    sem.push([tw0 + i * 7 * DIA, fees, Math.round(fees * 0.55), Math.round(fees * 0.55 * (0.45 + (i / semanas) * 0.25))])
    const ci = Math.min(n - 1, Math.max(0, n - 1 - (semanas - 1 - i) * 7))
    capb.push([tw0 + i * 7 * DIA, r2((cl[ci] / cl[Math.max(0, n - 1 - (semanas - 1) * 7)]) * 100, 1)])
    catb.push([tw0 + i * 7 * DIA, r2(100 * Math.exp(i * 0.012 * (90 / n) * 3 + (r() - 0.5) * 0.05), 1)])
  }
  const fees30 = sem.slice(-4).reduce((a, x) => a + x[1], 0), rev30 = sem.slice(-4).reduce((a, x) => a + x[2], 0), hold30 = sem.slice(-4).reduce((a, x) => a + x[3], 0)
  // redes, por día
  const menciones: number[][] = [], tono: number[][] = [], precioRed: number[][] = []
  for (let i = 0; i < n; i++) {
    const k = i / n, base = 40 + k * 90 + (k > 0.75 ? 60 : 0)
    menciones.push([t0 + i * DIA, Math.round(base * (0.8 + r() * 0.4)), Math.round(25 + r() * 25), Math.round(k > 0.82 ? 20 + r() * 40 : r() * 12)])
    tono.push([t0 + i * DIA, r2((r() - 0.35) * 0.8, 2)]); precioRed.push([t0 + i * DIA, cl[i]])
  }
  // on-chain, por día
  const cubre = !no_disponibles.some((x) => x.seccion === 'onchain' && !x.campo)
  const flujo = cubre ? Array.from({ length: n }, (_, i) => { const v = (r() - (i > n * 0.7 ? 0.7 : 0.5)) * 2; return [t0 + i * DIA, Math.round(Math.max(0, v) * m.cap * 0.0008 / ult), Math.round(Math.max(0, -v) * m.cap * 0.0008 / ult)] }) : []
  const pos = m.posicion
  const pnl = pos ? r2((ult - pos.precio_medio) * pos.cantidad, 2) : null
  const sym = m.simbolo
  return {
    activo: sym, nombre: m.nombre, descripcion: m.descripcion, categoria: m.categoria, operable_bingx: m.bingx, perp: m.perp, rango, intervalo: '1d',
    vitrina: { calculado_en: new Date().toISOString(), edad_s: 12, cada_s: 300, estado: 'fresco', duracion_ms: 42, error: null },
    encabezado: {
      precio: ult, cambio_24h_pct: r2((ult / cl[n - 2] - 1) * 100, 1),
      cifras: [
        cifra('r7', '7 d · USD', ret(7), 'pct', { signo: true }), cifra('r30', '30 d · USD', ret(30), 'pct', { signo: true }),
        cifra('b7', '7 d · vs BTC', r2(ret(7) - 9.9, 1), 'pct', { signo: true }), cifra('b30', '30 d · vs BTC', r2(ret(30) - 16.5, 1), 'pct', { signo: true }),
        cifra('cap', 'Capitalización', m.cap, 'usd'), cifra('fdv', 'FDV', m.fdv, 'usd'), cifra('vol', 'Volumen 24 h', Math.round(vol[n - 1]), 'usd'),
        cifra('vol_cap', 'Volumen / cap.', r2(vol[n - 1] / m.cap, 2), 'num'), cifra('ath', 'Bajo el máximo', -94, 'pct', { tono: 'neg' }),
        cifra('circ', 'En circulación', r2((m.cap / m.fdv) * 100, 0), 'pct', { tono: 'oro' }),
        cifra('desbloqueo', 'Próximo desbloqueo', null, 'texto', { texto: '28 oct · 2,1 %', tono: 'oro' }),
      ],
      posiciones: pos ? [{ origen: pos.origen, estado: 'abierta', precio_medio: pos.precio_medio, pnl_usdt: pnl, simulado: false }] : [],
      gatillos: m.gatillos, modos: [...m.modos.map((x) => ({ modo: x, version: '1', estado: 'cumple' })), ...(m.squeeze ? [{ modo: 'squeeze', version: '2', estado: m.squeeze }] : [])],
    },
    estadisticas: {
      cifras: [
        cifra('ret90', 'Retorno 90 d', ret(89), 'pct', { signo: true }), cifra('vol30', 'Volatilidad 30 d (anual)', 96, 'pct'),
        cifra('dd90', 'Caída máxima 90 d', -31, 'pct', { tono: 'neg' }), cifra('corr', 'Correlación con BTC 30 d', 0.42, 'num'),
        cifra('beta', 'Beta contra BTC', 1.7, 'num'), cifra('r52', 'Rango 52 semanas', null, 'texto', { texto: `${es(m.precio * 0.5)} – ${es(m.precio * 16)}` }),
        cifra('prof', 'Profundidad ±2 % (libro)', m.bingx ? 79000 : null, 'usd', { tono: 'oro', ...(m.bingx ? {} : { motivo: 'no se negocia en BingX: sin libro propio' }) }),
        cifra('donde', 'Dónde se negocia', null, 'texto', { texto: 'Binance 41 % · Bybit 18 % · BingX 9 %' }),
      ],
    },
    movimiento: {
      velas, perfil, liquidaciones: liq, marcas, niveles, delta_spot: dspot, delta_futuros: dfut, interes_abierto: oi,
      cifras: [
        cifra('fut_spot', 'Futuros / spot (volumen)', m.perp ? 6.1 : null, 'x', { tono: 'oro', nota: 'lo mueven apalancados' }),
        cifra('funding', 'Funding (8 h)', m.perp ? -0.018 : null, 'pct', { signo: true, nota: 'los cortos pagan' }),
        cifra('oi_cap', 'Interés abierto / cap.', m.perp ? 0.15 : null, 'num', { nota: 'percentil 94 de 30 d' }),
        cifra('largos_cortos', 'Largos / cortos (cuentas)', m.perp ? 0.74 : null, 'num', { nota: 'más cuentas cortas' }),
        cifra('liq_24h', 'Liquidaciones 24 h', null, 'texto', m.perp ? { texto: 'L 1,2 M · C 3,4 M', nota: 'barrieron cortos' } : {}),
        cifra('squeeze', 'Squeeze', null, 'texto', m.perp ? { texto: m.squeeze ?? 'no', tono: m.squeeze ? 'pos' : null, nota: m.squeeze ? 'precio plano + cortos apilados' : 'sin cortos apilados' } : {}),
      ],
      lectura: m.perp
        ? [`Los últimos 10 días sube el delta de futuros y el del spot queda plano: el movimiento lo empujan los apalancados.`, `El volumen se concentra cerca de ${es(perfil.poc)}, y hay un bloque denso de liquidaciones de cortos sobre ${es(ult * 1.045)}.`]
        : [`Sin perpetuo, el precio lo mueve el spot: el delta acumulado del spot subió en el último tramo.`, `El volumen se concentra cerca de ${es(perfil.poc)}.`],
      derivados,
      spec: { version: 2, titulo: `${sym}: precio, perfil y liquidaciones`, activos: [sym], rango, intervalo: '1d', paneles: [{ id: 'precio', altura: 3, escala: 'lineal', series: [{ id: 'p', tipo: 'ohlc', activo: sym, estilo: 'velas' }, { id: 'vp', tipo: 'volume_profile', activo: sym }] }, { id: 'delta', altura: 1, series: [{ id: 'ds', tipo: 'delta_spot', activo: sym, estilo: 'linea' }] }] },
    },
    fundamento: {
      semanas: sem, cap_base100: capb, categoria_base100: catb,
      cifras: [
        cifra('fees30', 'Fees 30 d', fees30, 'usd', { nota: '+18 % mes contra mes' }), cifra('rev30', 'Revenue 30 d', rev30, 'usd', { nota: '+15 % mes contra mes' }),
        cifra('hold30', 'Holders revenue 30 d', hold30, 'usd', { tono: 'pos', nota: 'lo que llega al token' }),
        cifra('cap_rev', 'Cap. / revenue anual', r2(m.cap / (rev30 * 12), 0), 'x', { tono: 'oro', nota: 'categoría: 75×' }),
        cifra('cap_tvl', 'Cap. / TVL', 1.9, 'num', { nota: 'categoría: 1,1' }), cifra('ss', 'Semana contra semana', 6, 'pct', { signo: true, nota: 'fees' }),
      ],
      captura: { clase: sym === 'KMNO' ? 'negocio sin captura' : 'anclado', mecanismo: sym === 'KMNO' ? 'ninguno: el revenue se queda en el protocolo' : 'reparto a staking', pct_al_token: sym === 'KMNO' ? 0 : 45, fuente: 'DefiLlama · documentación del protocolo' },
      proyecto: (m.filtros.length ? {
        compilado_en: '2026-10-08T12:00:00+00:00',
        lineas: [
          { campo: 'Qué hace', texto: sym === 'WAL' ? 'Almacenamiento descentralizado sobre Sui, desarrollado por Mysten Labs.' : `${m.nombre}: ${m.descripcion}.`, fuente: 'sitio oficial', fecha: '2026-10-08' },
          { campo: 'Narrativa', texto: sym === 'WAL' ? 'Infraestructura de datos para IA y apps en cadena.' : `${m.categoria}.`, fuente: 'documentación', fecha: '2026-10-08' },
          { campo: 'Equipo y backers', texto: 'Equipo público; rondas con fondos conocidos.', fuente: 'Messari', fecha: '2026-09-30' },
          { campo: 'Roadmap', texto: 'Mainnet de la v2 · nov 2026 · integraciones · 1T 2027', fuente: 'blog oficial', fecha: '2026-10-01' },
          { campo: 'Tokenomics', texto: `Suministro fijo; ${r2((m.cap / m.fdv) * 100, 0)} % en circulación; desbloqueos mensuales hasta 2028.`, fuente: 'Tokenomist', fecha: '2026-10-08' },
          { campo: 'Tenedores', texto: 'Top 10 sin exchanges ni contratos: 38 % · −1,2 pp en 30 d.', fuente: 'diccionario de entidades', fecha: '2026-10-08' },
          { campo: 'Riesgos', texto: 'Desbloqueos grandes cada mes; competencia con otras redes de almacenamiento.', fuente: 'documentación', fecha: '2026-10-08' },
        ],
      } : null),
      spec: { version: 2, titulo: `${sym}: fees, revenue y capitalización`, activos: [sym], rango, intervalo: '1w', paneles: [{ id: 'f', altura: 2, series: [{ id: 'fees', tipo: 'fees', activo: sym, estilo: 'barras' }, { id: 'rev', tipo: 'ingresos', activo: sym, estilo: 'barras' }, { id: 'mc', tipo: 'mcap', activo: sym, estilo: 'linea', eje: 'der', transformaciones: [{ tipo: 'base_100' }] }] }] },
    },
    redes: {
      mercado: [
        cifra('regimen', 'Régimen del mercado', null, 'texto', { texto: 'lateral alcista' }), cifra('fg', 'Miedo y codicia', null, 'texto', { texto: '62 · codicia', tono: 'oro' }),
        cifra('fund_mkt', 'Funding promedio del mercado', 0.008, 'pct', { signo: true, tono: 'neutro' }), cifra('dom', 'Dominancia de BTC', 57, 'pct'),
        cifra('alts', 'Altcoins contra BTC (30 d)', 3, 'pct', { signo: true }),
      ],
      menciones, precio: precioRed, tono,
      cifras: [
        cifra('men24', 'Menciones de personas (24 h)', menciones[n - 1][1], 'num', { tono: 'pos', nota: '7,1× su media de 30 d' }),
        cifra('bots', 'Bots y granjas', 25, 'pct', { tono: 'neg', nota: 'shill coordinado en alerta' }),
        cifra('antes', 'Atención antes que el precio', null, 'texto', { texto: 'sí', tono: 'pos', nota: 'subió antes de moverse' }),
        cifra('narr', 'Su narrativa contra BTC (30 d)', 7, 'pct', { signo: true, nota: m.categoria.toLowerCase() }),
      ],
      quien_habla: [
        { cuenta: '@datos_onchain', seguidores: 48000, tono: 'alcista', antes: true, acierto: '7 de 11', menciones: 6, nota: `Habló de ${sym} 2 días antes del movimiento.` },
        { cuenta: '@lectora_de_ingresos', seguidores: 12000, tono: 'neutro', antes: false, acierto: null, menciones: 3, nota: 'Hilo con datos de ingresos; sin llamado a comprar.' },
        { cuenta: '@alertas_liq', seguidores: 31000, tono: 'dato', antes: null, acierto: null, menciones: 9, nota: `Alerta de liquidaciones de cortos sobre ${es(ult * 1.045)}.` },
      ],
      granjas: [{ nombre: 'Red de 14 cuentas nuevas', cuentas: 14, nota: 'Publicaron lo mismo en 6 minutos: se mide aparte, no suma como interés real.' }],
      spec: { version: 2, titulo: `${sym}: menciones y precio`, activos: [sym], rango, intervalo: '1d', paneles: [{ id: 'm', altura: 2, series: [{ id: 'per', tipo: 'pulso_personas', activo: sym, estilo: 'barras' }, { id: 'p', tipo: 'cierre', activo: sym, estilo: 'linea', eje: 'der' }] }] },
    },
    onchain: cubre ? {
      cadena: m.cadena,
      cifras: [
        cifra('top10', 'Top 10 sin exchanges ni contratos', 38, 'pct', { tono: 'oro', nota: '−1,2 pp en 30 d: se reparte' }),
        cifra('holders', 'Tenedores', 41200, 'num', { nota: '+4,2 % en 30 d' }), cifra('nuevos', 'Nuevos tenedores 7 d', 1900, 'num', { signo: true, tono: 'pos', nota: 'el doble que la semana pasada' }),
        cifra('flujo7', 'Flujo neto a exchanges 7 d', null, 'texto', { texto: `−2,1 M ${sym}`, tono: 'pos', nota: 'sale más de lo que entra' }),
        cifra('en_ex', 'En exchanges', 18, 'pct', { nota: 'del circulante · baja desde 21 %' }),
      ],
      flujo,
      movimientos: [
        { hora: 'hace 2 h', entidad: 'Ballena 0x3f…a1', accion: 'compró en DEX', monto: `1,2 M ${sym}`, lado: 'compra' },
        { hora: 'hace 5 h', entidad: 'Binance (exchange)', accion: 'retiro a wallet propia', monto: `3,4 M ${sym}`, lado: 'compra' },
        { hora: 'hace 9 h', entidad: 'Fondo Alfa (fondo)', accion: 'envió a exchange', monto: `2,0 M ${sym}`, lado: 'venta' },
        { hora: 'hace 1 d', entidad: 'Contrato de desbloqueo', accion: 'liberó al equipo', monto: `0,8 M ${sym}`, lado: 'neutro' },
      ],
      wallets: sym === 'WAL' ? [{ nombre: 'Alpha #4 (de tu lista)', que_hizo: 'entró hace 3 d', lado: 'compra' }, { nombre: 'Fondo Alfa', que_hizo: 'mantiene', lado: 'neutro' }, { nombre: 'Insider del equipo', que_hizo: 'redujo 12 %', lado: 'venta' }] : [],
    } : { cadena: m.cadena, cifras: [], flujo: [], movimientos: [], wallets: [] },
    oportunidad: {
      escenarios: [
        { ref: 'Mediana de su categoría', cap_usd: m.cap * 2.07, multiplo: 2.07, multiplo_fdv: r2((m.cap * 2.07) / m.fdv, 2), precio: prec(ult * 2.07) },
        { ref: 'Top 3 de su categoría', cap_usd: m.cap * 15.5, multiplo: 15.5, multiplo_fdv: r2((m.cap * 15.5) / m.fdv, 2), precio: prec(ult * 15.5) },
        { ref: 'Su propio máximo', cap_usd: m.cap * 16.5, multiplo: 16.5, multiplo_fdv: r2((m.cap * 16.5) / m.fdv, 2), precio: prec(ult * 16.5) },
        { ref: 'Volver al mínimo de 90 d', cap_usd: m.cap * (Math.min(...lo) / ult), multiplo: r2(Math.min(...lo) / ult, 2), multiplo_fdv: null, precio: prec(Math.min(...lo)) },
      ],
      cifras: [
        cifra('v7_30', 'Volumen 7 d / 30 d', 1.8, 'x', { tono: 'pos', nota: 'se acelera' }), cifra('sin_precio', 'Volumen sin precio', null, 'texto', { texto: 'sí', tono: 'oro', nota: 'preparación: entra sin mover' }),
        cifra('oi_7d', 'Interés abierto 7 d', m.perp ? 38 : null, 'pct', { signo: true, tono: 'oro', nota: 'entra apalancamiento' }),
        cifra('h30', 'Holders 30 d', cubre ? 4.2 : null, 'pct', { signo: true, nota: 'snapshots del motor', ...(cubre ? {} : { motivo: 'sin cobertura en cadena' }) }),
      ],
      radar: [
        { modo: 'Squeeze cargado', version: '2', cumple: !!m.squeeze, frase: m.squeeze ? 'cortos apilados con precio plano. El estudio: 212 casos, acierto 58 %, mediana +3,2 % a 7 días.' : 'no se cumple: sin cortos apilados.' },
        { modo: 'Impulso', version: '1', cumple: m.modos.includes('impulso'), frase: m.modos.includes('impulso') ? 'fuerza contra BTC en 7 y 30 días con volumen creciente.' : 'no se cumple. En su estudio no le ganó al azar.' },
        { modo: 'Pre-catalizador', version: '1', cumple: m.modos.includes('pre_catalizador'), frase: m.modos.includes('pre_catalizador') ? 'votación con fecha en 9 días y atención subiendo.' : 'no se cumple: sin catalizador con fecha.' },
      ],
    },
    // para «comparar contra»: los cierres de BTC y de la mediana de su categoría en el mismo rango
    comparar: {
      btc: cl.map((_, i) => [t0 + i * DIA, Math.round(62000 * Math.exp((i / n) * 0.18 + Math.sin(i / 7) * 0.03))]),
      categoria: cl.map((_, i) => [t0 + i * DIA, r2(100 * Math.exp((i / n) * 0.05 + Math.sin(i / 5) * 0.04), 2)]),
    },
    no_disponibles,
  }
}

export const simuladorTerminal2 = new Hono()
const ORDEN: Record<string, (f: ReturnType<typeof fila>) => number> = {
  vs_btc_7d: (f) => f.vs_btc_7d_pct ?? -1e9, volumen_cambio: (f) => f.volumen_cambio_pct ?? -1e9, oi_cambio: (f) => f.oi_cambio_pct ?? -1e9,
  funding: (f) => -(f.funding_pct ?? 1e9), squeeze: (f) => (f.squeeze === 'ignicion' ? 2 : f.squeeze === 'cargado' ? 1 : 0), cap: (f) => f.cap_usd ?? 0,
}
simuladorTerminal2.get('/terminal/v2/lista', (c) => {
  const filtro = c.req.query('filtro') ?? 'todo', orden = c.req.query('orden') ?? 'vs_btc_7d', q = (c.req.query('q') ?? '').trim().toUpperCase()
  const items = MONEDAS.filter((m) => filtro === 'todo' || m.filtros.includes(filtro)).filter((m) => !q || m.simbolo.includes(q) || m.nombre.toUpperCase().includes(q)).map(fila)
  items.sort((a, b) => (ORDEN[orden] ?? ORDEN.vs_btc_7d)(b) - (ORDEN[orden] ?? ORDEN.vs_btc_7d)(a))
  return c.json({ items, filtro, orden, vitrina: { calculado_en: new Date().toISOString(), edad_s: 8, cada_s: 300, estado: 'fresco', duracion_ms: 31, error: null } })
})
simuladorTerminal2.get('/terminal/v2/:activo', async (c) => {
  const a = c.req.param('activo').toUpperCase(), m = MONEDAS.find((x) => x.simbolo === a)
  if (!m) return c.json({ detail: { codigo: 'no_encontrado', texto: `${a} no está en el universo seguido` } }, 404)
  // una demora corta, para ver cómo se comporta lo guardado mientras llega lo nuevo
  await new Promise((r) => setTimeout(r, 120))
  return c.json(ficha(m, c.req.query('rango') ?? '90d'))
})
