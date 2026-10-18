import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import * as monaco from 'monaco-editor'
import { MonacoBinding } from 'y-monaco'
import { useCursorStyles } from '../CodeEditor'
import Workbench from './Workbench'
import { languageOf, mainFile, movePath, within } from './model'

/**
 * A room's shared code project. In the room's Yjs doc:
 *   Y.Map('files:<field>')   path → Y.Text   (each file is a shared text: live typing, cursors)
 *   Y.Map('folders:<field>') path → true     (so empty folders show for everyone)
 * Everyone can be in a different file; the tree shows who is where. The server reads the same
 * maps on team submit (rooms.js projectJson).
 */
export default function CollabProjectEditor({ sync, field, language, participants, readOnly }) {
  const files = sync.doc.getMap(`files:${field}`)
  const folders = sync.doc.getMap(`folders:${field}`)
  const [paths, setPaths] = useState(() => [...files.keys()])
  const [dirs, setDirs] = useState(() => [...folders.keys()])
  const [active, setActive] = useState(() => [...files.keys()].sort()[0] || null)
  const [where, setWhere] = useState({}) // path → [{ name, color }] of the others
  const host = useRef(null)
  const editor = useRef(null)
  useCursorStyles(participants)

  useEffect(() => {
    const onFiles = () => setPaths([...files.keys()])
    const onDirs = () => setDirs([...folders.keys()])
    files.observe(onFiles)
    folders.observe(onDirs)
    // Seed the project once the room's saved state has arrived (seeding earlier could
    // overwrite a file someone already wrote). Rooms from before folders: their code becomes main.*.
    const seed = () => {
      if (files.size || folders.size || readOnly) return
      const legacy = sync.doc.getText(`field:${field}`).toString()
      sync.doc.transact(() => files.set(mainFile(language), new Y.Text(legacy)))
    }
    if (sync.provider.synced) seed()
    else sync.provider.once('sync', seed)
    onFiles()
    onDirs()
    return () => {
      files.unobserve(onFiles)
      folders.unobserve(onDirs)
      sync.provider.off('sync', seed)
    }
  }, [sync, field]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open something when nothing is open, or the open file was renamed / deleted by someone.
  useEffect(() => {
    if (!active || !paths.includes(active)) setActive([...paths].sort()[0] || null)
  }, [paths, active])

  // Who is in which file: shared through awareness, not stored.
  useEffect(() => {
    sync.awareness.setLocalStateField('file', active ? { field, path: active } : null)
    const onChange = () => {
      const map = {}
      sync.awareness.getStates().forEach((s, clientId) => {
        if (clientId === sync.doc.clientID || !s.user || s.file?.field !== field) return
        ;(map[s.file.path] ||= []).push({ name: s.user.name, color: s.user.color })
      })
      setWhere(map)
    }
    sync.awareness.on('change', onChange)
    onChange()
    return () => sync.awareness.off('change', onChange)
  }, [sync, field, active])

  useEffect(() => {
    editor.current = monaco.editor.create(host.current, {
      theme: 'vs', automaticLayout: true, fontSize: 14, minimap: { enabled: false },
      scrollBeyondLastLine: false, tabSize: 2, padding: { top: 12 },
    })
    return () => {
      editor.current.getModel()?.dispose()
      editor.current.dispose()
    }
  }, [])

  // Bind the open file's shared text to the editor.
  const ytext = active ? files.get(active) : null
  useEffect(() => {
    if (!ytext || !editor.current) return
    const model = monaco.editor.createModel('', languageOf(active, language))
    const old = editor.current.getModel()
    editor.current.setModel(model)
    old?.dispose()
    const binding = new MonacoBinding(ytext, model, new Set([editor.current]), sync.awareness)
    return () => binding.destroy()
  }, [ytext, active, language, sync])

  useEffect(() => {
    editor.current?.updateOptions({ readOnly })
  }, [readOnly])

  // Renames copy the text into a new Y.Text (Yjs types can't move between keys).
  const ops = readOnly ? {} : {
    onCreate(path, kind) {
      sync.doc.transact(() => (kind === 'folder' ? folders.set(path, true) : files.set(path, new Y.Text())))
      if (kind === 'file') setActive(path)
    },
    onRename(from, to) {
      sync.doc.transact(() => {
        for (const [p, t] of [...files.entries()]) {
          if (!within(p, from)) continue
          files.set(movePath(p, from, to), new Y.Text(t.toString()))
          files.delete(p)
        }
        for (const d of [...folders.keys()]) {
          if (!within(d, from)) continue
          folders.set(movePath(d, from, to), true)
          folders.delete(d)
        }
      })
      if (active && within(active, from)) setActive(movePath(active, from, to))
    },
    onDelete(path) {
      sync.doc.transact(() => {
        for (const p of [...files.keys()]) if (within(p, path)) files.delete(p)
        for (const d of [...folders.keys()]) if (within(d, path)) folders.delete(d)
      })
    },
  }

  return (
    <Workbench paths={paths} folders={dirs} active={active} onOpen={setActive} language={language} badges={where} height="100%" {...ops}>
      <div className="proj-monaco" ref={host} />
    </Workbench>
  )
}
