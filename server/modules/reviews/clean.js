// Pure functions (no database) for solution reviews: turning an answer into text a model
// can read, cleaning the model's report, and validating an admin's review. Easy to unit test.
import { FORMATS, CODE_LANGUAGES } from '../../catalog.js'
import { text } from '../../http.js'
import { parseProject, projectHasCode } from '../../project.js'

const MAX_FIELD_FOR_MODEL = 12_000 // keeps the whole prompt well inside an 8k-token context

/** Does the answer have anything in it? An empty whiteboard is "[]". */
export function hasAnswer(format, content) {
  return FORMATS[format].fields.some((f) => {
    const v = text(content?.fields?.[f.key])
    if (f.kind === 'project') return projectHasCode(v)
    return f.kind === 'diagram' ? v.length > 2 : v.length > 0
  })
}

/**
 * A whiteboard is a JSON list of Excalidraw elements: unreadable for a model. Describe it instead:
 * the labelled boxes, which arrows connect which boxes, and any free-standing notes.
 */
export function describeDiagram(json) {
  let els
  try {
    els = JSON.parse(json || '[]')
  } catch {
    return ''
  }
  if (!Array.isArray(els)) return ''
  els = els.filter((e) => e && !e.isDeleted)
  const labelOf = new Map() // shape id → its text
  for (const e of els) if (e.type === 'text' && e.containerId) labelOf.set(e.containerId, text(e.text).replace(/\s+/g, ' '))
  const shapes = els.filter((e) => ['rectangle', 'ellipse', 'diamond'].includes(e.type))
  const name = (id) => labelOf.get(id) || '(unlabelled box)'
  const boxes = shapes.map((s) => name(s.id))
  const arrows = els
    .filter((e) => e.type === 'arrow' || e.type === 'line')
    .map((a) => {
      const from = a.startBinding?.elementId, to = a.endBinding?.elementId
      const label = labelOf.get(a.id)
      if (!from && !to) return null
      return `${from ? name(from) : '?'} → ${to ? name(to) : '?'}${label ? ` (${label})` : ''}`
    })
    .filter(Boolean)
  const notes = els.filter((e) => e.type === 'text' && !e.containerId).map((e) => text(e.text).replace(/\s+/g, ' ')).filter(Boolean)
  const parts = []
  if (boxes.length) parts.push(`Boxes: ${boxes.join(', ')}`)
  if (arrows.length) parts.push(`Connections: ${arrows.join('; ')}`)
  if (notes.length) parts.push(`Notes on the board: ${notes.join(' | ')}`)
  return parts.join('\n')
}

/** A project as text: the file tree, then each file. Long projects are cut, biggest files last. */
export function describeProject(raw, language) {
  const { files, folders } = parseProject(raw, language)
  const withCode = files.filter((f) => f.content.trim())
  if (!withCode.length) return ''
  const tree = [...folders.map((d) => `${d}/`), ...files.map((f) => f.path)].sort().join('\n')
  let out = `Files:\n${tree}\n`
  let budget = MAX_FIELD_FOR_MODEL
  for (const f of [...withCode].sort((a, b) => a.content.length - b.content.length)) {
    const block = `\n--- ${f.path} ---\n${f.content.trim()}\n`
    if (block.length > budget) {
      out += `\n--- ${f.path} --- (${f.content.length} characters, cut for length)\n`
      continue
    }
    out += block
    budget -= block.length
  }
  return out
}

/** The answer as labelled sections of plain text, in the order the workspace shows them. */
export function answerForModel(format, content) {
  const lang = CODE_LANGUAGES.find((l) => l.id === content?.language)?.label || content?.language || ''
  return FORMATS[format].fields.map((f) => {
    const raw = content?.fields?.[f.key] ?? ''
    let body = f.kind === 'diagram' ? describeDiagram(raw) : f.kind === 'project' ? describeProject(raw, content?.language) : text(raw)
    if (body.length > MAX_FIELD_FOR_MODEL + 2000) body = body.slice(0, MAX_FIELD_FOR_MODEL) + '\n…(cut here)'
    return {
      label: f.kind === 'project' ? `${f.label} (${lang})` : f.label,
      kind: f.kind,
      text: body,
      // What this section should cover: the AI checks the thinking against it.
      ...(f.prompts && { covers: f.prompts }),
    }
  })
}

// ─── The AI report ──────────────────────────────────────────────────────────────
// Treated as untrusted input: keep known keys, clamp numbers, cap lengths.

const strList = (v, max) => (Array.isArray(v) ? v : []).map((x) => text(x).slice(0, 400)).filter(Boolean).slice(0, max)

export function cleanAiReview(r = {}, model = '') {
  return {
    rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 1))),
    summary: text(r.summary).slice(0, 600),
    strengths: strList(r.strengths, 5),
    improvements: strList(r.improvements, 6),
    hints: strList(r.hints, 4),
    model: text(model).slice(0, 60),
    at: new Date().toISOString(),
  }
}

/** An admin's review: a 1–5 rating and at least one comment. → { review, error } */
export function validateAdminReview(body = {}) {
  const rating = Number(body.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: 'Give a rating from 1 to 5' }
  const good = text(body.good).slice(0, 4000)
  const improve = text(body.improve).slice(0, 4000)
  if (!good && !improve) return { error: 'Write at least one comment' }
  return { review: { rating, good, improve } }
}
