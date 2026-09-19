/* Vocabulario del contrato (CONTRATO-ANALISIS-A-PEDIDO.md). Sin importaciones: lo comparten motor.ts y sus implementaciones. */
export type Nivel = 'determinista' | 'profundo'
export type Etapa = 'recolectando' | 'calculando' | 'esceptico' | 'redactando' | 'verificando'
export const ETAPAS: Etapa[] = ['recolectando', 'calculando', 'esceptico', 'redactando', 'verificando']
export type EstadoSolicitud = 'en_cola' | 'en_curso' | 'listo' | 'fallido' | 'bloqueado'

export interface Moneda { simbolo: string; nombre: string; id_coingecko?: string; cadena?: string; con_informe: boolean
  /** §9.2: lo dice el motor. `null` = todavía no lo informa y no se puede afirmar nada. */
  analizable?: boolean | null; motivo_no_analizable?: string }

/** §9.1: una candidata concreta detrás de lo que el usuario escribió. */
export interface RefMoneda { contrato?: string | null; cadena?: string | null }
export interface Candidata extends Moneda { contrato?: string | null; mcap_usd?: number | null; vol24h_usd?: number | null }
export interface Resolucion {
  consulta: string
  interpretada_como: 'ticker' | 'contrato' | 'nombre'
  /** Si el usuario escribió un par (BTCUSDT), el ticker limpio. */
  normalizada?: string | null
  candidatas: Candidata[]
  /** true cuando la lista sale del universo de la web y no de /resolver del motor. */
  aproximada?: boolean
}

/** Lo que la web manda al motor (una línea de cola-web.jsonl o un POST). */
export interface Solicitud {
  id: string; nivel: Nivel; simbolo: string; id_coingecko?: string
  usuario: { id: string; email: string; plan: string } | null
  origen: 'analiza_tu_moneda' | 'votacion_semanal' | string
  fecha: string; consume_cupo: boolean
  /** §9.3: cuál de las homónimas eligió quien pidió el análisis. */
  contrato?: string | null; cadena?: string | null
}

/** Lo que el motor devuelve mientras trabaja y al terminar. */
export interface Progreso {
  solicitud_id: string; estado: EstadoSolicitud; etapa: Etapa | null
  /** 0..1 dentro de la etapa, o null si la etapa no lo informa. */
  avance: number | null
  /** Una frase llana de lo que está haciendo ahora mismo. */
  detalle: string
  etapas_hechas: Etapa[]
  iniciado: string | null; actualizado: string; terminado: string | null
  costo_real_usd: number | null
  /** Registro completo del informe (nivel profundo) o lectura determinista. Sólo con estado listo. */
  resultado: Record<string, unknown> | null
  fallo: { codigo: string; texto: string } | null
  verificador: { estado: string; motivo_bloqueo: string } | null
}

/** Lectura estructural, sin tesis, sin escenarios, sin veredicto. */
export interface Bloque { lectura: string; texto: string; fuente: string | null; cifras: { k: string; v: number | string | null; unidad?: string }[] }
export interface LecturaDeterminista {
  nivel: 'determinista'; origen_motor: 'simulador' | 'motor'
  simbolo: string; nombre: string; cadena: string | null; id_coingecko: string | null
  fecha_datos: string; precio_usd: number | null
  demanda: Bloque & { lectura: 'demanda_real' | 'apalancamiento' | 'mixta' | 'sin_dato'; condiciones: { nombre: string; cumple: boolean; detalle: string }[] }
  riesgo_cola: Bloque & { lectura: 'contenida' | 'alta' | 'extrema' | 'sin_dato' }
  concentracion: Bloque & { lectura: 'dispersa' | 'concentrada' | 'muy_concentrada' | 'sin_dato' }
  tokenomics: Bloque & { lectura: 'captura_verificada' | 'captura_declarada' | 'sin_captura' | 'sin_dato' }
  liquidez: Bloque & { lectura: 'profunda' | 'suficiente' | 'fina' | 'sin_dato' }
  advertencias: { tipo: string; severidad: string; seccion: string; texto: string; campo_afectado: string }[]
  fuentes: { campo: string; fuente: string; timestamp: string; calidad: string }[]
}

/** El motor tiene la moneda en el universo pero todavía no guardó datos: el profundo la crea. */
export interface SinDatos { sin_datos: true; codigo: string; texto: string }

export interface Motor {
  nombre: 'simulador' | 'motor'
  universo(): Promise<Moneda[]>
  /** §9.1. Devuelve las monedas que pueden ser lo que el usuario escribió. */
  resolver(consulta: string): Promise<Resolucion>
  /** `ref` es la candidata que eligió quien pregunta (§9.1). El motor todavía
      busca sólo por símbolo, así que se manda y se comprueba lo que vuelve. */
  determinista(simbolo: string, ref?: RefMoneda): Promise<LecturaDeterminista | SinDatos | null>
  solicitarProfundo(s: Solicitud): Promise<void>
  progreso(id: string): Promise<Progreso | null>
}
