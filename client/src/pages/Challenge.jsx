import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api, inviteLink, syncClock } from '../lib/api'
import Workspace from '../components/Workspace'
import InviteBox from '../features/challenge/InviteBox'
import { CompareView, Discussion, ReviewPanel } from '../components/Results'
import { Badge, Chips, Modal, Person, RichText, usePoll } from '../components/ui'
import SolutionFeedback from '../features/reviews/SolutionFeedback'

function Header({ view }) {
  const c = view.challenge
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard?.writeText(c.inviteCode ? inviteLink(c.inviteCode) : location.href).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="ch-header">
      <div>
        <div className="row wrap">
          <h1>{c.title}</h1>
          <Badge state={c.status} />
        </div>
        {c.group && <Link to={`/groups/${c.group.id}`} className="group-pill">group · {c.group.name}</Link>}
        <Chips c={c} />
      </div>
      <div className="ch-header-side">
        <div className="participants">
          {view.participants.map((p) => (
            <Person key={p.user.id} user={p.user} size={24}>
              <Badge state={p.state} />
            </Person>
          ))}
        </div>
        {c.inviteCode && <button className="btn ghost small" onClick={copy}>{copied ? '✓ Link copied' : 'Copy invite link'}</button>}
      </div>
    </div>
  )
}

/** The statement, or a placeholder when it is intentionally hidden until you start. */
function Statement({ c }) {
  if (!c.statement) {
    return (
      <div className="card hidden-statement">
        You will see the problem when you click Start. Everyone gets {c.timeLimitMin} minutes.
      </div>
    )
  }
  return (
    <div className="card">
      <div className="example-label">Problem</div>
      <RichText text={c.statement} />
    </div>
  )
}

/** Library problems: what an interviewer would ask next, and what reviewers look for. Shown after you submit. */
function FollowUps({ problem }) {
  if (!problem?.unlocked) return null
  return (
    <div className="followups-grid">
      <div className="card">
        <div className="example-label">Follow-ups: does your design still hold?</div>
        {problem.followUps.length ? <ol className="bullets">{problem.followUps.map((x, i) => <li key={i}>{x}</li>)}</ol> : <p className="muted small">None yet.</p>}
      </div>
      <div className="card">
        <div className="example-label">What a good answer covers</div>
        {problem.checklist.length ? <ul className="bullets checklist">{problem.checklist.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted small">None yet.</p>}
      </div>
    </div>
  )
}

export default function Challenge() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refreshBadges } = useOutletContext()
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('compare')
  const [confirmCancel, setConfirmCancel] = useState(false)

  const apply = useCallback((v) => {
    syncClock(v.serverNow)
    setView(v)
  }, [])
  const load = useCallback(
    () => api.challenge(id).then(apply).catch((e) => setError(e.status === 404 ? 'not-found' : e.message)),
    [id, apply],
  )
  useEffect(() => {
    load()
  }, [load])

  // Poll while we're waiting on someone else (not while you're typing an answer).
  // Also poll on the review tab, so their review appears without a reload.
  const waiting =
    view &&
    ((view.me.state !== 'IN_PROGRESS' && ['INVITED', 'ACTIVE'].includes(view.challenge.status)) ||
      (view.challenge.status === 'COMPLETED' && tab === 'review'))
  usePoll(load, 5000, !!waiting)

  async function act(action) {
    setBusy(true)
    setError(null)
    try {
      apply(await api.challengeAction(id, action))
      refreshBadges()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error === 'not-found') {
    return (
      <div className="center">
        <div className="card login">
          <h2>Challenge not found</h2>
          <p className="muted">It doesn't exist, or you're not part of it.</p>
          <Link to="/" className="btn">Dashboard</Link>
        </div>
      </div>
    )
  }
  if (!view) return <div className="center muted">{error || 'Loading…'}</div>

  const c = view.challenge
  const me = view.me
  const others = view.participants.filter((p) => p.user.id !== user.id)
  const othersNames = others.map((p) => p.user.name.split(' ')[0]).join(', ')
  const creator = view.participants.find((p) => p.role === 'creator')
  const canCancel = me.role === 'creator' && ['INVITED', 'ACTIVE'].includes(c.status)

  let body
  if (c.status === 'CANCELLED') {
    body = <div className="card callout muted">This challenge was cancelled{others.every((p) => p.state === 'DECLINED') ? ` (${othersNames} declined)` : ''}.</div>
  } else if (me.state === 'DECLINED') {
    body = <div className="card callout muted">You declined this challenge.</div>
  } else if (me.state === 'INVITED') {
    body = (
      <div className="card invite">
        <h2>{creator.user.name} challenged you</h2>
        <p className="muted">
          {c.mode === 'independent'
            ? `You both solve it alone. Then you compare answers and review each other. Your ${c.timeLimitMin}-minute timer starts when you click Start.`
            : `You solve it together in a live room with code, whiteboard and video. You get ${c.timeLimitMin} minutes.`}
        </p>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => act('accept')}>Accept</button>
          <button className="btn ghost" disabled={busy} onClick={() => act('decline')}>Decline</button>
        </div>
      </div>
    )
  } else if (c.mode === 'collaborative' && c.status !== 'COMPLETED') {
    body = (
      <>
        <div className="card invite">
          {c.status === 'INVITED' ? (
            <>
              <h2>{others.length ? `Waiting for ${othersNames} to accept` : 'Waiting for your friend to join'}</h2>
              <p className="muted">You can open the room now. The timer starts when you are both in.</p>
              <InviteBox code={c.inviteCode} title={c.title} />
            </>
          ) : (
            <>
              <h2>{c.startedAt ? 'In progress' : 'Ready to start'}</h2>
              <p className="muted">Open the room together. Start the {c.timeLimitMin}-minute timer from inside the room, then submit your team's answer.</p>
            </>
          )}
          <button className="btn" onClick={() => navigate(`/room/${c.roomCode}`)}>Open room</button>
        </div>
        <Statement c={c} />
      </>
    )
  } else if (c.mode === 'independent' && me.state === 'ACCEPTED') {
    const pendingInvite = others.some((p) => p.state === 'INVITED')
    body = (
      <>
        <div className="card invite">
          <h2>Ready?</h2>
          <p className="muted">
            Your {c.timeLimitMin}-minute timer starts when you click Start. Your work is saved as you type.
            {pendingInvite && ` ${othersNames} hasn't accepted yet, but you can start anyway.`}
            {!others.length && !c.practice && " No one has joined yet, but you can start now."}
          </p>
          <button className="btn" disabled={busy} onClick={() => act('start')}>Start ({c.timeLimitMin} min)</button>
          {(pendingInvite || (!others.length && !c.practice)) && <InviteBox code={c.inviteCode} title={c.title} />}
        </div>
        <Statement c={c} />
      </>
    )
  } else if (me.state === 'IN_PROGRESS') {
    body = <Workspace view={view} onChange={apply} />
  } else if (c.status !== 'COMPLETED') {
    // Submitted, waiting for the others.
    const left = others.filter((p) => p.state !== 'SUBMITTED' && p.state !== 'DECLINED')
    body = (
      <>
        <div className="card invite">
          <h2>✓ Submitted. You can't change your answer now.</h2>
          {left.length ? (
            <p className="muted">
              Waiting for {left.map((p) => p.user.name.split(' ')[0]).join(', ')}
              {left.some((p) => p.state === 'IN_PROGRESS') ? ' (solving now)' : left.some((p) => p.state === 'INVITED') ? ' (hasn\'t accepted yet)' : ' (hasn\'t started)'}.
              You'll see {others.length > 1 ? 'all the' : 'both'} answers when everyone is done.
            </p>
          ) : (
            <p className="muted">No one has joined yet. Share the link with your friend.</p>
          )}
          {(!left.length || left.some((p) => p.state === 'INVITED')) && <InviteBox code={c.inviteCode} title={c.title} />}
          {me.role === 'creator' && left.length > 0 && others.some((p) => p.state === 'SUBMITTED') && (
            <div className="close-early">
              <span className="muted small">Don't want to wait? Close it and see the answers that are in.</span>
              <button className="btn ghost small" disabled={busy} onClick={() => act('close')}>Close now and compare</button>
            </div>
          )}
        </div>
        <SolutionFeedback challenge={c} />
        <Statement c={c} />
        {c.problem?.unlocked && (
          <>
            <h2 className="section-title">While you wait</h2>
            <FollowUps problem={c.problem} />
          </>
        )}
        {view.mySubmission && (
          <>
            <h2 className="section-title">Your submission</h2>
            <CompareView view={{ ...view, submissions: [{ owner: user.id, user, ...view.mySubmission }] }} />
          </>
        )}
      </>
    )
  } else {
    // Completed: the reveal.
    const tabs = c.practice ? ['compare'] : c.mode === 'independent' ? ['compare', 'discussion', 'review'] : ['compare', 'discussion']
    if (c.problem) tabs.splice(1, 0, 'followups')
    const labels = {
      compare: c.practice ? 'Your solution' : c.mode === 'independent' ? 'Compare solutions' : 'Team solution',
      followups: 'Follow-ups & checklist',
      discussion: 'Discussion',
      review: 'Peer review',
    }
    body = (
      <>
        {c.practice ? (
          <div className="card callout done">
            <span>✓ Submitted. Now try the follow-up questions.</span>
            {c.problem && <Link className="btn small" to={`/challenges/new?problem=${c.problem.slug}`}>Challenge a friend</Link>}
          </div>
        ) : c.mode === 'independent' && <div className="card callout done">{view.submissions.length > 2 ? `All ${view.submissions.length} answers are in.` : 'Both answers are in.'} Compare them and talk about what you did differently.</div>}
        {me.state === 'SUBMITTED' && <SolutionFeedback challenge={c} />}
        <Statement c={c} />
        <div className="tabs">
          {tabs.map((t) => (
            <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {labels[t]}
              {t === 'review' && view.reviews.given.length < others.length && <span className="dot">!</span>}
            </button>
          ))}
        </div>
        {tab === 'compare' && <CompareView view={view} />}
        {tab === 'followups' && <FollowUps problem={c.problem} />}
        {tab === 'discussion' && <Discussion challengeId={c.id} />}
        {tab === 'review' && <ReviewPanel view={view} onChange={apply} />}
      </>
    )
  }

  return (
    <div className={me.state === 'IN_PROGRESS' ? 'wide' : 'narrow wide-md'}>
      <Header view={view} />
      {error && <p className="error">{error}</p>}
      {body}
      {canCancel && me.state !== 'IN_PROGRESS' && (
        <button className="btn ghost small cancel-btn" onClick={() => setConfirmCancel(true)}>Cancel challenge</button>
      )}
      {confirmCancel && (
        <Modal
          title="Cancel this challenge?"
          onClose={() => setConfirmCancel(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setConfirmCancel(false)}>Keep it</button>
              <button className="btn danger" onClick={() => { setConfirmCancel(false); act('cancel') }}>Cancel challenge</button>
            </>
          }
        >
          <p className="muted">Nobody will be able to submit. This can't be undone.</p>
        </Modal>
      )}
    </div>
  )
}
