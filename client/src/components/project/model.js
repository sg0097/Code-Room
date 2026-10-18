// A code answer is a small project: files in folders, stored as JSON inside the answer.
// Same rules as server/project.js (the server re-checks everything).
//   { "files": [{ "path": "src/Main.java", "content": "…" }], "folders": ["src"] }

export const LIMITS = { files: 60, folders: 40, depth: 6 }

const MAIN_FILE = { cpp: 'main.cpp', java: 'Main.java', python: 'main.py', javascript: 'main.js', typescript: 'main.ts', go: 'main.go', sql: 'query.sql' }
export const mainFile = (language) => MAIN_FILE[language] || 'main.txt'
export const extFor = (language) => (MAIN_FILE[language] || '.txt').replace(/^[^.]*/, '')

const BY_EXT = {
  java: 'java', py: 'python', js: 'javascript', jsx: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'cpp', hpp: 'cpp', c: 'c', go: 'go', sql: 'sql', md: 'markdown', json: 'json',
  kt: 'kotlin', cs: 'csharp', rb: 'ruby', rs: 'rust', swift: 'swift', yml: 'yaml', yaml: 'yaml', txt: 'plaintext',
}
/** Monaco language for a file, from its extension. */
export const languageOf = (path, fallback = 'plaintext') => BY_EXT[path.split('.').pop()?.toLowerCase()] || fallback

export const validName = (name) => /^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$/.test(name) && name !== '..'
export function validPath(p) {
  const parts = String(p ?? '').split('/')
  return parts.length <= LIMITS.depth && parts.every(validName)
}
export const parentOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')
export const baseName = (path) => path.slice(path.lastIndexOf('/') + 1)
export const join = (dir, name) => (dir ? `${dir}/${name}` : name)
/** Is `path` the folder `dir` itself or inside it? */
export const within = (path, dir) => path === dir || path.startsWith(`${dir}/`)

/** Any stored value → { files, folders }. Old answers (plain code) read as one file. */
export function parseProject(value, language) {
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
      /* plain code that starts with "{" */
    }
  }
  return { files: [{ path: mainFile(language), content: s }], folders: [] }
}

export const serialize = (p) => (p.files.length || p.folders.length ? JSON.stringify({ files: p.files, folders: p.folders }) : '')

/** Paths → a tree, folders first, then files, each alphabetical. */
export function buildTree(paths, folders) {
  const root = { children: new Map() }
  const ensure = (dir) => {
    let node = root
    let at = ''
    for (const part of dir ? dir.split('/') : []) {
      at = join(at, part)
      if (!node.children.has(part)) node.children.set(part, { name: part, path: at, type: 'folder', children: new Map() })
      node = node.children.get(part)
    }
    return node
  }
  for (const d of folders) ensure(d)
  for (const p of paths) ensure(parentOf(p)).children.set(baseName(p), { name: baseName(p), path: p, type: 'file' })
  const sort = (node) =>
    [...node.children.values()]
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1))
      .map((n) => (n.type === 'folder' ? { ...n, children: sort(n) } : n))
  return sort(root)
}

/** Moves everything under `from` to `to` (a file, or a folder and its contents). */
export function movePath(path, from, to) {
  return within(path, from) ? to + path.slice(from.length) : path
}
