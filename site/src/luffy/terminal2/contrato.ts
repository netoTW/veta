/* ============================================================================
   Terminal v2 · lo único que depende del contrato de Mugiwara.

   Mugiwara todavía no publicó la sección del terminal v2 en CONTRATO-PANEL.md.
   Mientras tanto, la forma de aquí es la provisional, armada con
   PROMPT-TERMINAL-v2-mugiwara.md, y es la que manda el simulador
   (server/luffySimuladoTerminal2.ts). Cuando llegue el contrato real, se ajustan
   las RUTAS, los tipos `Crudo*` y `adaptar*`: la pantalla lee el modelo (`Ficha2`,
   `Fila2`), que no cambia.

   El adaptador es tolerante: un campo que falta queda vacío (nunca un cero
   inventado) y lo que no hay se lee de `no_disponibles`, con su motivo.
   ========================================================================== */

export const RUTAS = {
  lista: '/terminal/v2/lista',
  ficha: (activo: string) => `/terminal/v2/${encodeURIComponent(activo.toUpperCase())}`,
}

/* ---------- el modelo que lee la pantalla ---------- */
export type Filtro2 = 'mis_posiciones' | 'caja' | 'candidatas' | 'vigilancia' | 'gatillos' | 'todo'
export type Orden2 = 'vs_btc_7d' | 'volumen_cambio' | 'oi_cambio' | 'funding' | 'squeeze' | 'cap'
export type Rango2 = '30d' | '90d' | '6m' | '1y' | 'max'
export type Capa = 'posiciones' | 'gatillos' | 'catalizadores' | 'radar' | 'liquidaciones'
export type Unidad = 'pct' | 'pp' | 'usd' | 'x' | 'num' | 'precio' | 'texto'
export type Tono = 'pos' | 'neg' | 'oro' | 'neutro'
/** [t en segundos UTC, valor] */
export type Punto = [number, number]

export interface Cifra { id: string; etiqueta: string; valor: number | null; unidad: Unidad; texto: string | null; nota: string | null; tono: Tono | null; signo: boolean; motivo: string | null }
export interface Fila2 {
  simbolo: string; nombre: string; precio: number | null; cambio_24h_pct: number | null
  vs_btc_7d_pct: number | null; vs_btc_30d_pct: number | null; volumen_cambio_pct: number | null; oi_cambio_pct: number | null
  funding_pct: number | null; squeeze: 'cargado' | 'ignicion' | null; modos: string[]; categoria: string | null; cap_usd: number | null
  operable_bingx: boolean; posiciones: { origen: 'pablo' | 'caja'; simulado: boolean }[]; gatillos: number
}
export interface Vela { t: number; o: number; h: number; l: number; c: number; v: number | null }
export interface NivelLiq { precio: number; desde: number; hasta: number; lado: 'cortos' | 'largos'; intensidad: number; monto_usd: number | null; densa: boolean }
export interface Marca { t: number; tipo: 'entrada' | 'salida' | 'catalizador' | 'radar'; capa: Capa; precio: number | null; etiqueta: string }
export interface NivelPrecio { tipo: 'stop' | 'gatillo' | 'entrada'; capa: Capa; precio: number; etiqueta: string }
export interface Ficha2 {
  activo: string; nombre: string; descripcion: string; categoria: string | null; operable_bingx: boolean; perp: boolean
  rango: string; pendiente: boolean; reintentar_en_s: number | null; calculado_en: string | null; viejo: boolean
  encabezado: {
    precio: number | null; cambio_24h_pct: number | null; cifras: Cifra[]
    posiciones: { origen: 'pablo' | 'caja'; estado: string; precio_medio: number | null; pnl_usdt: number | null; simulado: boolean }[]
    gatillos: { id_corto: string; nivel: number | null; direccion: string | null }[]
    modos: { modo: string; version: string; estado: string }[]
  }
  estadisticas: { cifras: Cifra[] }
  movimiento: {
    velas: Vela[]; perfil: { niveles: [number, number][]; poc: number | null }
    liquidaciones: { niveles: NivelLiq[]; calibrado: boolean; datos: string | null; vs_azar: number | null } | null
    marcas: Marca[]; niveles: NivelPrecio[]
    delta_spot: Punto[]; delta_futuros: Punto[]; interes_abierto: Punto[]
    cifras: Cifra[]; lectura: string[]
    derivados: { interes_abierto: Punto[]; funding: { t: number; v: number; intervalo_h: number | null }[]; liquidaciones: { t: number; largos: number; cortos: number }[]; largos_cortos: { t: number; cuentas: number | null; posiciones: number | null }[] } | null
    spec: Record<string, unknown> | null
  }
  fundamento: {
    semanas: { t: number; fees: number | null; revenue: number | null; holders: number | null }[]
    cap_base100: Punto[]; categoria_base100: Punto[]; cifras: Cifra[]
    captura: { clase: string; mecanismo: string | null; pct_al_token: number | null; fuente: string | null } | null
    proyecto: { compilado_en: string | null; lineas: { campo: string; texto: string; fuente: string | null; fecha: string | null }[] } | null
    spec: Record<string, unknown> | null
  }
  redes: {
    mercado: Cifra[]; menciones: { t: number; personas: number; bots: number; granjas: number }[]; precio: Punto[]; tono: Punto[]; cifras: Cifra[]
    quien_habla: { cuenta: string; seguidores: number | null; tono: string; antes: boolean | null; acierto: string | null; menciones: number | null; nota: string | null }[]
    granjas: { nombre: string; cuentas: number | null; nota: string | null }[]
    spec: Record<string, unknown> | null
  }
  onchain: {
    cadena: string | null; cifras: Cifra[]; flujo: { t: number; entra: number; sale: number }[]
    movimientos: { hora: string; entidad: string; accion: string; monto: string; lado: 'compra' | 'venta' | 'neutro' }[]
    wallets: { nombre: string; que_hizo: string; lado: 'compra' | 'venta' | 'neutro' }[]
  }
  oportunidad: {
    escenarios: { ref: string; cap_usd: number | null; multiplo: number | null; multiplo_fdv: number | null; precio: number | null }[]
    cifras: Cifra[]; radar: { modo: string; version: string; cumple: boolean; frase: string }[]
  }
  comparar: { btc: Punto[]; categoria: Punto[] }
  /** lo que no hay, con su motivo: por sección (`movimiento`) o por campo (`movimiento.liquidaciones`, `estadisticas.beta_btc`) */
  no_disponibles: { donde: string; motivo: string }[]
}

/* ---------- lo que manda Mugiwara (provisional) ---------- */
type Crudo = Record<string, unknown>
const obj = (v: unknown): Crudo => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Crudo) : {})
const arr = <T = unknown>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : null)
const bool = (v: unknown) => v === true || v === 'true' || v === 1
const puntos = (v: unknown): Punto[] => arr(v).flatMap((p) => { const a = arr(p); const t = num(a[0]), x = num(a[1]); return t !== null && x !== null ? [[t, x] as Punto] : [] }).sort((a, b) => a[0] - b[0])
const UNIDADES: Unidad[] = ['pct', 'pp', 'usd', 'x', 'num', 'precio', 'texto']
const TONOS: Tono[] = ['pos', 'neg', 'oro', 'neutro']

function cifras(v: unknown, seccion: string, faltan: Map<string, string>): Cifra[] {
  return arr(v).flatMap((c) => {
    const o = obj(c), id = str(o.id) ?? str(o.etiqueta)
    if (!id) return []
    const u = str(o.unidad) as Unidad | null, t = str(o.tono) as Tono | null
    return [{
      id, etiqueta: str(o.etiqueta) ?? id, valor: num(o.valor), unidad: u && UNIDADES.includes(u) ? u : 'num', texto: str(o.texto),
      nota: str(o.nota), tono: t && TONOS.includes(t) ? t : null, signo: bool(o.signo),
      motivo: str(o.motivo) ?? faltan.get(`${seccion}.${id}`) ?? null,
    }]
  })
}

export function adaptarLista(c: unknown): Fila2[] {
  return arr(obj(c).items).flatMap((x) => {
    const o = obj(x), s = str(o.simbolo)
    if (!s) return []
    const sq = str(o.squeeze)
    return [{
      simbolo: s.toUpperCase(), nombre: str(o.nombre) ?? '', precio: num(o.precio), cambio_24h_pct: num(o.cambio_24h_pct),
      vs_btc_7d_pct: num(o.vs_btc_7d_pct), vs_btc_30d_pct: num(o.vs_btc_30d_pct), volumen_cambio_pct: num(o.volumen_cambio_pct),
      oi_cambio_pct: num(o.oi_cambio_pct), funding_pct: num(o.funding_pct), squeeze: sq === 'cargado' || sq === 'ignicion' ? sq : null,
      modos: arr(o.modos).map(String), categoria: str(o.categoria), cap_usd: num(o.cap_usd), operable_bingx: o.operable_bingx !== false,
      posiciones: arr(o.posiciones).map((p) => ({ origen: obj(p).origen === 'caja' ? 'caja' as const : 'pablo' as const, simulado: bool(obj(p).simulado) })),
      gatillos: num(o.gatillos) ?? 0,
    }]
  })
}

export function adaptarFicha(c: unknown): Ficha2 {
  const o = obj(c)
  const nd = arr(o.no_disponibles).flatMap((x) => { const n = obj(x); const donde = [str(n.seccion), str(n.campo)].filter(Boolean).join('.'); const motivo = str(n.motivo); return donde && motivo ? [{ donde, motivo }] : [] })
  const faltan = new Map(nd.map((n) => [n.donde, n.motivo]))
  const vit = obj(o.vitrina)
  const enc = obj(o.encabezado), est = obj(o.estadisticas), mov = obj(o.movimiento), fun = obj(o.fundamento), red = obj(o.redes), onc = obj(o.onchain), opo = obj(o.oportunidad), cmp = obj(o.comparar)
  const perfil = obj(mov.perfil), liq = mov.liquidaciones ? obj(mov.liquidaciones) : null, cal = obj(liq?.calidad), der = mov.derivados ? obj(mov.derivados) : null
  const lado = (v: unknown): 'compra' | 'venta' | 'neutro' => (v === 'compra' || v === 'sale' ? 'compra' : v === 'venta' || v === 'entra' ? 'venta' : 'neutro')
  return {
    activo: (str(o.activo) ?? '').toUpperCase(), nombre: str(o.nombre) ?? '', descripcion: str(o.descripcion) ?? '', categoria: str(o.categoria),
    operable_bingx: o.operable_bingx !== false, perp: bool(o.perp), rango: str(o.rango) ?? '90d', pendiente: bool(o.pendiente),
    reintentar_en_s: num(o.reintentar_en_s), calculado_en: str(vit.calculado_en), viejo: vit.estado === 'viejo',
    encabezado: {
      precio: num(enc.precio), cambio_24h_pct: num(enc.cambio_24h_pct), cifras: cifras(enc.cifras, 'encabezado', faltan),
      posiciones: arr(enc.posiciones).map((p) => { const q = obj(p); return { origen: q.origen === 'caja' ? 'caja' as const : 'pablo' as const, estado: str(q.estado) ?? 'abierta', precio_medio: num(q.precio_medio), pnl_usdt: num(q.pnl_usdt), simulado: bool(q.simulado) } }),
      gatillos: arr(enc.gatillos).map((g) => { const q = obj(g); return { id_corto: str(q.id_corto) ?? '', nivel: num(q.nivel), direccion: str(q.direccion) } }),
      modos: arr(enc.modos).map((m) => { const q = obj(m); return { modo: str(q.modo) ?? '', version: str(q.version) ?? '', estado: str(q.estado) ?? '' } }),
    },
    estadisticas: { cifras: cifras(est.cifras, 'estadisticas', faltan) },
    movimiento: {
      velas: arr(mov.velas).flatMap((v) => { const a = arr(v).map(num); return a[0] !== null && a[1] !== null && a[2] !== null && a[3] !== null && a[4] !== null ? [{ t: a[0]!, o: a[1]!, h: a[2]!, l: a[3]!, c: a[4]!, v: a[5] ?? null }] : [] }).sort((a, b) => a.t - b.t),
      perfil: { niveles: arr(perfil.niveles).flatMap((n) => { const a = arr(n).map(num); return a[0] !== null && a[1] !== null ? [[a[0]!, a[1]!] as [number, number]] : [] }), poc: num(perfil.poc) },
      liquidaciones: liq ? {
        niveles: arr(liq.niveles).flatMap((n) => { const q = obj(n); const p = num(q.precio); if (p === null) return []; return [{ precio: p, desde: num(q.desde) ?? p * 0.997, hasta: num(q.hasta) ?? p * 1.003, lado: q.lado === 'largos' ? 'largos' as const : 'cortos' as const, intensidad: Math.max(0, Math.min(1, num(q.intensidad) ?? 0.3)), monto_usd: num(q.monto_usd), densa: bool(q.densa) }] }),
        calibrado: bool(cal.calibrado), datos: str(cal.datos), vs_azar: num(cal.vs_azar),
      } : null,
      marcas: arr(mov.marcas).flatMap((m) => { const q = obj(m); const t = num(q.t), tipo = str(q.tipo); if (t === null || !tipo) return []; const capa = (str(q.capa) ?? (tipo === 'radar' ? 'radar' : tipo === 'catalizador' ? 'catalizadores' : 'posiciones')) as Capa; return [{ t, tipo: tipo as Marca['tipo'], capa, precio: num(q.precio), etiqueta: str(q.etiqueta) ?? '' }] }),
      niveles: arr(mov.niveles).flatMap((n) => { const q = obj(n); const p = num(q.precio), tipo = str(q.tipo); if (p === null || !tipo) return []; return [{ tipo: tipo as NivelPrecio['tipo'], capa: (str(q.capa) ?? (tipo === 'gatillo' ? 'gatillos' : 'posiciones')) as Capa, precio: p, etiqueta: str(q.etiqueta) ?? '' }] }),
      delta_spot: puntos(mov.delta_spot), delta_futuros: puntos(mov.delta_futuros), interes_abierto: puntos(mov.interes_abierto),
      cifras: cifras(mov.cifras, 'movimiento', faltan), lectura: arr(mov.lectura).flatMap((x) => (str(x) ? [str(x)!] : [])),
      derivados: der ? {
        interes_abierto: puntos(der.interes_abierto),
        funding: arr(der.funding).flatMap((f) => { const a = arr(f).map(num); return a[0] !== null && a[1] !== null ? [{ t: a[0]!, v: a[1]!, intervalo_h: a[2] ?? null }] : [] }),
        liquidaciones: arr(der.liquidaciones).flatMap((f) => { const a = arr(f).map(num); return a[0] !== null ? [{ t: a[0]!, largos: a[1] ?? 0, cortos: a[2] ?? 0 }] : [] }),
        largos_cortos: arr(der.largos_cortos).flatMap((f) => { const a = arr(f).map(num); return a[0] !== null ? [{ t: a[0]!, cuentas: a[1] ?? null, posiciones: a[2] ?? null }] : [] }),
      } : null,
      spec: mov.spec ? obj(mov.spec) : null,
    },
    fundamento: {
      semanas: arr(fun.semanas).flatMap((f) => { const a = arr(f).map(num); return a[0] !== null ? [{ t: a[0]!, fees: a[1] ?? null, revenue: a[2] ?? null, holders: a[3] ?? null }] : [] }),
      cap_base100: puntos(fun.cap_base100), categoria_base100: puntos(fun.categoria_base100), cifras: cifras(fun.cifras, 'fundamento', faltan),
      captura: fun.captura ? (() => { const q = obj(fun.captura); return str(q.clase) ? { clase: str(q.clase)!, mecanismo: str(q.mecanismo), pct_al_token: num(q.pct_al_token), fuente: str(q.fuente) } : null })() : null,
      proyecto: fun.proyecto ? { compilado_en: str(obj(fun.proyecto).compilado_en), lineas: arr(obj(fun.proyecto).lineas).flatMap((l) => { const q = obj(l); return str(q.texto) ? [{ campo: str(q.campo) ?? '', texto: str(q.texto)!, fuente: str(q.fuente), fecha: str(q.fecha) }] : [] }) } : null,
      spec: fun.spec ? obj(fun.spec) : null,
    },
    redes: {
      mercado: cifras(red.mercado, 'redes', faltan),
      menciones: arr(red.menciones).flatMap((f) => { const a = arr(f).map(num); return a[0] !== null ? [{ t: a[0]!, personas: a[1] ?? 0, bots: a[2] ?? 0, granjas: a[3] ?? 0 }] : [] }),
      precio: puntos(red.precio), tono: puntos(red.tono), cifras: cifras(red.cifras, 'redes', faltan),
      quien_habla: arr(red.quien_habla).flatMap((x) => { const q = obj(x); return str(q.cuenta) ? [{ cuenta: str(q.cuenta)!, seguidores: num(q.seguidores), tono: str(q.tono) ?? 'neutro', antes: q.antes === undefined || q.antes === null ? null : bool(q.antes), acierto: str(q.acierto), menciones: num(q.menciones), nota: str(q.nota) }] : [] }),
      granjas: arr(red.granjas).flatMap((x) => { const q = obj(x); return str(q.nombre) ? [{ nombre: str(q.nombre)!, cuentas: num(q.cuentas), nota: str(q.nota) }] : [] }),
      spec: red.spec ? obj(red.spec) : null,
    },
    onchain: {
      cadena: str(onc.cadena), cifras: cifras(onc.cifras, 'onchain', faltan),
      flujo: arr(onc.flujo).flatMap((f) => { const a = arr(f).map(num); return a[0] !== null ? [{ t: a[0]!, entra: a[1] ?? 0, sale: a[2] ?? 0 }] : [] }),
      movimientos: arr(onc.movimientos).flatMap((x) => { const q = obj(x); return str(q.entidad) ? [{ hora: str(q.hora) ?? '', entidad: str(q.entidad)!, accion: str(q.accion) ?? '', monto: str(q.monto) ?? '', lado: lado(q.lado) }] : [] }),
      wallets: arr(onc.wallets).flatMap((x) => { const q = obj(x); return str(q.nombre) ? [{ nombre: str(q.nombre)!, que_hizo: str(q.que_hizo) ?? '', lado: lado(q.lado) }] : [] }),
    },
    oportunidad: {
      escenarios: arr(opo.escenarios).flatMap((x) => { const q = obj(x); return str(q.ref) ? [{ ref: str(q.ref)!, cap_usd: num(q.cap_usd), multiplo: num(q.multiplo), multiplo_fdv: num(q.multiplo_fdv), precio: num(q.precio) }] : [] }),
      cifras: cifras(opo.cifras, 'oportunidad', faltan),
      radar: arr(opo.radar).flatMap((x) => { const q = obj(x); return str(q.modo) ? [{ modo: str(q.modo)!, version: str(q.version) ?? '', cumple: bool(q.cumple), frase: str(q.frase) ?? '' }] : [] }),
    },
    comparar: { btc: puntos(cmp.btc), categoria: puntos(cmp.categoria) },
    no_disponibles: nd,
  }
}
