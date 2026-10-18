import { useEffect, useRef, useState } from 'react'
import * as monaco from 'monaco-editor'
import '../CodeEditor' // registers Monaco's workers (MonacoEnvironment)
import { CodeView } from '../SoloCodeEditor'
import Workbench from './Workbench'
import { languageOf, mainFile, movePath, parseProject, serialize, within } from './model'

let instances = 0

/**
 * The solve screen's code editor: a project of files and folders. `value` is the stored JSON
 * (or old plain code); onChange gets the new JSON on every edit. One Monaco model per file, so
 * each file keeps its own undo history while you switch between them.
 */
export default function ProjectEditor({ value, onChange, language, height = 540 }) {
  const [project, setProject] = useState(() => {
    const p = parseProject(value, language)
    return p.files.length || p.folders.length ? p : { files: [{ path: mainFile(language), content: '' }], folders: [] }
  })
  const [active, setActive] = useState(() => project.files[0]?.path || null)
  const latest = useRef(project)
  latest.current = project
  const host = useRef(null)
  const editor = useRef(null)
  const models = useRef(new Map()) // path → monaco model
  const id = useRef(++instances)
  const emit = useRef(onChange)
  emit.current = onChange

  const update = (next) => {
    latest.current = next
    setProject(next)
    emit.current(serialize(next))
  }

  useEffect(() => {
    editor.current = monaco.editor.create(host.current, {
      theme: 'vs', automaticLayout: true, fontSize: 14, minimap: { enabled: false },
      scrollBeyondLastLine: false, tabSize: 2, padding: { top: 10 },
    })
    const all = models.current
    return () => {
      editor.current.dispose()
      for (const m of all.values()) m.dispose()
      all.clear()
    }
  }, [])

  // Show the active file, creating its model the first time it's opened.
  useEffect(() => {
    if (!active || !editor.current) return
    let model = models.current.get(active)
    if (!model) {
      const file = latest.current.files.find((f) => f.path === active)
      model = monaco.editor.createModel(file?.content || '', languageOf(active, language), monaco.Uri.parse(`inmemory://p${id.current}/${active}`))
      model.onDidChangeContent(() => {
        const p = latest.current
        update({ ...p, files: p.files.map((f) => (f.path === active ? { ...f, content: model.getValue() } : f)) })
      })
      models.current.set(active, model)
    }
    editor.current.setModel(model)
    editor.current.focus()
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switching language before writing anything renames the empty starter file (Main.java → main.py).
  useEffect(() => {
    const p = latest.current
    if (p.files.length !== 1 || p.files[0].content || p.folders.length) return
    const next = mainFile(language)
    if (p.files[0].path === next) return
    dropModels(p.files[0].path)
    setProject({ files: [{ path: next, content: '' }], folders: [] })
    setActive(next)
  }, [language])

  function dropModels(under) {
    for (const [p, m] of models.current) {
      if (within(p, under)) {
        m.dispose()
        models.current.delete(p)
      }
    }
  }

  const ops = {
    onCreate(path, kind) {
      const p = latest.current
      if (kind === 'folder') return update({ ...p, folders: [...p.folders, path] })
      update({ ...p, files: [...p.files, { path, content: '' }] })
      setActive(path)
    },
    onRename(from, to) {
      const p = latest.current
      dropModels(from) // a model's URI is its path; the next open makes a new one
      update({
        files: p.files.map((f) => ({ ...f, path: movePath(f.path, from, to) })),
        folders: p.folders.map((d) => movePath(d, from, to)),
      })
      if (active && within(active, from)) setActive(movePath(active, from, to))
    },
    onDelete(path) {
      const p = latest.current
      dropModels(path)
      const next = { files: p.files.filter((f) => !within(f.path, path)), folders: p.folders.filter((d) => !within(d, path)) }
      update(next)
      if (active && within(active, path)) setActive(next.files[0]?.path || null)
    },
  }

  return (
    <Workbench paths={project.files.map((f) => f.path)} folders={project.folders} active={active} onOpen={setActive} language={language} height={height} {...ops}>
      <div className="proj-monaco" ref={host} />
    </Workbench>
  )
}

/** Read-only: the same tree and tabs, with highlighted code (compare, admin review). */
export function ProjectView({ value, language, height = 420 }) {
  const project = parseProject(value, language)
  const [active, setActive] = useState(project.files.find((f) => f.content.trim())?.path || project.files[0]?.path || null)
  if (!project.files.length) return <span className="muted small">(no code)</span>
  const file = project.files.find((f) => f.path === active)
  return (
    <Workbench paths={project.files.map((f) => f.path)} folders={project.folders} active={active} onOpen={setActive} language={language} height={height}>
      <div className="proj-view">{file && <CodeView code={file.content} language={languageOf(file.path, language)} />}</div>
    </Workbench>
  )
}
