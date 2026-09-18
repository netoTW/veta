/* ============================================================================
   Correo saliente. En local no hay SMTP: cada correo se escribe como archivo
   en server/correo-saliente/ y el enlace se imprime en la consola. En
   producción, VETA_CORREO=smtp manda por SMTP (VETA_SMTP_URL, p. ej. el de
   Resend, Postmark o Gmail con clave de aplicación). Las contraseñas nunca
   viajan por correo: sólo enlaces con token de un solo uso.
   ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENV } from './entorno.ts'

export interface Correo { para: string; asunto: string; texto: string }

export async function enviar(c: Correo) {
  if (ENV.CORREO_TRANSPORTE === 'smtp') {
    if (!ENV.SMTP_URL) throw new Error('VETA_CORREO=smtp sin VETA_SMTP_URL (smtps://usuario:clave@host:465)')
    const { default: nodemailer } = await import('nodemailer')
    const t = nodemailer.createTransport(ENV.SMTP_URL)
    await t.sendMail({ from: ENV.CORREO_DESDE, to: c.para, subject: c.asunto, text: c.texto })
    console.log(`[correo] smtp → ${c.para} · ${c.asunto}`)
    return
  }
  mkdirSync(ENV.CORREO_SALIENTE, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const f = resolve(ENV.CORREO_SALIENTE, `${stamp}_${c.para.replace(/[^a-z0-9@.-]/gi, '_')}.txt`)
  writeFileSync(f, `Para: ${c.para}\nAsunto: ${c.asunto}\nFecha: ${new Date().toISOString()}\n\n${c.texto}\n`)
  console.log(`[correo] → ${c.para} · ${c.asunto}\n${c.texto.split('\n').filter((l) => l.includes('http')).join('\n')}`)
}
