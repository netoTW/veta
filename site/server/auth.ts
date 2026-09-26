/* ============================================================================
   Autenticación — better-auth sobre Postgres (producción) o SQLite (local).

   Por qué better-auth: es agnóstico al framework (corre en este mismo Node
   con Hono), trae registro/login/logout, sesión persistente por cookie,
   recuperación por correo con token de un solo uso y un plugin admin con
   suspensión e impersonación. El motor de base lo decide bd.ts: la
   librería recibe el Pool de Postgres o la base SQLite, y el resto no cambia.

   Contraseñas: hasheadas (scrypt) por la librería; nunca legibles.
   ========================================================================== */
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins'
import { getMigrations } from 'better-auth/db/migration'
import { bd, ahora, asignarPlan } from './db.ts'
import { enviar } from './correo.ts'
import { ENV } from './entorno.ts'

export const auth = betterAuth({
  appName: 'VETA',
  baseURL: ENV.URL_PUBLICA,
  basePath: '/api/auth',
  secret: ENV.SECRETO,
  trustedOrigins: ENV.ORIGENES_CONFIABLES,
  // Pool de `pg` o Database de better-sqlite3: better-auth entiende los dos.
  database: bd.crudo as Parameters<typeof betterAuth>[0]['database'],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hora
    sendResetPassword: async ({ user, url }) => {
      await enviar({
        para: user.email,
        asunto: 'VETA · elige tu contraseña',
        // El mismo correo sirve para recuperar y para una cuenta recién creada por admin,
        // porque las dos pasan por aquí. Por eso no da por hecho que lo pediste tú.
        texto: [
          'Hola.',
          '',
          'Para elegir tu contraseña de VETA, entra aquí. El enlace vale una hora y se usa una sola vez:',
          url,
          '',
          'Si no esperabas este correo, ignóralo. Sin abrir el enlace no cambia nada.',
          '',
          '— VETA · Crypto Intelligence',
          'Nada de lo que publicamos es consejo de inversión.',
        ].join('\n'),
      })
    },
  },
  user: {
    additionalFields: {
      // El plan lo asigna admin a mano mientras no hay proveedor de pago (spec §6, usuario.plan).
      plan: { type: 'string', defaultValue: 'gratis', input: false },
      estado: { type: 'string', defaultValue: 'activo', input: false },
      ultimo_acceso: { type: 'date', required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 días
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  advanced: {
    // Detrás de Caddy/Vercel la cookie tiene que ser Secure; en local http no.
    useSecureCookies: ENV.URL_PUBLICA.startsWith('https://'),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => { await asignarPlan(user.id, 'gratis') },
      },
    },
    session: {
      create: {
        // Cada sesión nueva es un acceso: último acceso = último login.
        after: async (session) => {
          await bd.ejecutar('UPDATE "user" SET ultimo_acceso = ? WHERE id = ?', [ahora(), session.userId])
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'usuario',
      adminRoles: ['admin'],
      impersonationSessionDuration: 60 * 60, // 1 hora
      bannedUserMessage: 'Esta cuenta está suspendida. Escríbenos si crees que es un error.',
    }),
  ],
})

export type Auth = typeof auth

/** Crea o actualiza las tablas de auth. Se corre al arrancar el servidor. */
export async function migrar() {
  const { runMigrations } = await getMigrations(auth.options)
  await runMigrations()
}

export interface SesionUsuario {
  id: string; email: string; name: string
  role?: string | null; plan?: string | null; estado?: string | null
  banned?: boolean | null; banReason?: string | null
  ultimo_acceso?: Date | string | null
  createdAt: Date | string
}
export interface Sesion { user: SesionUsuario; session: { id: string; impersonatedBy?: string | null; expiresAt: Date | string } }

/** Sesión a partir de las cabeceras de la petición (cookie). null si no hay. */
/* La sesión se busca en Supabase (us-east-1, ~100 ms cada consulta) y better-auth sólo se
   ahorra la consulta si llega su cookie de caché, que dura 5 min y sólo renueva
   /api/auth/get-session: en la práctica casi toda petición con sesión pagaba ~200 ms.
   Se recuerda 30 s por token. El plan y la suspensión no dependen de esto: los relee
   planVigente (10 s). Cerrar sesión borra la cookie en el navegador al momento. */
const SESIONES = new Map<string, { hasta: number; sesion: Sesion | null }>()
const VIDA_SESION_MS = 30_000
export async function sesionDe(headers: Headers): Promise<Sesion | null> {
  const token = (headers.get('cookie') ?? '').match(/(?:^|;\s*)(?:__Secure-)?[\w.-]*session_token=([^;]+)/)?.[1]
  if (!token) return null
  const m = SESIONES.get(token)
  if (m && m.hasta > Date.now()) return m.sesion ? { ...m.sesion, user: { ...m.sesion.user } } : null
  const s = ((await auth.api.getSession({ headers })) as unknown as Sesion | null) ?? null
  if (SESIONES.size > 5000) SESIONES.clear()
  SESIONES.set(token, { hasta: Date.now() + VIDA_SESION_MS, sesion: s })
  return s ? { ...s, user: { ...s.user } } : null
}
/** Al cerrar sesión o borrar una cuenta: que la memoria no la resucite. */
export const olvidarSesiones = () => SESIONES.clear()
