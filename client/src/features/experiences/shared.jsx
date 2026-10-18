// Small pieces shared by the interview experience pages.
import { OUTCOME_LABEL, TAG_LABEL, sourceLabel, yoeLabel } from './api'

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' }) : null)

/** One quiet line: company · role · YoE · outcome · tags · date. Company is clickable when onCompany is given. */
export function ExperienceMeta({ e, onCompany }) {
  const parts = [
    e.role !== 'Other' && e.role,
    e.roleTitle && e.roleTitle !== e.role && e.roleTitle,
    yoeLabel(e.yoe),
    ...e.tags.map((t) => TAG_LABEL[t] || t),
  ].filter(Boolean)
  return (
    <div className="xp-meta small">
      {onCompany ? (
        <button type="button" className="xp-company" onClick={() => onCompany(e.company)} title={`All ${e.company} experiences`}>{e.company}</button>
      ) : (
        <span className="xp-company">{e.company}</span>
      )}
      {parts.map((x) => <span key={x}>{x}</span>)}
      {e.outcome && <span className={`outcome-${e.outcome}`}>{OUTCOME_LABEL[e.outcome]}</span>}
      {/* The original post's date when we know it; never the day we found the link. */}
      {when(e.postedAt) && (
        <span title={e.postedApprox ? 'Estimated from where the post sits on the site' : undefined}>
          {e.postedApprox ? '~' : ''}{when(e.postedAt)}
        </span>
      )}
    </div>
  )
}

/** Where it comes from: the original site (opens in a new tab), or the person who wrote it here. */
export function SourceLink({ e }) {
  if (e.hasWriteUp) return <span className="muted small xp-source">by {e.authorName || 'anonymous'}</span>
  if (e.fromWeb) {
    return (
      <a className="xp-source small" href={e.url} target="_blank" rel="noreferrer noopener" title="Live web result, not saved on CodeRoom">
        web · {sourceLabel(e.source)} ↗
      </a>
    )
  }
  return (
    <a className="xp-source small" href={e.url} target="_blank" rel="noreferrer noopener" title="Open the original post">
      {sourceLabel(e.source)} ↗
    </a>
  )
}
