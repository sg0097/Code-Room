// Small pieces shared by the problem pages.
import { Level } from '../../components/ui'

export const FORMAT_LABEL = { design: 'Whiteboard', lld: 'Whiteboard + code', code: 'Code', debug: 'Written' }
export const FORMAT_ICON = { design: '✎', lld: '{}', code: '</>', debug: '!' }
export const DEFAULT_MINUTES = { Easy: 30, Medium: 45, Hard: 60 }

export function StatusIcon({ status }) {
  if (status === 'solved') return <span className="st-solved" title="Solved">✓</span>
  if (status === 'attempted') return <span className="st-attempted" title="Attempted">◐</span>
  return <span className="st-none" />
}

export function ProblemTags({ p }) {
  return (
    <div className="chips">
      <Level d={p.difficulty} />
      <span className="tag">{p.category}</span>
      <span className="tag">{FORMAT_ICON[p.format]} {FORMAT_LABEL[p.format]}</span>
      {p.companies?.map((c) => <span key={c} className="tag company">{c}</span>)}
    </div>
  )
}

/** A list (constraints, follow-ups…) as bullets, or nothing. */
export function Bullets({ items, numbered }) {
  if (!items?.length) return null
  const Tag = numbered ? 'ol' : 'ul'
  return <Tag className="bullets">{items.map((x, i) => <li key={i}>{x}</li>)}</Tag>
}

/** Textareas edit lists as one item per line. */
export const toLines = (arr) => (arr || []).join('\n')
export const fromLines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean)
