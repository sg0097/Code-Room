// How a solution review looks: the AI's quick read, or an admin's review.
import { Stars, timeAgo } from '../../components/ui'

function List({ title, items, icon }) {
  if (!items?.length) return null
  return (
    <>
      <div className="example-label">{title}</div>
      <ul className={`bullets fb-list fb-${icon}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </>
  )
}

export function AiReviewCard({ review, onRetry, onClose }) {
  const r = review.result
  const head = (
    <div className="fb-head">
      <b>AI review</b>
      <span className="muted small">{review.draft ? 'of your draft' : 'of your final answer'} · {timeAgo(review.createdAt)}</span>
      {onClose && <button className="link fb-close" onClick={onClose} aria-label="Hide">Hide</button>}
    </div>
  )
  if (review.status === 'waiting' || review.status === 'claimed') {
    return (
      <div className="card fb-card fb-ai">
        {head}
        <p className="muted small fb-wait">
          <span className="spinner" />
          {review.status === 'waiting' ? 'Queued: waiting for the AI reviewer to pick it up…' : 'Reading your answer…'} You can keep working.
        </p>
      </div>
    )
  }
  if (review.status === 'failed') {
    return (
      <div className="card fb-card fb-ai">
        {head}
        <p className="error small">The AI review didn't finish{r?.error ? ` (${r.error})` : ''}.</p>
        {onRetry && <button className="btn ghost small" onClick={onRetry}>Try again</button>}
      </div>
    )
  }
  return (
    <div className="card fb-card fb-ai">
      {head}
      <div className="row"><Stars value={r.rating} size={18} /><span className="small">{r.summary}</span></div>
      <List title="What's good" items={r.strengths} icon="good" />
      <List title="What to improve" items={r.improvements} icon="fix" />
      <List title="Think about" items={r.hints} icon="hint" />
      <p className="muted small fb-note">A quick automated read{r.model ? ` (${r.model})` : ''}. It can be wrong: trust your reasoning.</p>
    </div>
  )
}

export function AdminReviewCard({ review }) {
  if (review.status !== 'done') {
    return (
      <div className="card fb-card fb-admin">
        <div className="fb-head"><b>Admin review</b><span className="muted small">requested {timeAgo(review.createdAt)}</span></div>
        <p className="muted small">Waiting for an admin to read your solution. Their review will show up here.</p>
      </div>
    )
  }
  const r = review.result
  return (
    <div className="card fb-card fb-admin">
      <div className="fb-head">
        <b>Admin review</b>
        <span className="muted small">by {review.reviewerName || 'an admin'} · {timeAgo(review.doneAt)}</span>
      </div>
      <Stars value={r.rating} size={18} />
      {r.good && <><div className="example-label">What's good</div><p className="fb-text">{r.good}</p></>}
      {r.improve && <><div className="example-label">What to improve</div><p className="fb-text">{r.improve}</p></>}
    </div>
  )
}
