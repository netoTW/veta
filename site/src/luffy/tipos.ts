/* Tipos del panel de Mugiwara: la forma de CONTRATO-PANEL.md v1.1, tal cual la sirve /api/luffy/*. */

export interface HiloResumen { id: string; titulo: string; creado: string; actualizado: string; resumen_vivo: string | null; n_mensajes: number; costo_usd: number; telegram_activo: boolean }
export interface GraficoRef { spec_id: string | null; archivo: string; url: string; titulo: string; ruta?: string }
export interface PropuestaResumen { id_corto: string; accion: string; par: string; lado?: string; estado: string; expira: string | null; bloque: string | null; origen?: string; mandato?: string }
export interface Propuesta extends PropuestaResumen {
  id: string; hilo_id: string; tipo?: string; cantidad_usdt?: number; precio?: number | null; stop?: number | null; precio_referencia?: number | null
  expirada?: boolean; propuesta_en?: string; detalle?: Record<string, unknown>
}
export interface Herramienta { nombre: string; entrada?: Record<string, unknown>; hora?: string; ok?: boolean }
export interface Mensaje {
  id: number; rol: 'usuario' | 'luffy' | 'ejecucion' | 'sistema'; contenido: string; ts: string; modelo: string | null; costo_usd: number
  tipo_turno?: string; herramientas_usadas?: Herramienta[]; graficos?: GraficoRef[]; propuestas?: PropuestaResumen[]
}
export interface HiloDetalle {
  hilo: { id: string; titulo: string; creado: string; actualizado: string; resumen_vivo: string | null }
  resumen_vivo: string | null; telegram_activo: boolean; mensajes: Mensaje[]
  propuesta_vigente: Propuesta | null; propuesta_mision: { id_corto: string; bloque?: string; estado: string } | null
}
export interface Fin {
  mensaje_id: number | null; texto: string; modelo?: string; modo?: string; tipo_turno?: string
  tokens?: { entrada: number; salida: number; cache_lectura: number; cache_escritura: number }
  costo_usd?: number; costo_agentes_usd?: number; busquedas_web?: number; herramientas?: string[]
  graficos?: GraficoRef[]; propuestas?: PropuestaResumen[]; propuesta_vigente?: Propuesta | null
  propuesta_mision?: { id_corto: string; bloque?: string; estado: string } | null; aviso?: string | null; error: string | null; hora: string
}
export type EventoChat =
  | { tipo: 'inicio'; hilo_id: string; modo: string; hora: string }
  | { tipo: 'paso'; paso: string | null; evento: string; hora: string }
  | { tipo: 'texto'; texto: string }
  | ({ tipo: 'grafico' } & GraficoRef)
  | ({ tipo: 'propuesta' } & PropuestaResumen)
  | { tipo: 'propuesta_mision'; id_corto: string; bloque?: string; estado: string }
  | { tipo: 'aviso'; texto: string }
  | ({ tipo: 'fin' } & Fin)
  | { tipo: 'error'; texto: string }
export interface Confirmacion {
  ok: boolean; texto?: string; estado?: string; error?: string; eventos?: string[]
  fills?: { id: string; lado: string; precio: number; cantidad: number; comision: number; hora: string }[]
  stop?: { id: string; precio: number; cantidad: number; ok: boolean } | null
  alertas?: string[]; reconciliacion?: { discrepancias: unknown[]; alertas: unknown[]; error: string | null }; propuesta?: Propuesta
}
export interface ImagenAdjunta { base64: string; tipo: string; nombre?: string }

/* ---------- spec v2 ---------- */
export type Estilo = 'linea' | 'area' | 'barras' | 'velas' | 'puntos'
export type RolSerie = 'principal' | 'benchmark' | 'apoyo'
export interface Transformacion { tipo: string; desde?: string; contra?: string; ventana?: number }
export interface SerieSpec {
  id?: string; tipo: string; activo?: string; etiqueta?: string; estilo?: Estilo; rol?: RolSerie; eje?: 'izq' | 'der'
  transformaciones?: Transformacion[]; metrica?: string; categoria?: string; agregado?: string; dataset?: string; campo?: string; origen?: string
}
export interface PanelSpec { id: string; titulo?: string; altura?: number; escala?: 'lineal' | 'log'; series: SerieSpec[] }
export interface ZonaSpec { tipo?: string; desde: number; hasta: number; etiqueta?: string }
export interface NivelSpec { tipo?: string; precio: number; etiqueta?: string }
export interface EventoSpec { fecha: string; etiqueta?: string }
export interface Spec {
  version?: number; titulo?: string; activos?: string[]; rango?: string; intervalo?: string
  paneles?: PanelSpec[]; series?: SerieSpec[]; benchmarks?: string[]
  posiciones?: { origen?: string; mostrar?: string[] } | null
  zonas?: ZonaSpec[]; niveles?: NivelSpec[]; eventos?: EventoSpec[]; normalizar?: boolean; tipo?: string
}

/* ---------- datos listos para dibujar ---------- */
export type Formato = 'ohlc' | 'valor' | 'por_precio' | 'marcadores' | 'niveles'
export interface SerieDatos {
  id: string; panel: string; tipo: string; activo?: string; etiqueta: string; estilo: Estilo; rol: RolSerie; eje: 'izq' | 'der'
  formato: Formato; unidad: string; n: number; puntos: number[][]; ultimo: { t: number; valor: number } | null
  transformaciones: string[]; fuente: string; consultado_en: string
  entidad?: { slug: string; nombre: string; categoria: string }; categoria?: { nombre: string; agregado: string; n_protocolos: number; protocolos: string[] }; lado?: string
}
export interface PanelDatos { id: string; titulo: string; altura: number; escala: 'lineal' | 'log'; series: string[]; unidad: string }
export interface Marcador { serie: string; tipo: 'entrada' | 'salida' | 'stop_historial' | 'candidata'; t: number; hora: string; precio: number; valor?: number; cantidad?: number; usdt?: number; etiqueta: string; origen?: string; id_corto?: string; modo?: string; version?: string }
export interface Nivel { panel: string; serie?: string; tipo: string; precio: number; valor?: number; etiqueta: string; fuente?: string; origen?: string; direccion?: string }
export interface ZonaDatos { panel: string; tipo: string; desde: number; hasta: number; etiqueta: string }
export interface EventoDatos { t: number; fecha: string; etiqueta: string }
export interface PosicionResumen { activo: string; origen: string; estado: string; mandato: string; simulado?: boolean; cantidad: number; precio_medio: number; stop_precio: number | null; precio_actual: number | null; pnl_no_realizado_usdt: number | null; pnl_realizado_usdt: number | null; fuente: string; consultado_en: string }
export interface Datos {
  spec: Spec & { paneles: PanelSpec[]; activos: string[]; rango: string; intervalo: string }
  titulo: string; rango: { desde: string; hasta: string; intervalo: string; dias: number }
  paneles: PanelDatos[]; series: SerieDatos[]; marcadores: Marcador[]; niveles: Nivel[]; zonas: ZonaDatos[]; eventos: EventoDatos[]
  posiciones: PosicionResumen[]; no_disponibles: { serie: string; tipo: string; motivo: string }[]
  fuentes: { serie: string; fuente: string; consultado_en: string }[]; cache: { hit: boolean; ttl_s: number }; consultado_en: string; fuente: string
}
export interface SpecGuardado { spec_id: string; spec: Spec; titulo: string; hilo_id: string | null; mensaje_id: number | null; archivo: string | null; url: string | null; origen: 'chat' | 'laboratorio'; creado: string }

/* ---------- catálogo y tableros ---------- */
export interface CatalogoSerie { tipo: string; grupo: string; etiqueta: string; formato: Formato; unidad?: string; intervalos?: string[]; requiere: string[]; estilos?: Estilo[]; parametros?: Record<string, unknown>; fuente: string; nota?: string }
export interface CatalogoActivo { simbolo: string; par: string; nombre: string; en_posicion: boolean; origenes: string[]; defillama: { slug: string; categoria: string } | null; perp: boolean; volumen_24h_usdt: number | null }
export interface Catalogo {
  series: CatalogoSerie[]; transformaciones: { tipo: string; etiqueta: string; parametros?: Record<string, string>; aplica?: string[] }[]
  benchmarks: { id: string; etiqueta: string; tipo: string; agregados?: string[] }[]; activos: CatalogoActivo[]; categorias: string[]
  datasets: { id: number; nombre: string; descripcion: string; unidad: string; columnas: string[]; filas: number; hilo_id: string | null; creado: string }[]
  rangos: string[]; intervalos: string[]; estilos: Estilo[]; roles: RolSerie[]; origenes_posiciones: string[]; consultado_en: string; fuente: string
}
export interface Tablero { id: number; nombre: string; grupo: string | null; spec: Spec; orden: number; creado: string; actualizado: string }
export interface HistorialPosiciones {
  origen: string; consultado_en: string; fuente: string
  posiciones: { activo: string; origen: string; estado: string; mandato: string; abierta_en: string; cerrada_en: string | null; cantidad: number; precio_medio: number; pnl_realizado_usdt: number; entradas: { t: number; hora: string; precio: number; cantidad: number; usdt: number; id_corto?: string }[]; salidas: { t: number; hora: string; precio: number; cantidad: number; usdt: number; pnl_usdt: number; id_corto?: string }[]; stops: { t: number; hora: string; precio: number; accion: string; id_corto?: string }[]; stop_vigente: { precio: number; cantidad: number } | null; simulado?: boolean }[]
}
export interface Costo { desde: string; costo_usd: number; respuestas?: number; por_modelo?: { modelo: string; costo_usd: number; n: number }[]; presupuesto?: { presupuesto_api_usd: number; aviso_usd: number; degradar_usd: number } }
