import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { api, syncClock } from '../lib/api'
import { useRoomSync } from '../lib/useRoomSync'
import { useVideo } from '../lib/useVideo'
import CodeEditor from '../components/CodeEditor'
import CollabProjectEditor from '../components/project/CollabProjectEditor'
import { CollabWhiteboard } from '../components/whiteboard'
import ProblemPanel from '../components/ProblemPanel'
import ChallengeRoomPanel from '../components/ChallengeRoomPanel'
import VideoGrid from '../components/VideoGrid'
import Avatar from '../components/Avatar'
import TestPanel, { useTestRunner } from '../components/TestPanel'
import { sourceFor } from '../lib/runner'

function RoomError({ title, text, link = '/', linkText = 'Back to dashboard' }) {
  return (
    <div className="center">
      <div className="card login">
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        <Link className="btn" to={link}>{linkText}</Link>
      </div>
    </div>
  )
}

export default function Room() {
  const { code: rawCode } = useParams()
  const code = rawCode.toUpperCase()
  const { user, config, meta: catalogMeta } = useAuth()
  const navigate = useNavigate()
  const [check, setCheck] = useState({ state: 'checking' })
  const [catalog, setCatalog] = useState({ problems: [], languages: [] })
  const [copied, setCopied] = useState(false)
  const [field, setField] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([api.getRoom(code), api.problems()])
      .then(([room, cat]) => {
        if (!alive) return
        syncClock(room.serverNow)
        setCatalog(cat)
        if (room.canEnter) setCheck({ state: 'ok', room })
        else setCheck({ state: room.reason, room })
      })
      .catch((e) => alive && setCheck({ state: e.status === 404 ? 'notfound' : 'error', message: e.message }))
    return () => {
      alive = false
    }
  }, [code])

  const ok = check.state === 'ok'
  const { sync, status, meta, participants } = useRoomSync(code, user, ok)
  const video = useVideo(code, config.iceServers, ok)
  const challenge = check.room?.challenge

  // Tests for what's on screen: the quick room's problem, or a library coding challenge's code field.
  // Whoever presses Run runs it in their own browser; the result goes into the room's Yjs doc,
  // so everyone sees the same output.
  const roomProblemId = meta.problemId || catalog.problems[0]?.id
  const testField = challenge && (challenge.fields.find((f) => f.key === field) || challenge.fields[0])
  const testSpec = challenge ? (testField?.kind === 'project' ? challenge.tests : null) : field === 'whiteboard' ? null : catalog.problems.find((p) => p.id === roomProblemId)?.tests || null
  const runKey = challenge ? `field:${testField?.key}` : roomProblemId
  const runner = useTestRunner(testSpec)
  const [shared, setShared] = useState(null)
  useEffect(() => {
    if (!sync || !runKey) return
    const runs = sync.doc.getMap('runs')
    const read = () => setShared(runs.get(runKey) || null)
    read()
    runs.observe(read)
    return () => runs.unobserve(read)
  }, [sync, runKey])
  const lang = meta.language || 'javascript'
  async function runCode(kind) {
    if (!sync || !testSpec) return
    let source
    if (challenge) {
      const files = [...sync.doc.getMap(`files:${testField.key}`).entries()].map(([path, t]) => ({ path, content: t.toString() }))
      source = sourceFor(lang, files)
    } else {
      source = sync.doc.getText(`code:${roomProblemId}:${lang}`).toString()
    }
    const out = await runner.run(kind, lang, source)
    if (out) sync.doc.getMap('runs').set(runKey, { ...out, by: user.name })
  }
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "'") {
        e.preventDefault()
        runCode('run')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Tell others whether my mic/camera is on (shown on my video card).
  useEffect(() => {
    sync?.awareness.setLocalStateField('media', { mic: video.mic, cam: video.cam })
  }, [sync, video.mic, video.cam])

  // If we lose the connection for a while, check whether the room still exists,
  // instead of showing "Reconnecting…" forever after it expired or was deleted.
  useEffect(() => {
    if (!ok || status === 'connected') return
    const t = setTimeout(() => {
      api.getRoom(code).catch((e) => e.status === 404 && setCheck({ state: 'ended' }))
    }, 5000)
    return () => clearTimeout(t)
  }, [ok, status, code])

  // While a challenge room waits for the other person to accept, refresh its status
  // so the "Start timer" button unlocks without a page reload.
  const waitingForAccept = ok && challenge?.status === 'INVITED'
  useEffect(() => {
    if (!waitingForAccept) return
    const t = setInterval(() => {
      api.getRoom(code).then((room) => setCheck((c) => (c.state === 'ok' ? { ...c, room } : c))).catch(() => {})
    }, 5000)
    return () => clearInterval(t)
  }, [waitingForAccept, code])

  // Collaborative challenge submitted (by anyone, or by the timer): go to the result.
  useEffect(() => {
    if (challenge && meta.submitted) {
      const t = setTimeout(() => navigate(`/challenges/${challenge.id}`), 1500)
      return () => clearTimeout(t)
    }
  }, [challenge, meta.submitted, navigate])

  const s = check.state
  if (s === 'checking') return <div className="center muted">Joining room…</div>
  if (s === 'notfound') return <RoomError title="Room not found" text={`There's no room with code ${code}. Quick rooms expire 30 minutes after everyone leaves.`} />
  if (s === 'ended') return <RoomError title="This room has ended" text="It expired or was closed while you were disconnected." />
  if (s === 'full') return <RoomError title="This room is full" text={`Room ${code} already has ${check.room.max} people.`} />
  if (s === 'not-accepted') return <RoomError title="Accept the challenge first" text="This room belongs to a challenge you haven't accepted yet." link={`/challenges/${challenge.id}`} linkText="Open the challenge" />
  if (s === 'not-participant') return <RoomError title="Private room" text="This room belongs to a challenge you're not part of." />
  if (s === 'declined' || s === 'cancelled') return <RoomError title="Room closed" text={`This challenge was ${s}.`} />
  if (s === 'error') return <RoomError title="Something went wrong" text={check.message} />
  if (challenge?.status === 'COMPLETED') {
    return <RoomError title="Already submitted" text="This challenge is complete." link={`/challenges/${challenge.id}`} linkText="See the result" />
  }

  const roomName = meta.roomName || check.room.name
  const language = meta.language || 'javascript'

  // Which shared text the editor shows: a problem's code (quick room) or an answer field (challenge).
  let textKey, editorLanguage, fields
  if (challenge) {
    fields = challenge.fields
    const current = fields.find((f) => f.key === field) || fields[0]
    textKey = `field:${current.key}`
    editorLanguage = 'markdown'
  } else {
    const problemId = meta.problemId || catalog.problems[0]?.id
    textKey = problemId && `code:${problemId}:${language}`
    editorLanguage = language
  }
  const currentField = fields?.find((f) => f.key === field) || fields?.[0]
  // Whiteboard: a challenge's diagram field, or the quick room's Whiteboard tab.
  const showWhiteboard = challenge ? currentField?.kind === 'diagram' : field === 'whiteboard'
  const showProject = !!challenge && currentField?.kind === 'project'
  const showLanguage = !showWhiteboard && (!challenge || showProject)
  const languages = challenge ? catalogMeta.languages : catalog.languages

  async function copyLink() {
    await navigator.clipboard?.writeText(`${location.origin}/room/${code}`).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="room">
      <header className="topbar">
        <div className="row">
          <Link to="/" className="logo small"><span className="logo-mark">{'</>'}</span></Link>
          <strong>{roomName}</strong>
          {!challenge && (
            <button className="code-chip" onClick={copyLink} title="Copy invite link">
              {code} <span>{copied ? '✓ Copied' : 'Copy link'}</span>
            </button>
          )}
          {status !== 'connected' && <span className="status warn">Reconnecting…</span>}
        </div>
        <div className="row">
          <div className="people" title={participants.map((p) => p.name).join(', ')}>
            {participants.map((p) => (
              <div key={p.id} className="person" style={{ borderColor: p.color }}>
                <Avatar user={p} size={26} />
              </div>
            ))}
            <span className="muted small">{participants.length}/5</span>
          </div>
          <button className="btn danger small" onClick={() => navigate(challenge ? `/challenges/${challenge.id}` : '/')}>Leave</button>
        </div>
      </header>

      {challenge && meta.submitted && <div className="banner">✓ Team answer submitted. Opening the result…</div>}

      <div className="room-body">
        {challenge ? (
          <ChallengeRoomPanel
            challenge={challenge}
            deadlineAt={meta.deadlineAt || challenge.deadlineAt}
            submitted={!!meta.submitted}
            everyoneHere={participants.length > 1}
          />
        ) : (
          <ProblemPanel problems={catalog.problems} problemId={meta.problemId || catalog.problems[0]?.id} onSelect={(id) => sync?.metaMap.set('problemId', id)} />
        )}

        <section className="editor-wrap">
          <div className="editor-bar">
            <div className="field-tabs">
              {challenge
                ? fields.map((f) => (
                    <button key={f.key} className={`tab ${currentField.key === f.key ? 'on' : ''}`} onClick={() => setField(f.key)}>
                      {f.kind === 'diagram' ? '✎ ' : ''}
                      {f.label}
                    </button>
                  ))
                : [
                    ['code', 'Code'],
                    ['whiteboard', 'Whiteboard'],
                  ].map(([key, label]) => (
                    <button key={key} className={`tab ${(field || 'code') === key ? 'on' : ''}`} onClick={() => setField(key)}>
                      {label}
                    </button>
                  ))}
            </div>
            {showLanguage && (
              <select value={language} onChange={(e) => sync?.metaMap.set('language', e.target.value)}>
                {languages.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            )}
            {!challenge && !showWhiteboard && <span className="muted small">Everyone edits the same code. Switching problem or language switches it for the whole room.</span>}
            {showWhiteboard && <span className="muted small">Everyone draws on the same board. It's saved automatically.</span>}
          </div>
          {challenge && (currentField?.prompts || currentField?.placeholder) && !showWhiteboard && !showProject && (
            <div className="field-hint muted small">{currentField.prompts ? `Cover: ${currentField.prompts.join(' · ')}` : currentField.placeholder.split('\n')[0]}</div>
          )}
          {showWhiteboard ? (
            sync && <CollabWhiteboard doc={sync.doc} awareness={sync.awareness} readOnly={!!meta.submitted} />
          ) : showProject ? (
            sync && <CollabProjectEditor key={currentField.key} sync={sync} field={currentField.key} language={language} participants={participants} readOnly={!!meta.submitted} />
          ) : (
            <CodeEditor sync={sync} textKey={textKey} language={editorLanguage} participants={participants} readOnly={!!meta.submitted} />
          )}
          {testSpec && !showWhiteboard && (
            <TestPanel
              spec={testSpec}
              outcome={shared}
              status={runner.status}
              language={language}
              by={shared?.by}
              onRun={() => runCode('run')}
              onSubmit={() => runCode('submit')}
            />
          )}
        </section>

        <VideoGrid me={user} video={video} participants={participants} />
      </div>
    </div>
  )
}
