import { useState } from 'react'
import { Modal } from '../../components/ui'
import { AdminReviewCard, AiReviewCard } from './ReviewCards'
import { useSolutionReviews } from './api'

/**
 * After you submit: send your solution for an admin's review, or ask the AI for a quick read
 * of your final answer. Earlier AI reviews (of drafts) show here too.
 */
export default function SolutionFeedback({ challenge }) {
  const fb = useSolutionReviews(challenge.id)
  const [confirm, setConfirm] = useState(false)
  if (!fb.loaded) return null
  const canAi = fb.aiEnabled && challenge.mode === 'independent'

  return (
    <section className="feedback">
      <div className="card fb-actions">
        <div>
          <b>Get feedback on your solution</b>
          <p className="muted small">
            {fb.admin ? 'Sent to an admin.' : 'An admin reads it and tells you what works and what to improve.'}
            {canAi && ' The AI gives a quick read in about a minute.'}
          </p>
        </div>
        <div className="row wrap">
          {canAi && (
            <button className="btn ghost small" disabled={fb.busy || fb.aiRunning} onClick={() => fb.askAi()}>
              {fb.aiRunning ? 'AI reviewing…' : 'AI review'}
            </button>
          )}
          {!fb.admin && (
            <button className="btn small" disabled={fb.busy} onClick={() => setConfirm(true)}>Submit for admin review</button>
          )}
        </div>
      </div>
      {fb.error && <p className="error small">{fb.error}</p>}
      {fb.admin && <AdminReviewCard review={fb.admin} />}
      {fb.ai.slice(0, 3).map((r) => <AiReviewCard key={r.id} review={r} onRetry={canAi && r === fb.latestAi ? () => fb.askAi() : null} />)}

      {confirm && (
        <Modal
          title="Submit for admin review?"
          onClose={() => setConfirm(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Not now</button>
              <button className="btn" onClick={() => { setConfirm(false); fb.askAdmin() }}>Submit for review</button>
            </>
          }
        >
          <p>An admin will read your submitted solution and write a short review. You can ask once per solution.</p>
        </Modal>
      )}
    </section>
  )
}
