import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { LEVEL } from '../../components/ui'
import { libraryApi } from './api'
import { fromLines } from './shared'

const EMPTY = { title: '', category: 'System Design', difficulty: 'Medium', format: '', statement: '', constraints: '', followUps: '', companies: '', sources: '' }

/** A user turns an interview question into a library problem. It goes to the review queue. */
export default function SubmitProblemPage() {
  const { meta } = useAuth()
  const navigate = useNavigate()
  const [f, setF] = useState({ ...EMPTY, format: meta.defaultFormat['System Design'] })
  const [formatTouched, setFormatTouched] = useState(false)
  const [similar, setSimilar] = useState(null) // near-duplicates the server found
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    if (!formatTouched) setF((s) => ({ ...s, format: meta.defaultFormat[s.category] }))
  }, [f.category, formatTouched, meta])

  async function submit(confirmNotDuplicate = false) {
    setBusy(true)
    setErrors([])
    try {
      await libraryApi.submit({
        ...f,
        constraints: fromLines(f.constraints),
        followUps: fromLines(f.followUps),
        sources: fromLines(f.sources).map((url) => ({ url })),
        confirmNotDuplicate,
      })
      navigate('/my/problems', { state: { submitted: f.title } })
    } catch (e) {
      if (e.status === 409 && e.data?.similar) setSimilar(e.data.similar)
      else setErrors(e.data?.errors || [e.message])
      setBusy(false)
    }
  }

  return (
    <form className="narrow form" onSubmit={(e) => { e.preventDefault(); submit(false) }}>
      <div className="page-head">
        <h1>Submit a problem</h1>
        <Link to="/problems" className="muted small">← Problems</Link>
      </div>
      <div className="tip">
        <b>Describe a situation, not a concept.</b> "Two managers approve the same order at the same moment and stock goes negative" teaches more than
        "Implement distributed locking". Write it in your own words: don't paste someone's interview post. Link it under Sources instead.
      </div>

      <label>
        <span>Title</span>
        <input value={f.title} onChange={set('title')} maxLength={120} required placeholder="e.g. Cashback ledger with reversals" />
      </label>

      <div className="grid-3">
        <label>
          <span>Category</span>
          <select value={f.category} onChange={set('category')}>{meta.categories.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label>
          <span>Level</span>
          <select value={f.difficulty} onChange={set('difficulty')}>
            {meta.difficulties.map((d) => <option key={d} value={d}>{LEVEL[d]}</option>)}
          </select>
        </label>
        <label>
          <span>Answer format</span>
          <select value={f.format} onChange={(e) => { setFormatTouched(true); set('format')(e) }}>
            {Object.entries(meta.formats).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>

      <label>
        <span>Problem statement</span>
        <textarea rows={9} value={f.statement} onChange={set('statement')} required
          placeholder={'What is the situation? What has to be built or fixed?\n\nUse ``` on its own line to start and end a code block.'} />
      </label>

      <label>
        <span>Constraints <span className="muted small">one per line</span></span>
        <textarea rows={4} value={f.constraints} onChange={set('constraints')} placeholder={'5 million payments a day\nEvents can arrive twice or out of order'} />
      </label>

      <label>
        <span>Follow-up questions <span className="muted small">optional, one per line, easiest first</span></span>
        <textarea rows={4} value={f.followUps} onChange={set('followUps')} placeholder={'What if the refund arrives after the cashback was spent?'} />
      </label>

      <div className="grid-3">
        <label>
          <span>Companies <span className="muted small">optional, comma-separated</span></span>
          <input value={f.companies} onChange={set('companies')} placeholder="e.g. PhonePe, Swiggy" />
        </label>
        <label style={{ gridColumn: 'span 2' }}>
          <span>Sources <span className="muted small">optional links, one per line</span></span>
          <textarea rows={2} value={f.sources} onChange={set('sources')} placeholder="https://…" />
        </label>
      </div>

      {similar && (
        <div className="card dup-card">
          <b>This looks similar to problems we already have</b>
          <ul className="bullets">
            {similar.map((s) => (
              <li key={s.id}>
                {s.status === 'published' ? <Link to={`/problems/${s.slug}`} target="_blank">{s.title}</Link> : s.title}
                <span className="muted small"> · {Math.round(s.score * 100)}% match{s.status !== 'published' ? ' · in review' : ''}</span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => submit(true)}>It's different, submit anyway</button>
            <button type="button" className="btn ghost" onClick={() => setSimilar(null)}>Edit it</button>
          </div>
        </div>
      )}

      {errors.length > 0 && <ul className="error">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {!similar && <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>}
      <p className="muted small">An admin checks clarity, constraints and level, then publishes it. You'll see the status under My submissions.</p>
    </form>
  )
}
