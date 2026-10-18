import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import { experienceApi, experienceMeta } from './api'
import { ExperienceMeta, SourceLink } from './shared'
import { colorFor } from '../../lib/api'
import Icon from '../../components/Icon'

const FILTERS = ['company', 'role', 'yoe', 'q', 'source', 'sort', 'page']

/**
 * Interview experiences from around the web (as links) and from people here, in one list,
 * filtered by the three things people search by: company, role and years of experience.
 * Filters live in the URL, so a search can be shared and the back button works.
 */
// Filters start open on wide screens and folded on phones.
const isWide = () => typeof window === 'undefined' || window.matchMedia('(min-width: 1001px)').matches

export default function ExperiencesPage() {
  const [params, setParams] = useSearchParams()
  const f = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) || '']))
  const page = Number(f.page) || 1
  const [meta, setMeta] = useState(null)
  const [wide] = useState(isWide)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [company, setCompany] = useState(f.company) // what's typed; applied after a short pause
  const [q, setQ] = useState(f.q)

  // Every change applies to the latest URL (not this render's copy), so a slow keystroke
  // can never bring back a filter that was just cleared.
  const set = useCallback((patch, { replace = false } = {}) => setParams((prev) => {
    const next = new URLSearchParams(prev)
    next.delete('page')
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    return next
  }, { replace }), [setParams])

  useEffect(() => {
    experienceMeta().then(setMeta).catch((e) => setError(e.message))
  }, [])

  const key = params.toString()
  useEffect(() => {
    let live = true
    experienceApi.list(Object.fromEntries(new URLSearchParams(key)))
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [key])

  // Typing in the company / search boxes updates the URL once you pause…
  useEffect(() => {
    if (company === f.company && q === f.q) return
    const t = setTimeout(() => set({ company, q }, { replace: true }), 350)
    return () => clearTimeout(t)
  }, [company, q]) // eslint-disable-line react-hooks/exhaustive-deps
  // …and the boxes follow the URL on back / forward. (Not on every URL change: that could
  // overwrite what you're typing while an earlier change is still being applied.)
  const navType = useNavigationType()
  useEffect(() => {
    if (navType !== 'POP') return
    setCompany(f.company)
    setQ(f.q)
  }, [f.company, f.q, navType])
  const pickCompany = (name) => {
    setCompany(name)
    set({ company: name })
  }
  const clear = () => {
    setCompany('')
    setQ('')
    setParams(f.sort ? { sort: f.sort } : {})
  }

  if (error) return <div className="center error">{error}</div>
  const facets = meta?.facets
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const anyFilter = FILTERS.some((k) => k !== 'page' && k !== 'sort' && f[k])

  return (
    <div className="hr-page">
      <div className="hr-head">
        <div className="crumbs"><Link to="/">Home</Link> <span>›</span> Interview experiences</div>
        <h1>Interview experiences</h1>
        <p className="muted">
          {facets ? `${facets.total.toLocaleString()} real interviews.` : 'Real interviews.'} See what a company asks for your role.
        </p>
      </div>

      <div className="hr-cols">
        <section className="hr-main">
          <div className="hr-searchbar">
            <Icon name="search" size={16} />
            <input
              placeholder="Search, e.g. “amazon sde 2 3 yoe” or “google system design”"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search experiences"
            />
          </div>

          {!data ? (
            <div className="muted small">Loading…</div>
          ) : (
            <>
              <SearchSummary data={data} onCompany={pickCompany} />
              <div className="xp-list">
                {data.items.map((e) => (
                  <div key={e.id} className={`xp-row ${e.fromWeb ? 'xp-web' : ''}`}>
                    <span className="co-avatar" style={{ background: colorFor(e.company) }} aria-hidden="true">{e.company[0]}</span>
                    <div className="xp-main">
                      {e.fromWeb ? (
                        <a href={e.url} target="_blank" rel="noreferrer noopener" className="xp-title">{e.title} <span className="muted">↗</span></a>
                      ) : (
                        <Link to={`/experiences/${e.id}`} className="xp-title">{e.title}</Link>
                      )}
                      {e.snippet && <div className="muted small xp-snippet">{e.snippet}</div>}
                      <ExperienceMeta e={e} onCompany={pickCompany} />
                    </div>
                    <SourceLink e={e} />
                  </div>
                ))}
                {data.items.length === 0 && (
                  <div className="empty muted">
                    Nothing matches yet. <Link to="/experiences/share">Share your experience</Link> and be the first.
                  </div>
                )}
              </div>
              {pages > 1 && (
                <div className="pager">
                  <button className="btn ghost small" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>← Newer</button>
                  <span className="muted small">Page {page} of {pages}</span>
                  <button className="btn ghost small" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Older →</button>
                </div>
              )}
            </>
          )}
          <p className="muted small">Posts from other sites open on their own site. We only keep the link.</p>
        </section>

        <aside className="hr-side">
          <details className="hr-filters" open={wide}>
            <summary>Filters</summary>
          <fieldset className="hr-filter">
            <legend>Company</legend>
            <input list="xp-companies" placeholder="Any company" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company" />
            <datalist id="xp-companies">{facets?.companies.map((c) => <option key={c.key} value={c.name} />)}</datalist>
            {!f.company && facets?.companies.length > 0 && (
              <div className="hr-chips">
                {facets.companies.slice(0, 8).map((c) => (
                  <button key={c.key} className="pill" onClick={() => pickCompany(c.name)}>{c.name}</button>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset className="hr-filter">
            <legend>Role</legend>
            <select value={f.role} onChange={(e) => set({ role: e.target.value })} aria-label="Role">
              <option value="">Any role</option>
              {meta?.roles.map((r) => <option key={r} value={r}>{r}{facets?.roles[r] ? ` (${facets.roles[r]})` : ''}</option>)}
            </select>
          </fieldset>
          <fieldset className="hr-filter">
            <legend>Experience</legend>
            {[{ key: '', label: 'Any' }, ...(meta?.yoeBuckets || [])].map((b) => (
              <label key={b.key}>
                <input type="radio" name="yoe" checked={f.yoe === b.key} onChange={() => set({ yoe: b.key })} />
                <span>{b.label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="hr-filter">
            <legend>Source</legend>
            <select value={f.source} onChange={(e) => set({ source: e.target.value })} aria-label="Source">
              <option value="">All sources</option>
              {meta && Object.entries(meta.sources).filter(([k]) => facets?.sources[k]).map(([k, label]) => (
                <option key={k} value={k}>{label} ({facets.sources[k]})</option>
              ))}
            </select>
          </fieldset>
          <fieldset className="hr-filter">
            <legend>Sort</legend>
            <select value={f.sort} onChange={(e) => set({ sort: e.target.value })} title="Most relevant puts recent, detailed posts first" aria-label="Sort">
              <option value="">Most relevant</option>
              <option value="newest">Newest first</option>
            </select>
            {anyFilter && <button className="btn ghost small" onClick={clear}>Clear all filters</button>}
          </fieldset>
          </details>
          <div className="hr-side-card">
            <b>Been through an interview?</b>
            <p className="muted small">Write what they asked, or share a link. You can stay anonymous.</p>
            <div className="row wrap">
              <Link to="/experiences/share" className="btn small">Share yours</Link>
              <Link to="/my/experiences" className="btn ghost small">My posts</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** "Best matches for Google · SDE 2 · ~3 YoE", and how many came from the web. */
function SearchSummary({ data, onCompany }) {
  const u = data.understood
  const web = data.items.filter((e) => e.fromWeb).length
  return (
    <div className="xp-summary small">
      <span className="muted">{data.total.toLocaleString()} found{web ? ` + ${web} from across the web` : ''}</span>
      {u && (
        <span className="chips">
          <span className="muted">Best matches for</span>
          {u.company && <button type="button" className="tag company tag-btn" onClick={() => onCompany(u.company)} title={`Only ${u.company}`}>{u.company}</button>}
          {u.role && <span className="tag">{u.role}</span>}
          {u.yoe != null && <span className="tag">{u.yoe === 0 ? 'Fresher' : `~${u.yoe} YoE`}</span>}
          {u.terms.map((t) => <span key={t} className="tag muted">“{t}”</span>)}
        </span>
      )}
      {data.web?.error && <span className="muted">(web search unavailable: {data.web.error})</span>}
    </div>
  )
}
