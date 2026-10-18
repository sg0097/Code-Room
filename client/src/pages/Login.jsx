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
            <span className="muted small">{invite.title} · {invite.mode === 'independent' ? 'Compete' : 'Together'} · {invite.timeLimitMin} min</span>
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
          <span className="kicker">Interview practice</span>
          <h1>Practice interviews <mark>with your friends</mark>.</h1>
          <p className="lead">
            Pick a real interview problem. Send it to a friend. Solve it at the same time, then compare your answers.
          </p>
          {signIn}
        </div>
        <div className="landing-art">
          <span className="hand note-race">this is a live room ↓</span>
          <div className="taped"><HeroMockup /></div>
          {counts?.experiences > 0 && (
            <span className="sticky">{counts.experiences.toLocaleString()} real interview experiences from {counts.companies.toLocaleString()} companies</span>
          )}
        </div>
      </section>

      {counts && (
        <p className="ledger">
          <span><b>{counts.problems}</b> problems</span>
          {counts.experiences > 0 && <span><b>{counts.experiences.toLocaleString()}</b> interview experiences</span>}
          <span><b>2</b> ways: compete or solve together</span>
          <span><b>100%</b> free</span>
        </p>
      )}

      <section className="how-paper">
        <h2>How it works</h2>
        <ol className="ruled">
          <li><b>Pick a problem.</b> System design, LLD, backend or coding.</li>
          <li><b>Send the link.</b> Your friend opens it and joins.</li>
          <li><b>Solve and compare.</b> You both get the same time. Then you see each other's answers.</li>
        </ol>
        <span className="hand note-how">you can also make a group</span>
      </section>

      <footer className="landing-foot">CodeRoom</footer>
    </div>
  )
}
