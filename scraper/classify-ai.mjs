// Asks the local model (Ollama) to read a post and fill in what the title didn't say:
// company, role, years of experience, outcome. Only those fields leave this file; the
// post's text goes to Ollama on this machine and nowhere else.
import { ROLES, OUTCOMES } from '../server/modules/experiences/classify.js'

const OLLAMA = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '')
const MODEL = process.env.OLLAMA_MODEL || 'qwen3:8b'

const SYSTEM = `You sort interview experience posts. Read the post and extract, using only what it says:
- company: the company that interviewed the candidate, as people usually write it (e.g. "Amazon", "Goldman Sachs").
- role: the closest one from the list.
- yoe: the candidate's years of work experience as a whole number. 0 for students, interns and freshers. -1 if the post doesn't say.
- outcome: "selected" if they got the offer, "rejected" if not, "pending" if still waiting, "unknown" if the post doesn't say.`

const SCHEMA = {
  type: 'object',
  properties: {
    company: { type: 'string' },
    role: { type: 'string', enum: ROLES },
    yoe: { type: 'integer', minimum: -1, maximum: 40 },
    outcome: { type: 'string', enum: [...OUTCOMES, 'unknown'] },
  },
  required: ['company', 'role', 'yoe', 'outcome'],
}

export const aiModel = MODEL

/** → { company, role, yoe, outcome } with unknowns left out, or null if the model isn't reachable. */
export async function classifyWithAi(title, postText) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      think: false,
      format: SCHEMA,
      options: { temperature: 0, num_ctx: 4096 },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Title: ${title}\n\n${postText.slice(0, 6000)}` },
      ],
    }),
    signal: AbortSignal.timeout(2 * 60_000),
  })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const r = JSON.parse((await res.json()).message?.content || '{}')
  const out = {}
  if (r.company) out.company = r.company
  if (ROLES.includes(r.role) && r.role !== 'Other') out.role = r.role
  if (Number.isInteger(r.yoe) && r.yoe >= 0) out.yoe = r.yoe
  if (OUTCOMES.includes(r.outcome)) out.outcome = r.outcome
  return out
}
