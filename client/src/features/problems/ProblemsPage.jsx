import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { LEVEL } from '../../components/ui'
import Icon from '../../components/Icon'
import { libraryApi } from './api'
import { FORMAT_LABEL } from './shared'

const LEVELS = ['Easy', 'Medium', 'Hard']
const STATUS = { solved: 'Solved', attempted: 'Started', todo: 'Not started' }
const TYPES = { tests: 'Code with tests', design: 'Whiteboard', lld: 'Whiteboard + code', code: 'Code', debug: 'Written' }
const typeOf = (p) => (p.runnable ? 'tests' : p.format)

/** The problem library: challenges as rows, filters on the right (any mix of status, level, topic, type). */
// Filters start open on wide screens and folded on phones.
const isWide = () => typeof window === 'undefined' || window.matchMedia('(min-width: 1001px)').matches

export default function ProblemsPage() {
  const { meta } = useAuth()
  const navigate = useNavigate()
  const [problems, setProblems] = useState(null)
  const [wide] = useState(isWide)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [f, setF] = useState({ status: [], level: [], topic: [], type: [] })
  const toggle = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }))

  useEffect(() => {
    libraryApi.list().then((d) => setProblems(d.problems)).catch((e) => setError(e.message))
  }, [])

  const shown = useMemo(() => {
    if (!problems) return []
    const s = q.trim().toLowerCase()
    const status = (p) => p.myStatus || 'todo'
    return problems.filter(
      (p) =>
        (!s || p.title.toLowerCase().includes(s) || p.companies.some((c) => c.toLowerCase().includes(s))) &&
        (!f.status.length || f.status.includes(status(p))) &&
        (!f.level.length || f.level.includes(p.difficulty)) &&
        (!f.topic.length || f.topic.includes(p.category)) &&
        (!f.type.length || f.type.includes(typeOf(p))),
    )
  }, [problems, q, f])

  if (error) return <div className="center error">{error}</div>
  if (!problems) return <div className="center muted">Loading…</div>

  const solved = problems.filter((p) => p.myStatus === 'solved').length
  const topics = meta.categories.filter((c) => problems.some((p) => p.category === c))
  const types = Object.keys(TYPES).filter((t) => problems.some((p) => typeOf(p) === t))
  const count = (pred) => problems.filter(pred).length
  const anyFilter = Object.values(f).some((x) => x.length) || q
  const pickOne = () => {
    const pool = shown.filter((p) => p.myStatus !== 'solved')
    const p = (pool.length ? pool : shown)[Math.floor(Math.random() * (pool.length || shown.length))]
    if (p) navigate(`/problems/${p.slug}`)
  }

  return (
    <div className="hr-page">
      <div className="hr-head">
        <div className="crumbs"><Link to="/">Home</Link> <span>›</span> Problems</div>
        <h1>Problems</h1>
        <p className="muted">Real interview problems. Solve alone, or challenge a friend.</p>
      </div>

      <div className="hr-cols">
        <section className="hr-main">
          <div className="hr-searchbar">
            <Icon name="search" size={16} />
            <input placeholder="Search by title or company" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search problems" />
            <button className="btn ghost small" onClick={pickOne} title="Open a random unsolved problem">Surprise me</button>
          </div>
          <div className="hr-count muted small">{shown.length} of {problems.length} problems{anyFilter && <button className="link" onClick={() => { setQ(''); setF({ status: [], level: [], topic: [], type: [] }) }}>Clear filters</button>}</div>

          {shown.map((p) => (
            <div key={p.id} className={`hr-row ${p.myStatus === 'solved' ? 'is-solved' : ''}`}>
              <div className="hr-row-main">
                <Link to={`/problems/${p.slug}`} className="hr-row-title">{p.title}</Link>
                <div className="hr-row-meta">
                  <span className={`level-text ${p.difficulty.toLowerCase()}`}>{LEVEL[p.difficulty]}</span>
                  <span>{p.category}</span>
                  <span>{p.runnable ? 'Code with tests' : FORMAT_LABEL[p.format]}</span>
                  {p.solvers > 0 && <span>Solved by {p.solvers}</span>}
                  {p.companies.length > 0 && <span>Asked at {p.companies.join(', ')}</span>}
                </div>
              </div>
              {p.runnable && <span className="hr-tag" title="Run your code against test cases, right in the browser"><Icon name="check" size={13} /> Tests</span>}
              <Link to={`/problems/${p.slug}`} className={`btn small ${p.myStatus === 'solved' ? 'solved' : 'outline'}`}>
                {p.myStatus === 'solved' ? <>Solved <Icon name="check" size={14} /></> : p.myStatus === 'attempted' ? 'Continue' : 'Solve Challenge'}
              </Link>
            </div>
          ))}
          {shown.length === 0 && <div className="empty muted">No problems match these filters.</div>}
        </section>

        <aside className="hr-side">
          <div className="hr-progress">
            <b>{solved}<span className="muted">/{problems.length}</span></b>
            <span className="muted small">problems solved</span>
            <div className="meter"><span style={{ width: `${problems.length ? (solved / problems.length) * 100 : 0}%` }} /></div>
          </div>
          <details className="hr-filters" open={wide}>
            <summary>Filters</summary>
          <Filter title="Status" items={Object.entries(STATUS)} picked={f.status} onToggle={(v) => toggle('status', v)} count={(v) => count((p) => (p.myStatus || 'todo') === v)} />
          <Filter title="Difficulty" items={LEVELS.map((l) => [l, LEVEL[l]])} picked={f.level} onToggle={(v) => toggle('level', v)} count={(v) => count((p) => p.difficulty === v)} />
          <Filter title="Topic" items={topics.map((t) => [t, t])} picked={f.topic} onToggle={(v) => toggle('topic', v)} count={(v) => count((p) => p.category === v)} />
          <Filter title="Answer type" items={types.map((t) => [t, TYPES[t]])} picked={f.type} onToggle={(v) => toggle('type', v)} count={(v) => count((p) => typeOf(p) === v)} />
          </details>
          <div className="hr-side-card">
            <b>Asked something new in an interview?</b>
            <p className="muted small">Add it. We check it, then everyone can practice it.</p>
            <div className="row wrap">
              <Link to="/problems/submit" className="btn small">Add a problem</Link>
              <Link to="/my/problems" className="btn ghost small">My submissions</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Filter({ title, items, picked, onToggle, count }) {
  if (!items.length) return null
  return (
    <fieldset className="hr-filter">
      <legend>{title}</legend>
      {items.map(([v, label]) => (
        <label key={v}>
          <input type="checkbox" checked={picked.includes(v)} onChange={() => onToggle(v)} />
          <span>{label}</span>
          <span className="muted small">{count(v)}</span>
        </label>
      ))}
    </fieldset>
  )
}
