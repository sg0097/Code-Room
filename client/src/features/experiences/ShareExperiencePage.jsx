import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { experienceApi, experienceMeta, TAG_LABEL } from './api'

const EMPTY_ROUND = { name: '', notes: '' }

/**
 * Share an interview: write it up here (rounds + notes), or link a post you wrote elsewhere.
 * Either way it's sorted by company / role / YoE and goes to an admin before it's listed.
 */
export default function ShareExperiencePage() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState(null)
  const [mode, setMode] = useState('write')
  const [f, setF] = useState({
    company: '', roleTitle: '', role: '', yoe: '', outcome: '', tags: [], interviewedAt: '',
    rounds: [{ ...EMPTY_ROUND, name: 'Online assessment' }, { ...EMPTY_ROUND }], body: '', anonymous: false, url: '',
  })
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const setRound = (i, k, v) => setF((s) => ({ ...s, rounds: s.rounds.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }))
  const toggleTag = (t) => setF((s) => ({ ...s, tags: s.tags.includes(t) ? s.tags.filter((x) => x !== t) : [...s.tags, t] }))

  useEffect(() => {
    experienceMeta().then(setMeta)
  }, [])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErrors([])
    const common = { company: f.company, role: f.role || undefined, yoe: f.yoe, outcome: f.outcome || undefined }
    try {
      const { experience } = await experienceApi.share(
        mode === 'link'
          ? { ...common, url: f.url.trim() }
          : { ...common, roleTitle: f.roleTitle, tags: f.tags, rounds: f.rounds, body: f.body, anonymous: f.anonymous, interviewedAt: f.interviewedAt ? `${f.interviewedAt}-01` : undefined },
      )
      navigate('/my/experiences', { state: { shared: experience.title } })
    } catch (err) {
      setErrors(err.data?.errors || [err.message])
      setBusy(false)
    }
  }

  if (!meta) return <div className="center muted">Loading…</div>
  return (
    <form className="narrow form" onSubmit={submit}>
      <div className="page-head">
        <h1>Share an interview experience</h1>
        <Link to="/experiences" className="muted small">← Experiences</Link>
      </div>

      <div className="mode-pick">
        <label className={`mode-card ${mode === 'write' ? 'on' : ''}`}>
          <input type="radio" checked={mode === 'write'} onChange={() => setMode('write')} />
          <b>Write it here</b>
          <span className="muted small">The rounds, what they asked, how it went. Anonymous if you like.</span>
        </label>
        <label className={`mode-card ${mode === 'link' ? 'on' : ''}`}>
          <input type="radio" checked={mode === 'link'} onChange={() => setMode('link')} />
          <b>Link a post</b>
          <span className="muted small">Already wrote it on LeetCode, Medium or a blog? We'll list it and link to it.</span>
        </label>
      </div>

      {mode === 'link' && (
        <label>
          <span>Link to the post</span>
          <input type="url" required value={f.url} onChange={set('url')} placeholder="https://leetcode.com/discuss/post/…" />
        </label>
      )}

      <div className="grid-3">
        <label>
          <span>Company {mode === 'link' && <span className="muted small">if the link doesn't say</span>}</span>
          <input value={f.company} onChange={set('company')} required={mode === 'write'} maxLength={60} placeholder="e.g. Swiggy" />
        </label>
        {mode === 'write' && (
          <label>
            <span>Job title</span>
            <input value={f.roleTitle} onChange={set('roleTitle')} maxLength={80} placeholder="e.g. SDE-2 Backend" />
          </label>
        )}
        <label>
          <span>Role <span className="muted small">{mode === 'write' ? 'we guess it from the title' : 'optional'}</span></span>
          <select value={f.role} onChange={set('role')}>
            <option value="">{mode === 'write' ? 'From the job title' : 'From the link'}</option>
            {meta.roles.filter((r) => r !== 'Other').map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
      </div>

      <div className="grid-3">
        <label>
          <span>Your years of experience</span>
          <input type="number" min="0" max="40" value={f.yoe} onChange={set('yoe')} placeholder="0 for students / freshers" />
        </label>
        <label>
          <span>Outcome</span>
          <select value={f.outcome} onChange={set('outcome')}>
            <option value="">Rather not say</option>
            <option value="selected">Got the offer</option>
            <option value="rejected">Didn't get it</option>
            <option value="pending">Still waiting</option>
          </select>
        </label>
        {mode === 'write' && (
          <label>
            <span>When <span className="muted small">optional</span></span>
            <input type="month" value={f.interviewedAt} onChange={set('interviewedAt')} />
          </label>
        )}
      </div>

      {mode === 'write' && (
        <>
          <div className="row wrap">
            {meta.tags.map((t) => (
              <label key={t} className="check"><input type="checkbox" checked={f.tags.includes(t)} onChange={() => toggleTag(t)} /> {TAG_LABEL[t]}</label>
            ))}
          </div>

          <div className="tip">
            <b>What helps people most:</b> the actual questions, what the interviewer pushed on, and what you'd do differently.
            Write it in your own words, and don't share anything you agreed to keep confidential.
          </div>

          {f.rounds.map((r, i) => (
            <div key={i} className="card xp-round-edit">
              <div className="row">
                <span className="xp-round-no">{i + 1}</span>
                <input value={r.name} onChange={(e) => setRound(i, 'name', e.target.value)} maxLength={80} placeholder="Round name, e.g. DSA, System design, Hiring manager" />
                {f.rounds.length > 1 && (
                  <button type="button" className="link" onClick={() => setF((s) => ({ ...s, rounds: s.rounds.filter((_, j) => j !== i) }))}>Remove</button>
                )}
              </div>
              <textarea rows={4} value={r.notes} onChange={(e) => setRound(i, 'notes', e.target.value)} placeholder="What did they ask? How did you approach it? What did they push on?" />
            </div>
          ))}
          {f.rounds.length < 10 && (
            <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setF((s) => ({ ...s, rounds: [...s.rounds, { ...EMPTY_ROUND }] }))}>+ Add a round</button>
          )}

          <label>
            <span>Anything else <span className="muted small">optional: prep tips, timeline, the offer</span></span>
            <textarea rows={5} value={f.body} onChange={set('body')} />
          </label>
          <label className="check"><input type="checkbox" checked={f.anonymous} onChange={set('anonymous')} /> Post anonymously (your name isn't shown)</label>
        </>
      )}

      {errors.length > 0 && <ul className="error">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send for review'}</button>
      <p className="muted small">An admin checks it, then it's listed under its company, role and experience level. You'll see the status under My posts.</p>
    </form>
  )
}
