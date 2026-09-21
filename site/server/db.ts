/* ============================================================================
   Tablas del modelo de usuarios (spec §6) y helpers de escritura.

   Las tablas de autenticación (user, session, account, verification) las
   crea better-auth con sus migraciones. `user` lleva además plan, estado y
   ultimo_acceso (campos adicionales). Las tablas de abajo son de VETA y se
   crean igual en SQLite y en Postgres (bd.ts traduce lo poco que difiere).

   Regla: las contraseñas viven hasheadas en `account` (scrypt, por
   better-auth). No hay ninguna consulta ni endpoint que las lea o exporte.
   ========================================================================== */
import { bd } from './bd.ts'
import { ENV } from './entorno.ts'

export { bd }

await bd.exec(`
CREATE TABLE IF NOT EXISTS suscripcion (
  usuario_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('activa','vencida','cancelada')),
  fecha_renovacion TEXT NOT NULL,
  proveedor_pago TEXT,
  id_externo TEXT,
  actualizada_en TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cupo (
  usuario_id TEXT NOT NULL,
  periodo TEXT NOT NULL,
  analisis_incluidos INTEGER NOT NULL DEFAULT 0,
  analisis_usados INTEGER NOT NULL DEFAULT 0,
  solicitudes_scanner_usadas INTEGER NOT NULL DEFAULT 0,
  fecha_reinicio TEXT NOT NULL,
  PRIMARY KEY (usuario_id, periodo)
);
CREATE TABLE IF NOT EXISTS uso_analisis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  simbolo TEXT NOT NULL,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('determinista','profundo')),
  consumio_cupo INTEGER NOT NULL DEFAULT 0,
  costo_real_usd REAL NOT NULL DEFAULT 0,
  resultado TEXT
);
CREATE TABLE IF NOT EXISTS alerta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('invalidacion','gatillo','analisis_listo')),
  gema_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  leida INTEGER NOT NULL DEFAULT 0,
  detalle TEXT,
  UNIQUE (usuario_id, tipo, gema_id, fecha)
);
-- Estado de publicación de cada informe del motor: lo único que la
-- plataforma decide sobre el contenido. Una fila por decisión (historial).
CREATE TABLE IF NOT EXISTS publicacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  informe_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  version_registro INTEGER NOT NULL,
  accion TEXT NOT NULL CHECK (accion IN ('aprobar','rechazar','pedir_mas','despublicar')),
  motivo TEXT,
  verificador_estado TEXT,
  bloqueo_confirmado INTEGER NOT NULL DEFAULT 0,
  admin_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  fecha TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS publicacion_informe ON publicacion (informe_id, fecha);
-- Predicción del usuario sobre una gema: ¿le gana a la canasta (B1) al cierre? Una sola vez,
-- con fecha, y no se cambia: si se pudiera cambiar, no valdría nada.
CREATE TABLE IF NOT EXISTS prediccion (
  usuario_id TEXT NOT NULL,
  gema_id TEXT NOT NULL,
  prediccion TEXT NOT NULL CHECK (prediccion IN ('gana','no_gana')),
  fecha TEXT NOT NULL,
  retorno_gema_al_marcar REAL,
  b1_al_marcar REAL,
  dias_al_cierre_al_marcar INTEGER,
  PRIMARY KEY (usuario_id, gema_id)
);
-- Analiza tu moneda: cada pedido al motor (determinista o profundo), con su
-- progreso espejado desde el motor y el resultado. El cupo se reserva al
-- pedir y se devuelve si falla o lo bloquea la verificación.
CREATE TABLE IF NOT EXISTS solicitud (
  id TEXT PRIMARY KEY,
  usuario_id TEXT,
  usuario_email TEXT,
  simbolo TEXT NOT NULL,
  nombre TEXT,
  nivel TEXT NOT NULL CHECK (nivel IN ('determinista','profundo')),
  origen TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('en_cola','en_curso','listo','fallido','bloqueado')),
  etapa TEXT,
  avance REAL,
  detalle TEXT,
  etapas_hechas TEXT NOT NULL DEFAULT '[]',
  resultado TEXT,
  fallo TEXT,
  verificador TEXT,
  consume_cupo INTEGER NOT NULL DEFAULT 0,
  cupo_periodo TEXT,
  costo_real_usd REAL NOT NULL DEFAULT 0,
  motor TEXT NOT NULL DEFAULT 'simulador',
  creada TEXT NOT NULL,
  iniciada TEXT,
  terminada TEXT,
  actualizada TEXT NOT NULL,
  vista INTEGER NOT NULL DEFAULT 0,
  enviada INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS solicitud_usuario ON solicitud (usuario_id, creada);
-- Ajustes que el admin cambia en caliente (tope mensual de gasto, última sincronización).
CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado TEXT NOT NULL);
-- Quién cambió qué y cuándo. Hoy es Pablo; mañana, los socios.
CREATE TABLE IF NOT EXISTS acciones_admin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  accion TEXT NOT NULL,
  objetivo_tipo TEXT NOT NULL,
  objetivo_id TEXT,
  detalle TEXT,
  fecha TEXT NOT NULL
);
-- Track record: qué gemas vio el público COMO gemas. Se marca la primera vez
-- que una pasa a ser visible de verdad (aprobada, sin reclasificar y con la
-- ventana de anticipo ya cumplida). Una vez marcada no sale nunca del
-- seguimiento, aunque el motor la reclasifique después: lo que se publicó, se
-- mide hasta su plazo. Sin esta marca habría que adivinar el pasado.
CREATE TABLE IF NOT EXISTS gema_publica (
  informe_id TEXT PRIMARY KEY,
  desde TEXT NOT NULL,
  reclasificada_en TEXT
);
-- Enlaces cortos de redes: vetalab.io/ig y compañía. Viven aquí y no en el
-- código para poder añadir o cambiar uno desde admin sin desplegar.
CREATE TABLE IF NOT EXISTS enlace_corto (
  slug TEXT PRIMARY KEY,
  destino TEXT NOT NULL DEFAULT '/',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  notas TEXT,
  visitas INTEGER NOT NULL DEFAULT 0,
  ultima_visita TEXT,
  creado TEXT NOT NULL,
  actualizado TEXT NOT NULL
);
-- Cobro con Whop. Una fila por aviso recibido, con el id del mensaje como llave:
-- un reenvío choca contra la llave y no vuelve a aplicar nada (idempotencia).
CREATE TABLE IF NOT EXISTS pago_evento (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  membresia_id TEXT,
  usuario_id TEXT,
  plan TEXT,
  emitido TEXT,
  recibido TEXT NOT NULL,
  resultado TEXT NOT NULL,
  detalle TEXT
);
CREATE INDEX IF NOT EXISTS pago_evento_membresia ON pago_evento (membresia_id, recibido);
-- Qué membresía de Whop es de qué cuenta de VETA. Con esto una baja se atiende
-- aunque el aviso no traiga correo, y no dependemos del correo para reconocer.
CREATE TABLE IF NOT EXISTS pago_membresia (
  membresia_id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  estado TEXT NOT NULL,
  plan_whop TEXT,
  renovacion TEXT,
  ultimo_evento TEXT,
  actualizada TEXT NOT NULL
);
`)
// bases SQLite anteriores: la columna llegó después
await bd.columna('solicitud', 'enviada', 'INTEGER NOT NULL DEFAULT 1')
/* §9.5: cuál de las homónimas se pidió. Se guarda porque el pedido que viaja al motor se
   reconstruye desde esta fila, no desde el cuerpo de la petición. */
await bd.columna('solicitud', 'contrato', 'TEXT')
await bd.columna('solicitud', 'cadena', 'TEXT')
/* Cobro con Whop. `cancela_al_final` es quien canceló y sigue con acceso hasta
   que termine el ciclo pagado: no baja de plan, pero el admin tiene que verlo.
   `pago_fallido_en` es el último cobro que no entró; tampoco baja de plan,
   porque Whop reintenta y la baja real llega con membership.deactivated.
   `origen` guarda de dónde vino el suscriptor (UTM de la visita). */
await bd.columna('suscripcion', 'cancela_al_final', 'INTEGER NOT NULL DEFAULT 0')
await bd.columna('suscripcion', 'pago_fallido_en', 'TEXT')
await bd.columna('suscripcion', 'origen', 'TEXT')
await bd.columna('pago_membresia', 'cancela_al_final', 'INTEGER NOT NULL DEFAULT 0')

export const ahora = () => new Date().toISOString()

/* ---------- suscripción y cupo: se crean/ajustan cuando cambia el plan ---------- */
export async function asignarPlan(usuarioId: string, plan: 'gratis' | 'base' | 'pro') {
  const hoy = new Date()
  const renov = new Date(hoy); renov.setMonth(renov.getMonth() + 1)
  await bd.ejecutar(`INSERT INTO suscripcion (usuario_id, plan, estado, fecha_renovacion, proveedor_pago, id_externo, actualizada_en)
              VALUES (?, ?, 'activa', ?, NULL, NULL, ?)
              ON CONFLICT(usuario_id) DO UPDATE SET plan = excluded.plan, estado = 'activa', actualizada_en = excluded.actualizada_en`,
    [usuarioId, plan, renov.toISOString(), ahora()])
  const incluidos = ENV.CUPO[plan] ?? 0
  // el periodo del cupo es el inicio del ciclo (día de renovación), no el mes calendario (spec §5.1)
  await bd.ejecutar(`INSERT INTO cupo (usuario_id, periodo, analisis_incluidos, analisis_usados, solicitudes_scanner_usadas, fecha_reinicio)
              VALUES (?, ?, ?, 0, 0, ?)
              ON CONFLICT(usuario_id, periodo) DO UPDATE SET analisis_incluidos = excluded.analisis_incluidos, fecha_reinicio = excluded.fecha_reinicio`,
    [usuarioId, hoy.toISOString().slice(0, 10), incluidos, renov.toISOString()])
}

/**
 * Igual que asignarPlan, pero para un plan que manda un proveedor de pago.
 *
 * Dos diferencias que importan: la renovación es la que informa el proveedor (no
 * "hoy más un mes"), y queda anotado de quién viene. El periodo del cupo se
 * calcula igual que en cupo.ts — el inicio del ciclo es la renovación menos un
 * mes — porque si las dos cuentas no coinciden, el cupo que se escribe aquí no
 * es el que se lee después.
 */
export async function asignarPlanExterno(
  usuarioId: string,
  plan: 'gratis' | 'base' | 'pro',
  o: { proveedor: string; id_externo?: string | null; renovacion?: string | null; estado?: 'activa' | 'vencida' | 'cancelada'; origen?: string | null },
) {
  const hoy = new Date()
  let renov = o.renovacion ? new Date(o.renovacion) : new Date(NaN)
  if (Number.isNaN(renov.getTime()) || renov.getTime() <= hoy.getTime()) {
    renov = new Date(hoy); renov.setMonth(renov.getMonth() + 1)
  }
  const estado = o.estado ?? 'activa'
  /* Un alta limpia el estado de aviso: quien vuelve a pagar ya no está cancelando
     ni arrastra un cobro fallido. El origen sólo se escribe la primera vez: de
     dónde vino un suscriptor no cambia porque renueve. */
  await bd.ejecutar(`INSERT INTO suscripcion (usuario_id, plan, estado, fecha_renovacion, proveedor_pago, id_externo, actualizada_en, cancela_al_final, pago_fallido_en, origen)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
              ON CONFLICT(usuario_id) DO UPDATE SET plan = excluded.plan, estado = excluded.estado,
                fecha_renovacion = excluded.fecha_renovacion, proveedor_pago = excluded.proveedor_pago,
                id_externo = excluded.id_externo, actualizada_en = excluded.actualizada_en,
                cancela_al_final = 0, pago_fallido_en = NULL,
                origen = COALESCE(suscripcion.origen, excluded.origen)`,
    [usuarioId, plan, estado, renov.toISOString(), o.proveedor, o.id_externo ?? null, ahora(), o.origen ?? null])
  // mismo cálculo que cupo.ts: el periodo es el inicio del ciclo, no el mes calendario
  const inicio = new Date(renov); inicio.setMonth(inicio.getMonth() - 1)
  const incluidos = ENV.CUPO[plan] ?? 0
  await bd.ejecutar(`INSERT INTO cupo (usuario_id, periodo, analisis_incluidos, analisis_usados, solicitudes_scanner_usadas, fecha_reinicio)
              VALUES (?, ?, ?, 0, 0, ?)
              ON CONFLICT(usuario_id, periodo) DO UPDATE SET analisis_incluidos = excluded.analisis_incluidos, fecha_reinicio = excluded.fecha_reinicio`,
    [usuarioId, inicio.toISOString().slice(0, 10), incluidos, renov.toISOString()])
}

/* ---------- plan vigente, sin pagar un viaje a la base en cada petición ----------

   La cookie de sesión guarda una copia del plan durante cinco minutos, y quien
   acaba de pagar no puede esperar cinco minutos para entrar a lo que pagó. Pero
   preguntarle a la base en cada petición cuesta un viaje de ida y vuelta.

   El arreglo es una memoria de diez segundos que el cambio de plan borra: cuando
   Whop avisa —o cuando admin cambia un plan a mano— se olvida esa cuenta y la
   siguiente petición lee el valor nuevo. Sin espera y sin viaje por request. */
const PLANES_VISTOS = new Map<string, { plan: string; suspendido: boolean; hasta: number }>()
const MEMORIA_MS = 10_000

export function olvidarPlan(usuarioId: string) { PLANES_VISTOS.delete(usuarioId) }

export async function planVigente(usuarioId: string): Promise<{ plan: string; suspendido: boolean } | null> {
  const visto = PLANES_VISTOS.get(usuarioId)
  if (visto && visto.hasta > Date.now()) return { plan: visto.plan, suspendido: visto.suspendido }
  const u = await bd.uno<{ plan: string | null; banned: unknown }>('SELECT plan, banned FROM "user" WHERE id = ?', [usuarioId]).catch(() => undefined)
  if (!u) return null
  const valor = { plan: u.plan ?? 'gratis', suspendido: !!u.banned }
  PLANES_VISTOS.set(usuarioId, { ...valor, hasta: Date.now() + MEMORIA_MS })
  return valor
}

export async function registrarAccion(a: { admin_id: string; admin_email: string; accion: string; objetivo_tipo: string; objetivo_id?: string | null; detalle?: unknown }) {
  await bd.ejecutar(`INSERT INTO acciones_admin (admin_id, admin_email, accion, objetivo_tipo, objetivo_id, detalle, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [a.admin_id, a.admin_email, a.accion, a.objetivo_tipo, a.objetivo_id ?? null, a.detalle === undefined ? null : JSON.stringify(a.detalle), ahora()])
}
