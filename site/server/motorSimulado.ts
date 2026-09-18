/* ============================================================================
   Simulador del motor. Implementa el contrato (motor.ts) sin gastar:

   - Universo: los informes ya publicados por el motor (RAY, ORCA, SSV) más
     las candidatas del scanner. Fuera de eso, "no la cubrimos".
   - Determinista: se arma con las secciones deterministas del informe real
     cuando existe (riesgo, microestructura, on-chain, fundamentales) o con
     las métricas del scanner. Instantáneo.
   - Profundo: recorre las cinco etapas con tiempos reales (~2,5 min; se
     acelera con VETA_SIM_VELOCIDAD para capturas). El resultado es el
     informe real reproducido, marcado `simulado: true`. DODO termina
     bloqueada por la verificación y STG falla al traer datos: sirven para
     probar que un análisis que no termina no consume cupo.

   Todo lo que este archivo produce lleva `origen_motor: 'simulador'`.
   ========================================================================== */
import { randomBytes } from 'node:crypto'
import { ENV } from './entorno.ts'
import * as contenido from './contenido.ts'
import { rankingScanner } from './votacion.ts'
import { ETAPAS, type Motor, type Moneda, type LecturaDeterminista, type Solicitud, type Progreso, type Etapa, type Bloque } from './motorTipos.ts'

type Reg = Record<string, unknown>
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const s = (v: unknown): string => (typeof v === 'string' ? v : '')

/* ---------- universo ---------- */
function informes(): Reg[] { return contenido.registrosCompilados().filter((r) => r.origen !== 'a_pedido') as Reg[] }
function universo(): Moneda[] {
  const vistos = new Map<string, Moneda>()
  for (const r of informes()) vistos.set(s(r.simbolo), { simbolo: s(r.simbolo), nombre: s(r.nombre), cadena: s(r.cadena) || undefined, con_informe: true })
  for (const c of rankingScanner().candidatas) if (!vistos.has(c.simbolo)) vistos.set(c.simbolo, { simbolo: c.simbolo, nombre: c.nombre, id_coingecko: c.id_coingecko, con_informe: false })
  return [...vistos.values()]
}
const informeDe = (sym: string) => informes().filter((r) => s(r.simbolo) === sym).sort((a, b) => s(b.escrito_en).localeCompare(s(a.escrito_en)))[0] ?? null
const candidataDe = (sym: string) => rankingScanner().candidatas.find((c) => c.simbolo === sym) ?? null

/* ---------- determinista ---------- */
const bloqueVacio = (texto: string): Bloque => ({ lectura: 'sin_dato', texto, fuente: null, cifras: [] })

function deterministaDeInforme(r: Reg): LecturaDeterminista {
  const mic = (r.microestructura ?? {}) as Reg, rie = (r.riesgo ?? {}) as Reg, on = (r.onchain ?? {}) as Reg, fun = (r.fundamentales ?? {}) as Reg
  const niv = (r.niveles ?? {}) as Record<string, { esencial?: { texto?: string } }>
  const ficha = (r.ficha_esencial ?? {}) as Reg
  const precio = (ficha.precio_y_fecha_referencia ?? {}) as Reg
  const cond = ((mic.condiciones_perp_driven ?? []) as { nombre: string; cumple: boolean; detalle: string }[])
  const lecturaMic = s(mic.lectura)
  const demanda: LecturaDeterminista['demanda'] = mic.dato === 'ausente' ? { ...bloqueVacio(s(mic.motivo) || 'No hay datos de futuros para leer si el precio lo mueve el apalancamiento.'), lectura: 'sin_dato', condiciones: [] } : {
    lectura: lecturaMic === 'spot_driven' ? 'demanda_real' : lecturaMic === 'perp_driven' ? 'apalancamiento' : 'mixta',
    texto: niv.microestructura?.esencial?.texto || (lecturaMic === 'spot_driven' ? 'El precio lo mueve la compra real en spot, no el apalancamiento de futuros.' : 'El precio lo mueven las posiciones apalancadas: puede caer de golpe cuando se liquidan.'),
    fuente: 'binance:futures + spot', condiciones: cond,
    cifras: [{ k: 'futuros sobre spot', v: n(mic.fs_7d) ?? n(mic.fs), unidad: '×' }, { k: 'posiciones abiertas / valor', v: n(mic.oi_mcap) === null ? null : (n(mic.oi_mcap)! * 100), unidad: '%' }, { k: 'funding (percentil)', v: n(mic.funding_percentil), unidad: 'p' }, { k: 'liquidez spot / posiciones', v: n(mic.liquidez_spot_sobre_oi), unidad: '×' }],
  }
  const cvar7 = n(rie.cvar95_7d)
  const riesgo: LecturaDeterminista['riesgo_cola'] = cvar7 === null ? { ...bloqueVacio('No hay serie de precios suficiente para medir la cola.'), lectura: 'sin_dato' } : {
    lectura: cvar7 < 0.2 ? 'contenida' : cvar7 < 0.4 ? 'alta' : 'extrema',
    texto: niv.riesgo?.esencial?.texto || `En una semana mala de cada veinte, la caída media ronda el ${(cvar7 * 100).toFixed(0)} %.`,
    fuente: s(rie.fuente) || null,
    cifras: [{ k: 'caída 1 de cada 20 días', v: n(rie.var95_1d) === null ? null : n(rie.var95_1d)! * 100, unidad: '%' }, { k: 'si pasa, cae en promedio', v: n(rie.cvar95_1d) === null ? null : n(rie.cvar95_1d)! * 100, unidad: '%' }, { k: 'semana mala (1 de 20)', v: cvar7 * 100, unidad: '%' }, { k: 'peor día reciente', v: n(rie.peor_dia_ventana) === null ? null : n(rie.peor_dia_ventana)! * 100, unidad: '%' }],
  }
  const top10 = n(on.concentracion_top10_neta)
  const concentracion: LecturaDeterminista['concentracion'] = top10 === null ? { ...bloqueVacio(s(on.nota_cota) || 'No se pudo medir quién tiene el token.'), lectura: 'sin_dato' } : {
    lectura: top10 < 0.2 ? 'dispersa' : top10 < 0.45 ? 'concentrada' : 'muy_concentrada',
    texto: niv.onchain?.esencial?.texto || s(on.lectura),
    fuente: s(((on.entidades_etiquetadas ?? {}) as Reg).fuente) || null,
    cifras: [{ k: 'diez mayores (neto)', v: top10 * 100, unidad: '%' }, { k: 'cincuenta mayores', v: n(on.concentracion_top50) === null ? null : n(on.concentracion_top50)! * 100, unidad: '%' }, { k: 'direcciones con nombre', v: n(((on.entidades_etiquetadas ?? {}) as Reg).n_etiquetadas) }, { k: 'sin identificar', v: n(((on.entidades_etiquetadas ?? {}) as Reg).n_sin_etiquetar) }],
  }
  const cap = (fun.mecanismo_captura ?? {}) as Reg
  const unl = (fun.unlocks ?? {}) as Reg
  const tokenomics: LecturaDeterminista['tokenomics'] = {
    lectura: cap.existe && fun.captura_verificada ? 'captura_verificada' : cap.existe ? 'captura_declarada' : 'sin_captura',
    texto: niv.fundamentales?.esencial?.texto || s(cap.descripcion),
    fuente: s(cap.fuente_url) || null,
    cifras: [{ k: 'ingresos / valor (anual)', v: n(fun.revenue_sobre_mcap) === null ? null : n(fun.revenue_sobre_mcap)! * 100, unidad: '%' }, { k: 'ingresos 30 días', v: n(fun.revenue_protocolo_30d), unidad: 'USD' }, { k: 'capital depositado', v: n(fun.tvl), unidad: 'USD' }, { k: 'próximo desbloqueo', v: unl.encontrado ? s(unl.fecha) : 'ninguno encontrado' }],
  }
  const liq2 = n(mic.liquidez_spot_2pct_usd)
  const liquidez: LecturaDeterminista['liquidez'] = liq2 === null ? { ...bloqueVacio('No se pudo medir la profundidad del libro.'), lectura: 'sin_dato' } : {
    lectura: liq2 > 2_000_000 ? 'profunda' : liq2 > 300_000 ? 'suficiente' : 'fina',
    texto: `Se pueden mover unos ${Math.round(liq2 / 1000)} mil USD sin correr el precio más de un 2 %.`,
    fuente: 'binance:spot depth ±2%', cifras: [{ k: 'libro a ±2 %', v: liq2, unidad: 'USD' }],
  }
  const advertencias = [...((rie.advertencias ?? []) as Reg[]), ...((mic.advertencias ?? []) as Reg[]), ...((on.advertencias ?? []) as Reg[]), ...((fun.advertencias ?? []) as Reg[])] as LecturaDeterminista['advertencias']
  const fuentes = ((r.fuentes ?? []) as LecturaDeterminista['fuentes']).filter((f) => /riesgo|micro|onchain|fundament|precio|liquidez/i.test(f.campo)).slice(0, 24)
  return { nivel: 'determinista', origen_motor: 'simulador', simbolo: s(r.simbolo), nombre: s(r.nombre), cadena: s(r.cadena) || null, id_coingecko: null, fecha_datos: s(r.escrito_en), precio_usd: n(precio.precio_usd), demanda, riesgo_cola: riesgo, concentracion, tokenomics, liquidez, advertencias, fuentes }
}

function deterministaDeCandidata(c: NonNullable<ReturnType<typeof candidataDe>>): LecturaDeterminista {
  const m = c.metricas as Record<string, number | string | null | undefined>
  const num_ = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : null)
  const rot = num_('rotacion_diaria'), rev = num_('revenue_anual_sobre_mcap'), fdv = num_('fdv_sobre_mcap'), circ = num_('circulante_sobre_total'), tvl = num_('tvl_usd'), mcap = num_('mcap_usd'), vol = num_('vol24h_usd')
  const sinPerp = 'Sin datos de futuros en esta pasada: no se puede decir si el precio lo mueve el apalancamiento. El análisis profundo los trae.'
  return {
    nivel: 'determinista', origen_motor: 'simulador', simbolo: c.simbolo, nombre: c.nombre, cadena: null, id_coingecko: c.id_coingecko ?? null, fecha_datos: rankingScanner().corrida?.generado ?? '', precio_usd: null,
    demanda: { lectura: 'sin_dato', texto: sinPerp, fuente: null, condiciones: [], cifras: [{ k: 'rotación diaria', v: rot === null ? null : rot * 100, unidad: '%' }] },
    riesgo_cola: { lectura: 'sin_dato', texto: 'La cola de caídas se mide con la serie diaria de precios; el escaneo no la trae.', fuente: null, cifras: [{ k: '7 días', v: num_('cambio_7d_pct'), unidad: '%' }, { k: '30 días', v: num_('cambio_30d_pct'), unidad: '%' }] },
    concentracion: { lectura: 'sin_dato', texto: 'Quién tiene el token se lee on-chain en el análisis profundo.', fuente: null, cifras: [] },
    tokenomics: { lectura: rev !== null && rev > 0 ? 'captura_declarada' : 'sin_dato', texto: rev !== null && rev > 0 ? `El protocolo factura el equivalente al ${(rev * 100).toFixed(1)} % de lo que vale por año. Falta verificar si el token cobra parte de esa caja.` : 'No hay ingresos medidos para este protocolo.', fuente: 'defillama', cifras: [{ k: 'ingresos / valor (anual)', v: rev === null ? null : rev * 100, unidad: '%' }, { k: 'valor total / circulante', v: fdv, unidad: '×' }, { k: 'en circulación', v: circ === null ? null : circ * 100, unidad: '%' }, { k: 'capital depositado', v: tvl, unidad: 'USD' }] },
    liquidez: { lectura: vol === null ? 'sin_dato' : vol > 50_000_000 ? 'profunda' : vol > 5_000_000 ? 'suficiente' : 'fina', texto: vol === null ? 'Sin volumen medido.' : `Movió ${Math.round(vol / 1e6)} millones de USD en 24 h${mcap ? `, un ${((vol / mcap) * 100).toFixed(0)} % de lo que vale` : ''}.`, fuente: 'coingecko', cifras: [{ k: 'volumen 24 h', v: vol, unidad: 'USD' }, { k: 'vale', v: mcap, unidad: 'USD' }] },
    advertencias: [{ tipo: 'dato_ausente', severidad: 'LIMITA_LECTURA', seccion: 'demanda', texto: 'Lectura parcial: esta moneda sólo pasó por el escaneo, no por el análisis completo.', campo_afectado: 'microestructura' }],
    fuentes: (c.disparadores ?? []).map((d) => ({ campo: d.disparador, fuente: d.fuente, timestamp: rankingScanner().corrida?.generado ?? '', calidad: 'parcial' })),
  }
}

/* ---------- profundo: la máquina de etapas ---------- */
const DURACION: Record<Etapa, number> = { recolectando: 28, calculando: 24, esceptico: 42, redactando: 38, verificando: 22 } // segundos a velocidad 1
const DETALLES: Record<Etapa, string[]> = {
  recolectando: ['precio y volumen diario, 500 días', 'futuros: posiciones abiertas, funding, largos contra cortos', 'ingresos y capital depositado del protocolo', 'quién tiene el token: las cincuenta direcciones mayores', 'desbloqueos programados y código publicado'],
  calculando: ['cola de caídas: cuánto cae en un día malo de cada veinte', 'las dos varas: comparables por ingresos y máximos propios', 'concentración neta, sin contar los contratos del protocolo', 'condiciones del tier de riesgo'],
  esceptico: ['buscando la lectura contraria a la tesis', 'revisando si los comparables son comparables', 'preguntando si el catalizador tiene fecha', 'objeción: ¿la caja llega al token o se queda en el protocolo?'],
  redactando: ['una línea de tesis, sin adjetivos', 'escenarios con rango y horizonte', 'qué la invalidaría, en una condición medible', 'advertencias, por severidad'],
  verificando: ['reconsultando doce cifras contra su fuente', 'comprobando que ninguna fuente esté vencida', 'sello'],
}
interface Trabajo { s: Solicitud; inicio: number; p: Progreso; plan: { etapa: Etapa; desde: number; hasta: number }[]; final: 'listo' | 'bloqueado' | 'fallido'; fallaEn?: Etapa }
const trabajos = new Map<string, Trabajo>()
const hex = () => randomBytes(3).toString('hex')

function armarPlan(): Trabajo['plan'] {
  let t = 0; const v = Math.max(0.05, ENV.SIM_VELOCIDAD)
  return ETAPAS.map((etapa) => { const d = (DURACION[etapa] * (0.85 + Math.random() * 0.3)) / v; const p = { etapa, desde: t, hasta: t + d }; t += d; return p })
}

function resultadoProfundo(sol: Solicitud, r: Reg): Reg {
  const hoy = new Date().toISOString()
  return {
    ...r,
    id: `AP-${sol.simbolo}-${hoy.slice(0, 10).replace(/-/g, '')}-${hex()}`,
    tipo: 'analisis', origen: 'a_pedido', version_registro: 1, escrito_en: hoy, fecha_publicacion: hoy.slice(0, 10),
    solicitud: { id: sol.id, usuario_email: sol.usuario?.email ?? null, nivel: 'profundo' },
    simulado: true, origen_motor: 'simulador',
    // el sello editorial no lo pone el motor ni la web: sólo la bandeja
    apto_para_gemas: false, estado_seguimiento: 'sin_seguimiento',
  }
}

function avanzar(t: Trabajo, ahoraMs: number) {
  if (t.p.estado !== 'en_curso') return
  const seg = (ahoraMs - t.inicio) / 1000
  const iso = new Date(ahoraMs).toISOString()
  t.p.actualizado = iso
  const total = t.plan[t.plan.length - 1].hasta
  const actual = t.plan.find((x) => seg < x.hasta) ?? null
  t.p.etapas_hechas = t.plan.filter((x) => seg >= x.hasta).map((x) => x.etapa)
  // ¿falla o bloquea en esta etapa?
  if (t.final !== 'listo' && t.fallaEn && (actual?.etapa === t.fallaEn ? seg > (actual.desde + actual.hasta) / 2 : t.p.etapas_hechas.includes(t.fallaEn))) {
    t.p.estado = t.final; t.p.etapa = t.fallaEn; t.p.avance = null; t.p.terminado = iso
    t.p.costo_real_usd = Number((ENV.COSTO_ESTIMADO_USD * (t.final === 'bloqueado' ? 0.9 : 0.15)).toFixed(2))
    if (t.final === 'bloqueado') { t.p.verificador = { estado: 'bloqueado', motivo_bloqueo: 'dos cifras del informe no coinciden con su fuente (ingresos 30 d y concentración top-10)' }; t.p.detalle = 'La verificación no dejó pasar el informe.' }
    else { t.p.fallo = { codigo: 'fuente_caida', texto: 'La fuente de datos on-chain no respondió y no se inventa lo que falta.' }; t.p.detalle = 'No se pudieron traer los datos.' }
    return
  }
  if (!actual || seg >= total) {
    t.p.estado = 'listo'; t.p.etapa = null; t.p.avance = 1; t.p.terminado = iso; t.p.detalle = 'Listo.'
    t.p.costo_real_usd = Number((ENV.COSTO_ESTIMADO_USD * (0.8 + Math.random() * 0.4)).toFixed(2))
    t.p.verificador = { estado: 'pasa', motivo_bloqueo: '' }
    const r = informeDe(t.s.simbolo)
    t.p.resultado = r ? resultadoProfundo(t.s, r) : null
    if (!t.p.resultado) { t.p.estado = 'fallido'; t.p.fallo = { codigo: 'sin_cobertura', texto: 'Simulación: sólo se reproducen análisis ya hechos (RAY, ORCA, SSV).' } }
    return
  }
  t.p.etapa = actual.etapa
  const f = (seg - actual.desde) / (actual.hasta - actual.desde)
  t.p.avance = Math.max(0, Math.min(1, f))
  const ds = DETALLES[actual.etapa]; t.p.detalle = ds[Math.min(ds.length - 1, Math.floor(f * ds.length))]
}

export const motor: Motor = {
  nombre: 'simulador',
  async universo() { return universo() },
  async determinista(simbolo) {
    const sym = simbolo.toUpperCase()
    const r = informeDe(sym); if (r) return deterministaDeInforme(r)
    const c = candidataDe(sym); if (c) return deterministaDeCandidata(c)
    return null
  },
  async solicitarProfundo(sol) {
    const sym = sol.simbolo.toUpperCase()
    const conInforme = !!informeDe(sym); const cand = candidataDe(sym)
    if (!conInforme && !cand) throw new Error('no_encontrada')
    const inicio = Date.now()
    const final: Trabajo['final'] = sym === 'DODO' ? 'bloqueado' : sym === 'STG' ? 'fallido' : conInforme ? 'listo' : 'fallido'
    const t: Trabajo = {
      s: sol, inicio, plan: armarPlan(), final, fallaEn: final === 'bloqueado' ? 'verificando' : final === 'fallido' ? (sym === 'STG' ? 'recolectando' : 'calculando') : undefined,
      p: { solicitud_id: sol.id, estado: 'en_curso', etapa: 'recolectando', avance: 0, detalle: DETALLES.recolectando[0], etapas_hechas: [], iniciado: new Date(inicio).toISOString(), actualizado: new Date(inicio).toISOString(), terminado: null, costo_real_usd: null, resultado: null, fallo: null, verificador: null },
    }
    if (final === 'fallido' && !cand && !conInforme) t.fallaEn = 'recolectando'
    if (final === 'fallido' && sym !== 'STG') { t.fallaEn = 'calculando' }
    trabajos.set(sol.id, t)
  },
  async progreso(id) {
    const t = trabajos.get(id); if (!t) return null
    avanzar(t, Date.now())
    if (t.p.estado === 'fallido' && t.p.fallo?.codigo === 'fuente_caida' && t.s.simbolo.toUpperCase() !== 'STG') t.p.fallo = { codigo: 'sin_cobertura', texto: 'Simulación: sólo se reproducen análisis ya hechos (RAY, ORCA, SSV); esta moneda sólo pasó por el escaneo.' }
    return JSON.parse(JSON.stringify(t.p)) as Progreso
  },
}
