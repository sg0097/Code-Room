#!/usr/bin/env node
// AI review worker. Runs anywhere Ollama runs (your laptop), polls the CodeRoom server for
// solutions people asked the AI to review, asks the local model and posts the review back.
// The server never calls the model, so the app works fine when this isn't running:
// the request just shows "Queued" on the solve screen until the worker picks it up.
//
//   ollama pull qwen3:8b
//   SERVER_URL=https://your-app.onrender.com WORKER_TOKEN=... node worker/ai-review.mjs
//
// Env: SERVER_URL (default http://localhost:3001), WORKER_TOKEN (required, same as the server's),
//      OLLAMA_URL (default http://localhost:11434), OLLAMA_MODEL (default qwen3:8b),
//      POLL_MS (default 5000), ONCE=true to process the queue once and exit.
import { SYSTEM, SCHEMA, userMessage } from './prompt.mjs'

const SERVER = (process.env.SERVER_URL || 'http://localhost:3001').replace(/\/$/, '')
const TOKEN = process.env.WORKER_TOKEN || "rrrrrr"
const OLLAMA = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '')
const MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b'
// Someone is usually waiting on the solve screen, so check often (an empty check is one tiny query).
const POLL_MS = Number(process.env.POLL_MS || 5000)
const ONCE = process.env.ONCE === 'true'

if (!TOKEN) {
  console.error('Set WORKER_TOKEN (the same value as on the server).')
  process.exit(1)
}

async function server(path, body) {
  const res = await fetch(SERVER + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${res.status} ${data.error || ''}`)
  return data
}

async function askModel(job) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false, // qwen3: skip the long hidden reasoning, we only want the JSON
      format: SCHEMA, // structured output: the reply must match the schema
      options: { temperature: 0.2, num_ctx: 8192 },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userMessage(job) },
      ],
    }),
    signal: AbortSignal.timeout(5 * 60_000),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json()
  return JSON.parse(data.message?.content || '{}')
}

/** Process one review request. Returns false when the queue is empty. */
async function once() {
  const { job } = await server('/api/worker/claim')
  if (!job) return false
  const started = Date.now()
  console.log(`→ reviewing a ${job.draft ? 'draft' : 'final'} answer to "${job.problem.title}"`)
  try {
    const review = await askModel(job)
    await server(`/api/worker/solution-reviews/${job.id}`, { review, model: MODEL })
    console.log(`  ✓ ${review.rating}/5 in ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } catch (e) {
    console.error(`  ✗ ${e.message}`)
    // Tell the server, so the person sees "failed" and can ask again, instead of waiting 10 minutes.
    await server(`/api/worker/solution-reviews/${job.id}`, { error: e.message }).catch(() => {})
  }
  return true
}

console.log(`AI review worker: ${SERVER} ← ${MODEL} @ ${OLLAMA}`)
for (;;) {
  let more = false
  try {
    more = await once()
  } catch (e) {
    console.error('server unreachable:', e.message)
  }
  if (!more && ONCE) break
  if (!more) await new Promise((r) => setTimeout(r, POLL_MS))
}
