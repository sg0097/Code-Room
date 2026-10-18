import { Link } from 'react-router-dom'
import Icon from './Icon'

/** What CodeRoom is, in four parts. Shown on the home page and the sign-in page. */
export const PILLARS = [
  { icon: 'swords', colors: ['#0d7c6f', '#12a28f'], title: 'Solve with friends', text: 'Solve the same problem together in a live room (shared code, whiteboard and video) or race on the clock, then discuss and review each other.', to: '/challenges/new', cta: 'Start a challenge' },
  { icon: 'code', colors: ['#0d7c6f', '#12a28f'], title: 'Real interview problems', text: 'System design, LLD, backend and debugging problems like the ones companies ask, solved on a whiteboard and a real multi-file editor.', to: '/problems', cta: 'Browse problems' },
  { icon: 'book', colors: ['#0d7c6f', '#12a28f'], title: 'Interview experiences', text: 'Thousands of real write-ups from GeeksforGeeks, LeetCode and people here, searchable by company, role and years of experience.', to: '/experiences', cta: 'Search experiences' },
  { icon: 'sparkles', colors: ['#0d7c6f', '#12a28f'], title: 'Feedback on every answer', text: 'A quick AI review while you solve, then a detailed review from an admin when you submit.', to: '/problems', cta: 'Try a problem' },
]

/** `links={false}` shows plain tiles (the sign-in page, where the links would need an account). */
export default function Pillars({ compact = false, links = true }) {
  return (
    <div className={`pillars ${compact ? 'compact' : ''}`}>
      {PILLARS.map((x) => {
        const body = (
          <>
            <span className="pillar-icon" style={{ background: `linear-gradient(135deg, ${x.colors[0]}, ${x.colors[1]})`, boxShadow: `0 8px 24px -8px ${x.colors[0]}` }}>
              <Icon name={x.icon} size={compact ? 18 : 22} />
            </span>
            <b>{x.title}</b>
            {!compact && <span className="muted small">{x.text}</span>}
            {links && <span className="pillar-cta small">{x.cta} →</span>}
          </>
        )
        return links ? <Link key={x.title} to={x.to} className="pillar">{body}</Link> : <div key={x.title} className="pillar">{body}</div>
      })}
    </div>
  )
}
