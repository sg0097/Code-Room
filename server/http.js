// Route helpers shared by the feature modules: throw fail(status, message) anywhere in a
// handler wrapped with wrap(), and it becomes a JSON error response.

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra)
}

/** Runs an async handler, sends its return value as JSON, turns HttpErrors into responses. */
export const wrap = (fn) => async (req, res) => {
  try {
    res.json(await fn(req, res))
  } catch (e) {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...e.extra })
    console.error(e)
    res.status(500).json({ error: 'Something went wrong' })
  }
}

export const text = (v) => String(v ?? '').trim()

export function isHttpUrl(s) {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
