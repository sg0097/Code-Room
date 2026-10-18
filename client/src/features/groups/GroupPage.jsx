import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import { Badge, LEVEL, timeAgo } from '../../components/ui'
import QuickChallenge from '../challenge/QuickChallenge'

/** One group: challenge everyone, see the group's challenges, and manage who's in it. */
export default function GroupPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [renaming, setRenaming] = useState(null)

  const load = useCallback(() => api.group(id).then(setData).catch((e) => setError(e.message)), [id])
  useEffect(() => {
    load()
  }, [load])

  if (error) return <div className="center"><div className="card join-card"><h2>Group not found</h2><p className="muted">{error}</p><Link to="/groups" className="btn">Your groups</Link></div></div>
  if (!data) return <div className="center muted">Loading…</div>
  const { group, members, challenges } = data
  const owner = group.myRole === 'owner'

  async function rename(e) {
    e.preventDefault()
    try {
      await api.renameGroup(id, renaming)
      setRenaming(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }
  async function remove(m) {
    const self = m.id === user.id
    if (!confirm(self ? `Leave ${group.name}?` : `Remove ${m.name} from ${group.name}?`)) return
    const r = await api.removeFromGroup(id, m.id).catch((e) => setError(e.message))
    if (self) navigate('/groups')
    else if (r) load()
  }
  async function destroy() {
    if (!confirm(`Delete ${group.name}? Old challenges will stay.`)) return
    await api.deleteGroup(id)
    navigate('/groups')
  }

  return (
    <div className="hr-page">
      <div className="hr-head group-head">
        <div className="crumbs"><Link to="/">Home</Link> <span>›</span> <Link to="/groups">Groups</Link> <span>›</span> {group.name}</div>
        {renaming != null ? (
          <form className="rename" onSubmit={rename}>
            <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={40} aria-label="Group name" />
            <button className="btn small">Save</button>
            <button type="button" className="btn ghost small" onClick={() => setRenaming(null)}>Cancel</button>
          </form>
        ) : (
          <h1>
            {group.name}
            {owner && <button className="title-edit" onClick={() => setRenaming(group.name)} title="Rename"><Icon name="pen" size={16} /></button>}
          </h1>
        )}
        <div className="face-stack big">
          {members.map((m) => <Avatar key={m.id} user={m} size={36} />)}
          <span className="muted">{members.length} people</span>
        </div>
      </div>

      <div className="hr-cols">
        <section className="hr-main">
          <div className="panel feature">
            {members.length > 1 ? (
              <QuickChallenge groupId={group.id} groupName={group.name} groupMembers={members} title="Challenge the group" onCreated={load} />
            ) : (
              <p className="muted">Add a friend to this group first.</p>
            )}
          </div>

          <h2 className="h2" style={{ marginTop: 10 }}><Icon name="swords" /> Group challenges</h2>
          {challenges.length === 0 && <div className="empty muted">No challenges yet.</div>}
          {challenges.map((c) => (
            <Link key={c.id} to={`/challenges/${c.id}`} className="hr-row group-ch">
              <div className="hr-row-main">
                <span className="hr-row-title">{c.title}</span>
                <div className="hr-row-meta">
                  <span className={`level-text ${c.difficulty.toLowerCase()}`}>{LEVEL[c.difficulty]}</span>
                  <span>from {c.creator.id === user.id ? 'you' : c.creator.name.split(' ')[0]}</span>
                  <span>{timeAgo(c.createdAt)}</span>
                </div>
              </div>
              <div className="group-ch-progress" title={`${c.submitted} of ${c.people} submitted`}>
                <div className="meter"><span style={{ width: `${c.people ? (c.submitted / c.people) * 100 : 0}%` }} /></div>
                <span className="small muted">{c.submitted}/{c.people} submitted</span>
              </div>
              <Badge state={c.status} />
            </Link>
          ))}
        </section>

        <aside className="hr-side">
          <div className="hr-side-card">
            <b>Members</b>
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.id}>
                  <Avatar user={m} size={34} />
                  <span className="member-text">
                    <b>{m.name}{m.id === user.id && <span className="muted"> (you)</span>}</b>
                    <span className="muted small">@{m.username || '—'}{m.role === 'owner' ? ' · owner' : ''}</span>
                    <span className="small member-score">{m.done} done · {m.sent} sent</span>
                  </span>
                  {owner && m.id !== user.id && <button className="icon-x" onClick={() => remove(m)} title={`Remove ${m.name}`}><Icon name="x" size={14} /></button>}
                </li>
              ))}
            </ul>
            {owner && <AddMembers groupId={id} inGroup={members.map((m) => m.id)} max={data.limits.members} onAdded={load} />}
            <div className="row wrap">
              <button className="btn ghost small" onClick={() => remove(members.find((m) => m.id === user.id))}>Leave group</button>
              {owner && <button className="btn ghost small danger-text" onClick={destroy}>Delete group</button>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function AddMembers({ groupId, inGroup, max, onAdded }) {
  const [friends, setFriends] = useState(null)
  const [picked, setPicked] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => {
    api.friends().then((f) => setFriends(f.friends.map((x) => x.user))).catch(() => setFriends([]))
  }, [])
  if (!friends) return null
  const left = friends.filter((f) => !inGroup.includes(f.id))
  if (!left.length) return <p className="muted small">All your friends are in. <Link to="/friends">Add more friends</Link>.</p>
  async function add() {
    try {
      await api.addToGroup(groupId, picked)
      setPicked([])
      onAdded()
    } catch (e) {
      setError(e.message)
    }
  }
  return (
    <div className="add-members">
      <span className="muted small">Add friends ({inGroup.length}/{max})</span>
      <div className="qc-chips">
        {left.map((f) => (
          <button key={f.id} type="button" className={`chip-btn person ${picked.includes(f.id) ? 'on' : ''}`} onClick={() => setPicked((p) => (p.includes(f.id) ? p.filter((x) => x !== f.id) : [...p, f.id]))}>
            <Avatar user={f} size={20} /> {f.name.split(' ')[0]}
          </button>
        ))}
      </div>
      {picked.length > 0 && <button className="btn small" onClick={add}>Add {picked.length}</button>}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
