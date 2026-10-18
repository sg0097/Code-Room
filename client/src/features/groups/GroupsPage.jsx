import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import { timeAgo } from '../../components/ui'

/** Your groups, and a quick way to make a new one. */
export default function GroupsPage() {
  const [groups, setGroups] = useState(null)
  const [friends, setFriends] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    Promise.all([api.groups(), api.friends()])
      .then(([g, f]) => {
        setGroups(g.groups)
        setFriends(f.friends.map((x) => x.user))
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <div className="center error">{error}</div>
  if (!groups) return <div className="center muted">Loading…</div>

  return (
    <div className="hr-page">
      <div className="hr-head">
        <div className="crumbs"><Link to="/">Home</Link> <span>›</span> Groups</div>
        <h1>Groups</h1>
        <p className="muted">Put friends in a group and challenge everyone at once. Each person answers on their own.</p>
      </div>
      <div className="hr-cols">
        <section className="hr-main">
          {groups.length === 0 && <div className="empty muted">No groups yet. Make one on the right.</div>}
          <div className="group-grid">
            {groups.map((g) => (
              <Link key={g.id} to={`/groups/${g.id}`} className="group-card">
                <div className="group-card-top">
                  <span className="group-mark">{g.name[0].toUpperCase()}</span>
                  <div>
                    <b>{g.name}</b>
                    <span className="muted small">{g.members.length} people · {g.challenges} {g.challenges === 1 ? 'challenge' : 'challenges'}</span>
                  </div>
                </div>
                <div className="face-stack">
                  {g.members.slice(0, 6).map((m) => <Avatar key={m.id} user={m} size={30} />)}
                  {g.members.length > 6 && <span className="face-more">+{g.members.length - 6}</span>}
                </div>
                <span className="muted small">{g.lastChallengeAt ? `Last challenge ${timeAgo(g.lastChallengeAt)}` : 'No challenges yet'}</span>
              </Link>
            ))}
          </div>
        </section>
        <aside className="hr-side">
          <NewGroup friends={friends} />
        </aside>
      </div>
    </div>
  )
}

function NewGroup({ friends }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  async function create(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { id } = await api.createGroup(name, picked)
      navigate(`/groups/${id}`)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="hr-side-card new-group" onSubmit={create}>
      <b>New group</b>
      <input placeholder="Group name, e.g. DSA night owls" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Group name" />
      {friends.length ? (
        <>
          <span className="muted small">Add friends</span>
          <div className="qc-chips">
            {friends.map((f) => (
              <button key={f.id} type="button" className={`chip-btn person ${picked.includes(f.id) ? 'on' : ''}`} onClick={() => toggle(f.id)}>
                <Avatar user={f} size={20} /> {f.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted small">You need friends first. <Link to="/friends">Find friends</Link> or <Link to="/challenges/new">send a challenge link</Link>.</p>
      )}
      {error && <p className="error small">{error}</p>}
      <button className="btn" disabled={busy || !name.trim() || !picked.length}><Icon name="plus" size={14} /> Create group</button>
    </form>
  )
}
