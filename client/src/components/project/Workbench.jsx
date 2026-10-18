import { useEffect, useState } from 'react'
import { LIMITS, baseName, buildTree, extFor, join, parentOf, validName, within } from './model'

const ICON = { java: 'J', py: 'Py', js: 'JS', ts: 'TS', cpp: 'C+', h: 'H', go: 'Go', sql: 'DB', md: 'M↓', json: '{}' }
const fileIcon = (name) => ICON[name.split('.').pop()?.toLowerCase()] || '·'

/**
 * The editor's frame, shared by the solo, room and read-only editors: a file tree with folders
 * (new file, new folder, rename, delete), open tabs, and the editor itself as `children`.
 * It owns no file contents: callers pass the paths and handle the operations.
 *
 *   paths, folders     what exists
 *   active, onOpen     which file the editor shows
 *   onCreate(path, 'file'|'folder'), onRename(from, to), onDelete(path)   (omit for read-only)
 *   badges             { [path]: [{ color, name }] } who else is in which file (rooms)
 */
export default function Workbench({ paths, folders, active, onOpen, onCreate, onRename, onDelete, language, badges = {}, height = 520, children }) {
  const readOnly = !onCreate
  const [tabs, setTabs] = useState(() => (active ? [active] : []))
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [dir, setDir] = useState('') // where "new file" goes: the folder you last clicked
  const [edit, setEdit] = useState(null) // { mode: 'file'|'folder'|'rename', dir, path?, value, error? }

  // Tabs follow the active file, and drop files that no longer exist.
  useEffect(() => {
    setTabs((t) => {
      const kept = t.filter((p) => paths.includes(p))
      return active && !kept.includes(active) ? [...kept, active] : kept
    })
  }, [active, paths])

  const tree = buildTree(paths, folders)
  const toggle = (path) => setCollapsed((c) => {
    const n = new Set(c)
    if (n.has(path)) n.delete(path)
    else n.add(path)
    return n
  })

  function startCreate(mode) {
    const value = mode === 'file' ? `New${extFor(language)}` : 'folder'
    setEdit({ mode, dir, value })
    if (dir) setCollapsed((c) => new Set([...c].filter((p) => p !== dir)))
  }

  function commit() {
    const name = edit.value.trim()
    if (!validName(name)) return setEdit({ ...edit, error: 'Letters, digits, . _ - only' })
    const target = edit.mode === 'rename' ? join(parentOf(edit.path), name) : join(edit.dir, name)
    if (target !== edit.path && (paths.includes(target) || folders.includes(target))) return setEdit({ ...edit, error: 'That name is taken' })
    if (target.split('/').length > LIMITS.depth) return setEdit({ ...edit, error: 'Too many folders deep' })
    if (edit.mode === 'file' && paths.length >= LIMITS.files) return setEdit({ ...edit, error: `At most ${LIMITS.files} files` })
    if (edit.mode === 'rename') {
      if (target !== edit.path) onRename(edit.path, target)
    } else {
      onCreate(target, edit.mode)
      if (edit.mode === 'folder') setDir(target)
    }
    setEdit(null)
  }

  const input = (
    <form className="proj-input" onSubmit={(e) => { e.preventDefault(); commit() }}>
      <input
        autoFocus
        value={edit?.value || ''}
        onChange={(e) => setEdit({ ...edit, value: e.target.value, error: null })}
        onBlur={() => setEdit(null)}
        onKeyDown={(e) => e.key === 'Escape' && setEdit(null)}
        onFocus={(e) => {
          const dot = e.target.value.lastIndexOf('.')
          e.target.setSelectionRange(0, edit?.mode !== 'folder' && dot > 0 ? dot : e.target.value.length) // select the name, not the extension
        }}
        aria-label="Name"
      />
      {edit?.error && <span className="proj-err">{edit.error}</span>}
    </form>
  )

  // A plain function, not a component: a component defined in here would remount on every
  // render and the name box would lose focus while you type.
  function node(n, depth) {
    const pad = { paddingLeft: 8 + depth * 14 }
    if (edit?.mode === 'rename' && edit.path === n.path) return <div key={n.path} style={pad}>{input}</div>
    const actions = !readOnly && (
      <span className="proj-actions">
        <button type="button" title="Rename" onClick={(e) => { e.stopPropagation(); setEdit({ mode: 'rename', path: n.path, value: n.name }) }}>✎</button>
        <button
          type="button"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation()
            const inside = paths.filter((p) => within(p, n.path)).length
            if (n.type === 'file' || !inside || confirm(`Delete "${n.name}" and the ${inside} file${inside > 1 ? 's' : ''} in it?`)) onDelete(n.path)
          }}
        >
          ×
        </button>
      </span>
    )
    if (n.type === 'file') {
      return (
        <div
          key={n.path}
          className={`proj-node ${active === n.path ? 'on' : ''}`}
          style={pad}
          onClick={() => {
            onOpen(n.path)
            setDir(parentOf(n.path))
          }}
          title={n.path}
        >
          <span className="proj-icon">{fileIcon(n.name)}</span>
          <span className="proj-name">{n.name}</span>
          {(badges[n.path] || []).map((b) => <span key={b.name} className="proj-dot" style={{ background: b.color }} title={`${b.name} is here`} />)}
          {actions}
        </div>
      )
    }
    const open = !collapsed.has(n.path)
    return (
      <div key={n.path} role="group">
        <div className={`proj-node folder ${dir === n.path ? 'here' : ''}`} style={pad} onClick={() => { toggle(n.path); setDir(n.path) }} title={n.path}>
          <span className="proj-icon">{open ? '▾' : '▸'}</span>
          <span className="proj-name">{n.name}</span>
          {actions}
        </div>
        {open && (
          <>
            {edit && edit.mode !== 'rename' && edit.dir === n.path && <div style={{ paddingLeft: 8 + (depth + 1) * 14 }}>{input}</div>}
            {n.children.map((c) => node(c, depth + 1))}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="proj" style={{ height }}>
      <aside className="proj-tree">
        <div className="proj-tree-head">
          <span>Files</span>
          {!readOnly && (
            <span className="proj-tools">
              <button type="button" title={`New file${dir ? ` in ${dir}` : ''}`} onClick={() => startCreate('file')}>+ File</button>
              <button type="button" title={`New folder${dir ? ` in ${dir}` : ''}`} onClick={() => startCreate('folder')}>+ Folder</button>
            </span>
          )}
        </div>
        <div className="proj-tree-body" onClick={(e) => e.target === e.currentTarget && setDir('')}>
          {edit && edit.mode !== 'rename' && edit.dir === '' && <div style={{ paddingLeft: 8 }}>{input}</div>}
          {tree.map((n) => node(n, 0))}
          {!paths.length && !folders.length && !edit && <p className="muted small proj-empty">{readOnly ? 'No files.' : 'No files yet. Add one with + File.'}</p>}
        </div>
      </aside>
      <section className="proj-main">
        <div className="proj-tabs">
          {tabs.map((p) => (
            <div key={p} className={`proj-tab ${p === active ? 'on' : ''}`} onClick={() => onOpen(p)} title={p}>
              <span>{baseName(p)}</span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close ${baseName(p)}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    const rest = tabs.filter((x) => x !== p)
                    setTabs(rest)
                    if (p === active) onOpen(rest[rest.length - 1])
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {active && <span className="proj-path muted small">{active}</span>}
        </div>
        {/* The editor stays mounted (Monaco owns its element); with no file open it's covered. */}
        <div className="proj-editor">
          {children}
          {!active && <div className="proj-none muted small">{readOnly ? 'Pick a file.' : 'Create or pick a file.'}</div>}
        </div>
      </section>
    </div>
  )
}
