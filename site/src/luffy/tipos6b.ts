/* ============================================================================
   Fase 6b: las formas que el panel espera de mugiwara-api para el terminal,
   la cartera, el exchange, la caja, el radar, el control, la oficina y los
   informes. Son las que describe PROMPT-FASE-6b-mugiwara.md, escritas como
   SUPUESTO hasta que CONTRATO-PANEL.md v2 las fije; cuando llegue, lo que
   difiera se ajusta aquí y en el simulador (server/luffySimulado.ts), no en
   las pantallas.
   ========================================================================== */
import type { PosicionResumen, PropuestaResumen, Spec } from './tipos'

/* ---------- terminal ---------- */
export type Filtro = 'mis_posiciones' | 'caja' | 'candidatas' | 'vigilancia' | 'gatillos' | 'todo'
export interface UniversoFila {
  simbolo: string; par: string; nombre: string; precio: number | null; cambio_24h_pct: number | null
  vs_btc_7d_pct: number | null; vs_btc_30d_pct: number | null; modos: string[]; squeeze: 'cargado' | 'ignicion' | null
  posicion: { origen: string; estado: string } | null; gatillos: number; catalizador: { fecha: string; etiqueta: string } | null
  en_vigilancia: boolean; candidata: boolean; volumen_24h_usdt: number | null
}
export interface Universo { filas: UniversoFila[]; consultado_en: string; fuente: string }
export type SeccionId = 'precio' | 'derivados' | 'fundamento' | 'atencion'
export interface SeccionFicha { id: SeccionId; titulo: string; spec: Spec; plantilla: { nombre: string; version: string } }
export interface ModoFicha { id: string; version: string; nombre: string; cumple: boolean; estudio: { n: number; acierto_pct: number | null; retorno_mediano_pct: number | null; horizonte_d: number } | null }
export interface FichaRadar { familias: { nombre: string; cumple: boolean; cifras: { k: string; v: string }[] }[]; modos: ModoFicha[]; etiquetas: string[]; ultima_marca: string | null }
export interface Catalizador { fecha: string; tipo: string; etiqueta: string; fuente: string; url?: string }
export interface Nota { fecha: string; tipo: 'bitacora' | 'teoria'; texto: string; estado?: string; hilo_id?: string | null }
export interface Gatillo { id: number; activo: string | null; texto: string; estado: 'activo' | 'pausado' | 'disparado' | 'borrado'; precio?: number | null; direccion?: string | null; ultimo_disparo: string | null; cada_min: number | null; creado: string; hilo_id?: string | null }
export interface FichaTerminal {
  activo: string; nombre: string; par: string; precio: number | null; cambio_24h_pct: number | null
  secciones: SeccionFicha[]; radar: FichaRadar | null; catalizadores: Catalizador[]; notas: Nota[]
  posiciones: PosicionResumen[]; gatillos: Gatillo[]; no_disponibles: { seccion: string; motivo: string }[]; consultado_en: string
}
export interface PreguntarRespuesta { hilo_id: string; titulo: string; nuevo: boolean }

/* ---------- cartera y exchange ---------- */
export interface PosicionCartera {
  activo: string; par: string; mandato: string; cantidad: number; precio_medio: number; precio_actual: number | null; costo_usdt: number; valor_usdt: number | null
  pnl_no_realizado_usdt: number | null; pnl_no_realizado_pct: number | null; pnl_realizado_usdt: number; stop_precio: number | null; stop_distancia_pct: number | null
  peso_pct: number | null; abierta_en: string; declarada?: boolean; simulado: boolean; estado: string
}
export interface Cartera { origen: string; simulado: boolean; efectivo_usdt: number; valor_total_usdt: number; exposicion_pct: number; posiciones: PosicionCartera[]; exposicion: { activo: string; pct: number }[]; pnl_realizado_total_usdt: number; consultado_en: string; fuente: string }
export interface CurvaCapital { origen: string; rango: string; puntos: { t: number; capital: number; aportes: number; drawdown_pct: number }[]; max_drawdown_pct: number | null; rendimiento_pct: number | null; consultado_en: string }
export interface OrdenExchange { id: string; par: string; lado: string; tipo: string; precio: number | null; cantidad: number; llena: number; estado: string; creada: string; es_stop: boolean; stop_precio?: number | null }
export interface Ordenes { abiertas: OrdenExchange[]; consultado_en: string; fuente: string }
export interface Fill { id: string; par: string; lado: string; precio: number; cantidad: number; comision_usdt: number; hora: string; orden_id: string }
export interface Historial { ordenes: OrdenExchange[]; fills: Fill[]; comisiones: { periodo: string; total_usdt: number; por_par: { par: string; usdt: number }[] }; consultado_en: string }
export type AccionExchange = { accion: 'cancelar'; orden_id: string } | { accion: 'modificar'; orden_id: string; precio?: number; cantidad?: number } | { accion: 'mover_stop'; activo: string; stop: number } | { accion: 'orden'; par: string; lado: 'compra' | 'venta'; tipo: 'limit' | 'market'; precio?: number; cantidad_usdt?: number; cantidad?: number; stop?: number; mandato?: string }
export interface Declaracion { activo: string; cantidad: number; precio_medio: number; fecha: string; mandato: string }

/* ---------- caja ---------- */
export interface Caja {
  simulado: boolean; mision: { id_corto: string; texto: string; estado: string; creada: string; plazo_hasta: string | null; objetivo: string | null } | null
  presupuesto_api: { usado_usd: number; tope_usd: number }; limites: { k: string; v: string }[]; efectivo_usdt: number; valor_total_usdt: number
  posiciones: PosicionCartera[]; decisiones: { ciclo: number; hora: string; accion: string; activo: string | null; porque: string }[]; consultado_en: string
}

/* ---------- radar ---------- */
export interface Candidata {
  activo: string; nombre: string; fecha: string; modo: string; version: string; familias: { nombre: string; cumple: boolean; cifras: { k: string; v: string }[] }[]
  jev: { juicio: string; confianza: number | null } | null; etiquetas: string[]; precio_marca: number | null
  seguimiento: { d7_pct: number | null; d14_pct: number | null; d30_pct: number | null; vs_btc_d7_pct: number | null; vs_btc_d14_pct: number | null; vs_btc_d30_pct: number | null }
}
export interface Candidatas { candidatas: Candidata[]; modos: string[]; consultado_en: string }
export interface Modo { id: string; version: string; nombre: string; descripcion: string; estado: 'activo' | 'propuesto' | 'retirado'; receta: string[]; estudio: { n: number; acierto_pct: number | null; retorno_mediano_pct: number | null; horizonte_d: number } | null; track: { n: number; acierto_pct: number | null; retorno_mediano_pct: number | null } | null; creado: string }
export interface Modos { modos: Modo[]; consultado_en: string }

/* ---------- control ---------- */
export interface Manual { version_vigente: string; versiones: { version: string; fecha: string; resumen: string }[]; propuestas: { id: string; fecha: string; resumen: string; diff: string; estado: 'pendiente' | 'aprobada' | 'rechazada'; hilo_id?: string | null }[]; consultado_en: string }
export interface CostoAmpliado {
  desde: string; costo_usd: number; total_usd?: number
  luffy?: { total_usd: number; por_tipo_turno: { tipo: string; usd: number; n: number }[] }
  jev?: { total_usd: number; por_modelo: { modelo: string; usd: number; n: number }[]; por_proposito?: { proposito: string; usd: number; n: number }[] }
  por_dia?: { fecha: string; luffy_usd: number; jev_usd: number }[]
  por_modelo?: { modelo: string; costo_usd: number; n: number }[]; respuestas?: number
  presupuesto?: { presupuesto_api_usd: number; aviso_usd: number; degradar_usd: number }
}
export interface Alerta { id: number; hora: string; severidad: 'alta' | 'media' | 'baja'; tipo: string; activo: string | null; texto: string }
export interface Alertas { alertas: Alerta[]; total: number; pagina: number; por_pagina: number }

/* ---------- oficina ---------- */
export interface Oficina {
  luffy: { estado: 'ocioso' | 'pensando'; hilo_id: string | null; hilo_titulo: string | null; desde: string | null }
  agentes: { id: string; nombre: string; estado: 'ocioso' | 'trabajando'; ultima_actividad: string | null; hora: string | null }[]
  fuentes: { id: string; nombre: string; salud: 'al_dia' | 'atrasada' | 'caida'; ultima_lectura: string | null; detalle?: string }[]
  corriendo: { que: string; desde: string }[]; consultado_en: string
}
export type EventoOficina =
  | { tipo: 'turno_abierto' | 'turno_cerrado'; hora: string; hilo_id: string; hilo_titulo?: string; tipo_turno?: string; costo_usd?: number }
  | { tipo: 'agente_convocado' | 'agente_terminado'; hora: string; agente: string; costo_usd?: number }
  | { tipo: 'herramienta'; hora: string; herramienta: string; fuente?: string }
  | { tipo: 'fuente'; hora: string; fuente: string; ok: boolean; n?: number }
  | { tipo: 'radar_ciclo' | 'caja_ciclo'; hora: string; detalle: string }
  | { tipo: 'alerta'; hora: string; severidad: string; texto: string }

/* ---------- informes ---------- */
export interface Informes { informes: { fecha: string; titulo: string; resumen: string }[]; revisiones: { fecha: string; titulo: string; resumen: string }[]; bitacora: { id: number; fecha: string; activo: string | null; tipo: string; tesis: string; resultado: string | null }[]; teorias: { id: number; fecha: string; activo: string | null; texto: string; estado: string }[]; consultado_en: string }
export interface Informe { fecha: string; titulo: string; secciones: { titulo: string; texto: string; cifras: { k: string; v: string }[]; graficos: { spec_id: string; titulo: string }[] }[]; consultado_en: string }
export type { PropuestaResumen }
