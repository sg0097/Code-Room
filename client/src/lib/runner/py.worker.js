// Runs a Python answer against test cases with Pyodide (CPython compiled to WebAssembly),
// loaded once from the jsDelivr CDN and then cached by the browser. No server involved.
import { PY_HARNESS } from './harness'

export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/'
let py = null

self.onmessage = async ({ data }) => {
  try {
    if (!py) {
      self.postMessage({ status: 'loading' })
      const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
      py = await loadPyodide({ indexURL: PYODIDE_URL })
      py.runPython(PY_HARNESS)
      self.postMessage({ status: 'ready' })
    }
    const run = py.globals.get('__cr_run')
    const out = run(data.source, JSON.stringify(data.spec), JSON.stringify(data.cases))
    self.postMessage(JSON.parse(out))
  } catch (e) {
    self.postMessage({ error: String(e?.message || e).split('\n').slice(-3).join('\n') })
  }
}
