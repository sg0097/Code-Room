import { chromium } from 'playwright'
const BASE = 'http://localhost:3001'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
const log = (...a) => console.log('•', ...a)
async function user(name) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, permissions: ['camera', 'microphone'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message))
  page.on('console', (m) => m.type() === 'error' && !/404|favicon/.test(m.text()) && console.log(`[${name} console]`, m.text().slice(0, 200)))
  await page.goto(BASE + '/login'); await page.fill('input[placeholder="Your name"]', name); await page.click('button:has-text("Continue")')
  await page.waitForSelector('.home')
  return { ctx, page, name }
}
const api = (p, m, path, body) => p.evaluate(async ([m, path, body]) => { const r = await fetch(path, { method: m, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json() }, [m, path, body])

// Draw a rectangle (key "r", then drag) inside the visible whiteboard at an offset.
async function drawRect(page, dx = 0, dy = 0, nth = 0) {
  const wb = page.locator('.whiteboard .excalidraw').nth(nth)
  await wb.waitFor()
  await page.waitForTimeout(600)
  const box = await wb.boundingBox()
  const x = box.x + box.width * 0.35 + dx, y = box.y + box.height * 0.4 + dy
  await page.locator('.whiteboard').nth(nth).locator('[data-testid="toolbar-rectangle"]').click({ force: true })
  await page.mouse.move(x, y)
  await page.mouse.down(); await page.mouse.move(x + 140, y + 80, { steps: 8 }); await page.mouse.up()
  await page.keyboard.press('Escape')
}

// Wait until the saved draft has n shapes (autosave = 400ms whiteboard debounce + 1.5s draft debounce).
async function waitShapes(page, id, n) {
  for (let i = 0; i < 40; i++) {
    const v = await api(page, 'GET', `/api/challenges/${id}`)
    const got = JSON.parse(v.mySubmission?.content?.fields?.diagram || '[]').length
    if (got >= n) return got
    await page.waitForTimeout(250)
  }
  throw new Error('diagram not saved with ' + n + ' shapes')
}
const A = await user('Wb Shivam'), R = await user('Wb Rahul')
const rId = 'dev_wb-rahul'
await api(A.page, 'POST', '/api/friends/requests', { userId: rId })
const fr = await api(R.page, 'GET', '/api/friends'); await api(R.page, 'POST', `/api/friends/requests/${fr.incoming[0].requestId}/accept`)

// ── Independent system design: solo whiteboard → autosave → reload → compare
const { id } = await api(A.page, 'POST', '/api/challenges', { title: 'Notification system', statement: 'Millions of notifications a day; password resets can never be delayed.', category: 'System Design', difficulty: 'Medium', mode: 'independent', timeLimitMin: 45, inviteeIds: [rId] })
await api(R.page, 'POST', `/api/challenges/${id}/accept`); await api(R.page, 'POST', `/api/challenges/${id}/start`); await api(A.page, 'POST', `/api/challenges/${id}/start`)
await R.page.goto(`${BASE}/challenges/${id}`)
await R.page.waitForSelector('text=Architecture diagram')
await drawRect(R.page)
await drawRect(R.page, 220, 0)
await waitShapes(R.page, id, 2)
let v = await api(R.page, 'GET', `/api/challenges/${id}`)
const els = JSON.parse(v.mySubmission.content.fields.diagram || '[]')
log('solo: draft saved with', els.length, 'shapes:', els.map((e) => e.type).join(','))
await R.page.screenshot({ path: 'wb-solo.png' })
await R.page.reload(); await R.page.waitForSelector('.whiteboard .excalidraw'); await R.page.waitForTimeout(1500)
await R.page.screenshot({ path: 'wb-solo-reload.png' })
await R.page.fill('#f-architecture', 'Priority queue for password resets'); await R.page.waitForTimeout(2500)
v = await api(R.page, 'GET', `/api/challenges/${id}`)
log('after reload + typing, diagram still in draft:', JSON.parse(v.mySubmission.content.fields.diagram || '[]').length, 'shapes')

await A.page.goto(`${BASE}/challenges/${id}`); await A.page.waitForSelector('text=Architecture diagram'); await drawRect(A.page, 0, 60)
log('Shivam draft shapes:', await waitShapes(A.page, id, 1))
for (const P of [A, R]) { await P.page.click('.ws-actions >> button:has-text("Submit")'); await P.page.click('.modal >> button:has-text("Submit")') }
await A.page.waitForSelector('.tab:has-text("Compare solutions")', { timeout: 10000 })
await A.page.waitForSelector('.whiteboard.readonly .excalidraw >> nth=1', { timeout: 15000 }); await A.page.waitForTimeout(1500)
log('compare: read-only diagrams rendered:', await A.page.locator('.whiteboard.readonly').count())
await A.page.screenshot({ path: 'wb-compare.png', fullPage: true })

// ── Collaborative LLD: shared whiteboard + code, both draw, team submit
const col = await api(A.page, 'POST', '/api/challenges', { title: 'Parking lot', statement: 'Multi-level parking with different vehicle sizes and hourly pricing.', category: 'LLD', difficulty: 'Medium', mode: 'collaborative', timeLimitMin: 45, inviteeIds: [rId] })
await api(R.page, 'POST', `/api/challenges/${col.id}/accept`)
const cv = await api(A.page, 'GET', `/api/challenges/${col.id}`); log('LLD format:', cv.challenge.format)
await A.page.goto(`${BASE}/room/${cv.challenge.roomCode}`); await R.page.goto(`${BASE}/room/${cv.challenge.roomCode}`)
await A.page.waitForSelector('text=2/5', { timeout: 15000 })
await A.page.click('button:has-text("-min timer")')
// LLD rooms open on "Requirements & assumptions" now; the whiteboard is the next tab.
for (const P of [A, R]) { await P.page.click('.field-tabs >> text=Class diagram'); await P.page.waitForSelector('.whiteboard .excalidraw') }
await drawRect(A.page)
await R.page.waitForTimeout(1500); await R.page.screenshot({ path: 'wb-room-rahul-sees.png' })
await drawRect(R.page, 0, 140)
await R.page.reload(); await R.page.click('.field-tabs >> text=Class diagram'); await R.page.waitForSelector('.whiteboard .excalidraw'); await R.page.waitForTimeout(2000)
await R.page.screenshot({ path: 'wb-room-rahul-reload.png' })
await A.page.waitForTimeout(800); await A.page.screenshot({ path: 'wb-room-shivam.png' })
// Shared code project: Shivam types in the starter file; Rahul adds a folder and a file in it; both see both.
for (const P of [A, R]) { await P.page.click('.field-tabs >> text=Code'); await P.page.waitForSelector('.proj-tree .proj-node', { timeout: 10000 }) }
const starter = await A.page.locator('.proj-tree .proj-node .proj-name').first().textContent() // main.cpp (the room's language)
await A.page.click('.proj-monaco .view-line >> nth=0'); await A.page.keyboard.type('class ParkingLot { };', { delay: 5 })
await R.page.click('.proj-tools >> text=+ Folder'); await R.page.fill('.proj-input input', 'model'); await R.page.keyboard.press('Enter')
await R.page.click('.proj-tools >> text=+ File'); await R.page.fill('.proj-input input', 'Spot.java'); await R.page.keyboard.press('Enter')
await R.page.waitForSelector('.proj-tab.on >> text=Spot.java')
await R.page.click('.proj-monaco .view-line >> nth=0'); await R.page.keyboard.type('class Spot { int size; }', { delay: 5 })
await A.page.waitForSelector('.proj-node >> text=Spot.java', { timeout: 5000 })
await A.page.click('.proj-node >> text=Spot.java'); await A.page.waitForSelector('.proj-monaco >> text=class Spot')
log('room code: Rahul\'s new folder + file appeared for Shivam with its code')
await A.page.screenshot({ path: 'wb-room-project.png' })
await A.page.waitForTimeout(800)
await A.page.click('button:has-text("Submit team answer")'); await A.page.click('.modal >> button:has-text("Submit")')
await A.page.waitForURL(/challenges\//, { timeout: 10000 })
const done = await api(A.page, 'GET', `/api/challenges/${col.id}`)
const team = done.submissions[0].content.fields
const shapes = JSON.parse(team.diagram || '[]')
const project = JSON.parse(team.code)
log('team submission: diagram shapes =', shapes.length, '| sizes =', shapes.map((e) => `${Math.round(e.width)}x${Math.round(e.height)}`).join(', '), '| files =', project.files.map((f) => `${f.path}: ${f.content}`).join(' ; '), '| folders =', project.folders.join(','))
if (!project.files.some((f) => f.path === 'model/Spot.java' && f.content.includes('class Spot')) || !project.files.some((f) => f.path === starter && f.content.includes('ParkingLot'))) throw new Error('team project missing files')
await A.page.waitForSelector('.whiteboard.readonly .excalidraw', { timeout: 15000 }); await A.page.waitForTimeout(1200)
await A.page.screenshot({ path: 'wb-team-result.png', fullPage: true })

// ── Quick room whiteboard tab
const { code } = await api(A.page, 'POST', '/api/rooms', {})
await A.page.goto(`${BASE}/room/${code}`); await R.page.goto(`${BASE}/room/${code}`)
await A.page.waitForSelector('text=2/5', { timeout: 15000 })
for (const P of [A, R]) await P.page.click('.field-tabs >> text=Whiteboard')
await drawRect(A.page); await R.page.waitForTimeout(1500)
await R.page.screenshot({ path: 'wb-quick-rahul.png' })
log('quick room whiteboard screenshot taken')
await browser.close()
