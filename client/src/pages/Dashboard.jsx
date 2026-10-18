import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api, colorFor } from '../lib/api'
import { MiniChallenge } from '../components/ChallengeCard'
import { Level, usePoll } from '../components/ui'
import Icon, { CategoryBadge } from '../components/Icon'
import { AreaBars, Heatmap } from '../components/Charts'
import HeroMockup from '../components/HeroMockup'
import { CountUp, Reveal } from '../components/motion'
import { prepApi } from '../features/prep/api'
import GoalCard from '../features/prep/GoalCard'
import QuickChallenge from '../features/challenge/QuickChallenge'
import { FORMAT_LABEL } from '../features/problems/shared'
import { sourceLabel, yoeLabel } from '../features/experiences/api'

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// Accepts a bare code ("X7K2PM") or a full pasted link (".../room/X7K2PM").
const parseCode = (input) => {
  const m = String(input).trim().match(/([A-Za-z0-9]{6})\/?$/)
  return m ? m[1].toUpperCase() : ''
}

/**
 * Home: your goal, then "challenge a friend" (the main thing), your challenges, what to
 * practice next and your progress.
 */
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { refreshBadges } = useOutletContext()
  const [list, setList] = useState(null)
  const [prep, setPrep] = useState(null)
  const [editGoal, setEditGoal] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const { challenges } = await api.challenges()
      setList(challenges)
    } catch (e) {
      setError(e.message)
    }
  }, [])
  const loadPrep = useCallback(() => prepApi.home().then(setPrep).catch((e) => setError(e.message)), [])
  useEffect(() => {
    load()
    loadPrep()
  }, [load, loadPrep])
  usePoll(load, 15_000)

  async function respond(c, action) {
    try {
      await api.challengeAction(c.id, action)
      refreshBadges()
      if (action === 'accept') navigate(`/challenges/${c.id}`)
      else load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (!list || !prep) return <div className="center muted">{error || 'Loading…'}</div>

  const open = (c) => ['INVITED', 'ACTIVE'].includes(c.status)
  const pending = list.filter((c) => open(c) && c.me.state === 'INVITED')
  const active = list.filter((c) => open(c) && !['INVITED', 'DECLINED'].includes(c.me.state) && !c.practice)
  const practicing = list.filter((c) => open(c) && c.practice && c.me.state !== 'SUBMITTED')
  const completed = list.filter((c) => c.status === 'COMPLETED').length
  const p = prep.profile
  const first = user.name.split(' ')[0]
  const top = prep.next[0]
  const goalLine = [
    p.role,
    p.companies.length ? p.companies.slice(0, 3).join(', ') + (p.companies.length > 3 ? ` +${p.companies.length - 3}` : '') : null,
    prep.daysLeft != null && `${prep.daysLeft} ${prep.daysLeft === 1 ? 'day' : 'days'} left`,
  ].filter(Boolean)

  return (
    <div className="home">
      <section className={`hero ${prep.setUp && !editGoal ? '' : 'editing'}`}>
        <div className="hero-main">
          <span className="kicker">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <h1>{greeting()}, {first}.</h1>
          {prep.setUp && !editGoal ? (
            <>
              <p className="hero-goal">
                {p.role || p.companies.length
                  ? <>Preparing for <mark>{[p.role, p.companies.length ? `at ${p.companies.slice(0, 3).join(', ')}${p.companies.length > 3 ? ` and ${p.companies.length - 3} more` : ''}` : ''].filter(Boolean).join(' ')}</mark>.</>
                  : 'You have not set a goal yet.'}{' '}
                <button className="text-btn" onClick={() => setEditGoal(true)}>edit</button>
              </p>
              <div className="row wrap">
                {top && <Link to={`/problems/${top.slug}`} className="btn">Next: {top.title} <Icon name="arrow" size={15} /></Link>}
                <Link to="/challenges/new" className="btn cta">Challenge a friend</Link>
              </div>
            </>
          ) : (
            <>
              <p className="hero-sub">{prep.setUp ? 'Update your goal.' : 'Answer 3 quick questions so we can suggest problems for you.'}</p>
              <div className="hero-goalcard">
                <GoalCard
                  profile={p}
                  onSaved={() => {
                    setEditGoal(false)
                    loadPrep()
                  }}
                  onCancel={prep.setUp ? () => setEditGoal(false) : null}
                />
              </div>
            </>
          )}
        </div>
        <div className="hero-side">
          {prep.setUp && !editGoal ? (
            <div className="tearoff" aria-label={prep.daysLeft != null ? `${prep.daysLeft} days to the interview` : `${prep.solved} of ${prep.total} solved`}>
              <span className="tearoff-top">{prep.daysLeft != null ? 'interview in' : 'solved so far'}</span>
              <b><CountUp value={prep.daysLeft != null ? prep.daysLeft : prep.solved} /></b>
              <span className="tearoff-unit">{prep.daysLeft != null ? (prep.daysLeft === 1 ? 'day' : 'days') : `of ${prep.total}`}</span>
            </div>
          ) : (
            <div className="margin-note">
              <span className="hand">you can change this later</span>
              <HeroMockup />
            </div>
          )}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <Reveal className="home-grid challenge-row">
        <section className="panel feature">
          <QuickChallenge onCreated={load} />
        </section>
        <aside className="panel">
          <h2 className="h2">Your challenges <Link to="/challenges" className="see-all small">All</Link></h2>
          {pending.length === 0 && active.length === 0 && (
            <p className="muted small">No challenges yet.</p>
          )}
          {pending.map((c) => (
            <MiniChallenge
              key={c.id}
              c={c}
              actions={
                <div className="row">
                  <button className="btn small" onClick={() => respond(c, 'accept')}>Accept</button>
                  <button className="btn ghost small" onClick={() => respond(c, 'decline')}>Decline</button>
                </div>
              }
            />
          ))}
          {active.slice(0, 5).map((c) => <MiniChallenge key={c.id} c={c} />)}
          <MyGroups />
          <JoinRoom onError={setError} />
        </aside>
      </Reveal>

      <Reveal as="section" className="stat-tiles">
        <Stat icon="check" tone="teal" value={`${prep.solved}/${prep.total}`} label="solved" />
        <Stat icon="flame" tone="coral" value={prep.streak} label="day streak" />
        <Stat icon="trophy" tone="amber" value={completed} label="challenges done" />
        <Stat icon="calendar" tone="blue" value={prep.activity.length} label="active days" />
      </Reveal>

      <Reveal className="home-grid">
        <section className="panel">
          <h2 className="h2">Suggested for you <Link to="/problems" className="see-all small">All problems</Link></h2>
          {practicing.length > 0 && (
            <div className="resume">
              {practicing.map((c) => (
                <Link key={c.id} to={`/challenges/${c.id}`} className="resume-row">
                  <Icon name="clock" size={15} /> Continue <b>{c.title}</b>
                </Link>
              ))}
            </div>
          )}
          {prep.next.length === 0 ? (
            <p className="muted small">You have solved all the problems.</p>
          ) : (
            <div className="next-list">
              {prep.next.map((n) => (
                <Link key={n.id} to={`/problems/${n.slug}`} className="next-card">
                  <div className="next-top">
                    <CategoryBadge category={n.category} size={32} />
                    <Level d={n.difficulty} />
                  </div>
                  <b>{n.title}</b>
                  <span className="muted small">{n.category} · {n.runnable ? 'Code with tests' : FORMAT_LABEL[n.format]}</span>
                  {n.why.length > 0 && <span className="next-why small">{n.why[0]}</span>}
                </Link>
              ))}
            </div>
          )}
        </section>
        <aside className="panel">
          <h2 className="h2">Progress</h2>
          <AreaBars rows={prep.progress} />
        </aside>
      </Reveal>

      <Reveal as="section" className="panel">
        <h2 className="h2">Your activity</h2>
        <Heatmap activity={prep.activity} weeks={52} />
      </Reveal>

      {prep.experiences.length > 0 && (
        <Reveal as="section" className="panel">
          <h2 className="h2">
            Interviews at {p.companies.slice(0, 2).join(' and ')}
            <Link to={`/experiences?company=${encodeURIComponent(p.companies[0])}`} className="see-all small">More</Link>
          </h2>
          <ul className="feed">
            {prep.experiences.map((e) => (
              <li key={e.id}>
                <span className="co-avatar" style={{ background: colorFor(e.company) }}>{e.company[0]}</span>
                <div>
                  <Link to={`/experiences/${e.id}`}>{e.title}</Link>
                  <span className="muted small">{[e.company, e.role !== 'Other' && e.role, yoeLabel(e.yoe), sourceLabel(e.source)].filter(Boolean).join(' · ')}</span>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      )}
    </div>
  )
}

function Stat({ icon, tone, value, label }) {
  return (
    <div className={`stat-tile tone-${tone}`}>
      <div>
        <b>{typeof value === 'string' && value.includes('/') ? <><CountUp value={value.split('/')[0]} />/{value.split('/')[1]}</> : <CountUp value={value} />}</b>
        <span className="muted small">{label}</span>
      </div>
    </div>
  )
}

/** Your groups, one tap away. */
function MyGroups() {
  const [groups, setGroups] = useState(null)
  useEffect(() => {
    api.groups().then((g) => setGroups(g.groups)).catch(() => setGroups([]))
  }, [])
  if (!groups) return null
  return (
    <div className="my-groups">
      <span className="muted small">Groups</span>
      <div className="qc-chips">
        {groups.slice(0, 6).map((g) => (
          <Link key={g.id} to={`/groups/${g.id}`} className="chip-btn group"><Icon name="users" size={14} /> {g.name} <span className="chip-count">{g.members.length}</span></Link>
        ))}
        <Link to="/groups" className="chip-btn">{groups.length ? 'All groups' : '+ Make a group'}</Link>
      </div>
    </div>
  )
}

/** Got a room code from a friend? */
function JoinRoom({ onError }) {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  async function openRoom() {
    try {
      const { code } = await api.createRoom()
      navigate(`/room/${code}`)
    } catch (e) {
      onError(e.message)
    }
  }
  return (
    <div className="join-room">
      <span className="muted small">Live room</span>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          const c = parseCode(code)
          if (c) navigate(`/room/${c}`)
          else onError('Enter a 6-letter room code or paste the room link')
        }}
      >
        <input placeholder="Room code or link" value={code} onChange={(e) => setCode(e.target.value)} className="small-input" />
        <button className="btn ghost small">Join</button>
      </form>
      <button className="link" onClick={openRoom}>Open a new room</button>
    </div>
  )
}
