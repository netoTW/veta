/* ============================================================================
   Contrato de datos del motor — tal como llega en datos-motor/base_contenido.

   La plataforma NO CALCULA NADA. Estos tipos describen lo que el motor
   entrega; todo número que se muestra sale de aquí con su fuente y su
   timestamp. Lo que la UI necesite y no esté acá es un hueco del contrato y
   se reporta en HUECOS-CONTRATO.md, no se inventa en el frontend.
   ========================================================================== */

export type Tier = 'BAJO' | 'MEDIO' | 'ALTO'
export type EstadoTesis = 'INTACTA' | 'DEBILITANDOSE' | 'ROTA' | 'CERRADA'
export type Calidad = 'ok' | 'parcial' | 'ausente' | string

export interface Fuente { campo: string; fuente: string; timestamp: string; calidad: Calidad }

/* ---------- Sprint 6: advertencias tipadas ----------
   Severidad con un solo criterio: ¿si el lector no lee esto, puede decidir
   distinto? La lista es la misma en esencial y avanzado; el tipo sólo da
   jerarquía. `sin_clasificar` llega con la severidad más alta. */
export type Severidad = 'COMPROMETE_TESIS' | 'LIMITA_LECTURA' | 'CONTEXTO'
export type TipoAdvertencia =
  | 'dato_ausente' | 'dato_inconsistente' | 'objecion_esceptico' | 'limite_de_modelo'
  | 'metrica_no_calculable' | 'catalizador_sin_fecha' | 'calidad_parcial'
  | 'regla_de_metodologia' | 'tesis_contradicha' | 'sin_clasificar' | string
export interface Advertencia {
  tipo: TipoAdvertencia; severidad: Severidad; seccion: string; texto: string; campo_afectado: string
}
export const SEVERIDADES: Severidad[] = ['COMPROMETE_TESIS', 'LIMITA_LECTURA', 'CONTEXTO']

/* ---------- Sprint 6: invalidación como campos ----------
   Los campos son la fuente de verdad; `texto` se conserva para leer.
   `origen` dice si la estructuró el Redactor o el parser de respaldo. */
export type Direccion = 'menor_que' | 'mayor_que'
export interface Invalidacion {
  campo: string; direccion: Direccion | string; umbral: number | null; unidad: string
  ventana_dias: number | null; fuente: string; texto: string
  evaluable: boolean; motivo_no_evaluable: string; origen: 'redactor' | 'parser' | 'ninguno' | string
}
/** Lo que el cron escribe cada día. `cumple: null` = no se pudo medir (no es un "no"). */
export interface EvaluacionInvalidacion {
  campo: string; valor: number | null; umbral: number | null; direccion: Direccion | string; unidad: string
  cumple: boolean | null; evaluable: boolean; motivo: string; fuente: string; timestamp: string
}

/* ---------- Sprint 6: benchmark con motivo enumerado ---------- */
export type MotivoBenchmark = 'sin_universo_guardado' | 'sin_dias_transcurridos' | 'serie_incompleta' | 'medicion_desactivada' | 'otro' | ''
export interface BenchmarkDetalle {
  medible: boolean; motivo_codigo: MotivoBenchmark | string; motivo_texto: string; valor: number | null; fuente: string
}

/** Condición del triage con su valor y umbral crudos (vacío en registros anteriores a 5.1). */
export interface FactorTierDetalle {
  condicion: string; estado: string; valor: number | null; umbral: number | null; op: string; unidad: string
}

export interface FichaEsencial {
  tesis_una_linea: string
  precio_y_fecha_referencia: { precio_usd: number; fecha: string }
  riesgo_resumen: string
  catalizadores: string[]
  que_la_invalidaria: string
  advertencias: Advertencia[]
}

export interface Comparable {
  nombre: string; slug: string; simbolo: string; categoria: string
  mcap_usd: number; tvl_usd: number; revenue_anualizado: number; revenue_holders_30d: number
  estado: string; multiplo: number
}
export interface Excluido { simbolo: string; motivo: string; regla: string }

export interface VaraRevenue {
  hay_brecha: boolean
  rango_min: number | null; rango_max: number | null
  metrica: string
  multiplo_moneda: number; mediana: number; p25: number; p75: number
  familia_modelo: string
  comparables: Comparable[]; excluidos: Excluido[]
  criterio: string; fuente: string
  objetada_por_esceptico: boolean; objecion_citada: string
}
export interface Ciclo { magnitud: number; duracion_semanas: number; fecha: string; precio: number }
export interface VaraReflexiva {
  fraccion_del_maximo: string; maximo_valor: number; maximo_fecha: string
  ciclos: Ciclo[]; rango_min: number; rango_max: number; origen_rango: string
  semanas_de_serie: number; fuente: string
}
export interface Varas { revenue: VaraRevenue; reflexiva: VaraReflexiva; advertencias: Advertencia[] }

export interface Escenario {
  tipo: 'bull' | 'bull_reflexivo' | 'base' | 'bear' | string
  rango_min: number; rango_max: number
  catalizador: string; catalizador_datado: boolean; evidencia_citada: string
  horizonte_dias: number; horizonte_nivel: number; confianza_horizonte: string
  magnitud_origen: string; invalidacion: string
}

export interface Asimetria {
  dato?: 'ausente' | string
  motivo?: string
  riesgo?: number; riesgo_origen?: string
  recompensa?: number; recompensa_origen?: string
  ratio?: number; horizonte?: number; confianza?: string; vara_origen?: string
  no_calculable_motivo: string; regla?: string
  advertencias: Advertencia[]
}

export interface Riesgo {
  var95_1d: number; cvar95_1d: number; var95_7d: number; cvar95_7d: number
  cvar95_7d_bootstrap: unknown
  var95_1d_empirico: number; cvar95_1d_empirico: number
  metodo: string; nu: number; confianza: string; dias_serie: number
  empirico_vs_parametrico: string; limites_declarados: string[]
  peor_dia_ventana: number; sigma_anualizada: number
  fuente: string; timestamp: string; advertencias: Advertencia[]
}

export interface CondicionPerp { nombre: string; cumple: boolean; detalle: string }
export interface Microestructura {
  dato?: 'ausente' | string; motivo?: string
  fs?: number; fs_24h?: number; fs_7d?: number; fs_30d?: number
  oi_mcap?: number; funding_percentil?: number; funding_actual?: number
  long_short?: number; long_short_top_traders?: number
  liquidaciones?: unknown
  liquidez_spot_sobre_oi?: number; liquidez_spot_2pct_usd?: number
  lectura?: string; squeeze_setup?: boolean; condiciones_perp_driven?: CondicionPerp[]
  advertencias: Advertencia[]
}

export interface Entidad { direccion: string; nombre: string; tipo: string; fuente: string }
export interface EntidadesEtiquetadas {
  n_etiquetadas: number; n_sin_etiquetar: number
  por_tipo: Record<string, number>; entidades: Entidad[]; fuente: string
}
/** El objeto si de verdad lo es; null si el motor mandó una lista vacía o nada. */
export function etiquetadasDe(v: unknown): EntidadesEtiquetadas | null {
  return v && typeof v === 'object' && !Array.isArray(v) && 'n_etiquetadas' in v ? v as EntidadesEtiquetadas : null
}

export interface Onchain {
  concentracion_top10_neta: number | null
  concentracion_top50: number | null
  hhi: number | null; hhi_etiqueta: string; n: number
  /** OJO: el motor manda `[]` —lista vacía, no objeto— cuando no hay ninguna
      entidad etiquetada. El tipo lo dice para que nadie vuelva a dar por hecho
      el objeto: usa `etiquetadasDe()` antes de tocar sus campos. */
  entidades_etiquetadas: EntidadesEtiquetadas | unknown[] | null
  netflows: unknown[]
  lectura: string; cota_superior: boolean; nota_cota: string; naturaleza: string
  supply_referencia: number; advertencias: Advertencia[]
}

export interface RubricaItem { dimension: string; puntaje: number; evidencia: string; fuente: string | null }
export interface Fundamentales {
  rubrica: RubricaItem[]; puntaje_total: number
  revenue_protocolo: number; revenue_protocolo_30d: number; revenue_a_holders: number; tvl: number
  unlocks: { encontrado: boolean; fecha: string; pct_circulante: number | null; fuente_url: string }
  github: { encontrado: boolean; repo: string; fuente_url: string }
  mecanismo_captura: { existe: boolean; tipo: string; descripcion: string; fuente_url: string }
  estado_economico: string; captura_verificada: boolean; via_captura: string
  revenue_sobre_mcap: number; advertencias: Advertencia[]
}

export interface Objecion {
  objecion: string; evidencia: string; fuente: string
  que_conclusion_cambia: 'tesis' | 'tier' | 'ninguna' | string
  cambio_propuesto: string
}
export interface Esceptico {
  objeciones: Objecion[]; veredicto_bull: string
  comparables_son_comparables: boolean
  catalizador_tiene_fecha: unknown; rechaza: boolean; motivo_rechazo: string
}
export interface Reconsulta {
  numero: string; valor_informe: string; valor_fuente: string
  coincide: boolean | null; fuente_url: string; comentario: string
}
export interface Verificador { estado: string; reconsultas: Reconsulta[]; hallazgos: unknown[]; motivo_bloqueo: string }

export interface NivelSeccion<E = Record<string, unknown>, A = Record<string, unknown>> {
  seccion: string; disponible: boolean; motivo_ausencia: string
  esencial: { texto: string; advertencias: Advertencia[] } & E
  avanzado: A & { advertencias?: Advertencia[] }
}
export interface Niveles {
  fundamentales: NivelSeccion<object, Fundamentales>
  varas: NivelSeccion<object, Varas>
  escenarios: NivelSeccion<object, { escenarios: Escenario[]; nota_varas?: string; publicable?: boolean; regla_horizonte?: string }>
  asimetria: NivelSeccion<object, Asimetria>
  riesgo: NivelSeccion<object, Riesgo>
  microestructura: NivelSeccion<object, Microestructura>
  onchain: NivelSeccion<object, Onchain>
}

export interface BenchmarkDef {
  estado: string; congelado_en: string
  b1: Record<string, unknown> & { nombre: string; universo: string; ponderacion: string; n_maximo: number; decidido_por_pablo?: string }
  b2: Record<string, unknown> & { nombre: string; regla: string; posicion: string; parametros: { rapida_dias: number; lenta_dias: number }; decidido_por_pablo?: string }
  medicion?: { precio: string; decidido_por_pablo?: string }
  por_que: string
}
export interface BenchmarkAlPublicar {
  estado_definicion: string; definicion: BenchmarkDef; congelado_en: string; simbolo: string
  precio_gema_al_publicar: number; b1_composicion: unknown[]; b1_n: number; b1_nota: string
  b2_parametros: { rapida_dias: number; lenta_dias: number }; advertencia: string
}

/** Estado de publicación (lo decide la bandeja; lo adjunta el servidor sólo para admin). */
export interface Publicacion {
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'pedir_mas' | 'nueva_version' | 'despublicado'
  ultima?: { accion: string; motivo: string | null; version_registro: number; admin_email: string; fecha: string; bloqueo_confirmado: number; verificador_estado: string | null }
  publicado_en?: string
  version_aprobada?: number
}

/** Un informe del motor: gema (con tesis) o análisis (sin tesis).
    Para el visitante el servidor manda sólo el titular (`recorte: 'titular'`):
    sin ficha, sin secciones. */
export interface Informe {
  /** 'titular' cuando el servidor recortó el informe al titular y tier (visitante). */
  recorte?: 'titular'
  publicacion?: Publicacion
  id: string
  tipo: 'gema' | 'analisis'
  version_motor: string; version_registro: number; escrito_en: string
  simbolo: string; nombre: string; cadena: string
  fecha_publicacion: string; origen: string
  tier: Tier; factores_del_tier: string[]
  factores_del_tier_detalle?: FactorTierDetalle[]
  estado_economico: string; captura_verificada: boolean
  ficha_esencial: FichaEsencial
  tesis: string | null
  motivo_sin_tesis: string
  tesis_contradicha?: string
  invalidacion?: Invalidacion
  varas: Varas
  escenarios: Escenario[]
  asimetria: Asimetria
  riesgo: Riesgo
  microestructura: Microestructura
  onchain: Onchain
  fundamentales: Fundamentales
  esceptico: Esceptico
  verificador: Verificador
  senales_sin_fuente: { campo: string; motivo: string }[]
  calidad_por_seccion: Record<string, string>
  fuentes: Fuente[]
  apto_para_gemas: boolean
  estado_seguimiento: string
  benchmark_al_publicar?: BenchmarkAlPublicar
  niveles: Niveles
  cambios_respecto_version_anterior?: string[]
}

export interface SeguimientoDiario {
  id: string; tipo: 'seguimiento_diario'
  version_motor: string; version_registro: number; escrito_en: string
  gema_id: string; fecha: string
  precio: number | null
  retorno_desde_publicacion: number | null
  estado_tesis: EstadoTesis
  invalidacion_activada: boolean; invalidacion_fecha: string
  catalizador_estado: string
  dias_al_cierre: number
  benchmark_canasta: number | null
  benchmark_regla_simple: number | null
  nota: string
  evaluacion_invalidacion?: EvaluacionInvalidacion
  benchmark_canasta_detalle?: BenchmarkDetalle
  benchmark_regla_simple_detalle?: BenchmarkDetalle
  cambios_respecto_version_anterior?: string[]
}

export interface Watch {
  id: string; tipo: 'watchlist'
  version_motor: string; version_registro: number; escrito_en: string
  simbolo: string
  escenario_que_la_activaria: string
  observable: string; fuente_a_vigilar: string
  fecha_alta: string; tier_actual: string
  estado: 'VIGILANDO' | 'RADAR' | 'CERRADO' | string
  motivo_cierre: string; historial_revisiones: unknown[]
  observable_tipo: string; observable_param: Record<string, unknown>
  valor_al_anotar: number | null
  analisis_origen: string; origen_bloqueado: boolean
}

export interface Meta {
  generado_en: string; version_motor: string
  conteos: { gemas: number; analisis: number; watchlist: number; seguimiento: number }
  versiones_seguimiento: number
}

/* ---------- Visuales: lo que se dibuja. Lo calcula el motor; la web sólo lo pinta. ---------- */
export interface Cubeta { precio_desde: number; precio_hasta: number; notional_largos_usd: number; notional_cortos_usd: number; total_usd: number }
export interface LiquidacionProyectada {
  disponible: boolean; motivo: string; es_estimacion: boolean; etiqueta: string
  precio_actual: number | null; oi_usd: number | null
  cubetas: Cubeta[]; zona_densa_abajo: Cubeta | null; zona_densa_arriba: Cubeta | null
  notional_largos_usd: number; notional_cortos_usd: number; sesgo: string
  supuestos: Record<string, unknown>; limitaciones: string[]; venues: string[]; venues_consultados?: string[]; venues_caidos?: Record<string, string>
  calibrado: boolean; fuente: string; timestamp?: string
}
export interface Visuales {
  id: string; tipo: 'visuales'; informe_id: string; simbolo: string; escrito_en: string
  precio: { intervalo: '1w' | '1d' | ''; serie: { t: number; c: number }[]; fuente: string; timestamp: string; precio_actual: number | null; ath: { precio: number; fecha: string; multiplo_desde_actual?: number } | null; maximos_de_ciclo: { precio: number; fecha: string; multiplo_desde_actual: number; es_ath: boolean }[] }
  revenue: { serie: { t: number; v: number }[]; fuente: string; timestamp: string }
  tvl: { puntos: { t: 'hace_30d' | 'hoy'; v: number; fuente: string }[]; cambio_30d?: number | null; timestamp: string; serie_disponible: boolean; motivo_sin_serie: string }
  tenedores: { snapshots: { fecha: string; n_holders: number; fuente: string; top: { balance: number; pct: number | null }[] }[]; concentracion: { top10: number | null; top50: number | null; hhi: number | null; hhi_etiqueta: string; n_holders_considerados: number; base_supply: string; supply_referencia: number; top10_bruto_sobre_circulante: number | null }; descontadas: { entidad: string; tipo: string; pct_supply: number }[] }
  liquidacion_proyectada: LiquidacionProyectada
}
