// Group rules, without the database.
export const GROUP_LIMITS = { members: 12, nameMin: 2, nameMax: 40 }

export function checkGroupName(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (name.length < GROUP_LIMITS.nameMin) return { error: 'Give the group a name' }
  if (name.length > GROUP_LIMITS.nameMax) return { error: `Group names can be at most ${GROUP_LIMITS.nameMax} characters` }
  return { name }
}

/**
 * Who can be added: only the adder's friends, no duplicates, nobody already in, and the group
 * stays within the size limit. → { add: [ids] } or { error }
 */
export function checkNewMembers(ids, { friends, current = [] }) {
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => !current.includes(id))
  if (!want.length) return { error: 'Pick at least one friend' }
  const strangers = want.filter((id) => !friends.has(id))
  if (strangers.length) return { error: 'You can only add your friends' }
  if (current.length + want.length > GROUP_LIMITS.members) return { error: `A group can have at most ${GROUP_LIMITS.members} people` }
  return { add: want }
}

/** When the owner leaves, the person who joined earliest takes over. `members` sorted by added_at. */
export const nextOwner = (members, leavingId) => members.find((m) => m.user_id !== leavingId)?.user_id || null
