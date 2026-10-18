import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { LEVEL } from '../components/ui'
import Avatar from '../components/Avatar'
import Icon from '../components/Icon'
import Login from './Login'

/** /join/<code>: someone sent you a challenge. Sign in if needed, then join with one click. */
export default function JoinPage() {
  const { code } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.invite(code).then((d) => setInvite(d.invite)).catch((e) => setError(e.message))
  }, [code])

  if (!user) return <Login from={`/join/${code}`} invite={invite} />
  if (error) {
    return (
      <div className="center">
        <div className="card join-card">
          <h2>Link not working</h2>
          <p className="muted">{error}. Ask your friend for a new link.</p>
          <Link to="/" className="btn">Go home</Link>
        </div>
      </div>
    )
  }
  if (!invite) return <div className="center muted">Loading…</div>

  async function join() {
    setBusy(true)
    try {
      const { id } = await api.joinInvite(code)
      navigate(`/challenges/${id}`, { replace: true })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="center">
      <div className="card join-card">
        <div className="join-who">
          <Avatar user={invite.creator} size={52} />
          <div>
            <span className="muted small">{invite.creator.name} challenged you</span>
            <h2>{invite.title}</h2>
          </div>
        </div>
        <div className="chips">
          <span className="tag">{invite.mode === 'independent' ? 'Race' : 'Together'}</span>
          <span className={`tag ${invite.difficulty.toLowerCase()}`}>{LEVEL[invite.difficulty]}</span>
          <span className="tag">{invite.category}</span>
          <span className="tag">{invite.timeLimitMin} min</span>
        </div>
        <p className="muted">
          {invite.mode === 'independent'
            ? 'You both solve it alone, with the same time limit. Then you can see both answers.'
            : 'You solve it together in one live room, with code, a whiteboard and video.'}
        </p>
        {!invite.open ? (
          <p className="error">This challenge has already finished.</p>
        ) : invite.full ? (
          <p className="error">This challenge is full.</p>
        ) : (
          <button className="btn" disabled={busy} onClick={join}>{busy ? 'Joining…' : <>Accept challenge <Icon name="arrow" size={15} /></>}</button>
        )}
      </div>
    </div>
  )
}
