import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Badge, Empty, Level, timeAgo } from '../../components/ui'
import { libraryApi } from './api'

export default function MyProblemsPage() {
  const location = useLocation()
  const [problems, setProblems] = useState(null)

  useEffect(() => {
    libraryApi.mine().then((d) => setProblems(d.problems))
  }, [])

  if (!problems) return <div className="center muted">Loading…</div>
  return (
    <div className="narrow wide-md">
      <div className="page-head">
        <h1>My submissions</h1>
        <Link to="/problems/submit" className="btn small">+ Submit a problem</Link>
      </div>
      {location.state?.submitted && <div className="card callout done">✓ "{location.state.submitted}" was submitted for review.</div>}
      {problems.length === 0 && <Empty>You haven't submitted any problems yet.</Empty>}
      <div className="lc-table">
        {problems.map((p) => (
          <Link key={p.id} to={`/problems/${p.slug}`} className="lc-row my-row">
            <span className="lc-name">
              <b>{p.title}</b>
              <span className="muted small">{p.category} · submitted {timeAgo(p.createdAt)}</span>
              {p.status === 'pending' && <span className="small muted">Waiting for an admin</span>}
              {p.adminNote && <span className="small">Admin: {p.adminNote}</span>}
            </span>
            <Level d={p.difficulty} as="text" />
            <Badge state={p.status.toUpperCase()} />
          </Link>
        ))}
      </div>
    </div>
  )
}
