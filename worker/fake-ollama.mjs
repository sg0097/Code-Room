// Test double for Ollama's /api/chat (used by the automated tests, not in production).
// Answers in the solution-review schema, and says so if the prompt didn't look like one.
import http from 'node:http'
const port = Number(process.env.PORT || 11999)
http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const { messages, format } = JSON.parse(body || '{}')
    const prompt = messages?.[1]?.content || ''
    const ok = format?.required?.includes('rating') && prompt.includes("CANDIDATE'S ANSWER")
    const draft = prompt.includes('(draft')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({
      message: {
        content: JSON.stringify({
          rating: ok ? 3 : 1,
          summary: ok ? `A reasonable ${draft ? 'start' : 'answer'}: the main issue is named, but the fix needs more detail.` : 'The prompt was not a solution review.',
          strengths: ['You found the slow query before changing code.'],
          improvements: ['Say how you would confirm the cause, for example with EXPLAIN.', 'Explain what happens to page links when rows are inserted.'],
          hints: ['What if a user jumps straight to page 500?'],
        }),
      },
    }))
  })
}).listen(port, () => console.log('fake ollama on', port))
