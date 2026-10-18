// Runs a JavaScript answer against test cases, off the page's thread. One worker per run:
// the page kills it if it runs too long (an infinite loop can't freeze the tab).
import { runJs } from './harness'

self.onmessage = ({ data }) => {
  self.postMessage(runJs(data.source, data.spec, data.cases))
}
