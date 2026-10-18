// Run code against test cases in the browser: free, nothing runs on the server.
//   JavaScript: a fresh Web Worker per run.
//   Python: one Pyodide worker, kept warm after the first load (~10 MB, cached by the browser).
// Too slow (an infinite loop, say): the worker is killed and the run reports a time limit.
import { RUNNABLE, grade, jsSource } from './harness'

export { RUNNABLE }
const LIMIT_MS = { javascript: 5000, python: 10000 }
let pyWorker = null
let pyReady = false

const makeJs = () => new Worker(new URL('./js.worker.js', import.meta.url), { type: 'module' })
const makePy = () => new Worker(new URL('./py.worker.js', import.meta.url), { type: 'module' })

/** The code to run for a project's files in one language (main file last for Python). */
export function sourceFor(language, files) {
  const ext = language === 'python' ? /\.py$/ : /\.(m?js|jsx)$/
  const mine = files.filter((f) => ext.test(f.path))
  if (language === 'javascript') return jsSource(mine)
  const main = /(^|\/)(main|solution)\.py$/
  return [...mine.filter((f) => !main.test(f.path)), ...mine.filter((f) => main.test(f.path))].map((f) => f.content).join('\n\n')
}

/**
 * → { results: [{ pass, actual, error, stdout, ms }], error?, ms }
 * onStatus('loading') fires while Python loads for the first time.
 */
export function runTests({ language, source, spec, cases, onStatus }) {
  if (!RUNNABLE.includes(language)) return Promise.resolve({ error: `Running ${language} in the browser isn't supported yet. Use Python or JavaScript to run the tests.` })
  const started = performance.now()
  return new Promise((resolve) => {
    let worker
    if (language === 'python') {
      pyWorker ||= makePy()
      worker = pyWorker
    } else {
      worker = makeJs()
    }
    let timer = null
    const startClock = () => {
      timer = setTimeout(() => {
        worker.terminate()
        if (worker === pyWorker) {
          pyWorker = null
          pyReady = false
        }
        finish({ error: `Time limit exceeded (${LIMIT_MS[language] / 1000} s). Look for an infinite loop or a very slow step.` })
      }, LIMIT_MS[language])
    }
    function finish(out) {
      clearTimeout(timer)
      worker.onmessage = null
      if (language === 'javascript') worker.terminate()
      const ms = Math.round(performance.now() - started)
      resolve(out.error ? { error: out.error, ms } : { results: grade(spec, cases, out.results), ms })
    }
    worker.onmessage = ({ data }) => {
      if (data.status === 'loading') return onStatus?.('loading')
      if (data.status === 'ready') {
        pyReady = true
        onStatus?.('running')
        return startClock() // loading Python doesn't count against the time limit
      }
      finish(data)
    }
    worker.onerror = (e) => {
      e.preventDefault?.()
      finish({ error: e.message || 'The runner crashed' })
    }
    if (language === 'javascript' || pyReady) startClock()
    worker.postMessage({ source, spec: { kind: spec.kind, entry: spec.entry }, cases })
  })
}
