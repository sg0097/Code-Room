import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Challenges from './pages/Challenges'
import NewChallenge from './pages/NewChallenge'
import CustomChallenge from './pages/CustomChallenge'
import JoinPage from './pages/JoinPage'
import GroupsPage from './features/groups/GroupsPage'
import GroupPage from './features/groups/GroupPage'
import { PickUsername } from './features/account/AccountForms'
import Friends from './pages/Friends'
import Profile from './pages/Profile'
import ProblemsPage from './features/problems/ProblemsPage'
import ProblemPage from './features/problems/ProblemPage'
import SubmitProblemPage from './features/problems/SubmitProblemPage'
import MyProblemsPage from './features/problems/MyProblemsPage'
import ExperiencesPage from './features/experiences/ExperiencesPage'
import ExperiencePage from './features/experiences/ExperiencePage'
import ShareExperiencePage from './features/experiences/ShareExperiencePage'
import MyExperiencesPage from './features/experiences/MyExperiencesPage'

// These pull in Monaco (~280 KB gzipped), so load them only when needed.
const Room = lazy(() => import('./pages/Room'))
const Challenge = lazy(() => import('./pages/Challenge'))
const AdminPage = lazy(() => import('./features/admin/AdminPage'))

function RequireAuth({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  // Everyone has a public @username; first-time Google sign-ins pick one here.
  if (!user.username) return <PickUsername />
  return children
}

const Lazy = ({ children }) => <Suspense fallback={<div className="center muted">Loading…</div>}>{children}</Suspense>

export default function App() {
  const { loading, error } = useAuth()
  if (loading) return <div className="center muted">Loading…</div>
  if (error) return <div className="center error">Can't reach the server: {error}</div>

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/challenges" element={<Challenges />} />
        <Route path="/challenges/new" element={<NewChallenge />} />
        <Route path="/challenges/custom" element={<CustomChallenge />} />
        <Route path="/challenges/:id" element={<Lazy><Challenge /></Lazy>} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/groups" element={<GroupsPage />} />
        <Route path="/groups/:id" element={<GroupPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/problems" element={<ProblemsPage />} />
        <Route path="/problems/submit" element={<SubmitProblemPage />} />
        <Route path="/problems/:slug" element={<ProblemPage />} />
        <Route path="/my/problems" element={<MyProblemsPage />} />
        <Route path="/experiences" element={<ExperiencesPage />} />
        <Route path="/experiences/share" element={<ShareExperiencePage />} />
        <Route path="/experiences/:id" element={<ExperiencePage />} />
        <Route path="/my/experiences" element={<MyExperiencesPage />} />
        <Route path="/admin" element={<Lazy><AdminPage /></Lazy>} />
      </Route>
      <Route path="/room/:code" element={<RequireAuth><Lazy><Room /></Lazy></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
