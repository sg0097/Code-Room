import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'

/** Live "is this username free?" while typing (after a short pause). */
function useUsernameCheck(value) {
  const [state, setState] = useState(null) // null | { checking } | { available, reason }
  useEffect(() => {
    const v = value.trim()
    if (v.replace(/^@/, '').length < 3) return setState(null)
    setState({ checking: true })
    const t = setTimeout(() => {
      api.usernameAvailable(v).then(setState).catch(() => setState(null))
    }, 350)
    return () => clearTimeout(t)
  }, [value])
  return state
}

function UsernameHint({ check }) {
  if (!check) return <span className="field-hint small muted">Use letters, numbers, _ or . Friends will find you with this.</span>
  if (check.checking) return <span className="field-hint small muted">Checking…</span>
  return check.available
    ? <span className="field-hint small ok">✓ @{check.username} is free</span>
    : <span className="field-hint small error">{check.reason}</span>
}

export function SignInForm({ onDone, onForgot }) {
  const { setUser, config } = useAuth()
  const [f, setF] = useState({ identifier: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.login(f.identifier, f.password)
      setUser(user)
      onDone?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field">
        <span>Username or email</span>
        <input autoComplete="username" value={f.identifier} onChange={(e) => setF({ ...f, identifier: e.target.value })} placeholder="@asha or asha@example.com" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      </label>
      {error && <p className="error small">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      {config?.passwordReset && onForgot && <button type="button" className="text-btn forgot-link" onClick={() => onForgot(f.identifier)}>Forgot password?</button>}
    </form>
  )
}

/**
 * Forgot password: say who you are, get a 6-digit code by email, then type it with a new password.
 * The reply for step 1 is the same whether or not the account exists.
 */
export function ForgotPassword({ start = '', onDone, onBack }) {
  const { setUser } = useAuth()
  const [step, setStep] = useState('ask') // 'ask' | 'code'
  const [id, setId] = useState(start)
  const [f, setF] = useState({ code: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [wait, setWait] = useState(0) // seconds until "send again" works

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function ask(e) {
    e?.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.forgotPassword(id)
      setStep('code')
      setWait(60)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  async function reset(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.resetPassword(id, f.code, f.password)
      setUser(user)
      onDone?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (step === 'ask') {
    return (
      <form className="auth-form" onSubmit={ask}>
        <p className="muted small" style={{ margin: 0 }}>Enter your username or email. We'll email you a 6-digit code.</p>
        <label className="field">
          <span>Username or email</span>
          <input autoFocus autoComplete="username" value={id} onChange={(e) => setId(e.target.value)} placeholder="@asha or asha@example.com" required />
        </label>
        {error && <p className="error small">{error}</p>}
        <button className="btn" disabled={busy || !id.trim()}>{busy ? 'Sending…' : 'Send code'}</button>
        <button type="button" className="text-btn forgot-link" onClick={onBack}>Back to sign in</button>
      </form>
    )
  }
  return (
    <form className="auth-form" onSubmit={reset}>
      <p className="muted small" style={{ margin: 0 }}>If that account exists, we sent a 6-digit code to its email. It works for 10 minutes.</p>
      <label className="field">
        <span>6-digit code</span>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} className="otp-input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/[^\d ]/g, '') })} placeholder="000000" required />
      </label>
      <label className="field">
        <span>New password</span>
        <input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} placeholder="At least 8 characters" required minLength={8} />
      </label>
      {error && <p className="error small">{error}</p>}
      <button className="btn" disabled={busy || f.code.replace(/\s/g, '').length !== 6}>{busy ? 'Saving…' : 'Set new password'}</button>
      <div className="row between">
        <button type="button" className="text-btn forgot-link" disabled={wait > 0 || busy} onClick={ask}>{wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}</button>
        <button type="button" className="text-btn forgot-link" onClick={onBack}>Back to sign in</button>
      </div>
    </form>
  )
}

export function SignUpForm({ onDone }) {
  const { setUser } = useAuth()
  const [f, setF] = useState({ name: '', username: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const check = useUsernameCheck(f.username)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.signup(f)
      setUser(user)
      onDone?.()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field">
        <span>Your name</span>
        <input autoComplete="name" value={f.name} onChange={set('name')} placeholder="Full name" required maxLength={60} />
      </label>
      <label className="field">
        <span>Username</span>
        <div className="at-input"><span>@</span><input autoComplete="username" value={f.username} onChange={set('username')} placeholder="asha_rao" required maxLength={21} /></div>
        <UsernameHint check={check} />
      </label>
      <label className="field">
        <span>Email <span className="muted">(only used to reset your password)</span></span>
        <input type="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="you@example.com" required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} placeholder="At least 8 characters" required minLength={8} />
      </label>
      {error && <p className="error small">{error}</p>}
      <button className="btn" disabled={busy || check?.available === false}>{busy ? 'Creating…' : 'Create account'}</button>
    </form>
  )
}

/** First sign-in with Google: pick the @username people will know you by. */
export function PickUsername() {
  const { user, setUser, logout } = useAuth()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const check = useUsernameCheck(value)
  useEffect(() => {
    api.usernameSuggestion().then((r) => setValue((v) => v || r.username)).catch(() => {})
  }, [])
  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user: u } = await api.setUsername(value)
      setUser(u)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <div className="center">
      <form className="card join-card" onSubmit={save}>
        <h2>Choose a username</h2>
        <p className="muted">Hi {user.name.split(' ')[0]}! Friends will find you with your username. Your email stays private.</p>
        <label className="field">
          <span>Username</span>
          <div className="at-input"><span>@</span><input autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={21} aria-label="Username" /></div>
          <UsernameHint check={check} />
        </label>
        {error && <p className="error small">{error}</p>}
        <div className="row wrap">
          <button className="btn" disabled={busy || check?.available === false}>{busy ? 'Saving…' : 'Continue'}</button>
          <button type="button" className="btn ghost" onClick={logout}>Sign out</button>
        </div>
      </form>
    </div>
  )
}
