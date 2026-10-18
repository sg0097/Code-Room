import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Empty, RichText, timeAgo } from '../../components/ui'
import { experienceApi, experienceMeta, TAG_LABEL, yoeLabel } from '../experiences/api'

const TABS = [['pending', 'In review'], ['published', 'Published'], ['rejected', 'Hidden']]

/** Experiences people shared (and scraped links, to fix or hide), plus a box to add links by hand. */
export default function ExperienceQueue({ onChange }) {
  const [status, setStatus] = useState('pending')
  const [q, setQ] = useState('')
  const [list, setList] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [meta, setMeta] = useState(null)
  const [adding, setAdding] = useState(false)
  const [flash, setFlash] = useState(null) // survives the item leaving the list

  useEffect(() => {
    experienceMeta().then(setMeta)
  }, [])
  const load = useCallback(() => experienceApi.adminList(status, q).then((d) => {
    setList(d.experiences)
    onChange?.()
  }), [status, q, onChange])
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0) // search as you type, without a request per key
    return () => clearTimeout(t)
  }, [load, q])

  const selected = list?.find((e) => e.id === selectedId) || list?.[0]
  return (
    <div className="admin">
      <aside className="admin-list">
        <div className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setSelectedId(null) }}>{label}</button>
          ))}
        </div>
        <div className="admin-list-tools">
          <input className="search" placeholder="Search title or company" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn ghost small" onClick={() => setAdding(true)}>+ Add links</button>
        </div>
        {flash && <p className="ok small admin-flash">{flash}</p>}
        {!list && <p className="muted small">Loading…</p>}
        {list?.length === 0 && <Empty>Nothing here.</Empty>}
        {list?.map((e) => (
          <button key={e.id} className={`admin-item ${selected?.id === e.id && !adding ? 'on' : ''}`} onClick={() => { setSelectedId(e.id); setAdding(false); setFlash(null) }}>
            <b>{e.title}</b>
            <span className="muted small">{e.company} · {e.role}{e.yoe != null ? ` · ${yoeLabel(e.yoe)}` : ''}</span>
            <span className="muted small">{e.hasWriteUp ? `written by ${e.anonymous ? 'anonymous' : e.authorName}` : `link · ${e.source}`} · {timeAgo(e.createdAt)}</span>
          </button>
        ))}
      </aside>
      {adding ? <AddLinks onDone={load} /> : selected && meta ? <Editor key={selected.id + selected.status} e={selected} meta={meta} onDone={(msg) => { setFlash(msg); return load() }} /> : <div />}
    </div>
  )
}

function Editor({ e, meta, onDone }) {
  const [f, setF] = useState({
    title: e.title, company: e.company, role: e.role, roleTitle: e.roleTitle || '', yoe: e.yoe ?? '',
    outcome: e.outcome || '', tags: e.tags, note: e.adminNote || '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (ev) => setF((s) => ({ ...s, [k]: ev.target.value }))
  const toggleTag = (t) => setF((s) => ({ ...s, tags: s.tags.includes(t) ? s.tags.filter((x) => x !== t) : [...s.tags, t] }))

  async function decide(action) {
    setBusy(true)
    setMsg(null)
    try {
      await experienceApi.decide(e.id, { ...f, action, yoe: f.yoe === '' ? null : Number(f.yoe), outcome: f.outcome || null })
      await onDone(`✓ ${{ save: 'Saved', publish: 'Published', reject: e.hasWriteUp ? 'Rejected' : 'Hidden' }[action]}: ${f.title}`)
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-detail">
      <section className="admin-side card">
        {e.hasWriteUp ? (
          <>
            <h3 style={{ margin: 0 }}>Their write-up</h3>
            {e.rounds.map((r, i) => (
              <div key={i}>
                <div className="example-label">Round {i + 1}{r.name ? `: ${r.name}` : ''}</div>
                <p className="fb-text small-text">{r.notes}</p>
              </div>
            ))}
            {e.body && <><div className="example-label">Notes</div><div className="small-text"><RichText text={e.body} /></div></>}
          </>
        ) : (
          <>
            <h3 style={{ margin: 0 }}>Link</h3>
            <a href={e.url} target="_blank" rel="noreferrer noopener" className="small break">{e.url}</a>
            <p className="muted small">We keep the link and its details only. Fix the company, role or YoE if the title misled the classifier, or hide it if it isn't an interview experience.</p>
          </>
        )}
      </section>

      <section className="admin-form form card">
        <div className="row"><b>Details</b><Link to={`/experiences/${e.id}`} target="_blank" className="muted small">open page</Link></div>
        <label><span>Title</span><input value={f.title} onChange={set('title')} /></label>
        <div className="grid-3">
          <label><span>Company</span><input value={f.company} onChange={set('company')} /></label>
          <label><span>Role</span><select value={f.role} onChange={set('role')}>{meta.roles.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label><span>Years of experience</span><input type="number" min="0" max="40" value={f.yoe} onChange={set('yoe')} placeholder="not stated" /></label>
        </div>
        <div className="grid-3">
          <label><span>Job title as written</span><input value={f.roleTitle} onChange={set('roleTitle')} placeholder="e.g. SDE-1 (Payments)" /></label>
          <label><span>Outcome</span>
            <select value={f.outcome} onChange={set('outcome')}>
              <option value="">Not stated</option>
              {meta.outcomes.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        </div>
        <div className="row wrap">{meta.tags.map((t) => (
          <label key={t} className="check"><input type="checkbox" checked={f.tags.includes(t)} onChange={() => toggleTag(t)} /> {TAG_LABEL[t]}</label>
        ))}</div>
        {e.hasWriteUp && <label><span>Note to the author <span className="muted small">shown on their submissions page</span></span><input value={f.note} onChange={set('note')} /></label>}
        {msg && <p className={msg.ok ? 'ok small' : 'error small'}>{msg.text}</p>}
        <div className="row wrap">
          {e.status !== 'published' && <button className="btn" disabled={busy} onClick={() => decide('publish')}>Publish</button>}
          <button className="btn ghost" disabled={busy} onClick={() => decide('save')}>Save</button>
          {e.status !== 'rejected' && <button className="btn danger" disabled={busy} onClick={() => decide('reject')} style={{ marginLeft: 'auto' }}>{e.hasWriteUp ? 'Reject' : 'Hide'}</button>}
        </div>
      </section>
    </div>
  )
}

/** Paste links (LeetCode, Reddit, blogs…) one per line: each is classified from its URL and published. */
function AddLinks({ onDone }) {
  const [urls, setUrls] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  async function add() {
    setBusy(true)
    try {
      setResult(await experienceApi.addLinks(urls))
      setUrls('')
      await onDone(null)
    } catch (e) {
      setResult({ error: e.message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="admin-form form card">
      <h3 style={{ margin: 0 }}>Add links</h3>
      <p className="muted small">
        One URL per line, from any site (LeetCode Discuss, Reddit, Medium…). We read the company, role and YoE from the URL and store the link only.
        Links we can't find a company in are skipped: open them from the list afterwards to fix details.
      </p>
      <textarea rows={8} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder={'https://leetcode.com/discuss/post/123/google-l4-bangalore-offer/\nhttps://medium.com/@someone/my-uber-sde-2-interview'} />
      <button className="btn" disabled={busy || !urls.trim()} onClick={add}>{busy ? 'Adding…' : 'Add links'}</button>
      {result?.error && <p className="error small">{result.error}</p>}
      {result?.added && (
        <div className="small">
          <p className="ok">Added {result.added.length}.</p>
          {result.added.map((e) => <div key={e.id}>✓ {e.company} · {e.role}{e.yoe != null ? ` · ${yoeLabel(e.yoe)}` : ''}: {e.title}</div>)}
          {result.skipped.map((s) => <div key={s.url} className="muted">– {s.url}: {s.reason}</div>)}
        </div>
      )}
    </section>
  )
}
