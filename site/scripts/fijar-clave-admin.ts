/* Fija la contraseña de una cuenta usando la API de better-auth (hash scrypt correcto),
   nunca escribiendo en la tabla.

   `setUserPassword` es un endpoint del plugin admin: exige una sesión de admin. Así que
   primero se inicia sesión con las credenciales de admin del entorno y se usa esa cookie.
   Si la cuenta objetivo no existe, no la crea: lo dice y sale.

   Uso, en el servidor y con el .env de producción cargado:
     node node_modules/.bin/tsx scripts/fijar-clave-admin.ts <email> <contraseña nueva>
*/
import { auth } from '../server/auth.ts'
import { bd } from '../server/db.ts'
import { ENV } from '../server/entorno.ts'

const [email, clave] = process.argv.slice(2)
if (!email || !clave) { console.error('faltan argumentos: <email> <contraseña>'); process.exit(2) }

const salida = (o: unknown) => console.log(JSON.stringify(o))

const u = await bd.uno<{ id: string; email: string; role: string | null; plan: string | null }>(
  'SELECT id, email, role, plan FROM "user" WHERE lower(email) = lower(?)', [email])
if (!u) { salida({ ok: false, motivo: 'no_existe', email }); process.exit(3) }
salida({ encontrado: { id: u.id, email: u.email, rol: u.role, plan: u.plan } })

/* sesión de admin, para poder usar el endpoint del plugin */
let cookie = ''
try {
  const r = await auth.api.signInEmail({
    body: { email: ENV.ADMIN_EMAIL, password: ENV.ADMIN_PASSWORD }, asResponse: true,
  }) as Response
  cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('el login de admin no devolvió cookie')
} catch (e) {
  salida({ ok: false, motivo: 'no_se_pudo_autenticar_admin', detalle: (e as Error).message })
  process.exit(5)
}

try {
  await auth.api.setUserPassword({
    body: { userId: u.id, newPassword: clave },
    headers: new Headers({ cookie }),
  })
  const tras = await bd.uno<{ role: string | null; plan: string | null }>('SELECT role, plan FROM "user" WHERE id = ?', [u.id])
  salida({ ok: true, largo: clave.length, rol: tras?.role, plan: tras?.plan })
} catch (e) {
  const err = e as { body?: { code?: string; message?: string }; message?: string; statusCode?: unknown }
  salida({
    ok: false, largo: clave.length, status: err.statusCode,
    codigo: err.body?.code, mensaje: err.body?.message || err.message || '(sin mensaje)',
  })
  process.exit(4)
}
process.exit(0)
