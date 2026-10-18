import { useEffect, useState } from 'react'
import { prepApi } from './api'
import { experienceMeta } from '../experiences/api'

const ROLES = ['Intern', 'SDE 1', 'SDE 2', 'SDE 3 / Senior', 'Frontend', 'Backend', 'Full stack', 'Data / ML']
// Shown until the experience data says which companies people search most.
const COMMON = ['Amazon', 'Google', 'Microsoft', 'Flipkart', 'Atlassian', 'Uber', 'Swiggy', 'Razorpay', 'Adobe', 'Goldman Sachs']
const WHEN = [['1 week', 7], ['2 weeks', 14], ['1 month', 30], ['3 months', 90], ['No date yet', null]]
const dayIn = (n) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const daysTo = (iso) => (iso ? Math.round((new Date(`${iso}T00:00:00`) - new Date(new Date().toDateString())) / 86_400_000) : null)

/**
 * Your goal in three taps: role, companies, when. Saves to the prep profile (the profile page
 * has the rest: years of experience, focus areas, language).
 */
export default function GoalCard({ profile, onSaved, onCancel }) {
  const [role, setRole] = useState(profile?.role || '')
  const [companies, setCompanies] = useState(profile?.companies || [])
  const [days, setDays] = useState(() => daysTo(profile?.interviewDate))
  const [typed, setTyped] = useState('')
  const [popular, setPopular] = useState(COMMON)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    experienceMeta().then((m) => m.facets.companies.length >= 6 && setPopular(m.facets.companies.slice(0, 12).map((c) => c.name))).catch(() => {})
  }, [])

  const toggle = (name) => {
    const has = companies.some((c) => c.toLowerCase() === name.toLowerCase())
    setCompanies(has ? companies.filter((c) => c.toLowerCase() !== name.toLowerCase()) : [...companies, name].slice(0, 8))
  }
  const add = () => {
    const n = typed.trim()
    if (n && !companies.some((c) => c.toLowerCase() === n.toLowerCase())) setCompanies([...companies, n].slice(0, 8))
    setTyped('')
  }
  const shown = [...new Set([...popular, ...companies])]

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const extra = typed.trim() ? [...companies, typed.trim()] : companies
      await prepApi.save({ ...profile, role: role || null, companies: extra, interviewDate: days == null ? null : dayIn(days) })
      onSaved?.()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="goal">
      <div className="goal-q">
        <b>1. Which role?</b>
        <div className="qc-chips">
          {ROLES.map((r) => (
            <button key={r} type="button" className={`chip-btn ${role === r ? 'on' : ''}`} onClick={() => setRole(role === r ? '' : r)}>{r}</button>
          ))}
        </div>
      </div>
      <div className="goal-q">
        <b>2. Which companies?</b>
        <div className="qc-chips">
          {shown.map((c) => (
            <button key={c} type="button" className={`chip-btn ${companies.some((x) => x.toLowerCase() === c.toLowerCase()) ? 'on' : ''}`} onClick={() => toggle(c)}>{c}</button>
          ))}
          <input
            className="chip-input-inline"
            placeholder="+ Add another"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            onBlur={add}
            aria-label="Add a company"
          />
        </div>
      </div>
      <div className="goal-q">
        <b>3. When is the interview?</b>
        <div className="qc-chips">
          {WHEN.map(([label, n]) => (
            <button key={label} type="button" className={`chip-btn ${(days == null && n == null) || (days != null && n != null && Math.abs(days - n) <= Math.max(2, n * 0.2)) ? 'on' : ''}`} onClick={() => setDays(n)}>{label}</button>
          ))}
        </div>
      </div>
      {error && <p className="error small">{error}</p>}
      <div className="row wrap">
        <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save my goal'}</button>
        {onCancel && <button className="btn ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  )
}
