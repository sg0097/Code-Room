import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { ProjectView } from './project/ProjectEditor'
import { DiagramView } from './whiteboard'
import { Empty, Person, Stars, timeAgo, usePoll } from './ui'
import Avatar from './Avatar'

const minutesBetween = (a, b) => (a && b ? Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000)) : null)

/**
 * Side by side, field by field. Deliberately no "correct answer": the point is to see
 * where your reasoning differed and talk about why.
 */
export function CompareView({ view }) {
  const { meta, user } = useAuth()
  const c = view.challenge
  const fields = meta.formats[c.format].fields
  // Me first, then everyone else.
  const subs = [...view.submissions].sort((a, b) => (a.owner === user.id ? -1 : b.owner === user.id ? 1 : 0))
  const timeUsed = (s) => {
    const p = view.participants.find((x) => x.user.id === s.owner)
    return minutesBetween(p?.startedAt, s.submittedAt)
  }

  if (subs.length === 0) return <Empty>No submissions.</Empty>
  const team = subs[0].owner === 'team'

  return (
    <div className="compare" style={{ '--cols': subs.length }}>
      <div className="cmp-row cmp-head">
        <div className="cmp-label" />
        {subs.map((s) => (
          <div key={s.owner} className="cmp-cell">
            {team ? (
              <b>Team solution</b>
            ) : (
              <Person user={s.user} size={24}>
                {s.owner === user.id && <span className="muted small">(you)</span>}
              </Person>
            )}
            <span className="muted small">
              {timeUsed(s) ? `${timeUsed(s)} min · ` : ''}submitted {timeAgo(s.submittedAt)}
            </span>
            {s.content.run && (
              <span className={`tp-chip ${s.content.run.passed === s.content.run.total ? 'good' : 'bad'}`} title="Every test, hidden ones included, run when submitting">
                {s.content.run.passed === s.content.run.total ? '✓' : '✗'} {s.content.run.passed}/{s.content.run.total} tests passed
              </span>
            )}
          </div>
        ))}
      </div>
      {fields.map((f) => (
        <div key={f.key} className="cmp-row">
          <div className="cmp-label">{f.label}</div>
          {subs.map((s) => (
            <div key={s.owner} className="cmp-cell">
              {f.kind === 'diagram' ? (
                <DiagramView value={s.content.fields[f.key]} height={subs.length > 1 ? 340 : 420} />
              ) : f.kind === 'project' ? (
                <ProjectView value={s.content.fields[f.key]} language={s.content.language} height={subs.length > 1 ? 360 : 440} />
              ) : s.content.fields[f.key]?.trim() ? (
                <div className="cmp-text">{s.content.fields[f.key]}</div>
              ) : (
                <span className="muted small">(left empty)</span>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function Discussion({ challengeId }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const last = useRef(0)
  const bottom = useRef(null)

  const load = useCallback(async () => {
    try {
      const { messages: fresh } = await api.messages(challengeId, last.current)
      if (fresh.length) {
        last.current = fresh[fresh.length - 1].id
        setMessages((m) => [...m, ...fresh])
      }
    } catch (e) {
      setError(e.message)
    }
  }, [challengeId])
  useEffect(() => {
    load()
  }, [load])
  usePoll(load, 4000)
  // Braces matter: newer Chrome returns a Promise from scrollIntoView, and React would call it as cleanup.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' })
  }, [messages.length])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    try {
      await api.sendMessage(challengeId, body)
      await load()
    } catch (err) {
      setError(err.message)
      setText(body)
    }
  }

  return (
    <div className="discussion card">
      <div className="messages">
        {messages.length === 0 && <Empty>Start with the biggest difference: "Why did you choose…?"</Empty>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.user.id === user.id ? 'mine' : ''}`}>
            <Avatar user={m.user} size={26} />
            <div>
              <div className="msg-meta">
                <b>{m.user.id === user.id ? 'You' : m.user.name}</b> <span className="muted small">{timeAgo(m.createdAt)}</span>
              </div>
              <div className="msg-body">{m.body}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form className="msg-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={2000} />
        <button className="btn" disabled={!text.trim()}>Send</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function ReviewForm({ reviewee, challengeId, onDone }) {
  const { meta } = useAuth()
  const [scores, setScores] = useState({})
  const [good, setGood] = useState('')
  const [change, setChange] = useState('')
  const [error, setError] = useState(null)
  const complete = meta.reviewCriteria.every((r) => scores[r.key])

  async function submit(e) {
    e.preventDefault()
    try {
      onDone(await api.review(challengeId, { revieweeId: reviewee.id, scores, good, change }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="card review-form" onSubmit={submit}>
      <h3>Review {reviewee.name}'s solution</h3>
      {meta.reviewCriteria.map((r) => (
        <div key={r.key} className="review-row">
          <span>{r.label}</span>
          <Stars value={scores[r.key] || 0} onChange={(v) => setScores((s) => ({ ...s, [r.key]: v }))} />
        </div>
      ))}
      <label>
        <span>What did they do well?</span>
        <textarea rows={3} value={good} onChange={(e) => setGood(e.target.value)} />
      </label>
      <label>
        <span>What would you change?</span>
        <textarea rows={3} value={change} onChange={(e) => setChange(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={!complete || (!good.trim() && !change.trim())}>Submit review</button>
      <p className="muted small">Reviews are blind: you'll see their review of you after you submit yours.</p>
    </form>
  )
}

function ReviewCard({ title, review }) {
  const { meta } = useAuth()
  return (
    <div className="card review-card">
      <h3>{title}</h3>
      {meta.reviewCriteria.map((r) => (
        <div key={r.key} className="review-row">
          <span>{r.label}</span>
          <Stars value={review.scores[r.key]} size={18} />
        </div>
      ))}
      {review.good && <><div className="example-label">Did well</div><p>{review.good}</p></>}
      {review.change && <><div className="example-label">Would change</div><p>{review.change}</p></>}
    </div>
  )
}

export function ReviewPanel({ view, onChange }) {
  const { user } = useAuth()
  const others = view.participants.filter((p) => p.user.id !== user.id && p.state === 'SUBMITTED')
  return (
    <div className="reviews">
      {others.map((p) => {
        const given = view.reviews.given.find((r) => r.revieweeId === p.user.id)
        const received = view.reviews.received.find((r) => r.reviewerId === p.user.id)
        const waiting = view.reviews.pendingFrom?.includes(p.user.id)
        return (
          <div key={p.user.id} className="review-pair">
            {given ? (
              <ReviewCard title={`Your review of ${p.user.name}`} review={given} />
            ) : (
              <ReviewForm reviewee={p.user} challengeId={view.challenge.id} onDone={onChange} />
            )}
            {received ? (
              <ReviewCard title={`${p.user.name}'s review of you`} review={received} />
            ) : (
              <div className="card muted review-wait">
                {waiting ? `${p.user.name} has reviewed you. Submit your review to see it.` : `${p.user.name} hasn't reviewed you yet.`}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
