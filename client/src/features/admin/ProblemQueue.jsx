import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { Empty, LEVEL, Level, timeAgo } from '../../components/ui'
import { libraryApi } from '../problems/api'
import { fromLines, toLines } from '../problems/shared'

const TABS = [['pending', 'In review'], ['published', 'Published'], ['rejected', 'Rejected']]

/** Problems people submitted: duplicate check on the left, editable fields, then publish or reject. */
export default function ProblemQueue({ onChange }) {
  const [status, setStatus] = useState('pending')
  const [list, setList] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const load = useCallback(() => libraryApi.adminList(status).then((d) => {
    setList(d.problems)
    onChange?.()
  }), [status, onChange])
  useEffect(() => {
    setList(null)
    load()
  }, [load])

  const selected = list?.find((p) => p.id === selectedId) || list?.[0]

  return (
    <div className="admin">
      <aside className="admin-list">
        <div className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setSelectedId(null) }}>{label}</button>
          ))}
        </div>
        {!list && <p className="muted small">Loading…</p>}
        {list?.length === 0 && <Empty>Nothing here.</Empty>}
        {list?.map((p) => (
          <button key={p.id} className={`admin-item ${selected?.id === p.id ? 'on' : ''}`} onClick={() => setSelectedId(p.id)}>
            <b>{p.title}</b>
            <span className="row small">
              <Level d={p.difficulty} as="text" />
              <span className="muted">{p.authorName || 'seed'} · {timeAgo(p.createdAt)}</span>
            </span>
            {status === 'pending' && p.similar.length > 0 && <span className="small warn">possible duplicate</span>}
          </button>
        ))}
      </aside>
      {selected ? <Editor key={selected.id + selected.reviewedAt} p={selected} onDone={load} /> : <div />}
    </div>
  )
}

function Editor({ p, onDone }) {
  const { meta } = useAuth()
  const [f, setF] = useState(() => ({
    title: p.title, statement: p.statement, category: p.category, difficulty: p.difficulty, format: p.format,
    constraints: toLines(p.constraints), followUps: toLines(p.followUps), checklist: toLines(p.checklist),
    companies: p.companies.join(', '), sources: toLines(p.sources.map((s) => s.url)), note: p.adminNote || '',
  }))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  async function decide(action) {
    setBusy(true)
    setMsg(null)
    try {
      await libraryApi.decide(p.id, {
        ...f, action,
        constraints: fromLines(f.constraints), followUps: fromLines(f.followUps), checklist: fromLines(f.checklist),
        sources: fromLines(f.sources).map((url) => ({ url })),
      })
      setMsg({ ok: true, text: { save: 'Saved.', publish: 'Published.', reject: 'Rejected.' }[action] })
      await onDone()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-detail">
      <section className="admin-side card">
        <h3 style={{ margin: 0 }}>Checks</h3>
        {p.similar.length === 0 && <p className="muted small">No similar titles in the library.</p>}
        {p.similar.length > 0 && (
          <>
            <div className="example-label">Similar titles</div>
            <ul className="bullets small">
              {p.similar.map((s) => <li key={s.id}>{s.status === 'published' ? <Link to={`/problems/${s.slug}`} target="_blank">{s.title}</Link> : s.title} <span className="muted">({Math.round(s.score * 100)}%, {s.status})</span></li>)}
            </ul>
          </>
        )}
      </section>

      <section className="admin-form form card">
        <div className="row"><b>Problem</b><span className="muted small">by {p.authorName || 'seed'} · <Link to={`/problems/${p.slug}`} target="_blank">open page</Link></span></div>
        <label><span>Title</span><input value={f.title} onChange={set('title')} /></label>
        <div className="grid-3">
          <label><span>Category</span><select value={f.category} onChange={set('category')}>{meta.categories.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label><span>Level</span><select value={f.difficulty} onChange={set('difficulty')}>{meta.difficulties.map((d) => <option key={d} value={d}>{LEVEL[d]}</option>)}</select></label>
          <label><span>Format</span><select value={f.format} onChange={set('format')}>{Object.entries(meta.formats).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        </div>
        <label><span>Statement</span><textarea rows={8} value={f.statement} onChange={set('statement')} /></label>
        <label><span>Constraints <span className="muted small">one per line</span></span><textarea rows={4} value={f.constraints} onChange={set('constraints')} /></label>
        <label><span>Follow-ups <span className="muted small">one per line, easiest first</span></span><textarea rows={4} value={f.followUps} onChange={set('followUps')} /></label>
        <label><span>Reviewer checklist <span className="muted small">one per line</span></span><textarea rows={4} value={f.checklist} onChange={set('checklist')} /></label>
        <div className="grid-3">
          <label><span>Companies</span><input value={f.companies} onChange={set('companies')} /></label>
          <label style={{ gridColumn: 'span 2' }}><span>Sources</span><textarea rows={2} value={f.sources} onChange={set('sources')} /></label>
        </div>
        <label><span>Note to the author <span className="muted small">shown on their submissions page</span></span><input value={f.note} onChange={set('note')} placeholder="e.g. Added scale numbers and follow-ups" /></label>
        {msg && <p className={msg.ok ? 'ok small' : 'error small'}>{msg.text}</p>}
        <div className="row wrap">
          {p.status !== 'published' && <button className="btn" disabled={busy} onClick={() => decide('publish')}>Publish</button>}
          <button className="btn ghost" disabled={busy} onClick={() => decide('save')}>Save{p.status === 'published' ? ' changes' : ' draft'}</button>
          {p.status !== 'rejected' && <button className="btn danger" disabled={busy} onClick={() => decide('reject')} style={{ marginLeft: 'auto' }}>Reject</button>}
        </div>
      </section>
    </div>
  )
}

