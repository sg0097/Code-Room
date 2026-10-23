import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import { prepApi } from '../features/prep/api'
import { experienceMeta } from '../features/experiences/api'
import { useAuth as useAuthCtx } from '../lib/auth'

export default function Profile() {
  const { logout } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    api.profile().then(setData).catch((e) => setError(e.message))
  }, [])
  if (!data) return <div className="center muted">{error || 'Loading…'}</div>
  const { user, stats } = data

  return (
    <div className="narrow profile-page">
      <div className="card profile">
        <Avatar user={user} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{user.name}</h1>
          <p className="profile-handle">@{user.username}</p>
          <p className="muted small" style={{ margin: 0 }}>
            Joined {new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            {user.email && <> · {user.email} <span className="private-tag" title="Nobody else can see or search your email">only you see this</span></>}
          </p>
        </div>
        <button className="btn ghost small" onClick={logout}>Sign out</button>
      </div>

      <div className="stat-grid">
        <div className="card"><b>{stats.completed}</b><span>Challenges done</span></div>
        <div className="card"><b>{stats.active}</b><span>In progress</span></div>
        <Link to="/friends" className="card"><b>{stats.friends}</b><span>Friends →</span></Link>
        <Link to="/my/problems" className="card"><b>✎</b><span>My problems →</span></Link>
      </div>

      <EmailForm email={user.email} onChanged={(email) => setData((d) => ({ ...d, user: { ...d.user, email } }))} />

      <UsernameForm current={user.username} onChanged={(username) => setData((d) => ({ ...d, user: { ...d.user, username } }))} />

      <PrepForm />
    </div>
  )
}

/** What you're preparing for. It drives the home page: problems to do next, countdown, experiences. */
function PrepForm() {
  const { hash } = useLocation()
  const ref = useRef(null)
  const [options, setOptions] = useState(null)
  const [form, setForm] = useState(null)
  const [companies, setCompanies] = useState([]) // suggestions, from the experiences we list
  const [typed, setTyped] = useState('')
  const [state, setState] = useState({ saving: false, saved: null, error: null })

  useEffect(() => {
    prepApi.get().then(({ profile, options }) => {
      setOptions(options)
      setForm({ ...profile, yoe: profile.yoe ?? '', interviewDate: profile.interviewDate || '', language: profile.language || '', role: profile.role || '' })
    }).catch((e) => setState((s) => ({ ...s, error: e.message })))
    experienceMeta().then((m) => setCompanies(m.facets.companies.slice(0, 300).map((c) => c.name))).catch(() => {})
  }, [])
  useEffect(() => {
    if (form && hash === '#prep') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [form, hash])

  if (!form) return <div className="card muted">{state.error || 'Loading your goals…'}</div>
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }))
    setState((s) => ({ ...s, saved: null, error: null }))
  }
  const addCompany = (name) => {
    const n = name.trim()
    if (!n || form.companies.some((c) => c.toLowerCase() === n.toLowerCase())) return setTyped('')
    if (form.companies.length >= options.limits.companies) return setState((s) => ({ ...s, error: `At most ${options.limits.companies} companies` }))
    set({ companies: [...form.companies, n] })
    setTyped('')
  }
  const toggleFocus = (c) => set({ focus: form.focus.includes(c) ? form.focus.filter((x) => x !== c) : [...form.focus, c] })

  async function save(e) {
    e.preventDefault()
    setState({ saving: true, saved: null, error: null })
    try {
      const pending = typed.trim() ? [...form.companies, typed.trim()] : form.companies
      const { profile } = await prepApi.save({ ...form, companies: pending })
      setForm({ ...profile, yoe: profile.yoe ?? '', interviewDate: profile.interviewDate || '', language: profile.language || '', role: profile.role || '' })
      setTyped('')
      setState({ saving: false, saved: new Date(), error: null })
    } catch (err) {
      setState({ saving: false, saved: null, error: err.message })
    }
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <form className="card prep" id="prep" ref={ref} onSubmit={save}>
      <div>
        <h2>Your goal</h2>
        <p className="muted small" style={{ margin: 0 }}>
          We use this to pick your problems. All optional.
        </p>
      </div>

      <div className="prep-grid">
        <label className="field">
          <span>Target role</span>
          <select value={form.role} onChange={(e) => set({ role: e.target.value })}>
            <option value="">Not sure yet</option>
            {options.roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Years of experience</span>
          <input type="number" min="0" max="40" placeholder="e.g. 2" value={form.yoe} onChange={(e) => set({ yoe: e.target.value })} />
        </label>
        <label className="field">
          <span>Interview date</span>
          <input type="date" min={today} value={form.interviewDate} onChange={(e) => set({ interviewDate: e.target.value })} />
        </label>
        <label className="field">
          <span>Code in</span>
          <select value={form.language} onChange={(e) => set({ language: e.target.value })}>
            <option value="">Problem default</option>
            {options.languages.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </label>
      </div>

      <div className="field">
        <span>Target companies</span>
        <div className="chip-input">
          {form.companies.map((c) => (
            <span key={c} className="chip">
              {c}
              <button type="button" aria-label={`Remove ${c}`} onClick={() => set({ companies: form.companies.filter((x) => x !== c) })}>×</button>
            </span>
          ))}
          <input
            list="prep-companies"
            placeholder={form.companies.length ? 'Add another' : 'Type a company and press Enter'}
            value={typed}
            onChange={(e) => {
              const v = e.target.value
              // Picking from the list fills the whole name at once: add it straight away.
              if (companies.includes(v)) addCompany(v)
              else setTyped(v)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addCompany(typed)
              } else if (e.key === 'Backspace' && !typed && form.companies.length) {
                set({ companies: form.companies.slice(0, -1) })
              }
            }}
          />
          <datalist id="prep-companies">{companies.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      </div>

      <div className="field">
        <span>Focus areas</span>
        <div className="pills">
          {options.categories.map((c) => (
            <button key={c} type="button" className={`pill ${form.focus.includes(c) ? 'on' : ''}`} onClick={() => toggleFocus(c)} aria-pressed={form.focus.includes(c)}>
              {form.focus.includes(c) ? '✓ ' : ''}{c}
            </button>
          ))}
        </div>
      </div>

      <div className="row wrap">
        <button className="btn" disabled={state.saving}>{state.saving ? 'Saving…' : 'Save goals'}</button>
        {state.saved && <span className="ok small">Saved. <Link to="/">See your home page →</Link></span>}
        {state.error && <span className="error small" style={{ margin: 0 }}>{state.error}</span>}
      </div>
    </form>
  )
}

/** Change your @username. */
function UsernameForm({ current, onChanged }) {
  const { setUser, user } = useAuthCtx()
  const [value, setValue] = useState(current || '')
  const [state, setState] = useState({ busy: false, msg: null, error: null })
  async function save(e) {
    e.preventDefault()
    setState({ busy: true })
    try {
      const { user: u } = await api.setUsername(value)
      setUser({ ...user, username: u.username })
      onChanged(u.username)
      setState({ busy: false, msg: 'Saved.' })
    } catch (err) {
      setState({ busy: false, error: err.message })
    }
  }
  return (
    <form className="card username-card" onSubmit={save}>
      <div>
        <h2>Username</h2>
        <p className="muted small" style={{ margin: 0 }}>Friends find you with this.</p>
      </div>
      <div className="row wrap">
        <div className="at-input"><span>@</span><input value={value} onChange={(e) => { setValue(e.target.value); setState({}) }} maxLength={21} aria-label="Username" /></div>
        <button className="btn ghost" disabled={state.busy || value.replace(/^@/, '').toLowerCase() === current}>Change</button>
        {state.msg && <span className="ok small">{state.msg}</span>}
        {state.error && <span className="error small" style={{ margin: 0 }}>{state.error}</span>}
      </div>
    </form>
  )
}

/** The email used to reset your password. Only you can see it. */
function EmailForm({ email, onChanged }) {
  const { setUser, user } = useAuthCtx()
  const [f, setF] = useState({ email: email || '', password: '' })
  const [state, setState] = useState({ busy: false, msg: null, error: null })
  async function save(e) {
    e.preventDefault()
    setState({ busy: true })
    try {
      const { user: u } = await api.setEmail(f.email, f.password)
      setUser({ ...user, email: u.email })
      onChanged(u.email)
      setF({ email: u.email, password: '' })
      setState({ busy: false, msg: 'Saved.' })
    } catch (err) {
      setState({ busy: false, error: err.message })
    }
  }
  return (
    <form className="card username-card" onSubmit={save}>
      <div>
        <h2>Email for password reset</h2>
        <p className="muted small" style={{ margin: 0 }}>
          {email ? 'We send a code here if you forget your password. Only you can see it.' : 'Add an email so you can reset your password if you forget it.'}
        </p>
      </div>
      <div className="row wrap">
        <input type="email" className="email-input" placeholder="you@example.com" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setState({}) }} required aria-label="Email" />
        <input type="password" className="email-input" placeholder="Your password" value={f.password} onChange={(e) => { setF({ ...f, password: e.target.value }); setState({}) }} required aria-label="Current password" autoComplete="current-password" />
        <button className="btn ghost" disabled={state.busy || !f.email || !f.password || f.email.toLowerCase() === (email || '').toLowerCase()}>{email ? 'Change' : 'Save email'}</button>
        {state.msg && <span className="ok small">{state.msg}</span>}
        {state.error && <span className="error small" style={{ margin: 0 }}>{state.error}</span>}
      </div>
    </form>
  )
}
