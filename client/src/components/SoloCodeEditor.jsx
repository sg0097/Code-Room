import { useEffect, useState } from 'react'
import * as monaco from 'monaco-editor'

/** Syntax-highlighted, read-only code (used in Compare). */
export function CodeView({ code, language }) {
  const [html, setHtml] = useState(null)
  useEffect(() => {
    let alive = true
    monaco.editor.colorize(code || '', language, { tabSize: 2 }).then((h) => alive && setHtml(h))
    return () => {
      alive = false
    }
  }, [code, language])
  if (!code?.trim()) return <div className="muted small">(no code)</div>
  return html ? <pre className="code-view" dangerouslySetInnerHTML={{ __html: html }} /> : <pre className="code-view">{code}</pre>
}
