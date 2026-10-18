import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'
import Avatar from '../components/Avatar'
import HeroMockup from '../components/HeroMockup'
import { SignInForm, SignUpForm } from '../features/account/AccountForms'

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = resolve
    s.onerror = () => reject(new Error('Could not load Google sign-in'))
    document.head.appendChild(s)
  })
}

export default function Login({ from: fromProp, invite } = {}) {
  const { user, config, setUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = fromProp || location.state?.from || '/'
  const googleBtn = useRef(null)
  const [error, setError] = useState(null)
  const [devName, setDevName] = useState('')
  const [tab, setTab] = useState(invite ? 'signup' : 'signin')
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    fetch('/api/landing').then((r) => (r.ok ? r.json() : null)).then(setCounts).catch(() => {})
  }, [])

  useEffect(() => {
    if (user || !config?.googleClientId) return
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        if (cancelled) return
        window.google.accounts.id.initialize({
          client_id: config.googleClientId,
          callback: async ({ credential }) => {
            try {
              const { user } = await api.googleLogin(credential)
              setUser(user)
              navigate(from, { replace: true })
            } catch (e) {
              setError(e.message)
            }
          },
        })
        window.google.accounts.id.renderButton(googleBtn.current, { theme: 'filled_black', size: 'large', shape: 'pill', width: 280 })
      })
      .catch((e) => setError(e.message))
    return () => {
      cancelled = true
    }
  }, [user, config, from, navigate, setUser])

  if (user) return <Navigate to={from} replace />

  async function devLogin(e) {
    e.preventDefault()
    try {
      const { user } = await api.devLogin(devName)
      setUser(user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message)
    }
  }

  const signIn = (
    <div className="card login" id="signin">
      {invite ? (
        <div className="login-invite">
          <Avatar user={invite.creator} size={40} />
          <div>
            <b>{invite.creator.name} challenged you</b>
            <span className="muted small">{invite.title} · {invite.mode === 'independent' ? 'Race' : 'Together'} · {invite.timeLimitMin} min</span>
          </div>
        </div>
      ) : null}
      <div className="auth-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'signin'} className={tab === 'signin' ? 'on' : ''} onClick={() => setTab('signin')}>Sign in</button>
        <button type="button" role="tab" aria-selected={tab === 'signup'} className={tab === 'signup' ? 'on' : ''} onClick={() => setTab('signup')}>Create account</button>
      </div>
      {tab === 'signin' ? <SignInForm onDone={() => navigate(from, { replace: true })} /> : <SignUpForm onDone={() => navigate(from, { replace: true })} />}

      {config?.googleClientId && (
        <>
          <div className="divider"><span>or</span></div>
          <div ref={googleBtn} className="google-btn" />
        </>
      )}

      {config?.devLogin && (
        <form onSubmit={devLogin} className="dev-login">
          <div className="divider"><span>dev login</span></div>
          <input placeholder="Your name" value={devName} onChange={(e) => setDevName(e.target.value)} maxLength={40} />
          <button className="btn" disabled={!devName.trim()}>Continue</button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  )

  return (
    <div className="landing">
      <header className="landing-top">
        <span className="brand">CodeRoom<i>.</i></span>
        {!invite && <a href="#signin" className="btn ghost small">Sign in</a>}
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <span className="kicker">for anyone with an interview coming up</span>
          <h1>Interview prep is better <mark>with a friend</mark>.</h1>
          <p className="lead">
            Pick a real interview problem and send it to a friend. You both solve it on the same clock, then put your answers
            side by side and argue about them. That's the part where you actually learn.
          </p>
          {signIn}
        </div>
        <div className="landing-art">
          <span className="hand note-race">a race, mid-way through ↓</span>
          <div className="taped"><HeroMockup /></div>
          {counts?.experiences > 0 && (
            <span className="sticky">{counts.experiences.toLocaleString()} real interviews from {counts.companies.toLocaleString()} companies. We link to them, we don't copy them.</span>
          )}
        </div>
      </section>

      {counts && (
        <p className="ledger">
          <span><b>{counts.problems}</b> problems</span>
          {counts.experiences > 0 && <span><b>{counts.experiences.toLocaleString()}</b> interview write-ups</span>}
          <span><b>2</b> ways to play: race or together</span>
          <span><b>0</b> servers running your code (it runs in your browser)</span>
        </p>
      )}

      <section className="how-paper">
        <h2>How it works</h2>
        <ol className="ruled">
          <li><b>Pick a problem.</b> System design, low-level design, backend, or plain code with tests.</li>
          <li><b>Send the link.</b> Your friend clicks it, signs in, and they're in. No setup.</li>
          <li><b>Solve, then compare.</b> Same problem, same timer. Afterwards you see both answers and talk about where you differed.</li>
        </ol>
        <span className="hand note-how">or make a group and race all of them</span>
      </section>

      <footer className="landing-foot">CodeRoom. Made for practising out loud.</footer>
    </div>
  )
}
