import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { LEVEL, RichText } from '../components/ui'
import { libraryApi } from '../features/problems/api'
import { DEFAULT_MINUTES, ProblemTags } from '../features/problems/shared'

/** Write your own problem and challenge a friend on it (or anyone, with the link). */
export default function CustomChallenge() {
  const { meta } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [friends, setFriends] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [formatTouched, setFormatTouched] = useState(false)
  const [f, setF] = useState({
    title: '',
    statement: '',
    category: 'System Design',
    difficulty: 'Medium',
    format: meta.defaultFormat['System Design'],
    mode: 'independent',
    timeLimitMin: 45,
    friendId: params.get('friend') || '',
  })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  // ?problem=<slug>: challenge someone on a library problem (its text can't be edited here).
  const problemSlug = params.get('problem')
  const [problem, setProblem] = useState(null)
  useEffect(() => {
    if (!problemSlug) return
    libraryApi.get(problemSlug).then(({ problem: p }) => {
      setProblem(p)
      setF((s) => ({ ...s, title: p.title, statement: p.statement, category: p.category, difficulty: p.difficulty, format: p.format, timeLimitMin: DEFAULT_MINUTES[p.difficulty] || 45 }))
      setFormatTouched(true)
    }).catch((e) => setError(e.message))
  }, [problemSlug])

  useEffect(() => {
    api.friends().then((d) => {
      setFriends(d.friends)
      setF((s) => ({ ...s, friendId: s.friendId || '' }))
    })
  }, [])

  // The category suggests an answer format until the user picks one themselves.
  useEffect(() => {
    if (!formatTouched) setF((s) => ({ ...s, format: meta.defaultFormat[s.category] }))
  }, [f.category, formatTouched, meta])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { id } = await api.createChallenge({ ...f, problemId: problem?.id, timeLimitMin: Number(f.timeLimitMin), inviteeIds: f.friendId ? [f.friendId] : [], link: true })
      navigate(`/challenges/${id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (!friends || (problemSlug && !problem && !error)) return <div className="center muted">{error || 'Loading…'}</div>
  const fields = meta.formats[f.format].fields

  return (
    <form className="narrow form" onSubmit={submit}>
      <h1>Write your own problem</h1>
      <p className="muted" style={{ margin: 0 }}>You'll get a link to send. <Link to="/challenges/new">Or pick one from the library →</Link></p>

      <label>
        <span>Who</span>
        <select value={f.friendId} onChange={set('friendId')}>
          <option value="">Anyone with the link</option>
          {friends.map((fr) => (
            <option key={fr.user.id} value={fr.user.id}>{fr.user.name}</option>
          ))}
        </select>
      </label>

      <div className="mode-pick">
        {[
          ['independent', 'Compete', 'You both solve it alone, with the same time limit.'],
          ['collaborative', 'Together', 'Solve it together in one room, with video.'],
        ].map(([value, title, desc]) => (
          <label key={value} className={`mode-card ${f.mode === value ? 'on' : ''}`}>
            <input type="radio" name="mode" value={value} checked={f.mode === value} onChange={set('mode')} />
            <b>{title}</b>
            <span className="muted small">{desc}</span>
          </label>
        ))}
      </div>

      {problem ? (
        <div className="card">
          <div className="example-label">Problem from the library</div>
          <h2 style={{ margin: 0 }}>{problem.title}</h2>
          <ProblemTags p={problem} />
          <div className="statement-preview"><RichText text={problem.statement} /></div>
          <span className="muted small">{problem.constraints.length} constraints and {problem.followUpCount ?? problem.followUps.length} follow-ups come with it. Follow-ups unlock after you both submit.</span>
        </div>
      ) : (<>
      <label>
        <span>Title</span>
        <input value={f.title} onChange={set('title')} placeholder="e.g. Restaurant inventory" maxLength={120} required />
      </label>

      <label>
        <span>Problem statement</span>
        <textarea
          value={f.statement}
          onChange={set('statement')}
          rows={9}
          required
          placeholder={'Describe the situation and the constraints.\n\nMultiple restaurant managers update the same inventory item. Two managers can approve an order at almost the same time. Design a system that never lets inventory go negative.'}
        />
      </label>
      <div className="tip">
        <b>Describe the situation, not the concept.</b> Instead of "Implement Redis distributed locking", describe two managers approving the
        same order at once. Let your friend discover what matters.
      </div>
      </>)}

      <div className="grid-3">
        <label>
          <span>Category</span>
          <select value={f.category} onChange={set('category')} disabled={!!problem}>
            {meta.categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span>Difficulty</span>
          <select value={f.difficulty} onChange={set('difficulty')} disabled={!!problem}>
            {meta.difficulties.map((d) => <option key={d} value={d}>{LEVEL[d]}</option>)}
          </select>
        </label>
        <label>
          <span>Time limit</span>
          <select value={f.timeLimitMin} onChange={set('timeLimitMin')}>
            {meta.timeLimits.map((t) => <option key={t} value={t}>{t} minutes</option>)}
          </select>
        </label>
      </div>

      <label>
        <span>Answer format</span>
        <select
          disabled={!!problem}
          value={f.format}
          onChange={(e) => {
            setFormatTouched(true)
            set('format')(e)
          }}
        >
          {Object.entries(meta.formats).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="muted small">Answer will have: {fields.map((x) => x.label).join(' · ')}</span>
      </label>

      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create & send challenge'}</button>
    </form>
  )
}
