import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Badge, Empty, timeAgo } from '../../components/ui'
import { experienceApi, yoeLabel } from './api'

export default function MyExperiencesPage() {
  const location = useLocation()
  const [list, setList] = useState(null)

  useEffect(() => {
    experienceApi.mine().then((d) => setList(d.experiences))
  }, [])

  if (!list) return <div className="center muted">Loading…</div>
  return (
    <div className="narrow wide-md">
      <div className="page-head">
        <h1>My interview posts</h1>
        <Link to="/experiences/share" className="btn small">+ Share one</Link>
      </div>
      {location.state?.shared && <div className="card callout done">✓ "{location.state.shared}" was sent for review.</div>}
      {list.length === 0 && <Empty>You haven't shared an interview experience yet.</Empty>}
      <div className="lc-table">
        {list.map((e) => (
          <Link key={e.id} to={`/experiences/${e.id}`} className="lc-row xp-my-row">
            <span className="lc-name">
              <b>{e.title}</b>
              <span className="muted small">
                {e.company} · {e.role}{e.yoe != null ? ` · ${yoeLabel(e.yoe)}` : ''} · {e.hasWriteUp ? 'written here' : 'link'} · shared {timeAgo(e.createdAt)}
              </span>
              {e.adminNote && <span className="small">Admin: {e.adminNote}</span>}
            </span>
            <Badge state={e.status.toUpperCase()} />
          </Link>
        ))}
      </div>
    </div>
  )
}
