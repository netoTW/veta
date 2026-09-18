/* Cliente de autenticación: misma origen (/api/auth), cookie de sesión. */
import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [adminClient()],
})

/** Mensajes de error en español para lo que el usuario puede provocar. */
export function mensajeAuth(code?: string, fallback?: string): string {
  switch (code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
    case 'USER_NOT_FOUND': return 'Correo o contraseña incorrectos.'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL': return 'Ya hay una cuenta con ese correo. Entrá o recuperá la contraseña.'
    case 'PASSWORD_TOO_SHORT': return 'La contraseña tiene que tener al menos 10 caracteres.'
    case 'PASSWORD_TOO_LONG': return 'La contraseña es demasiado larga.'
    case 'INVALID_EMAIL': return 'Ese correo no parece válido.'
    case 'INVALID_TOKEN': return 'El enlace ya no sirve: pedí uno nuevo.'
    case 'BANNED_USER': return 'Esta cuenta está suspendida.'
    case 'FAILED_TO_CREATE_USER': return 'No se pudo crear la cuenta.'
    default: return fallback || 'No se pudo completar. Probá de nuevo.'
  }
}
