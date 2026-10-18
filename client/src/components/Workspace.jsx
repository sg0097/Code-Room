import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import ProjectEditor from './project/ProjectEditor'
import { SoloWhiteboard } from './whiteboard'
import { Modal, RichText, Timer } from './ui'
import { useSolutionReviews } from '../features/reviews/api'
import { AiReviewCard } from '../features/reviews/ReviewCards'
import { prepProfile } from '../features/prep/api'
import { mainFile, parseProject } from './project/model'
import TestPanel, { summarize, useTestRunner } from './TestPanel'
import { RUNNABLE, sourceFor } from '../lib/runner'

const AUTOSAVE_MS = 1500

/** The problem's "Constraints:" list (library problems append one to the statement). */
function constraintsOf(statement) {
  const m = String(statement || '').match(/\n\s*Constraints:\s*\n([\s\S]*)$/)
  return m ? m[1].split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean) : []
}

function emptyContent(fields, language) {
  return { language, fields: Object.fromEntries(fields.map((f) => [f.key, ''])) }
}

/**
 * Independent solve workspace. Drafts autosave 1.5s after you stop typing, on
 * "Save draft", and when you leave the page, so closing the tab never loses work.
 * "AI review" sends the current draft for quick feedback; it doesn't submit anything.
 */
export default function Workspace({ view, onChange }) {
  const { meta } = useAuth()
  const c = view.challenge
  const fields = meta.formats[c.format].fields
  const constraints = constraintsOf(c.statement)
  const firstText = fields.find((f) => f.kind === 'text')?.key
  // A coding problem with tests: its starter code goes in the editor, in a language that can run here.
  const spec = c.problem?.tests || null
  const codeKey = fields.find((f) => f.kind === 'project')?.key
  const starterFor = (lang) => (spec?.starter?.[lang] ? JSON.stringify({ files: [{ path: mainFile(lang), content: spec.starter[lang] }], folders: [] }) : '')
  const [content, setContent] = useState(() => {
    const lang = spec ? (RUNNABLE.includes(meta.formats[c.format].language) ? meta.formats[c.format].language : 'python') : meta.formats[c.format].language || meta.languages[0].id
    const empty = emptyContent(fields, lang)
    const saved = view.mySubmission?.content
    const merged = saved ? { ...empty, ...saved, fields: { ...empty.fields, ...saved.fields } } : empty
    const code = codeKey && parseProject(merged.fields[codeKey], merged.language)
    if (spec && codeKey && !code.files.some((f) => f.content.trim())) return { ...merged, language: lang, fields: { ...merged.fields, [codeKey]: starterFor(lang) } }
    return merged
  })
  const [editorKey, setEditorKey] = useState(0) // bumped when the starter code is swapped for another language
  const runner = useTestRunner(spec)
  const [save, setSave] = useState({ state: 'saved', at: view.mySubmission?.updatedAt || null })
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const fb = useSolutionReviews(c.id)
  const [showAi, setShowAi] = useState(true)
  const latest = useRef(content)
  const dirty = useRef(false)
  latest.current = content

  // Nothing written yet: start in the language from your prep profile.
  useEffect(() => {
    const code = fields.filter((f) => f.kind === 'project')
    if (!code.length) return
    let live = true
    prepProfile().then((p) => {
      const cur = latest.current
      const written = code.some((f) => parseProject(cur.fields[f.key], cur.language).files.some((x) => x.content.trim()))
      if (live && p?.language && p.language !== cur.language && !written) setContent((x) => ({ ...x, language: p.language }))
    })
    return () => {
      live = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveNow = useCallback(async () => {
    if (!dirty.current) return
    dirty.current = false
    setSave((s) => ({ ...s, state: 'saving' }))
    try {
      const { savedAt } = await api.saveDraft(c.id, latest.current)
      setSave({ state: dirty.current ? 'unsaved' : 'saved', at: savedAt })
    } catch (e) {
      dirty.current = true
      setSave((s) => ({ ...s, state: 'error', message: e.message }))
    }
  }, [c.id])

  // Debounced autosave.
  useEffect(() => {
    if (!dirty.current) return
    const t = setTimeout(saveNow, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [content, saveNow])

  // Last-chance save when the tab closes or you navigate away.
  useEffect(() => {
    const flush = () => dirty.current && api.saveDraft(c.id, latest.current, { keepalive: true }).catch(() => {})
    const warn = (e) => {
      if (dirty.current) {
        flush()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      flush()
    }
  }, [c.id])

  const update = (patch) => {
    dirty.current = true
    setSave((s) => ({ ...s, state: 'unsaved' }))
    setContent((s) => ({ ...s, ...patch, fields: { ...s.fields, ...(patch.fields || {}) } }))
  }

  const submit = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      dirty.current = false
      const next = await api.challengeAction(c.id, 'submit', { content: latest.current })
      onChange(next)
    } catch (e) {
      // Timer ran out a moment earlier and the server already locked it in: just reload.
      if (e.status === 409) onChange(await api.challenge(c.id))
      else setError(e.message)
      setSubmitting(false)
    }
  }, [c.id, onChange])

  function changeLanguage(key, lang) {
    // Untouched starter code follows the language (Python starter → JavaScript starter).
    const untouched = spec && latest.current.fields[key] === starterFor(latest.current.language)
    if (untouched && starterFor(lang)) {
      update({ language: lang, fields: { [key]: starterFor(lang) } })
      setEditorKey((k) => k + 1)
    } else update({ language: lang })
  }

  const runCode = (kind) => {
    const cur = latest.current
    return runner.run(kind, cur.language, sourceFor(cur.language, parseProject(cur.fields[codeKey], cur.language).files))
  }

  // Ctrl+' runs the sample tests, like most online judges.
  useEffect(() => {
    if (!spec) return
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "'") {
        e.preventDefault()
        runCode('run')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Submitting a coding problem runs every test first and keeps the score with the answer.
  async function submitWithTests() {
    if (spec && RUNNABLE.includes(latest.current.language)) {
      const out = await runCode('submit')
      const sum = summarize(out)
      if (sum) latest.current = { ...latest.current, run: { passed: sum.passed, total: sum.total, language: latest.current.language } }
    }
    submit()
  }

  const askAi = () => {
    setShowAi(true)
    fb.askAi(latest.current)
  }

  const saveLabel = {
    saved: save.at ? `Saved ${new Date(save.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: `Couldn't save, retrying (${save.message})`,
  }[save.state]

  return (
    <div className="workspace">
      <aside className="ws-problem card">
        <div className="ws-problem-head">
          <h2>{c.title}</h2>
          <Timer deadline={view.me.deadlineAt} onExpire={submit} />
        </div>
        <RichText text={c.statement} />
      </aside>

      <section className="ws-answer">
        {fb.latestAi && showAi && <AiReviewCard review={fb.latestAi} onRetry={askAi} onClose={() => setShowAi(false)} />}
        {fields.map((f) => (
          <div key={f.key} className="field">
            <div className="field-head">
              <label htmlFor={`f-${f.key}`}>{f.label}</label>
              {f.kind === 'project' && (
                <select value={content.language} onChange={(e) => changeLanguage(f.key, e.target.value)} title="Language for new files">
                  {meta.languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              )}
            </div>
            {f.prompts && (
              <ul className="field-prompts" aria-label="What this part should cover">
                {f.prompts.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
            {f.key === firstText && constraints.length > 0 && (
              <div className="field-constraints small">
                <b>Your approach should handle:</b> {constraints.join(' · ')}
              </div>
            )}
            {f.kind === 'diagram' ? (
              <SoloWhiteboard value={content.fields[f.key]} onChange={(v) => update({ fields: { [f.key]: v } })} />
            ) : f.kind === 'project' ? (
              <>
                <ProjectEditor key={`${f.key}:${editorKey}`} value={content.fields[f.key]} language={content.language} onChange={(v) => update({ fields: { [f.key]: v } })} />
                {spec && (
                  <TestPanel spec={spec} outcome={runner.outcome} status={runner.status} language={content.language} onRun={() => runCode('run')} onSubmit={() => runCode('submit')} />
                )}
              </>
            ) : (
              <textarea
                id={`f-${f.key}`}
                rows={f.key === 'architecture' ? 8 : 5}
                value={content.fields[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => update({ fields: { [f.key]: e.target.value } })}
              />
            )}
          </div>
        ))}

        <div className="ws-actions">
          <span className={`save-state ${save.state}`}>{saveLabel}</span>
          <button
            className="btn ghost"
            onClick={askAi}
            disabled={!fb.aiEnabled || fb.busy || fb.aiRunning}
            title={fb.aiEnabled ? "Quick feedback on your draft. It doesn't submit anything." : 'AI review is off on this server'}
          >
            {fb.aiRunning ? 'AI reviewing…' : 'AI review'}
          </button>
          <button className="btn ghost" onClick={() => { dirty.current = true; saveNow() }}>Save draft</button>
          <button className="btn" onClick={() => setConfirm(true)} disabled={submitting}>Submit</button>
        </div>
        {(error || fb.error) && <p className="error">{error || fb.error}</p>}
      </section>

      {confirm && (
        <Modal
          title="Submit your solution?"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Keep working</button>
              <button className="btn" disabled={submitting} onClick={() => { setConfirm(false); submitWithTests() }}>Submit</button>
            </>
          }
        >
          <p>You won't be able to change it after this. Solutions are revealed once everyone has submitted.</p>
          {spec && <p className="muted small">Every test, hidden ones included, runs first and the score is saved with your answer.</p>}
        </Modal>
      )}
    </div>
  )
}
