/* ============================================================================
   Semilla: el primer admin sale de variables de entorno (VETA_ADMIN_EMAIL /
   VETA_ADMIN_PASSWORD) la primera vez que arranca el servidor. Si además hay
   VETA_DEMO_PASSWORD, crea tres cuentas de prueba (gratis, base, pro) para
   recorrer cada vista sin crear cuentas a mano. Sólo en desarrollo.
   ========================================================================== */
import { auth } from './auth.ts'
import { bd, asignarPlan, ahora } from './db.ts'
import { ENV } from './entorno.ts'

async function crear(email: string, password: string, nombre: string, rol: 'admin' | 'usuario', plan: 'gratis' | 'base' | 'pro') {
  const existe = await bd.uno<{ id: string }>('SELECT id FROM "user" WHERE email = ?', [email])
  if (existe) return existe.id
  const r = await auth.api.signUpEmail({ body: { email, password, name: nombre } }) as { user: { id: string } }
  await bd.ejecutar('UPDATE "user" SET role = ?, plan = ?, "updatedAt" = ? WHERE id = ?', [rol, plan, ahora(), r.user.id])
  await asignarPlan(r.user.id, plan)
  // signUpEmail abre una sesión para esa cuenta: se cierra, la semilla no deja sesiones vivas.
  await bd.ejecutar('DELETE FROM session WHERE "userId" = ?', [r.user.id])
  console.log(`[semilla] creada ${email} · ${rol} · plan ${plan}`)
  return r.user.id
}

export async function sembrar() {
  if (ENV.ADMIN_EMAIL && ENV.ADMIN_PASSWORD) await crear(ENV.ADMIN_EMAIL, ENV.ADMIN_PASSWORD, 'Pablo', 'admin', 'pro')
  if (!ENV.PRODUCCION && ENV.DEMO_PASSWORD) {
    await crear('gratis@veta.local', ENV.DEMO_PASSWORD, 'Cuenta gratis', 'usuario', 'gratis')
    await crear('base@veta.local', ENV.DEMO_PASSWORD, 'Cuenta base', 'usuario', 'base')
    await crear('pro@veta.local', ENV.DEMO_PASSWORD, 'Cuenta pro', 'usuario', 'pro')
  }
}
