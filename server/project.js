// A code answer is a small project: files in folders. Stored inside the answer like every
// other field (a string), as JSON:  { "files": [{ "path": "src/Main.java", "content": "…" }], "folders": ["src"] }
// Answers from before v1.5 are a plain code string; they read as one file (Main.java, main.py…).
// The client has the same rules in client/src/components/project/model.js.

export const PROJECT_LIMITS = { files: 60, folders: 40, pathLength: 120, depth: 6, totalBytes: 300_000 }

const MAIN_FILE = { cpp: 'main.cpp', java: 'Main.java', python: 'main.py', javascript: 'main.js', typescript: 'main.ts', go: 'main.go', sql: 'query.sql' }
export const mainFile = (language) => MAIN_FILE[language] || 'main.txt'

/** "src/models/Car.java" is fine; "../x", "a//b", "/abs", "a b" are not. */
export function validPath(p) {
  const s = String(p ?? '')
  if (!s || s.length > PROJECT_LIMITS.pathLength) return false
  const parts = s.split('/')
  return parts.length <= PROJECT_LIMITS.depth && parts.every((x) => /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/.test(x) && x !== '..')
}

/** Any stored value → { files, folders }. Legacy plain code becomes one file. Never throws. */
export function parseProject(value, language = 'java') {
  const s = String(value ?? '')
  if (!s.trim()) return { files: [], folders: [] }
  if (s.trimStart().startsWith('{')) {
    try {
      const p = JSON.parse(s)
      if (Array.isArray(p.files)) {
        return {
          files: p.files.filter((f) => f && validPath(f.path)).map((f) => ({ path: f.path, content: String(f.content ?? '') })),
          folders: (Array.isArray(p.folders) ? p.folders : []).filter(validPath),
        }
      }
    } catch {
      /* not JSON: legacy code that happens to start with "{" */
    }
  }
  return { files: [{ path: mainFile(language), content: s }], folders: [] }
}

/** Keeps the limits: unique valid paths, capped counts and size, folders implied by files included. */
export function cleanProject(value, language) {
  const p = parseProject(value, language)
  const seen = new Set()
  let bytes = 0
  const files = []
  for (const f of p.files) {
    if (seen.has(f.path) || files.length >= PROJECT_LIMITS.files) continue
    bytes += f.content.length
    if (bytes > PROJECT_LIMITS.totalBytes) break
    seen.add(f.path)
    files.push(f)
  }
  const folders = new Set(p.folders.slice(0, PROJECT_LIMITS.folders))
  for (const f of files) {
    const parts = f.path.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  if (!files.length && !folders.size) return ''
  return JSON.stringify({ files, folders: [...folders].sort() })
}

export function projectTooLarge(value) {
  const p = parseProject(value)
  return p.files.length > PROJECT_LIMITS.files || p.files.reduce((n, f) => n + f.content.length, 0) > PROJECT_LIMITS.totalBytes
}

/** Does it have any code in it? */
export const projectHasCode = (value) => parseProject(value).files.some((f) => f.content.trim())
