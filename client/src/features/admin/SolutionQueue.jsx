import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { ProjectView } from '../../components/project/ProjectEditor'
import { DiagramView } from '../../components/whiteboard'
import { Empty, Level, RichText, Stars, timeAgo } from '../../components/ui'
import { reviewApi } from '../reviews/api'

const TABS = [['waiting', 'Waiting'], ['done', 'Reviewed']]

/** Solutions people sent for admin review: the problem, their answer, and a short review form. */
export default function SolutionQueue({ onChange }) {
  const [status, setStatus] = useState('waiting')
  const [list, setList] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [flash, setFlash] = useState(null) // survives the item leaving the list

  const load = useCallback(() => reviewApi.queue(status).then((d) => {
    setList(d.reviews)
    onChange?.()
  }), [status, onChange])
  useEffect(() => {
    setList(null)
    load()
  }, [load])

  const selected = list?.find((r) => r.id === selectedId) || list?.[0]
  return (
    <div className="admin">
      <aside className="admin-list">
        <div className="tabs">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab ${status === k ? 'on' : ''}`} onClick={() => { setStatus(k); setSelectedId(null) }}>{label}</button>
          ))}
        </div>
        {flash && <p className="ok small admin-flash">{flash}</p>}
        {!list && <p className="muted small">Loading…</p>}
        {list?.length === 0 && <Empty>{status === 'waiting' ? 'No solutions waiting.' : 'Nothing reviewed yet.'}</Empty>}
        {list?.map((r) => (
          <button key={r.id} className={`admin-item ${selected?.id === r.id ? 'on' : ''}`} onClick={() => { setSelectedId(r.id); setFlash(null) }}>
            <b>{r.challenge.title}</b>
            <span className="row small">
              <Level d={r.challenge.difficulty} as="text" />
              <span className="muted">{r.requesterName}{r.challenge.mode === 'collaborative' ? ' (team)' : ''} · {timeAgo(r.createdAt)}</span>
            </span>
            {r.status === 'done' && <span className="small"><Stars value={r.result.rating} size={13} /></span>}
          </button>
        ))}
      </aside>
      {selected ? <Detail key={selected.id + (selected.doneAt || '')} r={selected} onDone={(msg) => { setFlash(msg); return load() }} /> : <div />}
    </div>
  )
}

function Detail({ r, onDone }) {
  const c = r.challenge
  const [f, setF] = useState({ rating: r.result?.rating || 0, good: r.result?.good || '', improve: r.result?.improve || '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await reviewApi.decide(r.id, f)
      await onDone(`✓ Review sent to ${r.requesterName}.`)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-detail">
      <section className="admin-side card">
        <h3 style={{ margin: 0 }}>{c.title}</h3>
        <div className="chips"><Level d={c.difficulty} /><span className="tag">{c.category}</span></div>
        <div className="statement small-text"><RichText text={c.statement} /></div>
        {c.checklist.length > 0 && (
          <>
            <div className="example-label">What a good answer covers</div>
            <ul className="bullets checklist small">{c.checklist.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </>
        )}
      </section>

      <section className="admin-form form card">
        <div className="row"><b>{r.requesterName}'s solution</b><span className="muted small">submitted {timeAgo(r.createdAt)}</span></div>
        <AnswerView format={c.format} content={r.content} />
        <div className="review-box">
          <div className="example-label">Your review</div>
          <div className="row"><span className="small">Overall</span><Stars value={f.rating} onChange={(rating) => setF((s) => ({ ...s, rating }))} /></div>
          <label><span>What's good</span><textarea rows={3} value={f.good} onChange={(e) => setF((s) => ({ ...s, good: e.target.value }))} /></label>
          <label><span>What to improve</span><textarea rows={4} value={f.improve} onChange={(e) => setF((s) => ({ ...s, improve: e.target.value }))} /></label>
          {msg && <p className={msg.ok ? 'ok small' : 'error small'}>{msg.text}</p>}
          <button className="btn" disabled={busy || !f.rating || (!f.good.trim() && !f.improve.trim())} onClick={save}>
            {r.status === 'done' ? 'Update review' : 'Send review'}
          </button>
        </div>
      </section>
    </div>
  )
}

/** One answer, field by field, read-only. */
export function AnswerView({ format, content }) {
  const { meta } = useAuth()
  return meta.formats[format].fields.map((f) => (
    <div key={f.key} className="answer-field">
      <div className="example-label">{f.label}</div>
      {f.kind === 'diagram' ? (
        <DiagramView value={content.fields[f.key]} height={320} />
      ) : f.kind === 'project' ? (
        <ProjectView value={content.fields[f.key]} language={content.language} height={380} />
      ) : content.fields[f.key]?.trim() ? (
        <div className="cmp-text">{content.fields[f.key]}</div>
      ) : (
        <span className="muted small">(left empty)</span>
      )}
    </div>
  ))
}
