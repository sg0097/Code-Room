import { useCallback, useState } from 'react'
import { RUNNABLE, runTests } from '../lib/runner'
import { showInput, showValue } from '../lib/runner/harness'

/**
 * Runs code against a problem's tests in the browser. `run(kind)`: 'run' = sample tests,
 * 'submit' = samples + hidden. The outcome is plain JSON, so a room can share it with everyone.
 */
export function useTestRunner(spec) {
  const [outcome, setOutcome] = useState(null)
  const [status, setStatus] = useState(null) // null | 'loading' | 'running'
  const run = useCallback(async (kind, language, source) => {
    if (!spec || status) return null
    const cases = kind === 'submit' ? [...spec.samples, ...spec.hidden] : spec.samples
    setStatus('running')
    const out = await runTests({ language, source, spec, cases, onStatus: setStatus })
    const result = { kind, language, at: Date.now(), samples: spec.samples.length, ...out }
    setOutcome(result)
    setStatus(null)
    return result
  }, [spec, status])
  return { outcome, setOutcome, status, run }
}

export const summarize = (o) => {
  if (!o?.results) return null
  const passed = o.results.filter((r) => r.pass).length
  return { passed, total: o.results.length, all: passed === o.results.length }
}

/**
 * HackerRank-style results: test cases down the side, input / your output / expected on the right.
 * Before any run it shows the sample cases. Hidden cases show only pass / fail.
 */
export default function TestPanel({ spec, outcome, status, language, onRun, onSubmit, by, height }) {
  const [pick, setPick] = useState(0)
  if (!spec) return null
  const runnable = RUNNABLE.includes(language)
  const cases = outcome?.kind === 'submit' ? [...spec.samples, ...spec.hidden] : spec.samples
  const results = outcome?.results
  const sum = summarize(outcome)
  const i = Math.min(pick, cases.length - 1)
  const c = cases[i]
  const r = results?.[i]
  const hidden = i >= spec.samples.length

  return (
    <div className="tp" style={height ? { height } : undefined}>
      <div className="tp-bar">
        <b className="tp-title">{outcome ? (outcome.kind === 'submit' ? 'All tests' : 'Sample tests') : 'Test cases'}</b>
        {status === 'loading' && <span className="tp-chip wait">Loading Python…</span>}
        {status === 'running' && <span className="tp-chip wait">Running…</span>}
        {!status && outcome?.error && <span className="tp-chip bad">✗ {outcome.error.startsWith('Time limit') ? 'Time limit exceeded' : 'Error'}</span>}
        {!status && sum && (
          <span className={`tp-chip ${sum.all ? 'good' : 'bad'}`}>
            {sum.all ? '✓' : '✗'} {sum.passed}/{sum.total} passed{outcome.ms != null ? ` · ${outcome.ms} ms` : ''}
          </span>
        )}
        {by && outcome && <span className="muted small">run by {by}</span>}
        <span className="tp-actions">
          {!runnable && <span className="muted small">Switch to Python or JavaScript to run tests</span>}
          <button className="btn ghost small" disabled={!runnable || !!status} onClick={onRun} title="Run the sample tests (Ctrl+')">▶ Run code</button>
          {onSubmit && <button className="btn small" disabled={!runnable || !!status} onClick={onSubmit} title="Run every test, including hidden ones">Run all tests</button>}
        </span>
      </div>

      {outcome?.error ? (
        <pre className="tp-error">{outcome.error}</pre>
      ) : (
        <div className="tp-body">
          <ul className="tp-cases">
            {cases.map((x, k) => {
              const res = results?.[k]
              const isHidden = k >= spec.samples.length
              return (
                <li key={k}>
                  <button className={`tp-case ${k === i ? 'on' : ''} ${res ? (res.pass ? 'pass' : 'fail') : ''}`} onClick={() => setPick(k)}>
                    <span className="tp-mark">{res ? (res.pass ? '✓' : '✗') : '○'}</span>
                    {isHidden ? `Hidden ${k - spec.samples.length + 1}` : `Sample ${k + 1}`}
                    {isHidden && <span className="tp-lock" title="Hidden test: input not shown">hidden</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="tp-detail">
            {hidden ? (
              <p className="muted small">
                Hidden test. The input isn't shown.
                {r && (r.pass ? ' It passed.' : ' It failed. Try edge cases like empty input or very large values.')}
              </p>
            ) : (
              <>
                <Block label="Input" text={showInput(spec, c)} />
                {r && <Block label="Your output" text={r.error ? '—' : showValue(r.actual)} tone={r.pass ? 'good' : 'bad'} />}
                <Block label="Expected output" text={showValue(c.expected)} />
              </>
            )}
            {r?.error && <Block label="Error" text={r.error} tone="bad" />}
            {r?.stdout && !hidden && <Block label="Console output" text={r.stdout} />}
            {r && <span className="muted small">{r.ms} ms</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function Block({ label, text, tone }) {
  return (
    <div className="tp-block">
      <span className="tp-label">{label}</span>
      <pre className={tone ? `tp-${tone}` : ''}>{text}</pre>
    </div>
  )
}
