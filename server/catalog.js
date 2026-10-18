// Shared vocabulary for challenges. Served to the client at GET /api/meta so the
// form options, the workspace fields and the server's validation never drift apart.
import { cleanProject, projectTooLarge, PROJECT_LIMITS } from './project.js'

export const CATEGORIES = ['Backend', 'Frontend', 'System Design', 'Database', 'LLD', 'DevOps', 'Debugging', 'DSA']
export const DIFFICULTIES = ['Easy', 'Medium', 'Hard']
export const TIME_LIMITS = [15, 30, 45, 60, 90, 120]
export const MODES = ['independent', 'collaborative']

/**
 * An answer "format" decides what the solve workspace looks like:
 *   kind 'project' → a multi-file code editor with folders (stored as JSON, see project.js)
 *   kind 'diagram' → Excalidraw whiteboard (stored as a JSON string of elements)
 *   kind 'text'    → plain text area
 *
 * Every submission is stored the same way: { language, fields: { [key]: text } },
 * so compare, review and history work for all formats without special cases.
 */
export const FORMATS = {
  // `prompts` are what a good answer to that section covers: shown next to the box while solving,
  // and given to the AI reviewer, so the thinking is judged section by section.
  code: {
    label: 'Code',
    fields: [
      {
        key: 'approach', label: 'Approach', kind: 'text', placeholder: 'Think before you code: the idea in plain words, and why it works.',
        prompts: ['The idea in one or two sentences', 'The key observation that makes it work', 'Data structures you chose, and why'],
      },
      { key: 'code', label: 'Code', kind: 'project' },
      {
        key: 'explanation', label: 'Complexity & edge cases', kind: 'text', placeholder: 'Time and space complexity. Which edge cases you handled.',
        prompts: ['Time and space complexity', 'Edge cases: empty input, duplicates, limits', 'How you would test it'],
      },
    ],
  },
  design: {
    label: 'System design (whiteboard)',
    fields: [
      { key: 'diagram', label: 'Architecture diagram', kind: 'diagram' },
      { key: 'architecture', label: 'Components & request flow', kind: 'text', placeholder: 'Walk through the diagram: what each component does and how a request flows through it.' },
      { key: 'apis', label: 'APIs', kind: 'text', placeholder: 'POST /orders { ... } → 201 { ... }' },
      { key: 'database', label: 'Data model', kind: 'text', placeholder: 'Tables / collections, keys, indexes. Why this store?' },
      {
        key: 'tradeoffs', label: 'Reasoning & trade-offs', kind: 'text', placeholder: 'What did you assume? What did you give up, and why?',
        prompts: ['Assumptions about scale and traffic', 'What you gave up, and why', 'What breaks first, and what you would do then'],
      },
    ],
  },
  lld: {
    label: 'Low-level design (whiteboard + code)',
    language: 'java', // the language new answers start in (others start in the first of CODE_LANGUAGES)
    fields: [
      {
        key: 'requirements', label: 'Requirements & assumptions', kind: 'text', placeholder: 'What must the system do? What did you leave out on purpose?',
        prompts: ['The core use cases it must support', 'What you left out on purpose', 'Assumptions about rules or scale'],
      },
      { key: 'diagram', label: 'Class diagram', kind: 'diagram' },
      { key: 'code', label: 'Code', kind: 'project' },
      {
        key: 'explanation', label: 'Design decisions', kind: 'text', placeholder: 'Why these classes and relationships? Which patterns, and what would change if requirements grow?',
        prompts: ['Why each class owns what it owns', 'Patterns used (Strategy, State, Observer…) and why', 'What changes when a new requirement arrives', 'Thread safety, if two users act at once'],
      },
    ],
  },
  debug: {
    label: 'Debugging',
    fields: [
      { key: 'issue', label: 'What is wrong?', kind: 'text', placeholder: 'The symptom and where it comes from.' },
      { key: 'cause', label: 'Why does it happen?', kind: 'text', placeholder: 'The root cause, not just the symptom.' },
      { key: 'fix', label: 'How would you fix it?', kind: 'text', placeholder: 'The fix, and how you would verify it.' },
    ],
  },
}

export const DEFAULT_FORMAT = {
  DSA: 'code', Frontend: 'code', LLD: 'lld',
  Backend: 'design', 'System Design': 'design', Database: 'design',
  DevOps: 'debug', Debugging: 'debug',
}

// First entry is the default.
export const CODE_LANGUAGES = [
  { id: 'cpp', label: 'C++' },
  { id: 'java', label: 'Java' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'go', label: 'Go' },
  { id: 'sql', label: 'SQL' },
]

export const REVIEW_CRITERIA = [
  { key: 'understanding', label: 'Problem understanding' },
  { key: 'reasoning', label: 'Reasoning' },
  { key: 'approach', label: 'Technical approach' },
  { key: 'edgeCases', label: 'Edge cases' },
]

const MAX_FIELD = 50_000
export const MAX_DIAGRAM = 1_500_000 // ~1.5 MB of element JSON is a very large diagram

/** A diagram field must be a JSON array (of Excalidraw elements); anything else becomes empty. */
function cleanDiagram(value) {
  const s = String(value ?? '')
  if (!s) return ''
  try {
    return Array.isArray(JSON.parse(s)) ? s : ''
  } catch {
    return ''
  }
}

/** Returns an error message if the content can't be stored as-is (instead of silently truncating a diagram). */
export function contentProblem(format, content) {
  for (const f of FORMATS[format].fields) {
    if (f.kind === 'diagram' && String(content?.fields?.[f.key] ?? '').length > MAX_DIAGRAM) return 'This diagram is too large to save'
    if (f.kind === 'project' && projectTooLarge(content?.fields?.[f.key])) return `Your code is too large to save (at most ${PROJECT_LIMITS.files} files, ${PROJECT_LIMITS.totalBytes / 1000} KB)`
  }
  return null
}

/** Keeps only known fields for the format, as strings, capped in size. */
export function cleanContent(format, content) {
  const fields = {}
  const lang = CODE_LANGUAGES.some((l) => l.id === content?.language) ? content.language : CODE_LANGUAGES[0].id
  for (const f of FORMATS[format].fields) {
    const raw = content?.fields?.[f.key]
    fields[f.key] = f.kind === 'diagram' ? cleanDiagram(raw) : f.kind === 'project' ? cleanProject(raw, lang) : String(raw ?? '').slice(0, MAX_FIELD)
  }
  const out = { language: lang, fields }
  // A coding problem's test score, from the browser run on submit (practice: not re-checked here).
  const r = content?.run
  if (r && Number.isInteger(r.passed) && Number.isInteger(r.total) && r.total > 0 && r.total <= 500 && r.passed >= 0 && r.passed <= r.total) {
    out.run = { passed: r.passed, total: r.total, language: CODE_LANGUAGES.some((l) => l.id === r.language) ? r.language : lang }
  }
  return out
}

export const emptyContent = (format) => cleanContent(format, {})
