// A small robots.txt reader: may this user agent fetch this path?
// Follows the usual rules: the most specific User-agent group wins (else "*"), and within it
// the longest matching Allow/Disallow rule wins. Supports the "*" and "$" wildcards.

function parse(txt) {
  const groups = [] // [{ agents: [], rules: [{ allow, pattern }] }]
  let current = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim()
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!lastWasAgent) groups.push((current = { agents: [], rules: [] }))
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else {
      lastWasAgent = false
      if (current && (key === 'allow' || key === 'disallow') && value) current.rules.push({ allow: key === 'allow', pattern: value })
    }
  }
  return groups
}

function toRegex(pattern) {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp('^' + body + (anchored ? '$' : ''))
}

/** → (path) => boolean. Missing or unreadable robots.txt means everything is allowed. */
export async function robotsFor(origin, userAgent) {
  let groups = []
  try {
    const res = await fetch(new URL('/robots.txt', origin), { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(15_000) })
    if (res.ok) groups = parse(await res.text())
  } catch {
    /* treat as allowed */
  }
  const ua = userAgent.toLowerCase()
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)))
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules)
  const compiled = rules.map((r) => ({ ...r, re: toRegex(r.pattern), len: r.pattern.length }))
  return (path) => {
    let best = null
    for (const r of compiled) if (r.re.test(path) && (!best || r.len > best.len || (r.len === best.len && r.allow))) best = r
    return !best || best.allow
  }
}
