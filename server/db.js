import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * One tiny interface over two Postgres backends:
 *   - DATABASE_URL set  -> real Postgres via `pg` (production: Neon, Render, Supabase…)
 *   - not set           -> PGlite: real Postgres compiled to WASM, running in-process,
 *                          stored in server/data/. Zero setup for local dev and tests.
 * Same SQL dialect, same results, so nothing else in the code cares which one runs.
 *
 *   query(sql, params) -> rows
 *   tx(async (q) => ...) -> runs fn inside BEGIN/COMMIT, q(sql, params) -> rows
 */
const here = path.dirname(fileURLToPath(import.meta.url))
let backend

/**
 * Per-request DB stats: how many round trips a request made and how long they took.
 * index.js reports them in a Server-Timing header (visible in DevTools → Network → Timing)
 * and logs any request slower than SLOW_REQUEST_MS.
 */
export const stats = new AsyncLocalStorage()
// Benchmarking only: adds this delay to every round trip to imitate a far-away database.
const SIM = Number(process.env.DB_SIMULATED_LATENCY_MS || 0)
async function roundTrip(run) {
  const s = stats.getStore()
  const t = performance.now()
  try {
    if (SIM) await new Promise((r) => setTimeout(r, SIM))
    return await run()
  } finally {
    if (s) {
      s.queries++
      s.dbMs += performance.now() - t
    }
  }
}

// Database connections kept open and ready (DB_POOL_MIN, default 6, max 10).
const WARM = Math.min(10, Math.max(1, Number(process.env.DB_POOL_MIN) || 6))

async function init() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg')
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
      max: 10,
      // Opening a connection costs several network round trips (TCP + TLS + auth), often
      // 100–300 ms to a hosted database. pg's default closes idle connections after 10s,
      // so a quiet app paid that on almost every request. Keep a couple open and warm.
      // The home page sends ~5 requests at once. Each one that finds no open connection pays the
      // full handshake (~1 s to a far-away database), so keep enough open for a whole page.
      min: WARM,
      idleTimeoutMillis: 5 * 60_000,
      keepAlive: true,
    })
    // Open them now instead of on the first user's requests (pg only keeps `min` once opened).
    await Promise.all(Array.from({ length: WARM }, () => pool.query('SELECT 1')))
    // Neon's free plan pauses the database after ~5 idle minutes, and the next query then waits
    // ~1 s for it to wake. While this server is running, a tiny query every 4 minutes keeps it
    // awake. (Render's free plan sleeps the server after 15 idle minutes, which stops this too.)
    if (process.env.DB_KEEP_WARM !== 'false') {
      // Touch every open connection, so none of them is dropped while idle either.
      setInterval(() => Promise.all(Array.from({ length: WARM }, () => pool.query('SELECT 1'))).catch(() => {}), 4 * 60_000).unref()
    }
    backend = {
      name: 'postgres',
      query: (sql, params) => roundTrip(async () => (await pool.query(sql, params)).rows),
      exec: (sql) => pool.query(sql),
      tx: async (fn) => {
        const client = await pool.connect()
        try {
          await roundTrip(() => client.query('BEGIN'))
          const result = await fn((sql, params) => roundTrip(async () => (await client.query(sql, params)).rows))
          await roundTrip(() => client.query('COMMIT'))
          return result
        } catch (e) {
          await client.query('ROLLBACK')
          throw e
        } finally {
          client.release()
        }
      },
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[db] No DATABASE_URL in production: using local PGlite files. Most hosts wipe these on every deploy!')
    }
    const { PGlite } = await import('@electric-sql/pglite')
    const dir = process.env.PGLITE_DIR || path.join(here, 'data', 'pglite')
    fs.mkdirSync(dir, { recursive: true })
    const db = new PGlite(dir)
    await db.waitReady
    backend = {
      name: `pglite (${dir})`,
      query: (sql, params) => roundTrip(async () => (await db.query(sql, params)).rows),
      exec: (sql) => db.exec(sql),
      tx: (fn) => db.transaction((t) => fn((sql, params) => roundTrip(async () => (await t.query(sql, params)).rows))),
    }
  }
  await backend.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'))
  console.log(`[db] ready: ${backend.name}`)
}

export const ready = init()
export const query = (sql, params) => backend.query(sql, params)
export const tx = (fn) => backend.tx(fn)
