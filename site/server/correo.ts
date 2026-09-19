/* ============================================================================
   Correo saliente. Tres transportes, por VETA_CORREO:

   - `archivo` (por omisión, local): cada correo se escribe en
     server/correo-saliente/ y el enlace se imprime en la consola.
   - `resend` (producción): API HTTP de Resend. Sin dependencias nuevas.
   - `smtp`: cualquier servidor por VETA_SMTP_URL.

   Las contraseñas nunca viajan por correo: sólo enlaces de un solo uso.
   La clave de Resend vive en el .env del servidor y no entra al repositorio.
   ========================================================================== */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ENV } from './entorno.ts'

export interface Correo { para: string; asunto: string; texto: string }

async function porResend(c: Correo) {
  if (!ENV.RESEND_API_KEY) throw new Error('VETA_CORREO=resend sin VETA_RESEND_API_KEY')
  const cuerpo: Record<string, unknown> = { from: ENV.CORREO_DESDE, to: [c.para], subject: c.asunto, text: c.texto }
  if (ENV.CORREO_RESPONDER_A) cuerpo.reply_to = ENV.CORREO_RESPONDER_A
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ENV.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  })
  const texto = await r.text().catch(() => '')
  if (!r.ok) throw new Error(`resend ${r.status}: ${texto.slice(0, 300)}`)
  let id = ''
  try { id = (JSON.parse(texto) as { id?: string }).id ?? '' } catch { /* respuesta sin json */ }
  // El destinatario no se registra entero: basta el dominio para seguir un envío.
  console.log(`[correo] resend ok · id ${id || '(sin id)'} · ${c.asunto} · @${c.para.split('@')[1] ?? '?'}`)
}

export async function enviar(c: Correo) {
  if (ENV.CORREO_TRANSPORTE === 'resend') return porResend(c)
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
