/* Sesiones de los cinco perfiles contra la vista previa: lo comparten las pruebas. */
import { readFileSync } from 'node:fs'

export const BASE = process.env.VETA_BASE ?? 'http://localhost:5310'
export const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
export const PERFILES = { visitante: null, gratis: 'gratis@veta.local', base: 'base@veta.local', pro: 'pro@veta.local', admin: env.VETA_ADMIN_EMAIL }
/** El rol efectivo de cada perfil: gratis con sesión sigue siendo 'visitante' en la matriz. */
export const ROL = { visitante: 'visitante', gratis: 'visitante', base: 'base', pro: 'pro', admin: 'admin' }

/** Entra y devuelve la cabecera Cookie ('' para el visitante). */
export async function entrar(email) {
  if (!email) return ''
  const pw = email === env.VETA_ADMIN_EMAIL ? env.VETA_ADMIN_PASSWORD : env.VETA_DEMO_PASSWORD
  const r = await fetch(`${BASE}/api/auth/sign-in/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email, password: pw }) })
  if (r.status !== 200) throw new Error(`no pude entrar como ${email}: HTTP ${r.status}`)
  return r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

export async function cookiesDeTodos() {
  const c = {}
  for (const [p, email] of Object.entries(PERFILES)) c[p] = await entrar(email)
  return c
}
