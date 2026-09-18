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
`)
// bases SQLite anteriores: la columna llegó después
await bd.columna('solicitud', 'enviada', 'INTEGER NOT NULL DEFAULT 1')

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

export async function registrarAccion(a: { admin_id: string; admin_email: string; accion: string; objetivo_tipo: string; objetivo_id?: string | null; detalle?: unknown }) {
  await bd.ejecutar(`INSERT INTO acciones_admin (admin_id, admin_email, accion, objetivo_tipo, objetivo_id, detalle, fecha) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [a.admin_id, a.admin_email, a.accion, a.objetivo_tipo, a.objetivo_id ?? null, a.detalle === undefined ? null : JSON.stringify(a.detalle), ahora()])
}
