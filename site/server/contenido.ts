/* ============================================================================
   Contenido del motor, servido según la matriz de acceso (spec §4).

   Lo compilado por scripts/datos.mjs vive en server/datos/ (privado). Este
   módulo decide, por rol, qué sale: el visitante recibe sólo el titular de
   cada gema; base y pro, el informe; pro, antes que base (acceso anticipado).
   Nada se publica sin la decisión de la bandeja (tabla `publicacion`): un
   informe sin "aprobar" para su versión actual no existe para nadie que no
   sea admin. Regla dura heredada del motor.
   ========================================================================== */
import { readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'
import { bd, ahora } from './db.ts'
import { ENV } from './entorno.ts'
import { ultimasDecisiones, noticiasDespublicadas, alCambiarPublicacion } from './publicacion.ts'
import { declaradas, esDeclarada } from './tenencia.ts'
import { puede, type Rol } from '../src/lib/matriz.ts'

type Registro = Record<string, unknown> & { id: string; tipo: string; version_registro: number }

/* ---------- carga con caché por mtime: si se recompila, se relee ---------- */
const cache = new Map<string, { mtime: number; datos: unknown }>()
function leer<T>(nombre: string): T {
  const f = resolve(ENV.DATOS, `${nombre}.json`)
  if (!existsSync(f)) throw new Error(`Falta ${f}: corre \`node scripts/datos.mjs\``)
  const m = statSync(f).mtimeMs
  const c = cache.get(nombre)
  if (c && c.mtime === m) return c.datos as T
  const datos = JSON.parse(readFileSync(f, 'utf8'))
  cache.set(nombre, { mtime: m, datos })
  return datos as T
}

export const gemasTodas = () => leer<Registro[]>('gemas')
/* Resultados profundos de "analiza tu moneda": registros completos guardados en
   `solicitud`. Entran a la bandeja como cualquier informe.
   Se guardan en memoria: la consulta se hacía en cada petición de la lista de
   análisis y casi siempre volvía vacía. Se olvidan cuando un pedido termina
   (`olvidarAPedido`, desde analizar.ts) y, por si acaso, cada minuto. */
let aPedido: { hasta: number; registros: Registro[] } | null = null
export function olvidarAPedido() { aPedido = null }
export async function resultadosAPedido(forzar = false): Promise<Registro[]> {
  if (!forzar && aPedido && aPedido.hasta > Date.now()) return aPedido.registros
  const filas = await bd.todos<{ resultado: string }>("SELECT resultado FROM solicitud WHERE nivel = 'profundo' AND estado = 'listo' AND resultado IS NOT NULL ORDER BY terminada DESC")
  aPedido = { hasta: Date.now() + 60_000, registros: filas.map((f) => JSON.parse(f.resultado) as Registro) }
  return aPedido.registros
}
export const analisisTodos = async () => [...leer<Registro[]>('analisis'), ...(await resultadosAPedido())]
/** Sólo lo compilado del motor (sin los resultados a pedido): lo que el simulador y el universo necesitan, sin base. */
export const registrosCompilados = () => [...leer<Registro[]>('gemas'), ...leer<Registro[]>('analisis')]
export const watchlistToda = () => leer<Registro[]>('watchlist')
export const seguimientoTodo = () => leer<{ ultimo: Registro[]; historial: Registro[] }>('seguimiento')
export const benchmark = () => leer<Record<string, unknown>>('benchmark')
export const meta = () => leer<Record<string, unknown>>('meta')
/** Lo que el cliente necesita de meta es la fecha. Los conteos incluyen informes SIN aprobar
    y la versión del motor es vocabulario interno: sólo para admin. */
export function metaPara(rol: Rol) {
  const m = meta()
  return rol === 'admin' ? m : { generado_en: m.generado_en }
}
export const visualesTodos = () => leer<Record<string, Registro>>('visuales')

/** Visuales de un informe: mismas reglas que el informe (gema → informe del plan; análisis → gratis si aprobado).
    `undefined`: no hay informe que ver (404). `null`: el informe se ve pero no tiene visuales
    (200 vacío: un 404 ahí salía como error en la consola de cada detalle sin gráficos). */
export async function visualesPara(id: string, rol: Rol): Promise<Registro | null | undefined> {
  // Un mismo id puede ser a la vez una gema reclasificada (oculta) y su análisis (visible):
  // manda el registro que este rol ve, no el primero que aparece.
  const candidatos = [...gemasTodas().filter((x) => x.id === id), ...(await analisisTodos()).filter((x) => x.id === id)]
  let r: Registro | undefined
  for (const x of candidatos) if (await visiblePara(x, rol)) { r = x; break }
  if (!r) return undefined
  if (r.tipo === 'gema' && !puede(rol, 'gemas.informe')) return undefined
  const v = visualesTodos()[id] ?? null
  // El propio visual puede venir marcado, aunque su informe esté aprobado.
  if (v && rol !== 'admin' && ((v as { solo_admin?: boolean }).solo_admin || (v as { bloqueado?: boolean }).bloqueado)) return null
  return v
}

/* ---------- estado de publicación ---------- */
export interface EstadoPublicacion {
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'pedir_mas' | 'nueva_version' | 'despublicado'
  ultima?: { accion: string; motivo: string | null; version_registro: number; admin_email: string; fecha: string; bloqueo_confirmado: number; verificador_estado: string | null }
  publicado_en?: string
  version_aprobada?: number
  /** La versión cambió después de aprobarse: sigue publicado, pero hay que mirarlo. */
  revisar?: boolean
  version_actual?: number
  cambios?: string[]
}

/** Una reexportación que sólo cambia la forma de los campos no es contenido nuevo.
    El motor lo marcará; mientras tanto, cualquier cambio de versión se manda a revisar. */
function soloForma(r: Registro): boolean {
  const c = (r as { cambios_respecto_version_anterior?: unknown }).cambios_respecto_version_anterior
  return !!c && typeof c === 'object' && !Array.isArray(c) && (c as { solo_forma?: boolean }).solo_forma === true
}

function camposCambiados(r: Registro): string[] {
  const c = (r as { cambios_respecto_version_anterior?: unknown }).cambios_respecto_version_anterior
  // Antes era una lista de campos; §15.1 la convierte en objeto. Se aceptan las dos
  // mientras conviven, y de la nueva interesa qué cambió de CONTENIDO, no de forma.
  if (Array.isArray(c)) return c.filter((x): x is string => typeof x === 'string')
  if (c && typeof c === 'object') {
    const o = c as { campos_contenido?: unknown; detalle?: unknown; campos?: unknown }
    for (const lista of [o.campos_contenido, o.campos, o.detalle]) {
      if (Array.isArray(lista) && lista.length) return lista.filter((x): x is string => typeof x === 'string')
    }
  }
  return []
}

export async function estadoPublicacion(r: Registro): Promise<EstadoPublicacion> {
  // De memoria: era una consulta por informe y por petición (server/publicacion.ts).
  const ultima = (await ultimasDecisiones()).get(r.id)
  if (!ultima) return { estado: 'pendiente' }
  if (ultima.accion === 'aprobar') {
    /* La aprobación es de la CORRIDA (id + tipo), no de la versión del registro.
       El 21-sep el motor reexportó los vigentes para darles una forma única, eso
       subió `version_registro` de todos, y el sitio público se quedó en cero sin
       que nadie decidiera nada. Una reexportación del mismo análisis conserva la
       aprobación; sólo una corrida nueva de la moneda —otro id— vuelve a
       pendiente, porque entonces es otro informe.

       Si además cambió el contenido, sigue publicado y se marca para revisar:
       bajar algo solo, sin que nadie lo mire, es cómo se llega a un sitio vacío. */
    /* Por id, no por id+tipo: cuando el motor reclasifica una gema a análisis
       conserva el id, porque es la misma corrida. Atarlo al tipo dejaba fuera a
       STONK, aprobado como gema el 19-sep y reclasificado después. */
    const distinta = ultima.version_registro !== r.version_registro
    return {
      estado: 'aprobado', ultima, publicado_en: ultima.fecha,
      version_aprobada: ultima.version_registro,
      version_actual: r.version_registro,
      revisar: distinta && !soloForma(r),
      cambios: distinta ? camposCambiados(r) : [],
    }
  }
  if (ultima.accion === 'rechazar') return { estado: 'rechazado', ultima }
  if (ultima.accion === 'despublicar') return { estado: 'despublicado', ultima }
  return { estado: 'pedir_mas', ultima }
}

/**
 * Lo que no se enseña nunca, mande quien mande la publicación.
 *
 * Vive aparte porque hacen falta en DOS sitios: en `visiblePara` y en la lista de
 * anticipadas. Estaban sólo en el primero, y por eso CELO salió a la vez como
 * análisis y como gema anticipada en cuanto la aprobación dejó de depender de la
 * versión. Un guardia repetido a mano es un guardia que se olvida en una copia.
 */
function ocultoSiempre(r: Registro): boolean {
  // El motor marca lo que sólo puede ver la mesa: vale en listas, detalle,
  // seguimiento y visuales a la vez.
  if ((r as { solo_admin?: boolean }).solo_admin) return true
  // Un informe que cambió de tipo deja una versión final marcada: la vieja no se
  // lista, o la misma moneda aparece en gemas y en análisis.
  if ((r as { reclasificado_a?: string }).reclasificado_a) return true
  /* §17: retirado es retirado en todas partes, no sólo del seguimiento. Estaba
     sólo en el track record y PUMP seguía apareciendo en Gemas. Aquí vale para
     listas, detalle, seguimiento, visuales y exportación a la vez. */
  if ((r as { estado_seguimiento?: string }).estado_seguimiento === 'retirado') return true
  return false
}

/** Los informes retirados, para filtrar lo que cuelga de ellos (la agenda). */
export function idsRetirados(): Set<string> {
  const out = new Set<string>()
  for (const r of [...gemasTodas(), ...leer<Registro[]>('analisis')]) {
    if ((r as { estado_seguimiento?: string }).estado_seguimiento === 'retirado') out.add(r.id)
  }
  return out
}

/** Visible para un rol: aprobado en su versión actual y, para base, pasada la ventana de anticipo del pro. */
async function visiblePara(r: Registro, rol: Rol): Promise<boolean> {
  if (rol === 'admin') return true
  if (ocultoSiempre(r)) return false
  const p = await estadoPublicacion(r)
  if (p.estado !== 'aprobado' || !p.publicado_en) return false
  if (r.tipo === 'gema' && !puede(rol, 'gemas.anticipado')) {
    const desde = new Date(p.publicado_en).getTime() + ENV.HORAS_ANTICIPO * 3600_000
    if (Date.now() < desde) return false
  }
  return true
}

/** Gemas recién aprobadas que el base todavía no ve: se le dicen, con la hora. */
export async function anticipadasPara(rol: Rol) {
  if (rol === 'admin' || puede(rol, 'gemas.anticipado')) return []
  const out: { id: string; simbolo: unknown; nombre: unknown; tier: unknown; disponible_desde: string }[] = []
  for (const g of gemasTodas()) {
    if (ocultoSiempre(g)) continue
    const p = await estadoPublicacion(g)
    if (p.estado !== 'aprobado' || !p.publicado_en) continue
    const desde = new Date(p.publicado_en).getTime() + ENV.HORAS_ANTICIPO * 3600_000
    if (Date.now() >= desde) continue
    out.push({ id: g.id, simbolo: g.simbolo, nombre: g.nombre, tier: g.tier, disponible_desde: new Date(desde).toISOString() })
  }
  return out
}
/** filter asíncrono. */
async function filtrar<T>(xs: T[], f: (x: T) => Promise<boolean>) { const ok = await Promise.all(xs.map(f)); return xs.filter((_, i) => ok[i]) }
const conPublicacion = async (r: Registro, rol: Rol) => (rol === 'admin' ? { ...r, publicacion: await estadoPublicacion(r) } : paraCliente(r))

/* Contrato §20.2: lo que el control de calidad corrigió o quitó (`integridad.retiradas`)
   es de la mesa. No se esconde en pantalla: no sale del servidor hacia quien no es admin. */
export function paraCliente(r: Registro): Registro {
  let out: Registro = r
  const ig = r.integridad as { retiradas?: unknown } | undefined
  if (ig && 'retiradas' in ig) {
    const { retiradas: _fuera, ...resto } = ig as Record<string, unknown>
    void _fuera
    out = { ...out, integridad: resto }
  }
  /* §10: el combustible (posiciones apalancadas) es una lectura de la mesa: no calibrada,
     indica volatilidad y no dirección. No sale hacia un cliente, ni en el registro ni en niveles. */
  if ('combustible' in out || (out.niveles as Record<string, unknown> | undefined)?.combustible !== undefined) {
    const { combustible: _c, ...sinC } = out as Record<string, unknown>
    void _c
    const niveles = { ...((out.niveles ?? {}) as Record<string, unknown>) }
    delete niveles.combustible
    out = { ...sinC, niveles } as unknown as Registro
  }
  // Y los avisos que hablan de él (advertencias con seccion o campo «combustible»), estén donde estén.
  return sinSeccionCombustible(out) as Registro
}
const deCombustible = (x: unknown) => {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false
  const o = x as { seccion?: unknown; campo_afectado?: unknown }
  return o.seccion === 'combustible' || (typeof o.campo_afectado === 'string' && o.campo_afectado.startsWith('combustible'))
}
function sinSeccionCombustible(v: unknown): unknown {
  if (Array.isArray(v)) return v.filter((x) => !deCombustible(x)).map(sinSeccionCombustible)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sinSeccionCombustible(x)]))
  return v
}

/* ---------- recortes por rol ---------- */
const CAMPOS_TITULAR = ['id', 'tipo', 'version_motor', 'version_registro', 'escrito_en', 'simbolo', 'nombre', 'cadena',
  'fecha_publicacion', 'origen', 'tier', 'factores_del_tier', 'estado_economico', 'captura_verificada', 'estado_seguimiento']

/** Visitante: titular y tier, nada más (spec §2.1). */
export function soloTitular(r: Registro) {
  const out: Record<string, unknown> = { recorte: 'titular' }
  for (const k of CAMPOS_TITULAR) if (k in r) out[k] = r[k]
  return out
}

export async function gemasPara(rol: Rol) {
  const lista = await filtrar(gemasTodas(), (g) => visiblePara(g, rol))
  if (!puede(rol, 'gemas.informe')) return lista.map(soloTitular)
  return Promise.all(lista.map((g) => conPublicacion(g, rol)))
}

export async function gemaPara(id: string, rol: Rol) {
  const g = gemasTodas().find((x) => x.id === id)
  if (!g) return null
  if (!(await visiblePara(g, rol))) {
    const ant = (await anticipadasPara(rol)).find((a) => a.id === id)
    return ant ? { recorte: 'anticipada', ...ant } : null
  }
  if (!puede(rol, 'gemas.informe')) return soloTitular(g)
  return conPublicacion(g, rol)
}

export async function analisisPara(rol: Rol) {
  // Análisis (monedas sin tesis) es contenido gratis: mismo informe para todos, si está aprobado.
  const lista = await filtrar(await analisisTodos(), (a) => visiblePara(a, rol))
  return Promise.all(lista.map((a) => conPublicacion(a, rol)))
}

/* La lista de análisis mandaba cada registro entero (~100 KB): 301 KB para tres
   informes, y con la distancia al servidor eso se notaba en cada carga. La lista
   sólo pinta la cabecera, la lectura esencial, las cifras de la tarjeta y las
   advertencias; el informe entero va en /api/contenido/analisis/:id. Lo que
   pinta la lista (src/producto/paginas/Analisis.tsx, cifras.tsx) es esto: */
const CAMPOS_LISTA = ['id', 'tipo', 'version_registro', 'simbolo', 'nombre', 'cadena', 'fecha_publicacion', 'tier',
  'estado_economico', 'captura_verificada', 'estado_seguimiento', 'fundamentales', 'asimetria', 'escenarios', 'publicacion']
export function resumenDeLista(r: Registro) {
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS_LISTA) if (k in r) out[k] = r[k]
  const varas = r.varas as { reflexiva?: unknown } | undefined
  out.varas = { reflexiva: varas?.reflexiva ?? null }
  const ficha = r.ficha_esencial as { advertencias?: unknown } | undefined
  out.ficha_esencial = { advertencias: ficha?.advertencias ?? [] }
  // De cada sección, sólo la frase esencial.
  const niveles: Record<string, unknown> = {}
  for (const [k, v] of Object.entries((r.niveles ?? {}) as Record<string, { esencial?: { texto?: unknown } } | null>)) {
    if (k === 'combustible') continue // §10: sólo admin
    niveles[k] = v?.esencial?.texto !== undefined ? { esencial: { texto: v.esencial.texto } } : null
  }
  out.niveles = niveles
  return out
}

export async function analisisUnoPara(id: string, rol: Rol) {
  const a = (await analisisTodos()).find((x) => x.id === id)
  return a && (await visiblePara(a, rol)) ? conPublicacion(a, rol) : null
}

/* ---------- qué cuenta como track record ----------

   El seguimiento y el marcador daban números distintos —"1 tesis en
   seguimiento" contra "2 tesis vivas"— porque cada uno filtraba por su cuenta:
   uno por `visiblePara`, el otro sólo por "aprobado". Ahora salen los dos de
   aquí.

   La regla: entra un informe cuyo tipo vigente es gema Y que el público vio
   como gema. Lo segundo no se puede deducir del dato de hoy —una aprobación
   vieja no dice si alguien llegó a verla—, así que se marca cuando ocurre, en
   `gema_publica`.

   Y una vez marcada no sale nunca, aunque el motor la reclasifique a análisis:
   lo que se publicó se mide hasta su plazo, con la fecha en que cambió. Un
   track record del que se pueden caer las que salieron mal no es un track
   record. */

/** ¿La ve el público ahora mismo, como gema? Ventana de anticipo incluida. */
async function visibleComoGemaAhora(g: Registro): Promise<boolean> {
  if (g.tipo !== 'gema' || ocultoSiempre(g)) return false
  if ((g as { estado_seguimiento?: string }).estado_seguimiento === 'retirado') return false
  const p = await estadoPublicacion(g)
  if (p.estado !== 'aprobado' || !p.publicado_en) return false
  return Date.now() >= new Date(p.publicado_en).getTime() + ENV.HORAS_ANTICIPO * 3600_000
}

/** Se llama al arrancar y tras cada sincronización: anota lo que pasó a público. */
export async function marcarGemasPublicas(): Promise<number> {
  let nuevas = 0
  for (const g of gemasTodas()) {
    if (await visibleComoGemaAhora(g)) {
      const r = await bd.ejecutar('INSERT INTO gema_publica (informe_id, desde, reclasificada_en) VALUES (?, ?, NULL) ON CONFLICT(informe_id) DO NOTHING', [g.id, ahora()])
      if (r.cambios) { nuevas++; marcadasMem = null; console.log(`[track] ${g.simbolo} entra al seguimiento: el público ya la ve como gema`) }
    }
    // Si una marcada se reclasificó, se anota cuándo la vimos cambiar.
    if ((g as { reclasificado_a?: string }).reclasificado_a) {
      const r = await bd.ejecutar('UPDATE gema_publica SET reclasificada_en = ? WHERE informe_id = ? AND reclasificada_en IS NULL', [ahora(), g.id])
      if (r.cambios) marcadasMem = null
    }
  }
  return nuevas
}

/** Los informes del track record, con la fecha de reclasificación si la hubo. */
/* Las marcadas cambian sólo en marcarGemasPublicas: se guardan en memoria y se
   olvidan allí, o al minuto. Era una consulta por cada petición del marcador. */
let marcadasMem: { hasta: number; filas: { informe_id: string; reclasificada_en: string | null }[] } | null = null
async function gemasMarcadas(forzar = false) {
  if (!forzar && marcadasMem && marcadasMem.hasta > Date.now()) return marcadasMem.filas
  const filas = await bd.todos<{ informe_id: string; reclasificada_en: string | null }>('SELECT informe_id, reclasificada_en FROM gema_publica')
  marcadasMem = { hasta: Date.now() + 60_000, filas }
  return filas
}

export async function gemasDelSeguimiento(): Promise<{ registro: Registro; reclasificada_en: string | null }[]> {
  const marcadas = await gemasMarcadas()
  const porId = new Map(gemasTodas().map((g) => [g.id, g]))
  const out: { registro: Registro; reclasificada_en: string | null }[] = []
  for (const m of marcadas) {
    const g = porId.get(m.informe_id)
    if (!g) continue
    /* §17: una tesis retirada sale del track record y del marcador públicos.
       No se borra nada: sigue entera en admin y en la base. */
    if ((g as { estado_seguimiento?: string }).estado_seguimiento === 'retirado') continue
    out.push({ registro: g, reclasificada_en: m.reclasificada_en })
  }
  return out
}

/* ---------- una invalidación con cero no es una tesis rota ----------

   PUMP salió como ROTA porque `revenue_holders_30d` se leyó 0 USD y cero está,
   por debajo de cualquier umbral. Un cero casi nunca es una medición: es una
   fuente que no respondió. Decirle a un suscriptor que su tesis se rompió por
   eso es el peor error posible de esta pantalla.

   La medición la hace el motor; aquí sólo se decide no afirmar lo que no está
   sostenido. Mientras el valor sea cero o falte, el estado es EN_REVISION: ni
   se afirma que la tesis aguanta ni que se rompió. Y no se genera alerta. */
export function invalidacionFiable(ev: unknown, fila?: Record<string, unknown>): boolean {
  /* §16: el motor ya lo declara. `dato_confiable: false` es un cero contra un
     umbral positivo, un dato ausente o una caída de más del 80 % en un día;
     `pendiente_confirmacion` es un cruce sin la segunda lectura que lo
     confirme. Ninguno de los dos es una tesis rota. */
  if (fila) {
    if (fila.dato_confiable === false) return false
    if (fila.pendiente_confirmacion === true) return false
  }
  if (!ev || typeof ev !== 'object') return false
  const e = ev as { valor?: unknown; evaluable?: unknown }
  if (e.evaluable === false) return false
  return typeof e.valor === 'number' && Number.isFinite(e.valor) && e.valor !== 0
}

/** La fila del seguimiento, con el estado corregido si la medición no se sostiene. */
function conInvalidacionRevisada(x: Record<string, unknown>): Record<string, unknown> {
  if (!x.invalidacion_activada) return x
  if (invalidacionFiable(x.evaluacion_invalidacion, x)) return x
  return { ...x, estado_tesis: 'EN_REVISION', invalidacion_activada: false, invalidacion_en_revision: true }
}

export async function seguimientoPara(_rol: Rol) {
  const track = await gemasDelSeguimiento()
  const dentro = new Set(track.map((t) => t.registro.id))
  const recl = new Map(track.filter((t) => t.reclasificada_en).map((t) => [t.registro.id, t.reclasificada_en!]))
  const s = seguimientoTodo()
  const marcar = (x: Record<string, unknown>) => {
    const y = conInvalidacionRevisada(x)
    const f = recl.get(String(y.gema_id))
    return f ? { ...y, reclasificada_en: f } : y
  }
  return {
    ultimo: s.ultimo.filter((x) => dentro.has(String(x.gema_id))).map(marcar),
    historial: s.historial.filter((x) => dentro.has(String(x.gema_id))).map(marcar),
  }
}

/* ---------- paquete del motor para la bandeja ---------- */
export function paqueteDe(id: string) {
  const dir = resolve(ENV.REPORTS, id)
  const lee = (f: string) => { const p = resolve(dir, f); return existsSync(p) ? readFileSync(p, 'utf8') : null }
  const json = (f: string) => { const t = lee(f); try { return t ? JSON.parse(t) : null } catch { return null } }
  return {
    disponible: existsSync(dir),
    informe_md: lee('informe.md'),
    verificador: json('verificador.json'),
    esceptico: json('esceptico.json'),
    paquete: json('paquete.json'),
  }
}

/* ---------- marcador contra los benchmarks ----------
   Lo que el cron ya calculó cada día, puesto en primer plano. Acá NO se calcula
   ningún retorno: se comparan los que vienen (gema vs benchmark) y se cuentan.
   Un benchmark no medible cuenta como "sin medir", nunca como cero. */
export type Lado = 'gana' | 'pierde' | 'sin_medir'
const lado = (gema: number | null | undefined, detalle: { medible?: boolean; valor?: number | null } | undefined, bruto: number | null | undefined): Lado => {
  const medible = detalle ? detalle.medible : bruto !== null && bruto !== undefined
  const b = detalle ? detalle.valor : bruto
  if (!medible || typeof b !== 'number' || typeof gema !== 'number') return 'sin_medir'
  return gema > b ? 'gana' : 'pierde'
}

export interface MarcadorGema {
  gema_id: string; simbolo: string; fecha: string; estado_tesis: string; dias_al_cierre: number
  retorno_gema: number | null
  b1: { lado: Lado; valor: number | null; motivo_codigo: string; motivo_texto: string; fuente: string }
  b2: { lado: Lado; valor: number | null; motivo_codigo: string; motivo_texto: string; fuente: string }
  cerrada: boolean
}

export function marcadorDe(u: Registro, simbolo: string): MarcadorGema {
  const d1 = u.benchmark_canasta_detalle as MarcadorGema['b1'] & { medible: boolean } | undefined
  const d2 = u.benchmark_regla_simple_detalle as MarcadorGema['b2'] & { medible: boolean } | undefined
  const r = u.retorno_desde_publicacion as number | null
  const dias = Number(u.dias_al_cierre ?? 0)
  return {
    gema_id: String(u.gema_id), simbolo, fecha: String(u.fecha), estado_tesis: String(u.estado_tesis), dias_al_cierre: dias,
    retorno_gema: typeof r === 'number' ? r : null,
    b1: { lado: lado(r, d1, u.benchmark_canasta as number | null), valor: d1 ? d1.valor : (u.benchmark_canasta as number | null), motivo_codigo: d1?.motivo_codigo ?? '', motivo_texto: d1?.motivo_texto ?? '', fuente: d1?.fuente ?? '' },
    b2: { lado: lado(r, d2, u.benchmark_regla_simple as number | null), valor: d2 ? d2.valor : (u.benchmark_regla_simple as number | null), motivo_codigo: d2?.motivo_codigo ?? '', motivo_texto: d2?.motivo_texto ?? '', fuente: d2?.fuente ?? '' },
    cerrada: dias <= 0 || String(u.estado_tesis) === 'CERRADA',
  }
}

/** Marcador agregado: cómo van TODAS las gemas vivas y publicadas. Es evidencia de método: gratis para todos. */
export async function marcadorAgregado() {
  // El mismo conjunto que el seguimiento: si no, la cabecera y el marcador
  // cuentan cosas distintas y una de las dos miente.
  const track = await gemasDelSeguimiento()
  const porId = new Map(track.map((t) => [t.registro.id, t.registro]))
  /* Por el mismo filtro que la pantalla: si aquí se lee el dato crudo, el
     marcador dice ROTA mientras el seguimiento dice "dato en revisión", y una
     de las dos miente. Es el mismo error que ya costó "1 tesis" contra "2". */
  const filas = seguimientoTodo().ultimo
    .filter((u) => porId.has(String(u.gema_id)))
    .map((u) => conInvalidacionRevisada(u as Record<string, unknown>) as typeof u)
    .map((u) => marcadorDe(u, String(porId.get(String(u.gema_id))!.simbolo)))
  const cuenta = (k: 'b1' | 'b2') => ({ gana: filas.filter((f) => f[k].lado === 'gana').length, pierde: filas.filter((f) => f[k].lado === 'pierde').length, sin_medir: filas.filter((f) => f[k].lado === 'sin_medir').length })
  const fecha = filas.map((f) => f.fecha).sort().at(-1) ?? null
  return { fecha, vivas: filas.filter((f) => !f.cerrada).length, cerradas: filas.filter((f) => f.cerrada).length, b1: cuenta('b1'), b2: cuenta('b2'), gemas: filas, definicion: benchmark() }
}

/* ---------- §22: lo que está publicado, escrito para el motor ----------

   La bandeja es la única autoridad sobre qué está publicado. El motor no la ve:
   lee este fichero (contrato §22). Se reescribe entero y de forma atómica
   (temporal + rename) en cada decisión, al arrancar y tras cada sincronización
   si cambió algo. Sólo lleva lo publicado: lo que no está, no está publicado. */
export const RUTA_PUBLICADOS = () => resolve(ENV.BASE_CONTENIDO, 'publicados-web.json')
let cola: Promise<unknown> = Promise.resolve()

export function escribirPublicados(motivo: 'decision' | 'arranque' | 'sincronizacion') {
  const tarea = cola.then(() => escribir(motivo))
  cola = tarea.catch(() => {})
  return tarea
}

async function escribir(motivo: string): Promise<{ secuencia: number; informes: number; escrito: boolean }> {
  const ruta = RUTA_PUBLICADOS()
  let previo: { secuencia?: number; informes?: unknown; noticias_despublicadas?: unknown } = {}
  try { previo = JSON.parse(readFileSync(ruta, 'utf8')) } catch { /* no existe todavía */ }
  const d = declaradas()
  const informes: { id: string; tipo: string; estado: 'publicado'; version_registro: number; decidido: string; por: 'admin' }[] = []
  const vistos = new Set<string>()
  for (const r of [...gemasTodas(), ...(await analisisTodos())]) {
    const clave = `${r.tipo}:${r.id}`
    if (vistos.has(clave) || ocultoSiempre(r) || esDeclarada(r, d)) continue
    const p = await estadoPublicacion(r)
    if (p.estado !== 'aprobado' || !p.publicado_en) continue
    vistos.add(clave)
    informes.push({ id: r.id, tipo: String(r.tipo), estado: 'publicado', version_registro: Number(p.version_aprobada ?? r.version_registro), decidido: p.publicado_en, por: 'admin' })
  }
  informes.sort((a, b) => a.id.localeCompare(b.id) || a.tipo.localeCompare(b.tipo))
  const noticias_despublicadas = [...(await noticiasDespublicadas())].sort()
  const igual = JSON.stringify(previo.informes) === JSON.stringify(informes) && JSON.stringify(previo.noticias_despublicadas) === JSON.stringify(noticias_despublicadas)
  const secuenciaPrevia = Number(previo.secuencia ?? 0)
  if (igual && motivo === 'sincronizacion') return { secuencia: secuenciaPrevia, informes: informes.length, escrito: false }
  const secuencia = secuenciaPrevia + 1
  const cuerpo = { version: 1, generado: new Date().toISOString(), secuencia, informes, noticias_despublicadas }
  const tmp = `${ruta}.tmp`
  writeFileSync(tmp, JSON.stringify(cuerpo, null, 2) + '\n', { mode: 0o644 })
  renameSync(tmp, ruta)
  console.log(`[publicados-web] secuencia ${secuencia} · ${informes.length} informes · ${noticias_despublicadas.length} noticias despublicadas (${motivo})`)
  return { secuencia, informes: informes.length, escrito: true }
}

alCambiarPublicacion(() => { escribirPublicados('decision').catch((e) => console.error('[publicados-web]', (e as Error).message)) })

/* Las memorias de arriba se refrescan solas antes de caducar: ninguna petición paga la
   consulta a Supabase por llegar después de un rato sin tráfico (medido: 257 ms y 118 ms). */
setInterval(() => {
  resultadosAPedido(true).catch((e) => console.warn('[contenido] refresco a pedido:', (e as Error).message))
  gemasMarcadas(true).catch((e) => console.warn('[contenido] refresco marcadas:', (e as Error).message))
}, 45_000).unref()
