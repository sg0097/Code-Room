export async function request(method, url, body, opts = {}) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    keepalive: opts.keepalive,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`)
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export const api = {
  config: () => request('GET', '/api/config'),
  me: () => request('GET', '/api/me'),
  googleLogin: (credential) => request('POST', '/api/auth/google', { credential }),
  devLogin: (name) => request('POST', '/api/auth/dev', { name }),
  signup: (data) => request('POST', '/api/auth/signup', data),
  login: (identifier, password) => request('POST', '/api/auth/login', { identifier, password }),
  usernameAvailable: (u) => request('GET', `/api/auth/username?u=${encodeURIComponent(u)}`),
  setUsername: (username) => request('POST', '/api/me/username', { username }),
  usernameSuggestion: () => request('GET', '/api/me/username-suggestion'),
  logout: () => request('POST', '/api/auth/logout'),
  problems: () => request('GET', '/api/problems'),
  createRoom: (name) => request('POST', '/api/rooms', { name }),
  getRoom: (code) => request('GET', `/api/rooms/${encodeURIComponent(code)}`),

  meta: () => request('GET', '/api/meta'),
  profile: () => request('GET', '/api/profile'),

  searchUsers: (q) => request('GET', `/api/users/search?q=${encodeURIComponent(q)}`),
  friends: () => request('GET', '/api/friends'),
  sendFriendRequest: (userId) => request('POST', '/api/friends/requests', { userId }),
  acceptFriend: (requestId) => request('POST', `/api/friends/requests/${requestId}/accept`),
  rejectFriend: (requestId) => request('POST', `/api/friends/requests/${requestId}/reject`),
  removeFriend: (userId) => request('DELETE', `/api/friends/${userId}`),

  challenges: () => request('GET', '/api/challenges'),
  challenge: (id) => request('GET', `/api/challenges/${id}`),
  createChallenge: (data) => request('POST', '/api/challenges', data),
  challengeAction: (id, action, body) => request('POST', `/api/challenges/${id}/${action}`, body),
  saveDraft: (id, content, opts) => request('PUT', `/api/challenges/${id}/draft`, { content }, opts),
  messages: (id, after = 0) => request('GET', `/api/challenges/${id}/messages?after=${after}`),
  sendMessage: (id, body) => request('POST', `/api/challenges/${id}/messages`, { body }),
  review: (id, data) => request('POST', `/api/challenges/${id}/reviews`, data),
  groups: () => request('GET', '/api/groups'),
  group: (id) => request('GET', `/api/groups/${encodeURIComponent(id)}`),
  createGroup: (name, memberIds) => request('POST', '/api/groups', { name, memberIds }),
  renameGroup: (id, name) => request('PATCH', `/api/groups/${encodeURIComponent(id)}`, { name }),
  addToGroup: (id, userIds) => request('POST', `/api/groups/${encodeURIComponent(id)}/members`, { userIds }),
  removeFromGroup: (id, userId) => request('DELETE', `/api/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`),
  deleteGroup: (id) => request('DELETE', `/api/groups/${encodeURIComponent(id)}`),
  closeChallenge: (id) => request('POST', `/api/challenges/${id}/close`),
  invite: (code) => request('GET', `/api/invites/${encodeURIComponent(code)}`),
  joinInvite: (code) => request('POST', `/api/invites/${encodeURIComponent(code)}/join`),
}

export const inviteLink = (code) => `${location.origin}/join/${code}`

/** Difference between server and browser clocks, so timers agree for everyone. */
let clockOffset = 0
export const syncClock = (serverNow) => {
  if (serverNow) clockOffset = new Date(serverNow).getTime() - Date.now()
}
export const serverNow = () => Date.now() + clockOffset

export const wsBase = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`

// Shades of the brand teal plus slate, so avatars never clash with the page.
const COLORS = ['#0d7c6f', '#12a28f', '#0a5f55', '#2f6f73', '#3d5a63', '#4f7d78', '#1f4e4a', '#5c7a80']
export function colorFor(id) {
  let h = 0
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return COLORS[h % COLORS.length]
}

export const initials = (name = '?') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
