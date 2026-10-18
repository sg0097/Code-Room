// Small SVG / CSS charts for the home page. No chart library: these are a few shapes each.
import { useEffect, useState } from 'react'
import { reducedMotion } from './motion'

/** A progress ring. `value` 0..1; children go in the middle. */
export function Ring({ value, size = 120, stroke = 10, from = '#0d7c6f', to = '#5fc9b9', children }) {
  // Starts empty and fills to the value, so the ring visibly "loads".
  const [shown, setShown] = useState(reducedMotion() ? value : 0)
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 60)
    return () => clearTimeout(t)
  }, [value])
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = `ring-${from.slice(1)}-${to.slice(1)}`
  return (
    <div className="ring2" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--panel-2)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * Math.max(0, Math.min(1, shown))} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="ring2-mid">{children}</div>
    </div>
  )
}

const DAY = 86_400_000
const iso = (t) => new Date(t).toISOString().slice(0, 10)

/** GitHub-style grid of practice per day for the last `weeks` weeks (columns = weeks, Sunday on top). */
export function Heatmap({ activity, weeks = 26 }) {
  const [hover, setHover] = useState(null)
  const counts = new Map(activity.map((a) => [a.day, a.n]))
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  const start = today - ((weeks - 1) * 7 + new Date(today).getUTCDay()) * DAY
  const cols = []
  for (let w = 0; w < weeks; w++) {
    const days = []
    for (let d = 0; d < 7; d++) {
      const t = start + (w * 7 + d) * DAY
      days.push(t > today ? null : { day: iso(t), n: counts.get(iso(t)) || 0 })
    }
    cols.push(days)
  }
  const months = cols.map((col, i) => {
    const first = col.find(Boolean)
    if (!first) return ''
    const m = new Date(first.day).toLocaleString(undefined, { month: 'short', timeZone: 'UTC' })
    const prev = i && cols[i - 1].find(Boolean)
    return !prev || new Date(prev.day).getUTCMonth() !== new Date(first.day).getUTCMonth() ? m : ''
  })
  const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3)
  return (
    <div className="heat" style={{ "--weeks": weeks }}>
      <div className="heat-months">{months.map((m, i) => <span key={i}>{m}</span>)}</div>
      <div className="heat-grid">
        {cols.map((col, i) => (
          <div key={i} className="heat-col">
            {col.map((c, j) => (c
              ? <span key={j} className={`heat-cell l${level(c.n)} ${c.day === iso(today) ? 'today' : ''}`} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} />
              : <span key={j} className="heat-cell none" />))}
          </div>
        ))}
      </div>
      <div className="heat-legend small muted">
        <span className="heat-read">
          {hover
            ? `${new Date(hover.day).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${hover.n ? `${hover.n} practice ${hover.n === 1 ? 'session' : 'sessions'}` : 'no practice'}`
            : `${activity.length} active ${activity.length === 1 ? 'day' : 'days'} this year`}
        </span>
        Less <span className="heat-cell l0" /><span className="heat-cell l1" /><span className="heat-cell l2" /><span className="heat-cell l3" /> More
      </div>
    </div>
  )
}

/** Solved / total per area as gradient bars in each category's colours. */
export function AreaBars({ rows }) {
  return (
    <div className="area-bars">
      {rows.map((r) => {
                return (
          <div key={r.category} className="area-bar">
            <div className="row small">
              <span className="area-dot" />
              <span className={r.focus ? 'txt' : 'muted'}>{r.category}</span>
              {r.focus && <span className="focus-tag">focus</span>}
              <span className="muted" style={{ marginLeft: 'auto' }}>{r.solved}/{r.total}</span>
            </div>
            <div className="meter"><span style={{ width: `${r.total ? (r.solved / r.total) * 100 : 0}%` }} /></div>
          </div>
        )
      })}
    </div>
  )
}
