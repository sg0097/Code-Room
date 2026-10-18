// Real-world coding problems: everyday backend work, written for CodeRoom (no copied content).
// Each has starter code and test cases that run in the browser (Python and JavaScript).
// The cases are checked against reference solutions in tests.test.mjs.
const c = (args, expected) => ({ args, expected })
const T = true
const F = false

export const CODING_SEED = [
  {
    slug: 'api-rate-limiter',
    title: 'Rate limiter for a public API',
    category: 'Backend', difficulty: 'Medium', format: 'code',
    statement: `Your company's public API is being hammered by a few clients running scripts in tight loops, and everyone else gets slow responses. You're adding a per-client limit: each API key may make at most \`limit\` requests in any \`windowMs\` milliseconds.

Implement \`RateLimiter(limit, windowMs)\` with \`allow(clientId, timestampMs)\`, which returns true if the request may go through and false if it must be rejected.

- A request at time t counts the allowed requests in the window (t - windowMs, t]. A request exactly windowMs ago no longer counts.
- Rejected requests don't count towards the limit.
- Calls arrive in time order. Clients are independent.`,
    constraints: ['1 ≤ limit ≤ 10,000', '1 ≤ windowMs ≤ 3,600,000', 'Up to 100,000 calls', 'Timestamps never go backwards'],
    followUps: ['Memory grows with every client ever seen. How do you stop that?', 'You now run 20 API servers. Where does the counter live, and what happens when that store is slow?', 'Switch to a token bucket that allows short bursts. What changes?'],
    checklist: ['Per-client sliding window of allowed timestamps (a queue / deque)', 'Drops timestamps older than the window before counting', 'Rejected requests are not recorded', 'O(1) amortised per call'],
    tests: {
      kind: 'class', entry: { javascript: 'RateLimiter', python: 'RateLimiter' },
      starter: {
        javascript: 'class RateLimiter {\n  constructor(limit, windowMs) {\n    \n  }\n\n  allow(clientId, timestampMs) {\n    \n  }\n}\n',
        python: 'class RateLimiter:\n    def __init__(self, limit, window_ms):\n        pass\n\n    def allow(self, client_id, timestamp_ms):\n        pass\n',
      },
      samples: [
        { ops: [['new', 3, 1000], ['allow', 'a', 0], ['allow', 'a', 100], ['allow', 'a', 200], ['allow', 'a', 300], ['allow', 'b', 300], ['allow', 'a', 1000], ['allow', 'a', 1050]], expected: [null, T, T, T, F, T, T, F] },
      ],
      hidden: [
        { ops: [['new', 1, 500], ['allow', 'x', 0], ['allow', 'x', 499], ['allow', 'x', 500], ['allow', 'x', 999], ['allow', 'x', 1000]], expected: [null, T, F, T, F, T] },
        { ops: [['new', 2, 1000], ['allow', 'a', 0], ['allow', 'a', 10], ['allow', 'a', 20], ['allow', 'a', 30], ['allow', 'a', 1001], ['allow', 'a', 1005], ['allow', 'a', 1011]], expected: [null, T, T, F, F, T, F, T] },
        { ops: [['new', 1, 100], ['allow', 'a', 0], ['allow', 'b', 0], ['allow', 'c', 50], ['allow', 'a', 50], ['allow', 'b', 100], ['allow', 'c', 100]], expected: [null, T, T, T, F, T, F] },
      ],
    },
  },
  {
    slug: 'dedupe-payment-webhooks',
    title: 'Duplicate payment webhooks',
    category: 'Backend', difficulty: 'Easy', format: 'code',
    statement: `Your payment provider sends a webhook for every payment. When your server is slow to answer, the provider retries, and some customers got their order confirmed twice.

Write \`dedupe(events, windowMs)\`. Each event is \`[eventId, paymentKey, timestampMs]\`, in time order. Keep an event unless an event with the same paymentKey was **kept** less than windowMs before it. Return the ids of the kept events, in order.`,
    constraints: ['0 ≤ events.length ≤ 100,000', '0 ≤ windowMs ≤ 86,400,000', 'Events are sorted by timestamp'],
    followUps: ['Events can now arrive out of order by up to 5 seconds. What changes?', 'Your service restarts. How do you avoid confirming a payment twice across the restart?', 'Ten servers receive webhooks behind a load balancer. Where does the "seen" state live?'],
    checklist: ['A map from paymentKey to the time of the last KEPT event', 'Compares against the last kept event, not the last seen one', 'Boundary: exactly windowMs apart counts as a new event', 'O(n) time'],
    tests: {
      kind: 'function', entry: { javascript: 'dedupe', python: 'dedupe' }, params: ['events', 'windowMs'],
      starter: {
        javascript: 'function dedupe(events, windowMs) {\n  \n}\n',
        python: 'def dedupe(events, window_ms):\n    pass\n',
      },
      samples: [
        c([[['e1', 'pay_1', 0], ['e2', 'pay_1', 500], ['e3', 'pay_2', 600], ['e4', 'pay_1', 1200]], 1000], ['e1', 'e3', 'e4']),
        c([[], 1000], []),
      ],
      hidden: [
        c([[['a', 'k', 0], ['b', 'k', 999], ['c', 'k', 1000]], 1000], ['a', 'c']),
        c([[['a', 'k', 0], ['b', 'k', 600], ['c', 'k', 1100]], 1000], ['a', 'c']),
        c([[['a', 'x', 5], ['b', 'y', 5], ['c', 'x', 5]], 10], ['a', 'b']),
        c([[['a', 'x', 1], ['b', 'x', 1]], 0], ['a', 'b']),
      ],
    },
  },
  {
    slug: 'top-failing-endpoints',
    title: 'Top failing endpoints from access logs',
    category: 'Backend', difficulty: 'Easy', format: 'code',
    statement: `It's 2 a.m. and the on-call alert says the error rate is up. Before digging into dashboards you want a quick answer from the raw access log: which endpoints are failing the most?

Write \`topFailing(logs, k)\`. Each log line is \`"METHOD PATH STATUS MS"\`, for example \`"GET /orders 502 81"\`. Count the lines with a status of 500 or more for each \`"METHOD PATH"\`, and return the k endpoints with the most failures, most first. Break ties alphabetically. Skip lines that don't have exactly four parts or whose status isn't a number.`,
    constraints: ['0 ≤ logs.length ≤ 1,000,000', '1 ≤ k ≤ 1,000', 'GET /a and POST /a are different endpoints'],
    followUps: ['The log is 50 GB and doesn\'t fit in memory. How do you get the same answer?', 'You want this live, over the last 5 minutes, on every server. Design it.', 'How would you return the top k without sorting every endpoint?'],
    checklist: ['Validates each line before using it', 'Counts with a hash map keyed by "METHOD PATH"', 'Sorts by count descending, then name ascending', 'Returns at most k items'],
    tests: {
      kind: 'function', entry: { javascript: 'topFailing', python: 'top_failing' }, params: ['logs', 'k'],
      starter: {
        javascript: 'function topFailing(logs, k) {\n  \n}\n',
        python: 'def top_failing(logs, k):\n    pass\n',
      },
      samples: [
        c([['GET /orders 500 120', 'GET /orders 200 30', 'POST /pay 503 900', 'GET /orders 502 80', 'POST /pay 500 1000', 'GET /users 404 12'], 2], ['GET /orders', 'POST /pay']),
        c([['GET /a 200 1'], 3], []),
      ],
      hidden: [
        c([['GET /b 500 1', 'GET /a 500 1'], 5], ['GET /a', 'GET /b']),
        c([['oops', 'GET /x 5xx 1', 'GET /x 500', 'GET /y 599 3'], 1], ['GET /y']),
        c([['GET /p 500 1', 'POST /p 500 1', 'POST /p 501 2'], 2], ['POST /p', 'GET /p']),
        c([['GET /z 499 1', 'GET /z 500 1'], 1], ['GET /z']),
      ],
    },
  },
  {
    slug: 'meeting-room-booking',
    title: 'Meeting room booking',
    category: 'Backend', difficulty: 'Medium', format: 'code',
    statement: `The office booking tool lets two people book the same room for the same slot, and meetings keep getting double-booked. Write the booking logic that the API will call.

Implement \`RoomBooking()\` with:
- \`book(room, start, end)\`: books [start, end) and returns true, or returns false if start ≥ end or it overlaps a booking in that room. A meeting may start exactly when another ends.
- \`cancel(room, start)\`: removes the booking in that room that starts at start. Returns true if there was one.
- \`isFree(room, start, end)\`: true if nothing in that room overlaps [start, end).

Times are minutes since midnight.`,
    constraints: ['Up to 100 rooms', 'Up to 10,000 bookings per room', '0 ≤ start, end ≤ 1,440'],
    followUps: ['Two API servers handle book() at the same moment for the same slot. How do you make sure only one succeeds?', 'Find the first free 30-minute slot in any of 5 rooms. What data structure helps?', 'Add recurring weekly meetings. What does a booking look like now?'],
    checklist: ['Bookings stored per room', 'Overlap test: start < otherEnd && otherStart < end', 'Rejects empty or inverted ranges', 'Cancel removes exactly one booking'],
    tests: {
      kind: 'class', entry: { javascript: 'RoomBooking', python: 'RoomBooking' },
      starter: {
        javascript: 'class RoomBooking {\n  constructor() {\n    \n  }\n\n  book(room, start, end) {\n    \n  }\n\n  cancel(room, start) {\n    \n  }\n\n  isFree(room, start, end) {\n    \n  }\n}\n',
        python: 'class RoomBooking:\n    def __init__(self):\n        pass\n\n    def book(self, room, start, end):\n        pass\n\n    def cancel(self, room, start):\n        pass\n\n    def is_free(self, room, start, end):\n        pass\n',
      },
      samples: [
        { ops: [['new'], ['book', 'A', 540, 600], ['book', 'A', 570, 630], ['book', 'A', 600, 660], ['isFree', 'A', 600, 610], ['book', 'B', 570, 630], ['cancel', 'A', 600], ['isFree', 'A', 600, 610]], expected: [null, T, F, T, F, T, T, T] },
      ],
      hidden: [
        { ops: [['new'], ['book', 'A', 600, 600], ['book', 'A', 700, 650]], expected: [null, F, F] },
        { ops: [['new'], ['book', 'A', 0, 10], ['cancel', 'A', 5], ['cancel', 'B', 0], ['cancel', 'A', 0], ['cancel', 'A', 0]], expected: [null, T, F, F, T, F] },
        { ops: [['new'], ['book', 'A', 100, 200], ['book', 'A', 50, 300], ['book', 'A', 120, 150], ['book', 'A', 0, 100], ['isFree', 'A', 0, 300], ['isFree', 'A', 200, 300]], expected: [null, T, F, F, T, F, T] },
      ],
    },
  },
]
