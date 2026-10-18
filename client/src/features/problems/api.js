import { request } from '../../lib/api'

export const libraryApi = {
  list: () => request('GET', '/api/library'),
  get: (slug) => request('GET', `/api/library/${encodeURIComponent(slug)}`),
  submit: (data) => request('POST', '/api/library', data),
  mine: () => request('GET', '/api/my/problems'),
  // admin
  adminList: (status) => request('GET', `/api/admin/problems?status=${status}`),
  decide: (id, data) => request('POST', `/api/admin/problems/${id}/decide`, data),
}

/** Solo practice = an independent challenge with nobody invited. */
export const startPractice = (problem, timeLimitMin) =>
  request('POST', '/api/challenges', { problemId: problem.id, mode: 'independent', timeLimitMin, inviteeIds: [] })
