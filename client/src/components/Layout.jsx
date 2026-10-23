import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api, request } from '../lib/api'
import { usePoll } from './ui'
import Avatar from './Avatar'
import Icon from './Icon'
import ErrorBoundary from './ErrorBoundary'

/**
 * App shell: a navy top bar (places, search, "Challenge a friend", your account), like the
 * big coding sites. On phones the places fold into a menu. Badges come from polling.
 */
export default function Layout() {
  const { user } = useAuth()
  const [badges, setBadges] = useState({ challenges: 0, friends: 0, review: 0 })
  const [menu, setMenu] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => {
    setMenu(false)
  }, [pathname])

  const refresh = useCallback(async () => {
    try {
      const [{ challenges }, friends, waiting] = await Promise.all([
        api.challenges(),
        api.friends(),
        user.isAdmin ? request('GET', '/api/admin/counts') : {},
      ])
      setBadges({
        challenges: challenges.filter((c) => c.me.state === 'INVITED' && ['INVITED', 'ACTIVE'].includes(c.status)).length,
        friends: friends.incoming.length,
        review: (waiting.problems || 0) + (waiting.solutions || 0) + (waiting.experiences || 0),
      })
    } catch {
      /* offline; try again next tick */
    }
  }, [user.isAdmin])
  useEffect(() => {
    refresh()
  }, [refresh])
  usePoll(refresh, 30_000)

  const link = (to, label, count, end) => (
    <NavLink to={to} end={end}>
      {label}
      {count > 0 && <span className="dot">{count}</span>}
    </NavLink>
  )

  return (
    <div className="shell">
      <header className="hr-nav">
        <div className="hr-nav-in">
          <button className="hr-burger" onClick={() => setMenu((m) => !m)} aria-label="Menu" aria-expanded={menu}><Icon name="menu" /></button>
          <Link to="/" className="hr-logo">
            CodeRoom<i>.</i>
          </Link>
          <nav className={`hr-links ${menu ? 'open' : ''}`}>
            {link('/', 'Home', 0, true)}
            {link('/problems', 'Problems')}
            {link('/experiences', 'Experiences')}
            {link('/challenges', 'Challenges', badges.challenges)}
            {link('/friends', 'Friends', badges.friends)}
            {link('/groups', 'Groups')}
            {user.isAdmin && link('/admin', 'Review', badges.review)}
          </nav>
          <GlobalSearch />
          <Link to="/challenges/new" className="btn small cta cta-nav hide-sm"><Icon name="swords" size={15} /> Challenge a friend</Link>
          <UserMenu user={user} />
        </div>
      </header>
      <main className="page">
        <ErrorBoundary resetKey={pathname}>
          <Outlet context={{ refreshBadges: refresh }} />
        </ErrorBoundary>
      </main>
    </div>
  )
}

/** One box for "what am I looking for": Enter searches interview experiences; ⌘K / Ctrl+K focuses it. */
function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const box = useRef(null)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        box.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <form
      className="hr-search"
      onSubmit={(e) => {
        e.preventDefault()
        if (q.trim()) navigate(`/experiences?q=${encodeURIComponent(q.trim())}`)
        box.current?.blur()
      }}
    >
      <Icon name="search" size={16} />
      <input ref={box} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search interviews: amazon sde 2" aria-label="Search interview experiences" />
    </form>
  )
}

function UserMenu({ user }) {
  const { logout } = useAuth()
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const { pathname } = useLocation()
  useEffect(() => {
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div className="menu" ref={box}>
      <button className="menu-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Your account">
        <Avatar user={user} size={32} />
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          <div className="menu-who">
            <b>{user.name}</b>
            <span className="muted small">@{user.username}</span>
          </div>
          <Link to="/profile" role="menuitem"><Icon name="target" size={16} /> Profile &amp; prep goals</Link>
          <Link to="/challenges/new" role="menuitem"><Icon name="swords" size={16} /> Challenge a friend</Link>
          <Link to="/my/problems" role="menuitem"><Icon name="pen" size={16} /> My problems</Link>
          <Link to="/my/experiences" role="menuitem"><Icon name="message" size={16} /> My experiences</Link>
          <button role="menuitem" onClick={logout}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      )}
    </div>
  )
}
