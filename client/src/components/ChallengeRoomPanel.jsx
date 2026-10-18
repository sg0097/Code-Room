import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { Chips, Modal, RichText, Timer } from './ui'

/** Left panel of a collaborative challenge room: problem, shared timer, team submit. */
export default function ChallengeRoomPanel({ challenge, deadlineAt, submitted, everyoneHere }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function action(name) {
    setBusy(true)
    setError(null)
    try {
      await api.challengeAction(challenge.id, name)
    } catch (e) {
      // Someone else already submitted / the deadline already locked it: not an error for us.
      if (!(name === 'submit' && e.status === 409)) setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="problem">
      <div className="problem-body">
        <h2>{challenge.title}</h2>
        <Chips c={{ ...challenge, mode: 'collaborative' }} />

        <div className="room-timer card">
          {submitted ? (
            <b>✓ Submitted</b>
          ) : deadlineAt ? (
            <>
              <Timer deadline={deadlineAt} onExpire={() => action('submit')} />
              <button className="btn small" disabled={busy} onClick={() => setConfirm(true)}>Submit team answer</button>
            </>
          ) : (
            <>
              <span className="muted small">
                {challenge.status === 'INVITED' ? 'Waiting for your friend to accept.' : everyoneHere ? 'Everyone is here.' : 'Waiting for your friend to join.'}
              </span>
              <button className="btn small" disabled={busy || challenge.status === 'INVITED'} onClick={() => action('start')}>
                Start {challenge.timeLimitMin}-min timer
              </button>
            </>
          )}
        </div>
        {error && <p className="error">{error}</p>}

        <RichText text={challenge.statement} />
        <p className="muted small">
          Fill in each tab together. Everything you type is shared and saved. <Link to={`/challenges/${challenge.id}`}>Challenge page →</Link>
        </p>
      </div>

      {confirm && (
        <Modal
          title="Submit your team's answer?"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Keep working</button>
              <button className="btn" onClick={() => { setConfirm(false); action('submit') }}>Submit</button>
            </>
          }
        >
          <p>This locks the answer for everyone in the room.</p>
        </Modal>
      )}
    </aside>
  )
}
