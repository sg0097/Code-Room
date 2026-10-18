import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { MonacoBinding } from 'y-monaco'

// Monaco runs language services in web workers; Vite bundles them via ?worker.
// (Pinned to monaco-editor 0.52.x: newer versions break y-monaco's import path and Vite's worker bundling.)
self.MonacoEnvironment = {
  getWorker: (_, label) => (label === 'typescript' || label === 'javascript' ? new TsWorker() : new EditorWorker()),
}

// Monaco rejects pending internal work with a "Canceled" error whenever a model is
// disposed (we do that on every problem/language switch). It's harmless; keep it out of the console.
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.name === 'Canceled' || e.reason?.message === 'Canceled') e.preventDefault()
})

/** Injects a color + name label for every remote cursor (y-monaco tags them by Yjs client id). */
export function useCursorStyles(participants) {
  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = participants
      .filter((p) => !p.self)
      .map(
        (p) => `
.yRemoteSelection-${p.clientId} { background-color: ${p.color}33; }
.yRemoteSelectionHead-${p.clientId} { border-left: 2px solid ${p.color}; }
.yRemoteSelectionHead-${p.clientId}::after { content: ${JSON.stringify(p.name)}; background: ${p.color}; }`,
      )
      .join('\n')
    document.head.appendChild(el)
    return () => el.remove()
  }, [participants])
}

export default function CodeEditor({ sync, textKey, language, participants, readOnly = false }) {
  const hostRef = useRef(null)
  const editorRef = useRef(null)
  useCursorStyles(participants)

  // Create the editor once.
  useEffect(() => {
    const editor = monaco.editor.create(hostRef.current, {
      theme: 'vs',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
      padding: { top: 12 },
    })
    editorRef.current = editor
    return () => {
      editor.getModel()?.dispose()
      editor.dispose()
    }
  }, [])

  // Bind the shared Y.Text for the selected problem + language. Re-binds on switch.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !sync || !textKey) return
    const ytext = sync.doc.getText(textKey)
    const model = monaco.editor.createModel('', language)
    const old = editor.getModel()
    editor.setModel(model)
    old?.dispose()
    const binding = new MonacoBinding(ytext, model, new Set([editor]), sync.awareness)
    return () => binding.destroy()
  }, [sync, textKey, language])

  // Prose fields (markdown) wrap lines; code doesn't.
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: language === 'markdown' ? 'on' : 'off', readOnly })
  }, [language, readOnly])

  return <div className="editor" ref={hostRef} />
}
