/* ============================================================================
   Administración: bandeja de aprobación, cuentas y registro de acciones.

   Todo acá exige rol admin REAL (no "ver como", no impersonado): mientras se
   impersona, la sesión es la del usuario impersonado y estas rutas responden
   403. Salir de la impersonación devuelve la sesión de admin.

   Cada mutación queda en `acciones_admin` (quién, qué, cuándo).
   ========================================================================== */
import { Hono } from 'hono'
import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { auth, sesionDe, type Sesion } from './auth.ts'
import { bd, ahora, asignarPlan, registrarAccion } from './db.ts'
import { cupoDe } from './cupo.ts'
import { ENV } from './entorno.ts'
import { rolDe, PLANES } from '../src/lib/matriz.ts'
import * as contenido from './contenido.ts'
import { contradiccionesDelRegistro } from '../src/lib/contradicciones.ts'

type Vars = { sesion: Sesion; admin: { id: string; email: string } }
export const adminApp = new Hono<{ Variables: Vars }>()

adminApp.use('*', async (c, next) => {
  const s = await sesionDe(c.req.raw.headers)
  if (!s) return c.json({ error: 'sin_sesion' }, 401)
  if (s.session.impersonatedBy) return c.json({ error: 'impersonando', detalle: 'Salí de la impersonación para administrar.' }, 403)
  if (rolDe(s.user) !== 'admin') return c.json({ error: 'sin_acceso', seccion: 'bandeja' }, 403)
  c.set('sesion', s); c.set('admin', { id: s.user.id, email: s.user.email })
  await next()
})

const log = (c: { get: (k: 'admin') => { id: string; email: string } }, accion: string, objetivo_tipo: string, objetivo_id: string | null, detalle?: unknown) =>
  registrarAccion({ admin_id: c.get('admin').id, admin_email: c.get('admin').email, accion, objetivo_tipo, objetivo_id, detalle })

/* ======================= BANDEJA ======================= */
type Adv = { severidad?: string }
const conteoSeveridad = (r: Record<string, unknown>) => {
  const advs = ((r.ficha_esencial as { advertencias?: Adv[] } | undefined)?.advertencias ?? []) as Adv[]
  const n = (s: string) => advs.filter((a) => a.severidad === s).length
  return { total: advs.length, COMPROMETE_TESIS: n('COMPROMETE_TESIS'), LIMITA_LECTURA: n('LIMITA_LECTURA'), CONTEXTO: n('CONTEXTO') }
}

async function filaBandeja(r: Record<string, unknown> & { id: string; tipo: string; version_registro: number }) {
  const ver = r.verificador as { estado?: string; motivo_bloqueo?: string; hallazgos?: unknown[] } | undefined
  const esc = r.esceptico as { objeciones?: unknown[]; rechaza?: boolean } | undefined
  const sol = r.solicitud as { usuario_email?: string | null } | undefined
  return {
    a_pedido_de: r.origen === 'a_pedido' ? (sol?.usuario_email ?? null) : null, simulado: !!r.simulado,
    id: r.id, tipo: r.tipo, simbolo: r.simbolo, nombre: r.nombre, cadena: r.cadena, tier: r.tier,
    version_registro: r.version_registro, escrito_en: r.escrito_en, fecha_publicacion: r.fecha_publicacion, origen: r.origen,
    verificador: { estado: ver?.estado ?? 'desconocido', motivo_bloqueo: ver?.motivo_bloqueo ?? '', hallazgos: (ver?.hallazgos ?? []).length },
    esceptico: { objeciones: (esc?.objeciones ?? []).length, rechaza: !!esc?.rechaza },
    advertencias: conteoSeveridad(r),
    contradicciones: contradiccionesDelRegistro(r as unknown as Parameters<typeof contradiccionesDelRegistro>[0]),
    publicacion: await contenido.estadoPublicacion(r),
  }
}
const todosLosRegistros = async () => [...contenido.gemasTodas(), ...(await contenido.analisisTodos())]

adminApp.get('/bandeja', async (c) => {
  const filas = await Promise.all((await todosLosRegistros()).map(filaBandeja))
  const orden = { pendiente: 0, nueva_version: 1, pedir_mas: 2, rechazado: 3, despublicado: 4, aprobado: 5 } as Record<string, number>
  filas.sort((a, b) => (orden[a.publicacion.estado] ?? 9) - (orden[b.publicacion.estado] ?? 9) || String(b.escrito_en).localeCompare(String(a.escrito_en)))
  return c.json({ filas, pendientes: filas.filter((f) => ['pendiente', 'nueva_version'].includes(f.publicacion.estado)).length })
})

adminApp.get('/bandeja/:id', async (c) => {
  const id = c.req.param('id')
  const r = (await todosLosRegistros()).find((x) => x.id === id)
  if (!r) return c.json({ error: 'no_encontrado' }, 404)
  const historial = await bd.todos('SELECT * FROM publicacion WHERE informe_id = ? ORDER BY id DESC', [id])
  return c.json({ informe: r, fila: await filaBandeja(r), historial, paquete: contenido.paqueteDe(id) })
})

const BLOQUEADO = (estado: string | undefined) => !!estado && estado !== 'pasa'

adminApp.post('/bandeja/:id/decision', async (c) => {
  const id = c.req.param('id')
  const r = (await todosLosRegistros()).find((x) => x.id === id)
  if (!r) return c.json({ error: 'no_encontrado' }, 404)
  const body = await c.req.json().catch(() => ({})) as { accion?: string; motivo?: string; bloqueo_confirmado?: boolean }
  const accion = body.accion
  if (!accion || !['aprobar', 'rechazar', 'pedir_mas', 'despublicar'].includes(accion)) return c.json({ error: 'accion_invalida' }, 400)
  const motivo = (body.motivo ?? '').trim()
  if ((accion === 'rechazar' || accion === 'pedir_mas') && motivo.length < 5) return c.json({ error: 'motivo_requerido', detalle: 'Rechazar o pedir más exige un motivo escrito.' }, 400)
  const verEstado = (r.verificador as { estado?: string } | undefined)?.estado
  const bloqueado = BLOQUEADO(verEstado)
  if (accion === 'aprobar' && bloqueado && body.bloqueo_confirmado !== true) {
    return c.json({ error: 'bloqueo_no_confirmado', detalle: `El Verificador dejó este informe en estado "${verEstado}". Para aprobarlo tenés que confirmar explícitamente que viste el bloqueo.` }, 409)
  }
  const admin = c.get('admin'); const fecha = ahora()
  const fila = {
    informe_id: id, tipo: r.tipo, version_registro: r.version_registro, accion, motivo: motivo || null,
    verificador_estado: verEstado ?? null, bloqueo_confirmado: accion === 'aprobar' && bloqueado ? 1 : 0,
    admin_id: admin.id, admin_email: admin.email, fecha,
  }
  await bd.ejecutar(`INSERT INTO publicacion (informe_id, tipo, version_registro, accion, motivo, verificador_estado, bloqueo_confirmado, admin_id, admin_email, fecha)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [fila.informe_id, fila.tipo, fila.version_registro, fila.accion, fila.motivo, fila.verificador_estado, fila.bloqueo_confirmado, fila.admin_id, fila.admin_email, fila.fecha])
  // Lo único que la plataforma escribe hacia el motor: el estado de publicación, append-only.
  try {
    mkdirSync(ENV.BASE_CONTENIDO, { recursive: true })
    appendFileSync(resolve(ENV.BASE_CONTENIDO, 'publicacion.jsonl'), JSON.stringify({ ...fila, bloqueo_confirmado: !!fila.bloqueo_confirmado, escrito_por: 'veta-web' }) + '\n')
  } catch (e) { console.warn('[bandeja] no se pudo escribir publicacion.jsonl:', (e as Error).message) }
  await log(c, `bandeja.${accion}`, r.tipo, id, { version_registro: r.version_registro, motivo: motivo || null, verificador_estado: verEstado, bloqueo_confirmado: !!fila.bloqueo_confirmado })
  return c.json({ ok: true, publicacion: await contenido.estadoPublicacion(r) })
})

/* ======================= CUENTAS ======================= */
interface FilaUsuario { id: string; email: string; name: string; role: string | null; plan: string | null; estado: string | null; banned: number | null; banReason: string | null; createdAt: string; ultimo_acceso: string | null }

async function usuarioCompleto(u: FilaUsuario) {
  const sus = await bd.uno('SELECT plan, estado, fecha_renovacion, proveedor_pago, id_externo FROM suscripcion WHERE usuario_id = ?', [u.id]) ?? null
  const c0 = await cupoDe(u.id, u.plan ?? 'gratis', u.role === 'admin')
  const cupo = { periodo: c0.periodo, analisis_incluidos: c0.incluidos, analisis_usados: c0.usados, solicitudes_scanner_usadas: 0, fecha_reinicio: c0.fecha_reinicio }
  const consumo = await bd.uno('SELECT COUNT(*) AS analisis, COALESCE(SUM(costo_real_usd), 0) AS costo_real_usd, COALESCE(SUM(consumio_cupo), 0) AS con_cupo FROM uso_analisis WHERE usuario_id = ?', [u.id]) as { analisis: number; costo_real_usd: number; con_cupo: number }
  return {
    id: u.id, email: u.email, nombre: u.name, rol: u.role ?? 'usuario', plan: u.plan ?? 'gratis',
    estado: u.banned ? 'suspendido' : (u.estado ?? 'activo'), motivo_suspension: u.banReason ?? null,
    fecha_alta: u.createdAt, ultimo_acceso: u.ultimo_acceso, suscripcion: sus, cupo, consumo,
  }
}
const SEL = 'SELECT id, email, name, role, plan, estado, banned, "banReason", "createdAt", ultimo_acceso FROM "user"'

adminApp.get('/usuarios', async (c) => {
  const filas = await bd.todos<FilaUsuario>(`${SEL} ORDER BY "createdAt" DESC`)
  return c.json({ usuarios: await Promise.all(filas.map(usuarioCompleto)) })
})

adminApp.get('/usuarios/:id', async (c) => {
  const u = await bd.uno(`${SEL} WHERE id = ?`, [c.req.param('id')]) as FilaUsuario | undefined
  if (!u) return c.json({ error: 'no_encontrado' }, 404)
  const usos = await bd.todos('SELECT id, simbolo, fecha, tipo, consumio_cupo, costo_real_usd, resultado FROM uso_analisis WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 200', [u.id])
  const alertas = await bd.todos('SELECT id, tipo, gema_id, fecha, leida FROM alerta WHERE usuario_id = ? ORDER BY fecha DESC LIMIT 50', [u.id])
  const acciones = await bd.todos('SELECT admin_email, accion, detalle, fecha FROM acciones_admin WHERE objetivo_tipo = ? AND objetivo_id = ? ORDER BY id DESC LIMIT 100', ['usuario', u.id])
  return c.json({ usuario: await usuarioCompleto(u), usos, alertas, acciones })
})

/** Crear a mano (socios, primeros usuarios). Se crea con contraseña aleatoria y se le manda el enlace para elegir la suya. */
adminApp.post('/usuarios', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { email?: string; nombre?: string; plan?: string; rol?: string }
  const email = (body.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'email_invalido' }, 400)
  const plan = (PLANES as string[]).includes(body.plan ?? '') ? body.plan! : 'gratis'
  const rol = body.rol === 'admin' ? 'admin' : 'usuario'
  const azar = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')
  let creado: { user: { id: string } }
  try {
    creado = await auth.api.createUser({ body: { email, name: body.nombre?.trim() || email.split('@')[0], password: azar, role: rol as 'admin' | 'user', data: { plan } }, headers: c.req.raw.headers }) as { user: { id: string } }
  } catch (e) {
    return c.json({ error: 'no_se_pudo_crear', detalle: (e as Error).message }, 400)
  }
  await asignarPlan(creado.user.id, plan as 'gratis' | 'base' | 'pro')
  // Invitación = enlace de restablecer contraseña (un solo uso, una hora).
  try { await auth.api.requestPasswordReset({ body: { email, redirectTo: '/restablecer' }, headers: c.req.raw.headers }) } catch (e) { console.warn('[cuentas] invitación no enviada:', (e as Error).message) }
  await log(c, 'usuario.crear', 'usuario', creado.user.id, { email, plan, rol })
  return c.json({ ok: true, id: creado.user.id })
})

adminApp.patch('/usuarios/:id/plan', async (c) => {
  const id = c.req.param('id')
  const { plan } = await c.req.json().catch(() => ({})) as { plan?: string }
  if (!plan || !(PLANES as string[]).includes(plan)) return c.json({ error: 'plan_invalido' }, 400)
  const antes = await bd.uno('SELECT plan FROM "user" WHERE id = ?', [id]) as { plan: string | null } | undefined
  if (!antes) return c.json({ error: 'no_encontrado' }, 404)
  await bd.ejecutar('UPDATE "user" SET plan = ?, "updatedAt" = ? WHERE id = ?', [plan, ahora(), id])
  await asignarPlan(id, plan as 'gratis' | 'base' | 'pro')
  await log(c, 'usuario.plan', 'usuario', id, { de: antes.plan ?? 'gratis', a: plan })
  return c.json({ ok: true })
})

adminApp.patch('/usuarios/:id/rol', async (c) => {
  const id = c.req.param('id')
  const { rol } = await c.req.json().catch(() => ({})) as { rol?: string }
  if (rol !== 'admin' && rol !== 'usuario') return c.json({ error: 'rol_invalido' }, 400)
  if (id === c.get('admin').id && rol !== 'admin') return c.json({ error: 'no_a_vos_mismo', detalle: 'No podés quitarte el rol admin a vos mismo.' }, 400)
  await auth.api.setRole({ body: { userId: id, role: rol as 'admin' | 'user' }, headers: c.req.raw.headers })
  await log(c, 'usuario.rol', 'usuario', id, { rol })
  return c.json({ ok: true })
})

adminApp.patch('/usuarios/:id/estado', async (c) => {
  const id = c.req.param('id')
  const { estado, motivo } = await c.req.json().catch(() => ({})) as { estado?: string; motivo?: string }
  if (id === c.get('admin').id) return c.json({ error: 'no_a_vos_mismo', detalle: 'No podés suspender tu propia cuenta.' }, 400)
  if (estado === 'suspendido') {
    await auth.api.banUser({ body: { userId: id, banReason: motivo?.trim() || 'suspendido por admin' }, headers: c.req.raw.headers })
    await bd.ejecutar('UPDATE "user" SET estado = ? WHERE id = ?', ['suspendido', id])
  } else if (estado === 'activo') {
    await auth.api.unbanUser({ body: { userId: id }, headers: c.req.raw.headers })
    await bd.ejecutar('UPDATE "user" SET estado = ? WHERE id = ?', ['activo', id])
  } else return c.json({ error: 'estado_invalido' }, 400)
  await log(c, estado === 'suspendido' ? 'usuario.suspender' : 'usuario.reactivar', 'usuario', id, { motivo: motivo ?? null })
  return c.json({ ok: true })
})

adminApp.patch('/usuarios/:id/cupo', async (c) => {
  const id = c.req.param('id')
  const { analisis_incluidos } = await c.req.json().catch(() => ({})) as { analisis_incluidos?: number }
  const n = Number(analisis_incluidos)
  if (!Number.isInteger(n) || n < 0 || n > 100) return c.json({ error: 'cupo_invalido' }, 400)
  const u = await bd.uno('SELECT plan FROM "user" WHERE id = ?', [id]) as { plan: string | null } | undefined
  if (!u) return c.json({ error: 'no_encontrado' }, 404)
  const actual = await cupoDe(id, u.plan ?? 'gratis')
  const periodo = actual.periodo
  const fila = { analisis_incluidos: actual.incluidos }
  await bd.ejecutar('UPDATE cupo SET analisis_incluidos = ? WHERE usuario_id = ? AND periodo = ?', [n, id, periodo])
  await log(c, 'usuario.cupo', 'usuario', id, { de: fila?.analisis_incluidos ?? null, a: n, periodo })
  return c.json({ ok: true })
})

/** Impersonar: la cookie la cambia better-auth; acá sólo queda registrado. */
adminApp.post('/usuarios/:id/impersonar', async (c) => {
  const id = c.req.param('id')
  const u = await bd.uno('SELECT email, role FROM "user" WHERE id = ?', [id]) as { email: string; role: string | null } | undefined
  if (!u) return c.json({ error: 'no_encontrado' }, 404)
  if (u.role === 'admin') return c.json({ error: 'no_admin', detalle: 'No se impersona a otro admin.' }, 400)
  const res = await auth.api.impersonateUser({ body: { userId: id }, headers: c.req.raw.headers, asResponse: true })
  await log(c, 'usuario.impersonar', 'usuario', id, { email: u.email })
  return res
})

adminApp.get('/acciones', async (c) => {
  const filas = await bd.todos('SELECT id, admin_email, accion, objetivo_tipo, objetivo_id, detalle, fecha FROM acciones_admin ORDER BY id DESC LIMIT 500')
  return c.json({ acciones: filas })
})

/* ======================= ALERTAS (sincronización desde el seguimiento) ======================= */
/** Crea alertas para los usuarios pro/admin a partir del seguimiento actual. Idempotente. */
export async function sincronizarAlertas() {
  const seg = contenido.seguimientoTodo().ultimo as unknown as Array<{ gema_id: string; fecha: string; invalidacion_activada?: boolean; evaluacion_invalidacion?: unknown }>
  const activadas = seg.filter((s) => s.invalidacion_activada)
  if (!activadas.length) return 0
  const usuarios = await bd.todos<{ id: string }>(`SELECT id FROM "user" WHERE role = 'admin' OR plan = 'pro'`)
  let n = 0
  for (const s of activadas) for (const u of usuarios) n += (await bd.ejecutar('INSERT INTO alerta (usuario_id, tipo, gema_id, fecha, leida, detalle) VALUES (?, ?, ?, ?, 0, ?) ON CONFLICT DO NOTHING', [u.id, 'invalidacion', s.gema_id, s.fecha, JSON.stringify(s.evaluacion_invalidacion ?? null)])).cambios
  return n
}
