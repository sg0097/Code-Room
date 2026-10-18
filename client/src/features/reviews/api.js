import { useCallback, useEffect, useState } from 'react'
import { request } from '../../lib/api'
import { usePoll } from '../../components/ui'

export const reviewApi = {
  list: (challengeId) => request('GET', `/api/challenges/${challengeId}/solution-reviews`),
  // With content: review this draft. Without: review my submitted answer.
  askAi: (challengeId, content) => request('POST', `/api/challenges/${challengeId}/ai-review`, content ? { content } : {}),
  askAdmin: (challengeId) => request('POST', `/api/challenges/${challengeId}/admin-review`),
  // admin
  queue: (status) => request('GET', `/api/admin/solution-reviews?status=${status}`),
  decide: (id, data) => request('POST', `/api/admin/solution-reviews/${id}`, data),
}

const running = (r) => r.status === 'waiting' || r.status === 'claimed'

/**
 * Reviews of my answer in a challenge. Polls every few seconds while the AI is working on one
 * (someone is usually watching), and slowly while an admin review is pending.
 */
export function useSolutionReviews(challengeId) {
  const [state, setState] = useState({ loaded: false, aiEnabled: false, reviews: [] })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const d = await reviewApi.list(challengeId)
      setState({ loaded: true, aiEnabled: d.aiEnabled, reviews: d.reviews })
    } catch (e) {
      setError(e.message)
    }
  }, [challengeId])
  useEffect(() => {
    refresh()
  }, [refresh])

  const ai = state.reviews.filter((r) => r.kind === 'ai')
  const admin = state.reviews.find((r) => r.kind === 'admin') || null
  const aiRunning = ai.some(running)
  usePoll(refresh, aiRunning ? 3000 : 30_000, aiRunning || admin?.status === 'waiting')

  const ask = useCallback(async (fn) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [refresh])

  return {
    ...state,
    ai,
    latestAi: ai[0] || null,
    admin,
    aiRunning,
    busy,
    error,
    askAi: (content) => ask(() => reviewApi.askAi(challengeId, content)),
    askAdmin: () => ask(() => reviewApi.askAdmin(challengeId)),
  }
}
