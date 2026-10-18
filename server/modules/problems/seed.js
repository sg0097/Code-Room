// Starter library: original problems written for CodeRoom (no copied content).
// Inserted at boot if their slug doesn't exist yet, so editing one here doesn't overwrite
// changes an admin made in the app. To add more, append to SEED and restart.
import { insertProblem } from './repo.js'
import { query } from '../../db.js'
import { CODING_SEED } from './coding-seed.js'

export const SEED = [
  // ───────────── Beginner ─────────────
  {
    slug: 'feature-flags-for-one-app',
    title: 'Feature flags for one app',
    category: 'Backend', difficulty: 'Easy', format: 'design',
    statement: `Your team ships a food-ordering app. Every new feature goes out with a deploy, and when something breaks the only fix is another deploy, which takes 40 minutes.

Build a service that lets the team turn features on or off without deploying. A product manager should be able to flip a flag from a small admin page, and the app should pick up the change quickly.`,
    constraints: ['1 app, about 200 flags', '10,000 flag reads per second from the app servers', 'A flag change should take effect within 30 seconds', 'If the flag service is down, the app must keep working'],
    followUps: ['Roll a feature out to 10% of users. A user must get the same answer every time.', 'Add a kill switch that takes effect in under 5 seconds.', 'Now 50 services use the flag service. What breaks first?', 'Who changed which flag, and when? Make it auditable.'],
    checklist: ['Flags are cached on the client side (in-process), not fetched per request', 'Explains polling vs. push and picks one for the 30s / 5s targets', 'Percentage rollout uses a stable hash of the user id, not random()', 'Safe default when the service is unreachable (last known value or a hard-coded default)', 'Simple data model: flag, rules, updated_at, updated_by'],
  },
  {
    slug: 'otp-login-service',
    title: 'OTP login for a small fintech app',
    category: 'Backend', difficulty: 'Easy', format: 'design',
    statement: `Users log into a lending app with their phone number and a 6-digit code sent by SMS. Right now codes are stored forever in the users table, can be retried endlessly, and sometimes two codes are valid at the same time.

Design the OTP flow properly: generating, sending, verifying and expiring codes.`,
    constraints: ['About 2,000 logins per minute at peak', 'A code is valid for 5 minutes, at most 3 wrong attempts', 'SMS costs money: don\'t send more than needed', 'Codes must never be readable from the database or logs'],
    followUps: ['The SMS provider is down for 10 minutes. What do users see, and what do you do?', 'Someone tries 1 wrong code each on 100,000 different phone numbers. How do you notice and stop it?', 'Users complain the code arrives after it expires. What could cause that?'],
    checklist: ['Stores a hash of the code with an expiry, not the code itself', 'Attempt counter and lockout per phone number', 'Resend limits (cooldown between sends, daily cap)', 'Only the latest code is valid', 'Rate limiting by phone and by IP / device, not just one of them'],
  },
  {
    slug: 'library-book-holds',
    title: 'Book hold queue for a city library',
    category: 'LLD', difficulty: 'Easy', format: 'lld',
    statement: `A city library lets members place a hold on a book that's checked out. When a copy comes back, the next person in line gets 48 hours to pick it up. If they don't, it goes to the next person.

Design the classes for holds, copies and members, and implement: placing a hold, returning a copy, and expiring a hold that wasn't picked up.`,
    constraints: ['A book can have several copies across branches', 'A member can have at most 5 active holds', 'A member can cancel a hold at any time', 'Holds are served first-come, first-served'],
    followUps: ['Members can choose a pickup branch. A copy returned at branch A has to travel to branch B. How does the model change?', 'Premium members jump the queue. What changes, and what stays?', 'Two copies come back at the same moment. Make sure the same member isn\'t given both.'],
    checklist: ['Separates Book (title) from Copy (physical item)', 'Hold has a clear state: WAITING → READY → PICKED_UP / EXPIRED / CANCELLED', 'Queue per book, not per copy', 'Expiry is driven by time (a scheduler or a check on read), not by someone remembering', 'Limits (5 holds) enforced in one place'],
  },
  {
    slug: 'orders-page-slows-down',
    title: 'The orders page gets slower every week',
    category: 'Debugging', difficulty: 'Easy', format: 'debug',
    statement: `Support agents use an internal page that lists orders, 50 per page, newest first. Page 1 loads in 80 ms. Agents who jump to page 4,000 wait 6 seconds, and it gets a little worse every week. The database CPU spikes whenever agents page deep.

The endpoint does this:
\`\`\`
SELECT * FROM orders
ORDER BY created_at DESC
LIMIT 50 OFFSET (page - 1) * 50;
\`\`\`
Then, for each of the 50 orders, it runs \`SELECT name FROM customers WHERE id = ?\` to show the customer's name.`,
    constraints: ['orders has 30 million rows and grows by 100k a day', 'There is an index on orders(created_at)', 'Agents mostly look at recent orders, but sometimes jump deep'],
    followUps: ['Product wants "jump to page N" to keep working. Can you keep it, and at what cost?', 'Two orders have the same created_at. What goes wrong with your fix?', 'How would you prove your fix worked before shipping it?'],
    checklist: ['Identifies OFFSET: the database still reads and throws away every skipped row', 'Identifies the N+1 customer lookups', 'Proposes keyset (cursor) pagination on (created_at, id)', 'Fixes N+1 with a join or one IN (...) query', 'Mentions selecting only needed columns, and verifying with EXPLAIN'],
  },

  // ───────────── Intermediate ─────────────
  {
    slug: 'cashback-ledger-with-reversals',
    title: 'Cashback ledger with reversals',
    category: 'System Design', difficulty: 'Medium', format: 'design',
    statement: `A UPI payments app gives users cashback on some payments. The cashback lands in an in-app wallet the user can spend later. If the original payment is refunded, the cashback has to be taken back.

Design the cashback system: deciding the cashback, crediting it, letting users spend it, and reversing it on refunds.`,
    constraints: ['5 million payments a day, about 20% earn cashback', 'Payment and refund events can arrive twice, or out of order', 'Wallet balance shown to the user must never be wrong by more than a few seconds', 'Finance needs to be able to explain every rupee'],
    followUps: ['The refund arrives after the user already spent the cashback.', 'Finance wants a daily reconciliation report against the payments system.', 'A campaign has a ₹1 crore total budget. It must never be overspent, even at peak.', 'A bug credited double cashback to 20,000 users last night. How do you fix it?'],
    checklist: ['Append-only ledger entries instead of updating a balance column', 'Idempotency keys on payment/refund events', 'Handles refund-before-payment (out of order) explicitly', 'A clear policy for negative balance / clawback', 'Budget cap without a single hot row (pre-allocated chunks or reservations)'],
  },
  {
    slug: 'notification-quiet-hours',
    title: 'Notifications that respect quiet hours',
    category: 'System Design', difficulty: 'Medium', format: 'design',
    statement: `A shopping app sends push, SMS and email: order updates, price drops, marketing. Users complain about 2 a.m. notifications and getting the same offer three times. Marketing complains campaigns are slow to go out.

Design the notification pipeline: deciding whether, when and on which channel each notification is sent.`,
    constraints: ['20 million notifications a day, campaigns send 5 million in one go', 'Each user has channel preferences and quiet hours in their own timezone', 'Order updates must go out within 10 seconds; marketing can wait', 'Never send the same notification twice'],
    followUps: ['A marketing campaign is scheduled during quiet hours for half the users. What happens to those messages?', 'The SMS provider rate-limits you to 500/s. Order updates and a campaign compete for it.', 'A user unsubscribes while their campaign message is already queued.'],
    checklist: ['Separate queues/priorities for transactional vs. marketing', 'Preference and quiet-hours check close to send time, not only at enqueue', 'Deduplication key per (user, notification)', 'Delayed delivery for quiet hours instead of dropping', 'Per-provider rate limiting and fallback'],
  },
  {
    slug: 'coupon-eligibility-rules',
    title: 'Coupon eligibility rule engine',
    category: 'LLD', difficulty: 'Medium', format: 'lld',
    statement: `An e-commerce checkout supports coupons like:
- "FIRST100": ₹100 off your first order above ₹499
- "ELEC10": 10% off electronics, max ₹1,500, not with other coupons
- "WEEKEND": ₹50 off on Saturdays and Sundays for Gold members

Today each coupon is an if-else block in the checkout code. Design classes so new coupons can be added without touching checkout logic, and so the app can tell the user exactly why a coupon doesn't apply.`,
    constraints: ['Rules: minimum cart value, category, user segment, first order, day of week, date range', 'Some coupons can be combined, some can\'t', 'Checkout must evaluate all coupons in under 50 ms', 'Explanations like "Add ₹120 more to use FIRST100"'],
    followUps: ['Marketing wants to create coupons from an admin page without engineers. What does your model need?', 'Two coupons can combine, but the order matters (percentage first, then flat). Model it.', 'How would you unit test a new coupon?'],
    checklist: ['Rule / condition as an interface with composable implementations (AND / OR)', 'Discount calculation separate from eligibility', 'Evaluation returns a reason, not just a boolean', 'Stacking policy modeled explicitly, not hidden in ifs', 'Rules are data-driven (could be loaded from config)'],
  },
  {
    slug: 'double-orders-on-retry',
    title: 'Customers get charged twice',
    category: 'Debugging', difficulty: 'Medium', format: 'debug',
    statement: `A few customers a day are charged twice for one order. It happens more on slow mobile networks and during sales. The place-order handler looks like this:
\`\`\`
existing = db.query("SELECT id FROM orders WHERE cart_id = ?", cartId)
if (existing) return existing
order = db.insert("orders", { cartId, amount, status: 'PENDING' })
paymentGateway.charge(order.id, amount)     // takes 1–4 s
db.update("orders", order.id, { status: 'PAID' })
return order
\`\`\`
The mobile app retries a request if it gets no response in 3 seconds. The load balancer also retries once on a timeout.`,
    constraints: ['Several app servers behind a load balancer', 'The payment gateway supports an idempotency key', 'orders has no unique constraint on cart_id'],
    followUps: ['The charge succeeds but the server crashes before updating the status. What does the customer see, and how do you recover?', 'Would adding a lock in application memory fix it? Why not?', 'How would you find every customer already double-charged?'],
    checklist: ['Explains the check-then-insert race between two concurrent requests', 'Connects it to client and load-balancer retries plus the slow charge call', 'Unique constraint on cart_id (or an idempotency key table)', 'Passes an idempotency key to the gateway', 'Reconciliation for the crash-after-charge case'],
  },

  // ───────────── Advanced ─────────────
  {
    slug: 'exam-submission-burst',
    title: 'Exam submission burst',
    category: 'System Design', difficulty: 'Hard', format: 'design',
    statement: `A national online entrance exam ends at exactly 5:00 p.m. Almost every student clicks Submit in the last minute, and many have been autosaving answers the whole time.

Design the submission system so that no accepted answer is lost, the deadline is fair, and results can be computed soon after.`,
    constraints: ['2 million students, most submitting within the same 60 seconds', 'Each submission is up to 200 KB (answers plus a few scanned images)', 'No submission accepted before the deadline may ever be lost', 'Results must be published within 2 hours'],
    followUps: ['A student\'s network drops at 4:59:59. What counts as "submitted on time"?', 'One region\'s datacenter goes down 10 minutes before the deadline.', 'Detect students who submitted near-identical answers.', 'Autoscaling takes 3 minutes to add servers. Does it help?'],
    checklist: ['Accept fast, process later: durable write first (queue / object storage), grading async', 'Server-side acceptance time, with a defined grace rule, not the client clock', 'Pre-signed uploads or direct-to-storage for the images', 'Pre-scaling for a known spike instead of relying on autoscaling', 'Back-pressure and client retry with idempotent submission ids'],
  },
  {
    slug: 'live-cricket-score-fanout',
    title: 'Live cricket scores for 30 million fans',
    category: 'System Design', difficulty: 'Hard', format: 'design',
    statement: `A sports app shows live ball-by-ball scores. During an India vs. Pakistan final, 30 million people have the app open at once. A scorer at the stadium enters each ball into a tablet.

Design how a ball entered by the scorer reaches every open app.`,
    constraints: ['30 million concurrent clients, many on flaky mobile networks', 'A ball should appear on screen within 2 seconds', 'About 1 update every 30 seconds, but bursts when a wicket falls (commentary, stats, replays)', 'Clients that reconnect must catch up without hammering the backend'],
    followUps: ['The scorer made a mistake and corrects the last ball. How do clients fix their screen?', 'A wicket falls and 30 million clients refresh the full scorecard at the same instant.', 'Half the users are on 2G. What changes?', 'How do you show the score on the lock screen (push) without sending 30 million pushes per ball?'],
    checklist: ['Single source of truth with versioned score events (sequence numbers)', 'Fan-out tier (WebSocket/SSE edge servers) separate from the source', 'CDN or edge cache for snapshot reads; clients fetch snapshot + deltas', 'Reconnect with "since version N" and jittered backoff', 'Corrections as new events, not edits'],
  },
  {
    slug: 'logout-everywhere',
    title: '"Log out of all devices" in 5 seconds',
    category: 'Backend', difficulty: 'Hard', format: 'design',
    statement: `A banking app uses short-lived access tokens (JWTs) that services verify on their own, without calling the auth service. Security now requires a "log out of all devices" button: after pressing it, any request with an old token must be rejected within 5 seconds, everywhere.

Design the session and token system that makes this possible, without making every request slow.`,
    constraints: ['80 million users, 400,000 API requests per second', 'Services run in 3 regions', 'Token verification today adds under 1 ms; keep it close to that', 'A stolen phone must be locked out fast'],
    followUps: ['The revocation store in one region is down. Do you fail open or fail closed, and for which APIs?', 'A user changes their password. Should that log out other devices? Implement it.', 'How do you test that the 5-second guarantee actually holds?'],
    checklist: ['Explains why stateless JWTs can\'t be revoked by themselves', 'Session version / "tokens issued before T are invalid" per user, instead of a list of every token', 'Pushes revocations to every service (pub/sub) plus a local cache, with a bounded staleness', 'Short access-token lifetime as a backstop', 'Explicit fail-open vs. fail-closed choice per risk level'],
  },
  {
    slug: 'claims-workflow-engine',
    title: 'Insurance claim workflow engine',
    category: 'LLD', difficulty: 'Hard', format: 'lld',
    statement: `An insurance company processes claims through steps: document check, fraud score, surveyor visit (only for car claims over ₹50,000), manager approval (for amounts over ₹2 lakh), then payout. Each product team keeps asking for a different set of steps.

Design a small workflow engine: claim types define their steps as configuration, steps can be automatic or need a human, and a claim always knows where it is and why.`,
    constraints: ['Steps can succeed, fail, or wait for a person for days', 'Automatic steps call external services that can time out', 'Every state change must be audited (who, when, why)', 'A process restart must not lose or repeat a step'],
    followUps: ['Product wants to change the workflow for new claims while old ones finish on the old version.', 'The fraud service times out. Retry how many times, and then what?', 'Two managers click Approve on the same claim at the same moment.'],
    checklist: ['Workflow definition (data) separated from execution (engine)', 'Explicit claim state machine with allowed transitions', 'Step interface for automatic vs. human steps', 'Persisted progress + idempotent steps, so a restart resumes safely', 'Versioned workflow definitions; optimistic locking for concurrent actions'],
  },
]

/** Insert seed problems that aren't there yet. One query when nothing is missing. */
export async function seedProblems() {
  const all = [...SEED, ...CODING_SEED]
  const have = new Set((await query(`SELECT slug FROM problems WHERE slug = ANY($1::text[])`, [all.map((p) => p.slug)])).map((r) => r.slug))
  const missing = all.filter((p) => !have.has(p.slug))
  for (const p of missing) await insertProblem(p, { origin: 'seed', status: 'published' })
  if (missing.length) console.log(`[problems] seeded ${missing.length} problems`)
}
