import { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { request } from '../../lib/api'
import ProblemQueue from './ProblemQueue'
import SolutionQueue from './SolutionQueue'
import ExperienceQueue from './ExperienceQueue'

const SECTIONS = [
  ['solutions', 'Solutions', SolutionQueue],
  ['problems', 'Problems', ProblemQueue],
  ['experiences', 'Interview experiences', ExperienceQueue],
]

/** Everything waiting on an admin, one queue per kind. The section is in the URL (?q=…) so it can be linked. */
export default function AdminPage() {
  const { user } = useAuth()
  const { refreshBadges } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const [counts, setCounts] = useState({})
  const section = SECTIONS.find(([k]) => k === params.get('q')) || SECTIONS[0]
  const Queue = section[2]

  const refresh = useCallback(() => {
    request('GET', '/api/admin/counts').then(setCounts).catch(() => {})
    refreshBadges()
  }, [refreshBadges])
  useEffect(() => {
    if (user.isAdmin) refresh()
  }, [refresh, user.isAdmin])

  if (!user.isAdmin) return <div className="center muted">Admins only.</div>
  return (
    <div className="admin-page">
      <div className="pills">
        {SECTIONS.map(([k, label]) => (
          <button key={k} className={`pill ${section[0] === k ? 'on' : ''}`} onClick={() => setParams({ q: k })}>
            {label} {counts[k] > 0 && <span className="dot">{counts[k]}</span>}
          </button>
        ))}
      </div>
      <Queue key={section[0]} onChange={refresh} />
    </div>
  )
}
