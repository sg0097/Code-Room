// Sending email. Set SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM) to use any provider:
// Gmail (an app password), Brevo, Resend's SMTP, and so on. Without them nothing is sent:
//   - locally (DEV_LOGIN=true) the email is kept in memory, readable at GET /api/dev/mail
//   - in production the "forgot password" feature is switched off, and the app says so.
import nodemailer from 'nodemailer'

const dev = process.env.DEV_LOGIN === 'true'
const host = (process.env.SMTP_HOST || '').trim()
export const mailEnabled = !!host || dev

const transport = host
  ? nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null
const from = (process.env.MAIL_FROM || process.env.SMTP_USER || 'CodeRoom <no-reply@coderoom.local>').trim()

export const outbox = [] // dev only: the last emails "sent"

/** Fire and forget: callers don't wait for it, so a slow mail server can't show who has an account. */
export async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    if (dev) {
      outbox.unshift({ to, subject, text, at: new Date().toISOString() })
      outbox.length = Math.min(outbox.length, 20)
      console.log(`[mail] (dev, not sent) to ${to}: ${subject}`)
    }
    return
  }
  try {
    await transport.sendMail({ from, to, subject, text, html })
  } catch (e) {
    console.error('[mail] could not send:', e.message)
  }
}

if (!transport && !dev) console.warn('[mail] SMTP_HOST not set: "forgot password" is off. Set SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM to turn it on.')
