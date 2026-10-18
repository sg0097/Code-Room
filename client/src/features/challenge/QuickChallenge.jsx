import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { LEVEL } from '../../components/ui'
import Avatar from '../../components/Avatar'
import Icon from '../../components/Icon'
import { libraryApi } from '../problems/api'
import { DEFAULT_MINUTES, FORMAT_LABEL } from '../problems/shared'
import InviteBox from './InviteBox'

const MODES = [
  { id: 'independent', icon: 'swords', title: 'Race', text: 'Same problem, same timer. Compare after.' },
  { id: 'collaborative', icon: 'users', title: 'Together', text: 'One live room: code, whiteboard, video.' },
]
const TIMES = [30, 45, 60, 90]

/**
 * Challenge a friend in one card: problem → race or together → time → who. Creates the
 * challenge and hands back a link to send. Friends picked here also get it on their home page.
 */
export default function QuickChallenge({ problemSlug = null, friendId = null, groupId: fixedGroup = null, groupName = null, groupMembers = null, title = 'Challenge a friend', onCreated }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const root = useRef(null)
  const [problems, setProblems] = useState(null)
  const [friends, setFriends] = useState([])
  const [myGroups, setMyGroups] = useState([])
  const [pick, setPick] = useState({ problemId: '', mode: 'independent', minutes: 45, invitees: friendId ? [friendId] : [], groupId: fixedGroup })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [made, setMade] = useState(null) // { id, inviteCode, title }

  useEffect(() => {
    Promise.all([libraryApi.list(), api.friends(), fixedGroup ? { groups: [] } : api.groups().catch(() => ({ groups: [] }))])
      .then(([lib, fr, gr]) => {
        setProblems(lib.problems)
        setFriends(fr.friends.map((x) => x.user))
        setMyGroups(gr.groups.filter((g) => g.members.length > 1))
        const first = (problemSlug && lib.problems.find((p) => p.slug === problemSlug)) || lib.problems.find((p) => p.myStatus !== 'solved') || lib.problems[0]
        if (first) setPick((s) => ({ ...s, problemId: first.id, minutes: DEFAULT_MINUTES[first.difficulty] || 45 }))
      })
      .catch((e) => setError(e.message))
  }, [problemSlug])

  const problem = problems?.find((p) => p.id === pick.problemId)
  const groups = useMemo(() => {
    const g = new Map()
    for (const p of problems || []) g.set(p.category, [...(g.get(p.category) || []), p])
    return [...g]
  }, [problems])

  const set = (patch) => setPick((s) => ({ ...s, ...patch }))
  const toggleFriend = (id) => set({ groupId: null, invitees: pick.invitees.includes(id) ? pick.invitees.filter((x) => x !== id) : [...pick.invitees, id].slice(0, 4) })
  // A group challenge is always a race: each person answers on their own.
  const toggleGroup = (id) => set(pick.groupId === id ? { groupId: null } : { groupId: id, invitees: [], mode: 'independent' })
  const group = fixedGroup ? { id: fixedGroup, name: groupName, members: groupMembers || [] } : myGroups.find((g) => g.id === pick.groupId)
  const random = () => {
    const pool = problems.filter((p) => p.myStatus !== 'solved' && p.id !== pick.problemId)
    const p = pool[Math.floor(Math.random() * pool.length)] || problems[0]
    set({ problemId: p.id, minutes: DEFAULT_MINUTES[p.difficulty] || 45 })
  }

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const out = await api.createChallenge(group
        ? { problemId: pick.problemId, mode: 'independent', timeLimitMin: pick.minutes, groupId: group.id }
        : { problemId: pick.problemId, mode: pick.mode, timeLimitMin: pick.minutes, inviteeIds: pick.invitees, link: true })
      setMade({ ...out, title: problem.title })
      onCreated?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const chosen = group ? group.members.filter((m) => m.id !== user.id) : friends.filter((f) => pick.invitees.includes(f.id))
  const ticket = problem && <Ticket problem={problem} mode={group ? 'independent' : pick.mode} minutes={pick.minutes} me={user} friends={chosen} group={group} ready={!!made} />

  if (made) {
    return (
      <div className="qc-wrap" ref={root}>
      <div className="qc qc-done">
        <div className="qc-head">
          <span className="qc-check"><Icon name="check" size={22} /></span>
          <div>
            <h3>Done. Now send it.</h3>
            <p className="muted small">{made.title} · {pick.mode === 'independent' ? 'Race' : 'Together'} · {pick.minutes} min</p>
          </div>
        </div>
        {group ? (
          <p className="muted small">Everyone in <b>{group.name}</b> sees it on their home page. Each person answers on their own; you'll see all the answers side by side at the end.</p>
        ) : (
          <>
            <InviteBox code={made.inviteCode} title={made.title} />
            {pick.invitees.length > 0 && <p className="muted small">{pick.invitees.length === 1 ? 'Your friend also sees it' : 'Your friends also see it'} on their home page.</p>}
          </>
        )}
        <div className="row wrap">
          <button className="btn" onClick={() => navigate(`/challenges/${made.id}`)}>{pick.mode === 'independent' ? 'Start solving' : 'Go to the challenge'} <Icon name="arrow" size={15} /></button>
          <button className="btn ghost" onClick={() => setMade(null)}>Make another</button>
        </div>
      </div>
      {ticket}
      </div>
    )
  }

  return (
    <div className="qc-wrap" ref={root}>
    <div className="qc">
      <h3>{title}</h3>
      {!problems ? (
        <p className="muted small">{error || 'Loading…'}</p>
      ) : (
        <>
          <div className="qc-step">
            <span className="qc-label">Problem</span>
            <div className="qc-problem">
              <select value={pick.problemId} onChange={(e) => { const p = problems.find((x) => x.id === e.target.value); set({ problemId: p.id, minutes: DEFAULT_MINUTES[p.difficulty] || 45 }) }} aria-label="Problem">
                {groups.map(([cat, ps]) => (
                  <optgroup key={cat} label={cat}>
                    {ps.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </optgroup>
                ))}
              </select>
              <button type="button" className="btn ghost small" onClick={random} title="Pick a problem for me">Random</button>
            </div>
            {problem && (
              <span className="muted small">
                <span className={`level-text ${problem.difficulty.toLowerCase()}`}>{LEVEL[problem.difficulty]}</span> · {problem.runnable ? 'Code with tests' : FORMAT_LABEL[problem.format]} · <Link to={`/problems/${problem.slug}`}>Read it</Link>
              </span>
            )}
          </div>

          {group ? (
            <div className="qc-step">
              <span className="qc-label">How</span>
              <p className="qc-note"><Icon name="swords" size={15} /> A race: everyone in the group answers on their own, with the same timer.</p>
            </div>
          ) : (
            <div className="qc-step">
            <span className="qc-label">How</span>
            <div className="qc-modes">
              {MODES.map((m) => (
                <button key={m.id} type="button" className={`qc-mode ${pick.mode === m.id ? 'on' : ''}`} onClick={() => set({ mode: m.id })} aria-pressed={pick.mode === m.id}>
                  <Icon name={m.icon} size={18} />
                  <b>{m.title}</b>
                  <span>{m.text}</span>
                </button>
              ))}
            </div>
          </div>

          )}
          <div className="qc-step">
            <span className="qc-label">Time</span>
            <div className="qc-chips">
              {TIMES.map((t) => (
                <button key={t} type="button" className={`chip-btn ${pick.minutes === t ? 'on' : ''}`} onClick={() => set({ minutes: t })}>{t} min</button>
              ))}
            </div>
          </div>

          {!fixedGroup && (
          <div className="qc-step">
            <span className="qc-label">Who</span>
            {(myGroups.length > 0 || friends.length > 0) && (
              <div className="qc-chips">
                {myGroups.map((g) => (
                  <button key={g.id} type="button" className={`chip-btn group ${pick.groupId === g.id ? 'on' : ''}`} onClick={() => toggleGroup(g.id)}>
                    <Icon name="users" size={14} /> {g.name} <span className="chip-count">{g.members.length}</span>
                  </button>
                ))}
                {friends.map((f) => (
                  <button key={f.id} type="button" className={`chip-btn person ${pick.invitees.includes(f.id) ? 'on' : ''}`} onClick={() => toggleFriend(f.id)}>
                    <Avatar user={f} size={20} /> {f.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}
            <span className="muted small">{group ? `Everyone in ${group.name} gets it.` : friends.length || myGroups.length ? 'Pick a group or friends, or just send the link to anyone.' : "You'll get a link to send to anyone."}</span>
          </div>
          )}

          {error && <p className="error small">{error}</p>}
          <button className="btn cta qc-go" disabled={busy || !problem} onClick={create}>
            {busy ? 'Creating…' : <>Create challenge <Icon name="arrow" size={15} /></>}
          </button>
        </>
      )}
    </div>
    {ticket}
    </div>
  )
}

/** What you're about to send, drawn as a ticket. Updates as you choose. */
function Ticket({ problem, mode, minutes, me, friends, group, ready }) {
  return (
    <div className={`ticket ${mode} ${ready ? 'ready' : ''}`} aria-hidden="true">
      <div className="ticket-top">
        <span className="ticket-tag">{group ? group.name : mode === 'independent' ? 'Race' : 'Together'}</span>
        <span className="ticket-time">{minutes}:00</span>
      </div>
      <span className="ticket-no">No. {String(problem.id).replace(/\D/g, '').slice(0, 4).padStart(4, '0')}</span>
      <b key={problem.id} className="ticket-title">{problem.title}</b>
      <span className="ticket-meta">{LEVEL[problem.difficulty]} · {problem.category}</span>
      <div className="ticket-vs">
        <span className="ticket-person"><Avatar user={me} size={36} /><small>You</small></span>
        <span className="ticket-x">{mode === 'independent' ? 'VS' : '+'}</span>
        {friends.length ? (
          <>
            {friends.slice(0, 3).map((f) => <span key={f.id} className="ticket-person"><Avatar user={f} size={36} /><small>{f.name.split(' ')[0]}</small></span>)}
            {friends.length > 3 && <span className="ticket-person"><span className="ticket-q">+{friends.length - 3}</span><small>more</small></span>}
          </>
        ) : (
          <span className="ticket-person"><span className="ticket-q">?</span><small>Your friend</small></span>
        )}
      </div>
      <div className="ticket-cut" />
      <div className="ticket-foot">{group ? (ready ? 'sent to the whole group' : 'goes to everyone in the group') : ready ? 'link ready, send it' : 'admit one (or a few)'}</div>
      {ready && <span className="ticket-stamp">SENT</span>}
    </div>
  )
}
