/* ============================================================================
   Operación: la web mira el servidor del motor.

   Dos cosas, las dos sólo para admin:
   1. Sincronizar contenido: `scripts/sincronizar-servidor.sh` trae por rsync lo que
      el motor deja en el servidor (base_contenido y reports) y recompila
      server/datos. Corre cada VETA_SYNC_MINUTOS y a pedido. Así la bandeja
      lee informes DEL SERVIDOR sin que nadie copie nada a mano.
   2. Proxy de /operacion/*: estado, hits, cola, alertas y lanzar, contra el
      servicio del motor por el túnel SSH (VETA_OPERACION_URL). El token
      (VETA_OPERACION_TOKEN) vive en el entorno y nunca llega al navegador.
   ========================================================================== */
import { Hono } from 'hono'
import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bd, ahora, registrarAccion } from './db.ts'
import { ENV, RAIZ_SITE } from './entorno.ts'
import { sesionDe, type Sesion } from './auth.ts'
import { rolDe } from '../src/lib/matriz.ts'

/* ---------- sincronización ---------- */
interface Sync { cuando: string | null; ok: boolean | null; duracion_s: number | null; salida: string; en_curso: boolean; proxima: string | null }
const sync: Sync = { cuando: null, ok: null, duracion_s: null, salida: '', en_curso: false, proxima: null }
{
  const a = await bd.uno<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'sync_ultimo'")
  if (a) { try { Object.assign(sync, JSON.parse(a.valor), { en_curso: false }) } catch { /* nada */ } }
}
/** Hay algo que sincronizar: por SSH desde otra máquina, o en local si la web corre junto al motor. */
const configurado = () => !!((ENV.SERVIDOR_SSH && ENV.SERVIDOR_RUTA) || ENV.SYNC_MODO === 'local')

export function sincronizar(): Promise<Sync> {
  if (sync.en_curso) return Promise.resolve(sync)
  if (!configurado()) { sync.ok = false; sync.salida = 'sin VETA_SERVIDOR_SSH / VETA_SERVIDOR_RUTA ni VETA_SYNC_MODO=local en el entorno'; return Promise.resolve(sync) }
  sync.en_curso = true
  const t0 = Date.now()
  return new Promise((res) => {
    /* El callback es async y execFile no recoge lo que devuelve: si algo de aquí
       dentro lanza, la promesa queda sin manejar y Node 22 mata el proceso. Una
       sincronización que falla no puede dejar la web sin servir a nadie. */
    execFile('bash', [resolve(RAIZ_SITE, 'scripts/sincronizar-servidor.sh')], { cwd: RAIZ_SITE, timeout: 180_000, env: { ...process.env, VETA_SERVIDOR_SSH: ENV.SERVIDOR_SSH, VETA_SERVIDOR_CLAVE: ENV.SERVIDOR_CLAVE, VETA_SERVIDOR_RUTA: ENV.SERVIDOR_RUTA, VETA_SYNC_MODO: ENV.SYNC_MODO, VETA_BASE_CONTENIDO: ENV.BASE_CONTENIDO, VETA_DATOS: ENV.DATOS } }, (err, stdout, stderr) => {
      void (async () => {
        try {
          sync.en_curso = false; sync.cuando = ahora(); sync.duracion_s = Math.round((Date.now() - t0) / 100) / 10
          sync.ok = !err; sync.salida = (err ? `${stderr || err.message}` : stdout).trim().split('\n').slice(-6).join('\n')
          sync.proxima = new Date(Date.now() + ENV.SYNC_MINUTOS * 60_000).toISOString()
          await bd.ejecutar("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('sync_ultimo', ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado", [JSON.stringify(sync), ahora()])
          if (err) console.warn('[sync] falló:', sync.salida); else console.log('[sync]', sync.salida.split('\n').pop())
          if (!err) await vigilarPublicados().catch((e) => console.warn('[publicados]', (e as Error).message))
        } catch (e) {
          sync.en_curso = false
          console.error('[sync] error al registrar el resultado:', (e as Error).message)
        } finally {
          res(sync)
        }
      })()
    })
  })
}
if (configurado() && ENV.SYNC_MINUTOS > 0) {
  setTimeout(() => { sincronizar().catch((e) => console.error('[sync]', e)) }, 4000)
  setInterval(() => { sincronizar().catch((e) => console.error('[sync]', e)) }, ENV.SYNC_MINUTOS * 60_000)
}

/* ---------- el motor en el servidor ---------- */
async function motor<T>(ruta: string, init?: RequestInit & { quien?: string }): Promise<{ status: number; cuerpo: T | null; caido: boolean }> {
  if (!ENV.OPERACION_TOKEN) return { status: 503, cuerpo: { error: 'sin_token_local', texto: 'la web no tiene VETA_OPERACION_TOKEN en su entorno' } as T, caido: false }
  try {
    const r = await fetch(`${ENV.OPERACION_URL}${ruta}`, { ...init, signal: AbortSignal.timeout(25_000), headers: { 'Content-Type': 'application/json', 'X-Veta-Token': ENV.OPERACION_TOKEN, ...(init?.quien ? { 'X-Veta-Quien': init.quien } : {}), ...(init?.headers ?? {}) } })
    const texto = await r.text().catch(() => '')
    let cuerpo: T | null = null; try { cuerpo = texto ? JSON.parse(texto) : null } catch { cuerpo = null }
    return { status: r.status, cuerpo, caido: false }
  } catch (e) {
    return { status: 0, cuerpo: { error: 'tunel_caido', texto: (e as Error).message } as T, caido: true }
  }
}

/** La última tanda que el motor dejó registrada en el servidor (sincronizada a local). */
function tandaLocal() {
  const f = resolve(ENV.BASE_CONTENIDO, 'tanda_depuracion', 'rendimiento.jsonl')
  if (!existsSync(f)) return null
  const filas = readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) as Record<string, unknown>[]
  if (!filas.length) return null
  const n = (v: unknown) => (typeof v === 'number' ? v : null)
  const corridas = filas.map((r) => ({
    simbolo: r.simbolo, corrida: r.corrida, cuando: r.cuando, tier: r.tier, hay_tesis: !!r.hay_tesis, publicable: !!r.publicable,
    bloqueado: !!r.bloqueado, motivo_bloqueo: (r.motivo_bloqueo as string) || '', reloj_s: n(r.reloj_s), segundos_modelo: n(r.segundos_modelo),
    salida_tokens: n(r.salida_tokens), campos_ausentes: n(r.campos_ausentes), campos_totales: n(r.campos_totales), nota: r.nota,
  }))
  const tiempos = corridas.map((c) => c.reloj_s).filter((x): x is number => x !== null)
  return {
    archivo: 'base_contenido/tanda_depuracion/rendimiento.jsonl', n: corridas.length,
    completadas: corridas.filter((c) => !c.bloqueado).length, bloqueadas: corridas.filter((c) => c.bloqueado).length,
    con_tesis: corridas.filter((c) => c.hay_tesis).length,
    tiempo_medio_s: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
    desde: corridas[0]?.cuando ?? null, hasta: corridas[corridas.length - 1]?.cuando ?? null,
    corridas: [...corridas].reverse(),
  }
}

/* ---------- rutas ---------- */
type VarsAdmin = { sesion: Sesion; admin: { id: string; email: string } }
export const operacionAdmin = new Hono<{ Variables: VarsAdmin }>()
operacionAdmin.use('*', async (c, next) => {
  const s = await sesionDe(c.req.raw.headers)
  if (!s || s.session.impersonatedBy || rolDe(s.user) !== 'admin') return c.json({ error: 'sin_acceso' }, 403)
  c.set('sesion', s); c.set('admin', { id: s.user.id, email: s.user.email }); await next()
})

/** Todo junto para la pestaña: estado, hits, cola, alertas, sincronización y última tanda. */
/* ---------- vigilancia de lo publicado ----------

   El 21-sep el motor reexportó los informes vigentes para darles una forma
   única. Eso subió `version_registro` de todos, las aprobaciones dejaron de
   valer y el sitio público se quedó en cero. Nadie se enteró hasta que un
   humano lo miró.

   Esto cuenta lo que el público ve de verdad —el mismo camino que sirve las
   listas, no un atajo— después de cada sincronización y en cada arranque. Si
   baja, queda un aviso en Operación con cuánto había y cuánto hay. No lo
   arregla: lo dice, que es lo que faltó. */
export interface AvisoPublicados {
  cuando: string; antes: number; ahora: number; gemas: number; analisis: number
}
let avisoPublicados: AvisoPublicados | null = null
export const avisoDePublicados = () => avisoPublicados

export async function vigilarPublicados(): Promise<{ total: number; gemas: number; analisis: number }> {
  const contenido = await import('./contenido.ts')
  // Antes de contar: anotar lo que acaba de hacerse público como gema.
  await contenido.marcarGemasPublicas().catch((e) => console.warn('[track]', (e as Error).message))
  // Como los ve un suscriptor base: lo aprobado y nada más.
  const [gemas, analisis] = await Promise.all([contenido.gemasPara('base'), contenido.analisisPara('base')])
  const cuenta = { gemas: gemas.length, analisis: analisis.length, total: gemas.length + analisis.length }
  try {
    const fila = await bd.uno<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'publicados_ultimo'")
    const antes = fila ? Number(JSON.parse(fila.valor).total) : null
    if (antes !== null && Number.isFinite(antes) && cuenta.total < antes) {
      avisoPublicados = { cuando: ahora(), antes, ahora: cuenta.total, gemas: cuenta.gemas, analisis: cuenta.analisis }
      console.error(`[publicados] BAJARON: ${antes} -> ${cuenta.total} (gemas ${cuenta.gemas}, analisis ${cuenta.analisis}). Revisa la bandeja.`)
    } else if (antes !== null && cuenta.total > antes && avisoPublicados) {
      avisoPublicados = null  // se recuperó: el aviso deja de tener sentido
    }
    await bd.ejecutar("INSERT INTO ajustes (clave, valor, actualizado) VALUES ('publicados_ultimo', ?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado = excluded.actualizado",
      [JSON.stringify(cuenta), ahora()])
  } catch (e) {
    console.warn('[publicados] no se pudo comparar:', (e as Error).message)
  }
  return cuenta
}

operacionAdmin.get('/resumen', async (c) => {
  const [estado, hits, cola, alertas] = await Promise.all([motor('/operacion/estado'), motor('/operacion/hits?limite=60'), motor('/operacion/cola'), motor('/operacion/alertas')])
  const conteo_publicado = await vigilarPublicados().catch(() => ({ total: -1, gemas: -1, analisis: -1 }))
  const conteo = { gemas: 0, analisis: 0 }
  try { conteo.gemas = (JSON.parse(readFileSync(resolve(ENV.DATOS, 'gemas.json'), 'utf8')) as unknown[]).length; conteo.analisis = (JSON.parse(readFileSync(resolve(ENV.DATOS, 'analisis.json'), 'utf8')) as unknown[]).length } catch { /* sin datos */ }
  return c.json({
    conexion: { url: ENV.OPERACION_URL, caido: estado.caido, status: estado.status, token_local: !!ENV.OPERACION_TOKEN, tunel: ENV.SYNC_MODO === 'local' ? 'systemctl status veta-servicio' : 'ssh -i ~/.ssh/veta_vps -f -N -L 8788:127.0.0.1:8787 ' + (ENV.SERVIDOR_SSH || 'root@<servidor>') },
    estado: estado.cuerpo, hits: hits.cuerpo, cola: cola.cuerpo, alertas: alertas.cuerpo,
    sync: { ...sync, configurado: configurado(), modo: ENV.SYNC_MODO, cada_minutos: ENV.SYNC_MINUTOS, destino: ENV.BASE_CONTENIDO, ...conteo },
    publicados: { ...conteo_publicado, aviso: avisoPublicados },
    tanda: tandaLocal(),
  })
})
operacionAdmin.get('/estado', async (c) => { const r = await motor('/operacion/estado'); return c.json(r.cuerpo, (r.status || 502) as 200) })
operacionAdmin.get('/hits', async (c) => { const r = await motor(`/operacion/hits?limite=${Number(c.req.query('limite') ?? 100) || 100}`); return c.json(r.cuerpo, (r.status || 502) as 200) })
operacionAdmin.get('/cola', async (c) => { const r = await motor('/operacion/cola'); return c.json(r.cuerpo, (r.status || 502) as 200) })
operacionAdmin.get('/alertas', async (c) => { const r = await motor('/operacion/alertas'); return c.json(r.cuerpo, (r.status || 502) as 200) })

/** La única escritura: lanzar un pedido de la cola del servidor. Gasta dinero; queda con nombre en los dos lados. */
operacionAdmin.post('/lanzar', async (c) => {
  const { id } = await c.req.json().catch(() => ({})) as { id?: string }
  if (!id || !/^sol-\d{8}-[0-9a-f]{6}$/.test(id)) return c.json({ error: 'id_invalido' }, 400)
  const quien = c.get('admin').email
  const r = await motor<Record<string, unknown>>('/operacion/lanzar', { method: 'POST', body: JSON.stringify({ id, quien }), quien })
  registrarAccion({ admin_id: c.get('admin').id, admin_email: quien, accion: 'operacion.lanzar', objetivo_tipo: 'solicitud', objetivo_id: id, detalle: { status: r.status, respuesta: r.cuerpo } })
  return c.json({ status: r.status, ...(r.cuerpo ?? {}) }, (r.status || 502) as 200)
})

operacionAdmin.post('/sincronizar', async (c) => {
  const r = await sincronizar()
  registrarAccion({ admin_id: c.get('admin').id, admin_email: c.get('admin').email, accion: 'servidor.sincronizar', objetivo_tipo: 'servidor', objetivo_id: ENV.SERVIDOR_SSH || null, detalle: { ok: r.ok, duracion_s: r.duracion_s } })
  return c.json(r)
})
