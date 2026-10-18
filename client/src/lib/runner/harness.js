// Test cases, written once for every language. Pure code: used by the browser workers
// (js.worker.js, py.worker.js) and by the server's tests, which check every problem's
// cases against reference solutions.
//
//   spec = { kind: 'function', entry: { javascript: 'twoSum', python: 'two_sum' }, params: ['nums', 'target'],
//            compare: 'exact' | 'unordered', samples: [case], hidden: [case] }
//   spec = { kind: 'class', entry: { javascript: 'LRUCache', python: 'LRUCache' }, … }
//
//   function case: { args: [[2, 7, 11, 15], 9], expected: [0, 1] }
//   class case:    { ops: [['new', 2], ['put', 1, 1], ['get', 1]], expected: [null, null, 1] }
//                  (Python calls snake_case methods: getValue → get_value)

export const RUNNABLE = ['javascript', 'python']
export const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** JSON with object keys sorted, so equal values print the same. */
export function canon(v) {
  if (v === undefined) return 'null'
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
  if (typeof v === 'number' && !Number.isFinite(v)) return JSON.stringify(String(v))
  return JSON.stringify(v)
}

/** Does the answer match? 'unordered' ignores the order of a top-level list. */
export function same(actual, expected, compare = 'exact') {
  if (compare === 'unordered' && Array.isArray(actual) && Array.isArray(expected)) {
    const sort = (xs) => xs.map(canon).sort().join(',')
    return actual.length === expected.length && sort(actual) === sort(expected)
  }
  return canon(actual) === canon(expected)
}

/** How a case's input reads on screen: "nums = [2,7,11,15]\ntarget = 9", or the calls of a class case. */
export function showInput(spec, c) {
  if (c.ops) return c.ops.map(([name, ...args]) => `${name === 'new' ? spec.entry.javascript : name}(${args.map((a) => JSON.stringify(a)).join(', ')})`).join('\n')
  return c.args.map((a, i) => `${spec.params?.[i] || `arg${i + 1}`} = ${JSON.stringify(a)}`).join('\n')
}
export const showValue = (v) => (v === undefined ? 'null' : JSON.stringify(v))

/** Plain browser JavaScript: no imports/exports between files. */
export function jsSource(files) {
  return files
    .map((f) => f.content.replace(/^\s*import\s.*$/gm, '').replace(/^\s*export\s+(default\s+)?/gm, ''))
    .join('\n;\n')
}

/**
 * Runs the cases against JavaScript source. → { results: [{ actual | error, stdout, ms }] } or { error }
 * (Runs in a worker in the browser; the worker is killed on timeout.)
 */
export function runJs(source, spec, cases) {
  const name = spec.entry.javascript
  let logs = []
  const fake = {
    log: (...a) => logs.push(a.map((x) => (typeof x === 'string' ? x : safe(x))).join(' ')),
  }
  fake.info = fake.log
  fake.warn = fake.log
  fake.error = fake.log
  let target
  try {
    // eslint-disable-next-line no-new-func
    target = new Function('console', `"use strict";\n${source}\n;return typeof ${name} === 'undefined' ? undefined : ${name};`)(fake)
  } catch (e) {
    return { error: `${e.name}: ${e.message}` }
  }
  if (typeof target !== 'function') return { error: `${name} is not defined. Keep the ${spec.kind === 'class' ? 'class' : 'function'} name from the starter code.` }
  const results = cases.map((c) => {
    logs = []
    const t = now()
    const r = {}
    try {
      if (spec.kind === 'class') {
        let obj = null
        r.actual = c.ops.map(([op, ...args]) => {
          if (op === 'new') {
            obj = new target(...clone(args))
            return null
          }
          if (typeof obj?.[op] !== 'function') throw new Error(`${name} has no method ${op}()`)
          return plain(obj[op](...clone(args)))
        })
      } else {
        r.actual = plain(target(...clone(c.args)))
      }
    } catch (e) {
      r.error = `${e?.name || 'Error'}: ${e?.message ?? e}`
    }
    r.ms = Math.round((now() - t) * 10) / 10
    r.stdout = logs.join('\n').slice(0, 4000)
    return r
  })
  return { results }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const clone = (v) => JSON.parse(JSON.stringify(v))
function plain(v) {
  if (v === undefined) return null
  if (v instanceof Set) return [...v]
  if (v instanceof Map) return Object.fromEntries(v)
  try {
    return JSON.parse(JSON.stringify(v))
  } catch {
    return String(v)
  }
}
function safe(v) {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** Mark each raw result pass/fail against the cases. */
export function grade(spec, cases, raw) {
  return cases.map((c, i) => {
    const r = raw[i] || { error: 'Not run' }
    return { ...r, pass: !r.error && same(r.actual, c.expected, spec.compare) }
  })
}

// The same runner in Python (run inside Pyodide in the browser, or python3 in the server tests).
// __cr_run(source, spec_json, cases_json) → JSON string, same shape as runJs.
export const PY_HARNESS = String.raw`
import json, sys, io, time, traceback, re

def __cr_snake(s):
    return re.sub(r'[A-Z]', lambda m: '_' + m.group(0).lower(), s)

def __cr_run(source, spec_json, cases_json):
    spec = json.loads(spec_json)
    cases = json.loads(cases_json)
    ns = {'__name__': '__solution__'}
    old = sys.stdout
    sys.stdout = io.StringIO()
    try:
        exec(compile(source, 'solution.py', 'exec'), ns)
    except Exception:
        sys.stdout = old
        return json.dumps({'error': traceback.format_exc(limit=2).strip().split('\n')[-1]})
    sys.stdout = old
    name = spec['entry']['python']
    target = ns.get(name)
    if target is None:
        return json.dumps({'error': name + ' is not defined. Keep the name from the starter code.'})
    out = []
    for c in cases:
        buf = io.StringIO()
        sys.stdout = buf
        t = time.perf_counter()
        r = {}
        try:
            if spec['kind'] == 'class':
                obj = None
                acts = []
                for op in c['ops']:
                    args = json.loads(json.dumps(op[1:]))
                    if op[0] == 'new':
                        obj = target(*args)
                        acts.append(None)
                    else:
                        fn = getattr(obj, __cr_snake(op[0]), None) or getattr(obj, op[0], None)
                        if fn is None:
                            raise AttributeError(name + ' has no method ' + __cr_snake(op[0]) + '()')
                        acts.append(fn(*args))
                r['actual'] = json.loads(json.dumps(acts, default=lambda o: list(o) if isinstance(o, (set, tuple)) else str(o)))
            else:
                res = target(*json.loads(json.dumps(c['args'])))
                r['actual'] = json.loads(json.dumps(res, default=lambda o: list(o) if isinstance(o, (set, tuple)) else str(o)))
        except Exception as e:
            r['error'] = type(e).__name__ + ': ' + str(e)
        finally:
            sys.stdout = old
        r['ms'] = round((time.perf_counter() - t) * 1000, 1)
        r['stdout'] = buf.getvalue()[:4000]
        out.append(r)
    return json.dumps({'results': out})
`
