// Solution reviews: every SQL query for the solution_reviews table lives here.
import crypto from 'node:crypto'
import { query } from '../../db.js'

const iso = (d) => (d ? new Date(d).toISOString() : null)
// Whose answer a participant works on: their own (independent) or the team's (collaborative).
const OWNER = `CASE WHEN c.mode = 'collaborative' THEN 'team' ELSE p.user_id END`

/** DB row → API shape. The answer itself is only included for the admin queue. */
export function toReview(r, { withAnswer = false } = {}) {
  const v = {
    id: r.id,
    kind: r.kind,
    status: r.status,
    draft: r.draft,
    result: r.result,
    reviewerName: r.reviewer_name ?? null,
    createdAt: iso(r.created_at),
    doneAt: iso(r.done_at),
  }
  if (withAnswer) {
    Object.assign(v, {
      content: r.content,
      requesterName: r.requester_name,
      challenge: {
        id: r.challenge_id, title: r.title, statement: r.statement, category: r.category,
        difficulty: r.difficulty, format: r.format, mode: r.mode, checklist: r.checklist || [],
      },
    })
  }
  return v
}

/** Everything needed to decide whether I may ask for a review: one query. Null if I'm not a participant. */
export async function answerContext(challengeId, userId) {
  const [r] = await query(
    `SELECT c.id, c.mode, c.format, c.status, p.state, ${OWNER} AS owner, s.content, s.is_final
       FROM challenges c
       JOIN challenge_participants p ON p.challenge_id = c.id AND p.user_id = $2
       LEFT JOIN submissions s ON s.challenge_id = c.id AND s.owner = ${OWNER}
      WHERE c.id = $1`,
    [String(challengeId), userId],
  )
  return r || null
}

/**
 * Queue a review. Returns null when one can't be added: the unique indexes allow one admin
 * review per answer and one AI review in flight per answer.
 */
export async function request({ challengeId, owner, userId, kind, draft, content }) {
  const [r] = await query(
    `INSERT INTO solution_reviews (id, challenge_id, owner, requested_by, kind, status, draft, content)
     VALUES ($1, $2, $3, $4, $5, 'waiting', $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [crypto.randomUUID(), challengeId, owner, userId, kind, draft, JSON.stringify(content)],
  )
  return r || null
}

/** Reviews of my answer in a challenge, newest first. Empty if I'm not part of it. */
export const forMe = (challengeId, userId) =>
  query(
    `SELECT r.*, u.name AS reviewer_name
       FROM challenge_participants p
       JOIN challenges c ON c.id = p.challenge_id
       JOIN solution_reviews r ON r.challenge_id = c.id AND r.owner = ${OWNER}
       LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE p.challenge_id = $1 AND p.user_id = $2
      ORDER BY r.created_at DESC
      LIMIT 20`,
    [String(challengeId), userId],
  )

// ─── Admin ───────────────────────────────────────────────────────────────────
// An admin who is solving the same challenge must not see the other side's answer before
// the reveal, so those requests are left out until the challenge is complete.
const NOT_MY_OPEN_CHALLENGE = `(c.status = 'COMPLETED' OR NOT EXISTS (
    SELECT 1 FROM challenge_participants x WHERE x.challenge_id = c.id AND x.user_id = $2))`

export const adminQueue = (status, adminId) =>
  query(
    `SELECT r.*, c.title, c.statement, c.category, c.difficulty, c.format, c.mode,
            u.name AS requester_name, rv.name AS reviewer_name, pr.checklist
       FROM solution_reviews r
       JOIN challenges c ON c.id = r.challenge_id
       JOIN users u ON u.id = r.requested_by
       LEFT JOIN users rv ON rv.id = r.reviewer_id
       LEFT JOIN problems pr ON pr.id = c.problem_id
      WHERE r.kind = 'admin' AND r.status = $1 AND ${NOT_MY_OPEN_CHALLENGE}
      ORDER BY r.created_at ${status === 'waiting' ? 'ASC' : 'DESC'}
      LIMIT 100`,
    [status, adminId],
  )

/** Save (or update) an admin's review. False if it doesn't exist or this admin may not see it. */
export async function adminDecide(id, adminId, result) {
  const rows = await query(
    `UPDATE solution_reviews r SET status = 'done', result = $3, reviewer_id = $2, done_at = now()
       FROM challenges c
      WHERE r.id = $1 AND r.kind = 'admin' AND c.id = r.challenge_id AND ${NOT_MY_OPEN_CHALLENGE}
      RETURNING r.id`,
    [String(id), adminId, JSON.stringify(result)],
  )
  return rows.length > 0
}

// ─── AI worker queue ─────────────────────────────────────────────────────────
// The worker claims one AI review at a time. A claim older than 10 minutes counts as
// abandoned (worker crashed or laptop closed), so it's handed out again.
// SKIP LOCKED: two workers never get the same review.

export async function claimAi() {
  const [r] = await query(
    `WITH j AS (
       UPDATE solution_reviews SET status = 'claimed', claimed_at = now()
        WHERE id = (
          SELECT id FROM solution_reviews
           WHERE kind = 'ai' AND (status = 'waiting' OR (status = 'claimed' AND claimed_at < now() - interval '10 minutes'))
           ORDER BY created_at LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING id, challenge_id, draft, content)
     SELECT j.*, c.title, c.statement, c.category, c.difficulty, c.format, pr.checklist
       FROM j JOIN challenges c ON c.id = j.challenge_id
       LEFT JOIN problems pr ON pr.id = c.problem_id`,
  )
  return r || null
}

export async function saveAi(id, { result, failed }) {
  const rows = await query(
    `UPDATE solution_reviews SET status = $2, result = $3, done_at = now()
      WHERE id = $1 AND kind = 'ai' AND status = 'claimed'
      RETURNING id`,
    [String(id), failed ? 'failed' : 'done', JSON.stringify(result)],
  )
  return rows.length > 0
}
