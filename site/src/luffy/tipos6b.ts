/* ============================================================================
   Fase 6b: las formas de CONTRATO-PANEL.md v2.1, §8 (terminal, cartera,
   exchange, radar, control, oficina, informes), tal cual las sirve
   /api/luffy/*. Si el contrato cambia, se ajusta aquí y en el simulador
   (server/luffySimulado.ts), no en las pantallas.
   ========================================================================== */
import type { Propuesta, Spec } from './tipos'

export type Num = number | null

/* ---------- 8.1 terminal ---------- */
export type Filtro = 'mis_posiciones' | 'caja' | 'candidatas' | 'vigilancia' | 'gatillos' | 'todo'
export type Squeeze = 'cargado' | 'ignicion' | null
export interface Catalizador { fecha: string; dias: number | null; titulo: string; tipo: 'agenda' | 'listado' | 'votacion' | string; fuente?: string; url?: string; estado?: string; impacto?: string }
export interface UniversoFila {
  simbolo: string; par: string; nombre: string | null
  precio: Num; cambio_24h_pct: Num; vs_btc_7d_pct: Num; vs_btc_30d_pct: Num; volumen_24h_usdt: Num
  modos_hoy: string[]; squeeze: Squeeze
  posiciones: { origen: string; cantidad: number; pnl_no_realizado_pct: Num; simulado: boolean; mandato: string }[]
  gatillos: number; vigilancia: boolean; candidata_hoy: boolean
  proximo_catalizador: Pick<Catalizador, 'fecha' | 'titulo' | 'tipo' | 'dias'> | null
  hora_precio: string | null
}
export interface Universo { filtro: Filtro; q: string | null; n: number; activos: UniversoFila[]; fuentes: Record<string, string>; consultado_en: string; fuente: string }

export interface SeccionFicha { id: 'precio' | 'derivados' | 'fundamento' | 'atencion' | string; titulo: string; plantilla: string; version: string; spec: Spec }
/** v2.2: `etiqueta` y `frase` en llano son lo que se muestra; `detalle` llega vacío y lo técnico va en `detalle_tecnico` (sólo laboratorio). */
export interface Familia { valor: number | string | null; z: Num; cumple: boolean; cumple_inverso: boolean; etiqueta: string; frase?: string | null; detalle: Record<string, unknown>; detalle_tecnico?: Record<string, unknown>; motivo: string | null }
/** v2.2: siempre listas. Antes `obligatorias` pudo llegar como objeto y la ficha se rompía: se lee con `lista()`. */
export interface Confluencia { cumple?: boolean; score: number; obligatorias: string[]; obligatorias_todas?: string[]; obligatorias_faltan?: string[]; apoyo: string[]; apoyo_todas?: string[]; n_apoyo: number; minimo_apoyo?: number | null; sin_dato?: string[] }
/** v2.2: toda respuesta de la sección 8 servida desde la vitrina trae su hora. `viejo` = se recalcula en el fondo. */
export interface Vitrina { calculado_en: string | null; edad_s: number | null; cada_s: number | null; estado: 'fresco' | 'viejo' | 'pendiente' | string; duracion_ms: number | null; error: string | null }
export interface EtiquetaRiesgo { etiqueta: string; fuerte: boolean; detalle: string; llano: string }
export interface ModoCumplido { modo: string; version: string; confluencia: Confluencia; linea_estudio: string | null; candidata_id: number | null; decision: string; p_merece: Num }
export interface FichaRadar { familias: Record<string, Familia>; modos_cumplidos: ModoCumplido[]; etiquetas: EtiquetaRiesgo[]; regimen: { lectura: string; detalle?: string } | null; consultado_en: string; fuente: string }
export interface Bitacora { id: string; fecha: string; activo?: string | null; tipo: string; origen?: string; mandato?: string | null; tesis: string; cifras?: Record<string, unknown>; agentes_consultados?: string[]; resultado: string | null; cerrada?: string | null; modo?: string | null; modo_version?: string | null; hilo_id?: string | null; orden_id?: string | null }
export interface Teoria { id: string; titulo: string; hipotesis: string; razonamiento?: string; como_probar?: string; evidencia_favor?: { texto: string; fuente?: string; hora?: string }[]; evidencia_contra?: { texto: string; fuente?: string; hora?: string }[]; estado: string; confianza: string | null; activos: string[]; creada?: string; revisada?: string | null; hilo_origen?: string | null }
export interface PosicionHistorial {
  activo: string; origen: string; estado: string; simulado?: boolean; mandato: string; cantidad: number; precio_medio: number
  stop_vigente: { precio: number; cantidad: number; orden_id?: string } | null
  entradas: { t: number; hora: string; precio: number; cantidad: number; usdt: number; declarada?: boolean; id_corto?: string }[]
  salidas: { t: number; hora: string; precio: number; cantidad: number; usdt: number; pnl_usdt: number; id_corto?: string }[]
  stops: { t: number; hora: string; precio: number; accion: string; id_corto?: string }[]
  pnl_realizado_usdt?: number
}
export interface Gatillo {
  id: number; id_corto: string; texto: string; condicion: string; accion: string; avisar: boolean
  vigilancia: { cuentas?: string[]; activos?: string[]; exchanges?: string[]; palabras?: string[]; precio?: { activo: string; nivel: number; direccion: 'sube' | 'baja' } }
  estado: 'activo' | 'pausado' | 'cumplido' | 'cancelado'; hilo_id: string | null; en_curso: string | null; ultimo_despertar: string | null
  despertares: number; resultado: string | null; creado: string; actualizado: string; cumplido_en: string | null; cada_min: number
}
export interface FichaTerminal {
  activo: string; par: string; nombre: string | null; rango: string
  precio: { ultimo: Num; cambio_24h_pct: Num; hora: string | null; fuente: string }
  secciones: SeccionFicha[]; radar: FichaRadar | null; catalizadores: Catalizador[]; bitacora: Bitacora[]; teorias: Teoria[]
  posiciones: PosicionHistorial[]; gatillos: Gatillo[]; hilos: { id: string; titulo: string; actualizado: string }[]
  no_disponibles: { seccion: string; motivo: string }[]; consultado_en: string; fuente: string
  /** v2.2: ficha parcial que aún no se calculó; se vuelve a pedir a los `reintentar_en_s`. */
  pendiente?: boolean; reintentar_en_s?: number; vitrina?: Vitrina
}
export interface HiloTerminal { hilo_id: string; titulo: string; nuevo: boolean }

/* ---------- 8.2 cartera y exchange ---------- */
export interface StopCartera { precio: number; distancia_pct: Num; orden_id: string | null; cantidad: Num }
export interface PosicionCartera {
  activo: string; origen: string; mandato: string; declarada?: boolean; simulado: boolean
  cantidad: number; precio_medio: number; costo_usdt: number; precio_actual: Num; valor_usdt: Num
  pnl_no_realizado_usdt: Num; pnl_no_realizado_pct: Num; pnl_realizado_usdt: number; comisiones_usdt?: number
  stop: StopCartera | null; sin_stop: boolean; peso_pct: Num; abierta_en: string; tesis?: string | null; invalidacion?: string | null; hilo_id?: string | null; fuente?: string
}
export interface CerradaReciente { activo: string; origen: string; mandato: string; abierta_en: string; cerrada_en: string | null; pnl_realizado_usdt: number; comisiones_usdt: number; costo_usdt: number; motivo_cierre: string | null }
export interface Cartera {
  origen: 'pablo' | 'caja'; simulado: boolean
  capital: { declarado_usdt?: Num; capital_asignado_usdt?: Num; efectivo_usdt: number; valor_posiciones_usdt: number; valor_total_usdt: number; exposicion_pct: number; fuente: string }
  posiciones: PosicionCartera[]; cerradas_recientes: CerradaReciente[]
  pnl: { realizado_total_usdt: number; no_realizado_total_usdt: number; comisiones_total_usdt: number; desde: string | null }
  mision?: Mision | null; consultado_en: string; fuente: string
}
export interface Movimiento { id: number; fecha: string; usdt: number; tipo: 'aporte' | 'retiro'; nota: string | null; origen: string }
export interface CurvaCapital {
  origen: string; rango: string
  puntos: { t: number; fecha: string; valor_total_usdt: number; aportes_acum_usdt: number; rendimiento_usdt: number; rendimiento_pct: number; drawdown_pct: number }[]
  movimientos: Movimiento[]
  resumen: { desde: string | null; valor_inicial_usdt: Num; valor_final_usdt: Num; rendimiento_usdt: Num; rendimiento_pct: Num; max_drawdown_pct: Num; aportes_usdt: number; retiros_usdt: number } | null
  no_disponibles?: { motivo: string }[]; consultado_en: string; fuente: string
}
export interface Declaracion { activo: string; cantidad: number; precio_medio: number; fecha: string; mandato: string; tesis?: string; invalidacion?: string; origen?: string }
export interface OrdenExchange {
  id: string; par: string; lado: string; tipo: string; estado: string; precio: Num; precio_stop: Num; cantidad: number; ejecutada: number
  total_usdt: number; precio_promedio: Num; comision: number; hora: string; client_id: string | null
  propuesta: { id_corto: string; accion: string; origen: string; rol: 'orden' | 'stop' | 'tramo' } | null
}
export interface Ordenes { estado: 'abiertas' | 'historial'; ordenes: OrdenExchange[]; consultado_en: string; fuente: string }
/** `comision` llega como la da BingX: negativa y en el activo que cobró (−2,23 WAL). */
export interface Fill { id: string; orden_id: string; par?: string; lado: string; precio: number; cantidad: number; total_usdt: number; comision: number; comision_activo: string | null; maker: boolean; hora: string; propuesta: { id_corto: string; origen: string; accion?: string; rol?: string } | null }
/** v2.2: sin `par` trae los de todos los pares con posición u órdenes en 30 días (`pares`), más nuevos primero. */
export interface Fills { par: string | null; pares?: string[]; fills: Fill[]; no_disponibles?: { par?: string; motivo: string }[]; consultado_en: string; fuente: string; vitrina?: Vitrina }
export interface Comisiones { periodo: { desde: string; hasta: string }; origen: string; total_usdt: number; n_fills: number; por_activo: { activo: string; comision_usdt: number; n_fills: number; volumen_usdt: number }[]; tasas: { par: string; maker_pct: number; taker_pct: number }[]; consultado_en: string; fuente: string }
export type AccionExchange =
  | { accion: 'entrada'; par: string; mandato: 'hold' | 'swing' | 'trade'; tipo: 'market' | 'limit'; cantidad_usdt: number; precio?: number; stop?: number; tesis: string }
  | { accion: 'cerrar'; par: string; pct_posicion: number; tipo: 'market' | 'limit'; precio?: number; razon: string }
  | { accion: 'mover_stop'; par: string; stop: number; afloja: boolean; razon: string }
  | { accion: 'cancelar'; orden_id?: string; id_corto?: string; razon: string }
  | { accion: 'modificar'; orden_id: string; precio?: number; cantidad?: number; razon: string }
  | { accion: 'cambio_mandato'; par: string; mandato: 'hold' | 'swing' | 'trade'; stop?: number; invalidacion?: string; razon: string }
export interface RespuestaPropuestas { propuestas: Propuesta[]; propuesta: Propuesta; hilo_id: string }

/* ---------- 8.3 radar ---------- */
export interface Seguimiento { fecha: string; ret_pct: Num; ret_btc_pct: Num; exceso_pct: Num }
export interface Candidata {
  id: number; fecha: string; activo: string; modo: string; version: string; score: number; rango: number; decision: string; p_merece: Num; por_que: string | null
  precio_ref: Num; btc_ref?: Num; confluencia: Confluencia; familias: Record<string, Pick<Familia, 'valor' | 'z' | 'cumple'> & { etiqueta?: string; frase?: string | null; cumple_inverso?: boolean; detalle?: Record<string, unknown>; inverso?: boolean; motivo?: string | null }>
  etiquetas: EtiquetaRiesgo[]; regimen: string | { lectura?: string } | null; corrida_ts: string | null; hilo_id: string | null; seguimiento: Record<string, Seguimiento>; linea_estudio: string | null
}
export interface Candidatas { desde: string; hasta: string; modo: string | null; candidatas: Candidata[]; consultado_en: string; fuente: string }
export interface RendimientoHorizonte { n: number; cobertura_pct: Num; exceso_medio_pct: Num; mediana_pct: Num; acierto_pct: Num }
export interface Modo {
  id: string; version: string; estado: 'propuesto' | 'activo' | 'retirado'; origen: string; hipotesis: string
  familias_obligatorias: string[]; apoyo: { familias: string[]; minimo: number }; etiquetas_relevantes: string[]
  regimen: string; horizontes_dias: number[]; cadencia: string; invalidacion: string | null; universo: Record<string, unknown>; motivo: string | null; creado_en: string
  estudio: { estado: string; resumen: string } | null; linea_estudio: string | null
  rendimiento_vivo: { emitidas: number; descartadas: number; primera: string | null; ultima: string | null; horizontes: Record<string, RendimientoHorizonte> } | null
}
export interface Modos { modos: Modo[]; familias: string[]; historia_propia: Record<string, unknown>; regimen: { lectura: string } | null; consultado_en: string; fuente: string }

/* ---------- 8.4 control ---------- */
export interface Mision {
  id: string; estado: string; objetivo: string; objetivo_pct: Num; avance_pct: Num; falta_pct: Num; horizonte: string | null; tiempo_restante: { dias: number; vencida: boolean } | null
  perdida_max_pct: Num; perdida_max_usdt: Num; perdida_actual_usdt: Num; riesgo_por_operacion_pct: Num; universo_permitido: string[]; universo_vetado: string[]
  permite_sin_stop: boolean; cerrar_al_perder: boolean; presupuesto_api_usd: Num; gasto_api_usd: Num; max_ordenes_dia: Num; capital_inicial_usdt: Num
  simulado: boolean; plan: string | null; hilo_id: string | null; motivo_pausa: string | null; activada_en: string | null
}
export interface Caja {
  estado: {
    capital_asignado_usdt: number; efectivo_usdt: number; valor_posiciones_usdt: number; valor_total_usdt: number; pnl_realizado_usdt: number; pnl_no_realizado_usdt: number
    pnl_total_pct: Num; ordenes_hoy: number; simulado: boolean; exchange: string
    posiciones: { activo: string; mandato: string; cantidad: number; precio_medio: number; precio_actual: Num; valor_usdt: Num; pnl_no_realizado_usdt: Num; pnl_no_realizado_pct: Num; stop_precio: Num; stop_orden_id: string | null; distancia_stop_pct: Num; sin_stop: boolean; tesis: string | null; abierta_en: string }[]
    consultado_en: string; fuente: string
  }
  mision: Mision | null
  decisiones: { fecha: string; activo: string; tipo: string; accion: 'entrar' | 'salir' | 'mover_stop' | 'quitar_stop' | 'esperar' | 'pausa' | 'fin_mision' | string; tesis: string; cifras: Record<string, unknown>; orden: { id_corto: string; estado: string } | null; modo?: string | null; modo_version?: string | null; hilo_id?: string | null }[]
  ciclos: { ultimo: string | null; cada_h: number; proximo: string | null; sin_novedades_seguidos: number } | null
  rendimiento: Record<string, unknown> | null
  consultado_en: string; fuente: string
}
export interface Manual {
  vigente: { id: number; version: string; origen?: string; resumen?: string; creada: string; texto: string } | null
  versiones: { id: number; version: string; origen: string; resumen: string; vigente: boolean; creada: string }[]
  propuestas_pendientes: { id: number; revision_id: number | null; seccion: string; texto_nuevo: string; motivo: string; creada: string }[]
  consultado_en: string; fuente: string
}
export interface DiffManual { desde: string; hasta: string; unificado: string }
export interface CostoAmpliado {
  desde: string; costo_usd: number; luffy_usd?: number; total_usd?: number
  jev?: { costo_usd: number; llamadas: number; por_proposito?: { proposito: string; modelo: string; n: number; costo_usd: number }[]; por_modelo?: { modelo: string; n: number; costo_usd: number }[] }
  por_modelo?: { modelo: string; costo_usd: number; n: number }[]; respuestas?: number
  presupuesto?: { presupuesto_api_usd: number; aviso_usd: number; degradar_usd: number }
  por_tipo?: { tipo_turno: string; etiqueta: string; n: number; costo_usd: number; promedio_usd: number; iteraciones: Num }[]
  por_dia?: { dia: string; luffy_usd: number; jev_usd: number; total_usd: number; turnos: number }[]
  agentes?: { quien: string; n: number; costo_usd: number }[]
  /** El contrato dice {turnos, reescritos, tasa_pct, costo_usd}; el servidor manda {turnos, reescrituras, porcentaje, costo_extra_usd, lectura}: se leen los dos. */
  estilo?: { turnos: number; reescritos?: number; reescrituras?: number; tasa_pct?: number; porcentaje?: number; costo_usd?: number; costo_extra_usd?: number; lectura?: string }
  umbrales?: { presupuesto_api_usd: number; aviso_usd: number; degradar_usd: number; estado: 'normal' | 'aviso' | 'degradado' }
}
export interface AlertaFeed { id: number; clave: string; tipo: string; activo: string | null; severidad: 'alta' | 'media' | 'baja' | string; texto: string; valor: Num; datos: Record<string, unknown>; enviada_en: string; canal: string; atendida: boolean }
export interface FeedAlertas { items: AlertaFeed[]; siguiente: number | null; tipos: string[]; consultado_en: string; fuente: string }

/* ---------- 8.5 oficina ---------- */
export type EstadoFuente = 'al_dia' | 'atrasada' | 'caida' | 'apagada' | 'sin_datos'
export interface Oficina {
  luffy: { en_curso: { hilo_id: string; titulo: string; desde: string; modo: string; canal: string }[]; ultimo_turno: string | null; turnos_24h: number; costo_24h_usd: number }
  agentes: { nombre: string; etiqueta?: string; ultima_actividad: string | null; llamadas_24h: number; costo_24h_usd: number; en_curso: boolean }[]
  fuentes: { nombre: string; etiqueta?: string; estado: EstadoFuente; ultima_lectura?: string | null; detalle?: string }[]
  trabajos: { nombre: string; etiqueta?: string; cada: string; ultima?: string | null; proxima?: string | null; estado?: string }[]
  eventos_ultimo_id?: number | null; consultado_en: string; fuente: string
}
interface EvBase { id: number; hora: string; proceso: 'api' | 'bot' | 'monitor' | 'social' | string }
export type EventoOficina = EvBase & (
  | { tipo: 'latido' }
  | { tipo: 'turno_abierto'; hilo_id: string; quien: string; modo: string; origen: string; canal: string }
  | { tipo: 'turno_cerrado'; hilo_id: string; tipo_turno: string; modelo: string; costo_usd: number; herramientas: number; duracion_s: number; mensaje_id: number | null }
  | { tipo: 'agente_convocado'; agente: string; hilo_id: string | null }
  | { tipo: 'agente_terminado'; agente: string; costo_usd: number; duracion_s: number; ok: boolean }
  | { tipo: 'herramienta'; nombre: string; quien: string; ok: boolean; duracion_s: number; fuente: string | null }
  | { tipo: 'jev'; proposito: string; n: number; costo_usd: number; modelo: string }
  | { tipo: 'fuente_leida'; fuente: string; n: number; ok: boolean; detalle?: string }
  | { tipo: 'radar_ciclo'; modo: string; n_evaluados: number; n_candidatas: number; duracion_s: number }
  | { tipo: 'caja_ciclo'; motivo: string; corrio: boolean; propuestas: number; costo_usd: number }
  | { tipo: 'reconciliacion'; origen: string; discrepancias: number; eventos: number }
  | { tipo: 'alerta'; alerta_id: number; tipo_alerta?: string; activo: string | null; severidad: string }
  | { tipo: 'propuesta'; id_corto: string; accion: string; par: string; estado: string; origen: string }
  | { tipo: 'orden'; id_corto: string; accion: string; estado: string; origen: string }
  | { tipo: 'gatillo'; id_corto: string; evento: 'despertado' | 'cumplido' }
  | { tipo: 'informe'; fecha: string; costo_usd: number }
)

/* ---------- 8.6 informes ---------- */
export interface Pagina<T> { items: T[]; siguiente: string | number | null; tipos?: string[] }
export interface InformeItem { id: number; fecha: string; tipo: string; costo_usd: number; enviado: boolean; resumen: string; hilo_id: string | null; creado: string }
export interface Informe { id: number; fecha: string; tipo: string; modelo: string; costo_usd: number; creado: string; enviado: boolean; hilo_id: string | null; texto: string; secciones: { titulo: string; texto: string }[]; cifras: Record<string, unknown>; graficos: { spec_id: string; titulo: string; url?: string }[]; fuente: string }
export interface Revision { id: number; desde: string; hasta: string; texto: string; datos: Record<string, unknown>; costo_usd: number; hilo_id: string | null; creada: string; propuestas: { id: number; seccion: string; estado: string; motivo: string }[] }
