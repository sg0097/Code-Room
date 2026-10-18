// Test double for the Brave Search API (used by e2e-v14-api.mjs, not in production).
import http from 'node:http'
const port = Number(process.env.PORT || 11998)
const days = (n) => new Date(Date.now() - n * 86400e3).toISOString()
http.createServer((req, res) => {
  const q = new URL(req.url, 'http://x').searchParams.get('q') || ''
  if (req.headers['x-subscription-token'] !== 'test-brave') return res.writeHead(401).end()
  const results = /google/i.test(q) ? [
    { title: 'Google | L4 | Bangalore | Offer', url: 'https://leetcode.com/discuss/post/9000001/google-l4-bangalore-offer/', description: 'Phone screen, 4 <strong>onsites</strong>…', page_age: days(12) },
    { title: 'Google Software Engineer Interview Questions | Glassdoor', url: 'https://www.glassdoor.co.in/Interview/Google-Software-Engineer-Interview-Questions-EI_IE9079.0,6_KO7,24.htm', description: 'Interview questions shared by candidates', page_age: days(40) },
    { title: 'Is Google worth it? (rant)', url: 'https://www.reddit.com/r/cscareerquestions/comments/abc/is_google_worth_it/', description: 'not an interview', page_age: days(3) },
    { title: 'Google interview experience', url: 'https://some-random-blog.example/google', description: 'not an allowed site', page_age: days(1) },
    { title: 'Amazon Interview Experience | Set 269', url: 'https://www.geeksforgeeks.org/interview-experiences/amazon-interview-experience-set-269-1-year-experienced-for-sde-1/', description: 'already in the library', page_age: days(9) },
  ] : []
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify({ web: { results } }))
}).listen(port, () => console.log('fake brave on', port))
