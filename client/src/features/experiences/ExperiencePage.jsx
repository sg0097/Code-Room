import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, RichText } from '../../components/ui'
import { experienceApi, sourceLabel } from './api'
import { ExperienceMeta, SourceLink } from './shared'

/** One experience: a write-up from here, or the link to the original post, plus more from the same company. */
export default function ExperiencePage() {
  const { id } = useParams()
  const [d, setD] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setD(null)
    experienceApi.get(id).then(setD).catch((e) => setError(e.status === 404 ? "This experience doesn't exist, or isn't published yet." : e.message))
  }, [id])

  if (error) return <div className="center"><div className="card login"><p>{error}</p><Link className="btn" to="/experiences">All experiences</Link></div></div>
  if (!d) return <div className="center muted">Loading…</div>
  const e = d.experience
  const companyLink = `/experiences?company=${encodeURIComponent(e.company)}`

  return (
    <div className="narrow wide-md">
      <Link to="/experiences" className="muted small">← Interview experiences</Link>
      <div className="xp-head">
        <h1>{e.title}</h1>
        <ExperienceMeta e={e} />
        <SourceLink e={e} />
      </div>

      {e.status !== 'published' && (
        <div className="card callout">
          <span><Badge state={e.status.toUpperCase()} /> {e.status === 'pending' ? 'Only you can see this until an admin publishes it.' : 'An admin decided not to publish this.'}</span>
          {e.adminNote && <span className="small">Admin: {e.adminNote}</span>}
        </div>
      )}

      {e.hasWriteUp ? (
        <>
          {e.rounds.map((r, i) => (
            <div key={i} className="card xp-round">
              <div className="xp-round-head"><span className="xp-round-no">{i + 1}</span><b>{r.name || `Round ${i + 1}`}</b></div>
              <div className="fb-text">{r.notes}</div>
            </div>
          ))}
          {e.body && (
            <div className="card">
              <div className="example-label">{e.rounds.length ? 'More notes' : 'The interview'}</div>
              <RichText text={e.body} />
            </div>
          )}
        </>
      ) : (
        <div className="card xp-external">
          <div>
            <b>This experience is on {sourceLabel(e.source)}</b>
            <p className="muted small">We link to the original instead of copying it, so the author keeps the credit and the latest version.</p>
          </div>
          <a className="btn" href={e.url} target="_blank" rel="noreferrer noopener">Read it on {sourceLabel(e.source)} ↗</a>
        </div>
      )}

      {d.related.length > 0 && (
        <>
          <h2 className="h2">More from {e.company} <Link to={companyLink} className="see-all small">See all →</Link></h2>
          <div className="xp-list">
            {d.related.map((x) => (
              <div key={x.id} className="xp-row">
                <div className="xp-main">
                  <Link to={`/experiences/${x.id}`} className="xp-title">{x.title}</Link>
                  <ExperienceMeta e={x} />
                </div>
                <SourceLink e={x} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
