import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../lib/api'
import { Empty, Modal, Person } from '../components/ui'

export default function Friends() {
  const { refreshBadges } = useOutletContext()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)

  const load = useCallback(() => api.friends().then(setData).catch((e) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  // Debounced search.
  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const t = setTimeout(() => api.searchUsers(q.trim()).then((r) => setResults(r.users)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [q])

  async function act(fn) {
    setError(null)
    try {
      await fn()
      await load()
      if (q.trim().length >= 2) setResults((await api.searchUsers(q.trim())).users)
      refreshBadges()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!data) return <div className="center muted">{error || 'Loading…'}</div>

  return (
    <div className="narrow">
      <h1>Friends</h1>

      <div className="card">
        <h3>Find people</h3>
        <input placeholder="Search by @username or name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {results.length > 0 && (
          <div className="list">
            {results.map((u) => (
              <Person key={u.id} user={u}>
                {u.relation === 'none' && <button className="btn small" onClick={() => act(() => api.sendFriendRequest(u.id))}>Add friend</button>}
                {u.relation === 'outgoing' && <span className="muted small">Request sent</span>}
                {u.relation === 'incoming' && <button className="btn small" onClick={() => act(() => api.acceptFriend(u.requestId))}>Accept request</button>}
                {u.relation === 'friends' && <Link className="btn ghost small" to={`/challenges/new?friend=${u.id}`}>Challenge</Link>}
              </Person>
            ))}
          </div>
        )}
        {q.trim().length >= 2 && results.length === 0 && (
          <p className="muted small">No one found. Your friend needs to sign in once before you can add them.</p>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {data.incoming.length > 0 && (
        <section>
          <h2 className="section-title">Requests <span className="dot">{data.incoming.length}</span></h2>
          <div className="card list">
            {data.incoming.map((r) => (
              <Person key={r.requestId} user={r.user}>
                <button className="btn small" onClick={() => act(() => api.acceptFriend(r.requestId))}>Accept</button>
                <button className="btn ghost small" onClick={() => act(() => api.rejectFriend(r.requestId))}>Reject</button>
              </Person>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Your friends ({data.friends.length})</h2>
        {data.friends.length === 0 ? (
          <Empty>No friends yet. Search above, or <Link to="/challenges/new">send a challenge link</Link>: whoever joins becomes your friend.</Empty>
        ) : (
          <div className="card list">
            {data.friends.map((f) => (
              <Person key={f.user.id} user={f.user}>
                <Link className="btn small" to={`/challenges/new?friend=${f.user.id}`}>Challenge</Link>
                <button className="btn ghost small" onClick={() => setConfirmRemove(f.user)}>Remove</button>
              </Person>
            ))}
          </div>
        )}
      </section>

      {data.outgoing.length > 0 && (
        <section>
          <h2 className="section-title">Sent requests</h2>
          <div className="card list">
            {data.outgoing.map((r) => (
              <Person key={r.requestId} user={r.user}>
                <span className="muted small">Pending</span>
                <button className="btn ghost small" onClick={() => act(() => api.rejectFriend(r.requestId))}>Cancel</button>
              </Person>
            ))}
          </div>
        </section>
      )}

      {confirmRemove && (
        <Modal
          title={`Remove ${confirmRemove.name}?`}
          onClose={() => setConfirmRemove(null)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setConfirmRemove(null)}>Keep</button>
              <button
                className="btn danger"
                onClick={() => {
                  const id = confirmRemove.id
                  setConfirmRemove(null)
                  act(() => api.removeFriend(id))
                }}
              >
                Remove
              </button>
            </>
          }
        >
          <p className="muted">Past challenges stay in your history. You won't be able to send new ones until you're friends again.</p>
        </Modal>
      )}
    </div>
  )
}
