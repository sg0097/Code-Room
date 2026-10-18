// Auth for the jobs that run on your laptop (worker/ai-review.mjs and scraper/experiences.mjs).
// They send `Authorization: Bearer <WORKER_TOKEN>`; the server never calls them.
import crypto from 'node:crypto'

const WORKER_TOKEN = process.env.WORKER_TOKEN || ''
export const workerEnabled = !!WORKER_TOKEN
if (!workerEnabled) console.warn('[worker] WORKER_TOKEN not set: AI solution review and the scraper upload are off')

export function requireWorker(req, res, next) {
  if (!WORKER_TOKEN) return res.status(503).json({ error: 'Worker is not configured (set WORKER_TOKEN)' })
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(given), b = Buffer.from(WORKER_TOKEN)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: 'Bad worker token' })
  next()
}
