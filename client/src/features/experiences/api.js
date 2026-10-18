import { request } from '../../lib/api'

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString()

export const experienceApi = {
  list: (filters) => request('GET', `/api/experiences?${qs(filters)}`),
  meta: () => request('GET', '/api/experiences/meta'),
  get: (id) => request('GET', `/api/experiences/${encodeURIComponent(id)}`),
  share: (data) => request('POST', '/api/experiences', data),
  mine: () => request('GET', '/api/my/experiences'),
  // admin
  adminList: (status, q = '') => request('GET', `/api/admin/experiences?${qs({ status, q })}`),
  decide: (id, data) => request('POST', `/api/admin/experiences/${id}/decide`, data),
  addLinks: (urls) => request('POST', '/api/admin/experiences/links', { urls }),
}

// The filter vocabulary (roles, YoE ranges…) never changes while the app runs: fetch it once.
let metaPromise = null
export const experienceMeta = () => (metaPromise ||= experienceApi.meta().catch((e) => {
  metaPromise = null
  throw e
}))

export const OUTCOME_LABEL = { selected: '✓ Selected', rejected: '✗ Rejected', pending: '… Waiting' }
export const TAG_LABEL = { 'on-campus': 'On campus', 'off-campus': 'Off campus', internship: 'Internship', referral: 'Referral' }
const SOURCE_LABEL = { gfg: 'GeeksforGeeks', leetcode: 'LeetCode', reddit: 'Reddit', medium: 'Medium', glassdoor: 'Glassdoor', web: 'Web', user: 'CodeRoom' }
export const sourceLabel = (s) => SOURCE_LABEL[s] || s
export const yoeLabel = (yoe) => (yoe == null ? null : yoe === 0 ? 'Fresher' : `${yoe} YoE`)
