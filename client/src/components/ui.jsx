import { useEffect, useRef, useState } from 'react'
import { serverNow } from '../lib/api'
import Avatar from './Avatar'

export const STATE_LABEL = {
  INVITED: 'Invited',
  ACCEPTED: 'Accepted',
  DECLINED: 'Declined',
  IN_PROGRESS: 'Solving',
  SUBMITTED: 'Submitted',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  PENDING: 'In review',
  PUBLISHED: 'Published',
  REJECTED: 'Rejected',
}

/** Difficulty is stored as Easy/Medium/Hard and shown as a level. */
export const LEVEL = { Easy: 'Beginner', Medium: 'Intermediate', Hard: 'Advanced' }
export function Level({ d, as = 'tag' }) {
  return <span className={`${as === 'text' ? 'level-text' : 'tag'} ${d.toLowerCase()}`}>{LEVEL[d] || d}</span>
}

export function Badge({ state }) {
  return <span className={`badge badge-${state.toLowerCase()}`}>{STATE_LABEL[state] || state}</span>
}

export function Chips({ c }) {
  return (
    <div className="chips">
      <span className="tag">{c.category}</span>
      <Level d={c.difficulty} />
      <span className="tag">{c.practice ? 'Practice' : c.mode === 'collaborative' ? 'Together' : 'Compete'}</span>
      <span className="tag">{c.timeLimitMin} min</span>
    </div>
  )
}

export function Person({ user, children, size = 28 }) {
  return (
    <div className="person-row">
      <Avatar user={user} size={size} />
      <span className="person-name">{user?.name}{user?.username && <span className="person-handle"> @{user.username}</span>}</span>
      {children}
    </div>
  )
}

const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Counts down to a server timestamp; calls onExpire once when it reaches zero. */
export function Timer({ deadline, onExpire }) {
  const [left, setLeft] = useState(() => new Date(deadline).getTime() - serverNow())
  const fired = useRef(false)
  useEffect(() => {
    fired.current = false
    const tick = () => {
      const ms = new Date(deadline).getTime() - serverNow()
      setLeft(ms)
      if (ms <= 0 && !fired.current) {
        fired.current = true
        onExpire?.()
      }
    }
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [deadline, onExpire])
  return <span className={`timer ${left < 5 * 60_000 ? 'urgent' : ''}`}>{fmt(left)}</span>
}

export function Modal({ title, children, onClose, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}

export function Stars({ value, onChange, size = 22 }) {
  return (
    <span className="stars" role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= value ? 'on' : ''}`}
          style={{ fontSize: size }}
          onClick={onChange ? () => onChange(n) : undefined}
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </span>
  )
}

// `code` and **bold** inside a line of text.
const inline = (line) =>
  line.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, j) => {
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={j}>{part.slice(1, -1)}</code>
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={j}>{part.slice(2, -2)}</strong>
    return part
  })

/** Renders plain text: paragraphs, "- " bullet lists, `inline code` and ``` fenced code blocks. */
export function RichText({ text }) {
  // First group lines into blocks, then render. Blank lines just separate paragraphs.
  const blocks = []
  String(text || '').split(/```[a-z]*\n?/).forEach((chunk, b) => {
    if (b % 2 === 1) return blocks.push({ type: 'code', text: chunk.replace(/\n$/, '') })
    for (const line of chunk.split('\n')) {
      const item = line.match(/^\s*[-*•]\s+(.*)/)
      const last = blocks[blocks.length - 1]
      if (item) {
        if (last?.type === 'list') last.items.push(item[1])
        else blocks.push({ type: 'list', items: [item[1]] })
      } else if (line.trim()) blocks.push({ type: 'p', text: line })
      else blocks.push({ type: 'gap' })
    }
  })
  return blocks.map((bl, i) =>
    bl.type === 'code' ? <pre key={i} className="code-block">{bl.text}</pre>
      : bl.type === 'list' ? <ul key={i} className="bullets">{bl.items.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>
        : bl.type === 'p' ? <p key={i}>{inline(bl.text)}</p>
          : null,
  )
}

/** Calls fn now and then every `ms` while `enabled`; pauses when the tab is hidden. */
export function usePoll(fn, ms, enabled = true) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    if (!enabled) return
    const run = () => document.visibilityState === 'visible' && saved.current()
    const t = setInterval(run, ms)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', run)
    }
  }, [ms, enabled])
}

export function Empty({ children }) {
  return <div className="empty muted">{children}</div>
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}
