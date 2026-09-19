/* Fija la contraseña de una cuenta usando la API de better-auth (hash scrypt correcto),
   nunca escribiendo en la tabla. Si la cuenta no existe, no la crea: lo dice y sale.

   Uso, en el servidor y con el .env de producción cargado:
     node node_modules/.bin/tsx scripts/fijar-clave-admin.ts <email> <contraseña>
*/
import { auth } from '../server/auth.ts'
import { bd } from '../server/db.ts'

const [email, clave] = process.argv.slice(2)
if (!email || !clave) { console.error('faltan argumentos: <email> <contraseña>'); process.exit(2) }

const u = await bd.uno<{ id: string; email: string; role: string | null; plan: string | null; banned: unknown }>(
  'SELECT id, email, role, plan, banned FROM "user" WHERE lower(email) = lower(?)', [email])
if (!u) { console.error(JSON.stringify({ ok: false, motivo: 'no_existe', email })); process.exit(3) }

console.log(JSON.stringify({ encontrado: { id: u.id, email: u.email, rol: u.role, plan: u.plan } }))
try {
  await auth.api.setUserPassword({ body: { userId: u.id, newPassword: clave }, headers: new Headers() })
  const tras = await bd.uno<{ role: string | null; plan: string | null }>('SELECT role, plan FROM "user" WHERE id = ?', [u.id])
  console.log(JSON.stringify({ ok: true, largo: clave.length, rol: tras?.role, plan: tras?.plan }))
} catch (e) {
  const err = e as { body?: { code?: string; message?: string }; message?: string; status?: unknown }
  console.error(JSON.stringify({ ok: false, codigo: err.body?.code, mensaje: err.body?.message ?? err.message, largo: clave.length }))
  process.exit(4)
}
process.exit(0)
