/**
 * Tiny in-memory sliding-window rate limiter: limit(key, max, windowMs) -> true if allowed.
 * Per process, which is fine while we run a single server.
 */
const hits = new Map()

export function allow(key, max, windowMs) {
  const now = Date.now()
  const list = (hits.get(key) || []).filter((t) => now - t < windowMs)
  if (list.length >= max) {
    hits.set(key, list)
    return false
  }
  list.push(now)
  hits.set(key, list)
  return true
}

setInterval(() => {
  const now = Date.now()
  for (const [k, list] of hits) if (!list.some((t) => now - t < 3600_000)) hits.delete(k)
}, 600_000).unref()

export const rateLimit = (name, max, windowMs) => (req, res, next) =>
  allow(`${name}:${req.user?.id || req.ip}`, max, windowMs)
    ? next()
    : res.status(429).json({ error: 'Too many requests, slow down a little.' })
