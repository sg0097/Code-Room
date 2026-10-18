import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Badge, RichText } from '../../components/ui'
import { libraryApi, startPractice } from './api'
import { Bullets, DEFAULT_MINUTES, FORMAT_ICON, ProblemTags, StatusIcon } from './shared'

const KIND_ICON = { diagram: '✎', code: '</>', text: '¶' }

/** LeetCode-style split view: the problem on the left, how to solve it on the right. */
export default function ProblemPage() {
  const { slug } = useParams()
  const [p, setP] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('description')

  useEffect(() => {
    setP(null)
    libraryApi.get(slug).then((d) => setP(d.problem)).catch((e) => setError(e.status === 404 ? 'This problem does not exist, or is not published yet.' : e.message))
  }, [slug])

  if (error) return <div className="center"><div className="card login"><p>{error}</p><Link className="btn" to="/problems">All problems</Link></div></div>
  if (!p) return <div className="center muted">Loading…</div>

  const tabs = [
    ['description', 'Description'],
    ['followups', `Follow-ups${p.unlocked ? '' : ' (locked)'}`],
    ['checklist', `What a good answer covers${p.unlocked ? '' : ' (locked)'}`],
  ]

  return (
    <div className="lc-split">
      <section className="lc-panel">
        <div className="lc-panel-head">
          <Link to="/problems" className="back" title="All problems">←</Link>
          {tabs.map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="lc-panel-body">
          {tab === 'description' && <Description p={p} />}
          {tab === 'followups' && (p.unlocked ? (
            <>
              <h3>What an interviewer asks next</h3>
              <p className="muted small">Try to answer each one. They get harder.</p>
              <Bullets items={p.followUps} numbered />
              {!p.followUps.length && <p className="muted">No follow-ups yet.</p>}
            </>
          ) : <Locked what={`${p.followUpCount || 'The'} follow-up questions`} />)}
          {tab === 'checklist' && (p.unlocked ? (
            <>
              <h3>What a good answer covers</h3>
              <p className="muted small">This is what reviewers look for. Other good answers are also fine.</p>
              <Bullets items={p.checklist} />
              {!p.checklist.length && <p className="muted">No checklist yet.</p>}
            </>
          ) : <Locked what="The reviewer checklist" />)}
        </div>
      </section>

      <section className="lc-panel">
        <div className="lc-panel-head"><span className="tab on">Solve</span></div>
        <div className="lc-panel-body">
          <SolvePanel p={p} />
        </div>
      </section>
    </div>
  )
}

function Description({ p }) {
  return (
    <div className="problem-desc">
      <div className="row wrap">
        <h2>{p.title}</h2>
        <StatusIcon status={p.myStatus} />
        {p.status !== 'published' && <Badge state={p.status.toUpperCase()} />}
      </div>
      <ProblemTags p={p} />
      {p.status === 'pending' && <div className="tip">This problem is waiting for review. Only you and the admins can see it.</div>}
      {p.status === 'rejected' && <div className="tip">Not published{p.adminNote ? `: ${p.adminNote}` : '.'}</div>}
      <div className="statement"><RichText text={p.statement} /></div>
      {p.constraints.length > 0 && (
        <>
          <div className="example-label">Constraints</div>
          <Bullets items={p.constraints} />
        </>
      )}
      {p.sources.length > 0 && (
        <>
          <div className="example-label">Based on</div>
          <ul className="bullets">
            {p.sources.map((s) => (
              <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.label || new URL(s.url).hostname}</a></li>
            ))}
          </ul>
        </>
      )}
      {p.origin === 'user' && p.authorName && <p className="muted small">Submitted by {p.authorName}</p>}
    </div>
  )
}

function Locked({ what }) {
  return (
    <div className="locked">
      <div className="lock">locked</div>
      <p><b>{what} unlock after you solve this once.</b></p>
      <p className="muted small">Solve the problem first. Then these will open.</p>
    </div>
  )
}

function SolvePanel({ p }) {
  const { meta } = useAuth()
  const navigate = useNavigate()
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES[p.difficulty] || 45)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fields = meta.formats[p.format].fields
  const published = p.status === 'published'

  async function practice() {
    setBusy(true)
    setError(null)
    try {
      const { id } = await startPractice(p, Number(minutes))
      navigate(`/challenges/${id}`)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="solve">
      <div className="solve-card solve-feature">
        <h3>Challenge a friend</h3>
        <p className="muted small">Compete with a friend or solve it together. You get a link to share.</p>
        {published ? (
          <Link to={`/challenges/new?problem=${encodeURIComponent(p.slug)}`} className="btn cta">Challenge a friend</Link>
        ) : (
          <button className="btn" disabled>Challenge a friend</button>
        )}
      </div>

      <div className="solve-card">
        <h3>Practice alone</h3>
        <p className="muted small">Solve it alone with a timer.</p>
        <div className="row">
          <select value={minutes} onChange={(e) => setMinutes(e.target.value)} style={{ width: 'auto' }}>
            {meta.timeLimits.map((t) => <option key={t} value={t}>{t} min</option>)}
          </select>
          <button className="btn" onClick={practice} disabled={busy || !published}>{busy ? 'Starting…' : 'Start practice'}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!published && <p className="muted small">You can practice once it's published.</p>}

      <div className="example-label">Your answer will have</div>
      <ul className="answer-fields">
        {fields.map((f) => (
          <li key={f.key}><span className="kind">{KIND_ICON[f.kind]}</span> {f.label}</li>
        ))}
      </ul>
      <p className="muted small">{FORMAT_ICON[p.format]} {meta.formats[p.format].label}</p>
    </div>
  )
}
