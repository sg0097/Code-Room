import { Link } from 'react-router-dom'
import { Badge, Chips, timeAgo } from './ui'
import Avatar from './Avatar'

/** What this challenge is waiting on, from my point of view. */
export function nextStep(c) {
  const others = c.others.map((o) => o.name.split(' ')[0]).join(', ') || 'a friend to join'
  if (c.status === 'CANCELLED') return { label: 'Cancelled', tone: 'muted' }
  if (c.status === 'COMPLETED') return { label: c.practice ? 'See follow-ups' : c.mode === 'independent' ? 'Compare & review' : 'View solution', tone: 'done' }
  if (c.me.state === 'DECLINED') return { label: 'You declined', tone: 'muted' }
  if (c.me.state === 'INVITED') return { label: 'Accept or decline', tone: 'action' }
  if (c.mode === 'collaborative') {
    if (c.status === 'INVITED') return { label: c.others.length ? `Waiting for ${others} to accept` : 'Waiting for a friend to join', tone: 'wait' }
    return { label: 'Open room', tone: 'action' }
  }
  if (c.me.state === 'ACCEPTED') return { label: 'Start solving', tone: 'action' }
  if (c.me.state === 'IN_PROGRESS') return { label: 'Continue solving', tone: 'action' }
  if (c.me.state === 'SUBMITTED') return { label: `Waiting for ${others}`, tone: 'wait' }
  return { label: 'Open', tone: 'muted' }
}

export default function ChallengeCard({ c, actions }) {
  const step = nextStep(c)
  const creator = c.me.role === 'creator' ? null : c.others.find((o) => o.role === 'creator')
  return (
    <div className="ch-card">
      <Link to={`/challenges/${c.id}`} className="ch-main">
        <div className="ch-title-row">
          <strong className="ch-title">{c.title}</strong>
          <Badge state={c.status} />
        </div>
        <Chips c={c} />
        <div className="ch-sub muted small">
          {c.group ? <>group <b>{c.group.name}</b></> : creator ? <>from <b>{creator.name}</b></> : c.practice ? 'Solo practice' : c.others.length ? <>with {c.others.map((o) => o.name).join(', ')}</> : 'Link sent, nobody joined yet'} · {timeAgo(c.createdAt)}
          <span className="ch-people">
            {c.others.map((o) => (
              <span key={o.id} title={`${o.name}: ${o.state}`}>
                <Avatar user={o} size={20} />
              </span>
            ))}
          </span>
        </div>
      </Link>
      <div className="ch-side">
        {actions || (
          <Link to={`/challenges/${c.id}`} className={`step step-${step.tone}`}>
            {step.label} →
          </Link>
        )}
      </div>
    </div>
  )
}

/** A compact row for narrow columns (the home page): who, what, and the next step. */
export function MiniChallenge({ c, actions }) {
  const step = nextStep(c)
  const creator = c.me.role === 'creator' ? null : c.others.find((o) => o.role === 'creator')
  const people = c.others.length ? c.others : null
  return (
    <div className={`mini-ch tone-${step.tone}`}>
      <Link to={`/challenges/${c.id}`} className="mini-ch-main">
        <span className="mini-ch-faces">
          {people ? people.slice(0, 2).map((o) => <Avatar key={o.id} user={o} size={28} />) : <span className="mini-ch-q">?</span>}
        </span>
        <span className="mini-ch-text">
          <b>{c.title}</b>
          <span className="muted small">
            {c.group ? c.group.name : c.mode === 'independent' ? 'Race' : 'Together'} · {creator ? `from ${creator.name.split(' ')[0]}` : c.group ? `${people?.length || 0} others` : people ? `with ${people.map((o) => o.name.split(' ')[0]).join(', ')}` : 'nobody joined yet'}
          </span>
        </span>
      </Link>
      {actions || <Link to={`/challenges/${c.id}`} className={`mini-ch-step step-${step.tone}`}>{step.label} →</Link>}
    </div>
  )
}
