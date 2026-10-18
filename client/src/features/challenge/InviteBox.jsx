import { useState } from 'react'
import { inviteLink } from '../../lib/api'
import Icon from '../../components/Icon'

/** The challenge link, ready to send: copy, WhatsApp, or the phone's share sheet. */
export default function InviteBox({ code, title, compact = false }) {
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const url = inviteLink(code)
  const text = `I challenge you: "${title}" on CodeRoom. Join here: ${url}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* the link is selectable in the box anyway */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className={`invite-box ${compact ? 'compact' : ''}`}>
      {!compact && <b>Send this link to your friend</b>}
      <div className="invite-row">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <button className="btn small" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
      </div>
      <div className="row wrap">
        <a className="btn ghost small" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer noopener">
          <Icon name="message" size={14} /> WhatsApp
        </a>
        {typeof navigator !== 'undefined' && navigator.share && (
          <button className="btn ghost small" onClick={() => navigator.share({ title: 'CodeRoom challenge', text, url }).catch(() => {})}>Share…</button>
        )}
        {!compact && <span className="muted small">They sign in, and they're in. You become friends too.</span>}
      </div>
    </div>
  )
}
