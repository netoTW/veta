/* ============================================================================
   Base de datos: Postgres (Supabase) en producción, SQLite en local.

   Una sola interfaz asíncrona; el SQL se escribe con `?` y en un dialecto
   común a los dos motores (ON CONFLICT, RETURNING, COALESCE, substr…). Lo
   poco que difiere (autoincremento, REAL, ADD COLUMN IF NOT EXISTS) se
   traduce acá. Con DATABASE_URL presente se usa Postgres; si no, el archivo
   SQLite de VETA_DB. better-auth recibe el mismo motor por `crudo`.
   ========================================================================== */
import { ENV } from './entorno.ts'

export type Fila = Record<string, unknown>
export interface Bd {
  motor: 'sqlite' | 'postgres'
  uno<T = Fila>(sql: string, params?: unknown[]): Promise<T | undefined>
  todos<T = Fila>(sql: string, params?: unknown[]): Promise<T[]>
  /** INSERT/UPDATE/DELETE. `filas` trae lo que devuelva RETURNING. */
  ejecutar(sql: string, params?: unknown[]): Promise<{ cambios: number; filas: Fila[] }>
  /** DDL, varias sentencias separadas por `;`. */
  exec(sql: string): Promise<void>
  /** Sólo Postgres: `ALTER TABLE … ADD COLUMN IF NOT EXISTS`; en SQLite se mira la tabla. */
  columna(tabla: string, columna: string, definicion: string): Promise<void>
  crudo: unknown
}

/** `?` → `$1, $2…` para Postgres. Nuestro SQL no lleva `?` dentro de literales. */
function posicional(sql: string) { let i = 0; return sql.replace(/\?/g, () => `$${++i}`) }
/** El DDL se escribe en SQLite; para Postgres se cambian tres cosas. */
function ddlPg(sql: string) {
  return sql
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
}

async function abrirPostgres(url: string): Promise<Bd> {
  const { default: pg } = await import('pg')
  // bigint (COUNT, SUM de enteros) y numeric llegan como texto: se quieren números
  pg.types.setTypeParser(20, (v: string) => parseInt(v, 10))
  pg.types.setTypeParser(1700, (v: string) => parseFloat(v))
  const local = /localhost|127\.0\.0\.1/.test(url)
  const pool = new pg.Pool({ connectionString: url, max: 8, ssl: local ? undefined : { rejectUnauthorized: false }, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
  pool.on('error', (e) => console.error('[bd] postgres:', e.message))
  return {
    motor: 'postgres', crudo: pool,
    async uno<T>(sql: string, params: unknown[] = []) { const r = await pool.query(posicional(sql), params); return r.rows[0] as T | undefined },
    async todos<T>(sql: string, params: unknown[] = []) { const r = await pool.query(posicional(sql), params); return r.rows as T[] },
    async ejecutar(sql: string, params: unknown[] = []) { const r = await pool.query(posicional(sql), params); return { cambios: r.rowCount ?? 0, filas: r.rows as Fila[] } },
    async exec(sql: string) { await pool.query(ddlPg(sql)) },
    async columna(tabla, columna, definicion) { await pool.query(`ALTER TABLE ${tabla} ADD COLUMN IF NOT EXISTS ${columna} ${ddlPg(definicion)}`) },
  }
}

async function abrirSqlite(ruta: string): Promise<Bd> {
  const { default: Database } = await import('better-sqlite3')
  const { mkdirSync } = await import('node:fs'); const { dirname } = await import('node:path')
  mkdirSync(dirname(ruta), { recursive: true })
  const db = new Database(ruta)
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON')
  return {
    motor: 'sqlite', crudo: db,
    async uno<T>(sql: string, params: unknown[] = []) { return db.prepare(sql).get(...params) as T | undefined },
    async todos<T>(sql: string, params: unknown[] = []) { return db.prepare(sql).all(...params) as T[] },
    async ejecutar(sql: string, params: unknown[] = []) {
      const st = db.prepare(sql)
      if (/\bRETURNING\b/i.test(sql)) { const filas = st.all(...params) as Fila[]; return { cambios: filas.length, filas } }
      const r = st.run(...params); return { cambios: r.changes, filas: [] }
    },
    async exec(sql: string) { db.exec(sql) },
    async columna(tabla, columna, definicion) {
      const cols = (db.prepare(`PRAGMA table_info(${tabla})`).all() as { name: string }[]).map((c) => c.name)
      if (!cols.includes(columna)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`)
    },
  }
}

export const bd: Bd = ENV.DATABASE_URL ? await abrirPostgres(ENV.DATABASE_URL) : await abrirSqlite(ENV.DB)
console.log(`[bd] ${bd.motor}${bd.motor === 'sqlite' ? ` · ${ENV.DB}` : ''}`)
