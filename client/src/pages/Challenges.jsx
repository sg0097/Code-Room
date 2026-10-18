import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import ChallengeCard from '../components/ChallengeCard'
import { Empty } from '../components/ui'

const TABS = {
  all: () => true,
  pending: (c) => ['INVITED', 'ACTIVE'].includes(c.status) && c.me.state === 'INVITED',
  active: (c) => ['INVITED', 'ACTIVE'].includes(c.status) && !['INVITED', 'DECLINED'].includes(c.me.state),
  completed: (c) => c.status === 'COMPLETED',
  closed: (c) => c.status === 'CANCELLED' || c.me.state === 'DECLINED',
}

export default function Challenges() {
  const [list, setList] = useState(null)
  const [tab, setTab] = useState('all')
  const [error, setError] = useState(null)

  useEffect(() => {
    api.challenges().then((r) => setList(r.challenges)).catch((e) => setError(e.message))
  }, [])

  if (!list) return <div className="center muted">{error || 'Loading…'}</div>
  const shown = list.filter(TABS[tab])

  return (
    <div className="narrow">
      <div className="page-head">
        <h1>My challenges</h1>
        <Link to="/challenges/new" className="btn small">+ New challenge</Link>
      </div>
      <div className="tabs">
        {Object.keys(TABS).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)} <span className="muted">{list.filter(TABS[t]).length}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 ? <Empty>Nothing here yet.</Empty> : shown.map((c) => <ChallengeCard key={c.id} c={c} />)}
    </div>
  )
}
