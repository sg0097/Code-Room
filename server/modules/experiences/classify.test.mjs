// Run: npm test --prefix server
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, cleanLink, normalizeCompany, parseQuery, validateExperience, yoeFrom, sourceOf } from './classify.js'

const gfg = (slug) => `https://www.geeksforgeeks.org/interview-experiences/${slug}/`

test('GfG slugs: company, role and YoE from the URL alone', () => {
  const a = cleanLink({ url: gfg('amazon-interview-experience-set-269-1-year-experienced-for-sde-1') })
  assert.equal(a.company, 'Amazon')
  assert.equal(a.role, 'SDE 1')
  assert.equal(a.yoe, 1)
  assert.equal(a.source, 'gfg')
  assert.equal(a.title, 'Amazon Interview Experience Set 269 1 Year Experienced for SDE 1')

  const b = cleanLink({ url: gfg('goldman-sachs-interview-experience-set-29-internship') })
  assert.deepEqual([b.company, b.role, b.yoe, b.tags], ['Goldman Sachs', 'Intern', 0, ['internship']])

  const c = cleanLink({ url: gfg('samsung-bangalore-srib-interview-experience-set-22-campus') })
  assert.deepEqual([c.company, c.role, c.yoe, c.tags], ['Samsung', 'SDE 1', 0, ['on-campus']])

  assert.equal(cleanLink({ url: gfg('cisco-interview-experience-set-17-1-5-years-experienced') }).yoe, 1) // 1.5 years
  // Role words after the company name aren't part of it.
  assert.equal(cleanLink({ url: gfg('amazon-internship-interview-experience-2') }).company, 'Amazon')
  assert.equal(cleanLink({ url: gfg('amazon-qa-role-support-engineer-interview-experience') }).company, 'Amazon')
  assert.equal(cleanLink({ url: gfg('zs-associates-interview-experience-for-business-technology-solutions-associate') }).company, 'ZS Associates')
  // Newer title styles
  const co = (slug) => cleanLink({ url: gfg(slug) })?.company
  assert.equal(co('my-interview-experience-at-tech-mahindra-associate-data-process-analyst-role'), 'Tech Mahindra')
  assert.equal(co('my-interview-experience-for-fidelity-investments-as-an-associate-software-engineer-role'), 'Fidelity Investments')
  assert.equal(co('tech-mahindra-on-campus-recruitment-process-detailed-experience-rounds-explained'), 'Tech Mahindra')
  assert.equal(co('data-engineer-hiring-experience-at-accenture-2025-26-batch-on-campus'), 'Accenture')
  assert.equal(co('interview-experience-with-zorvyn-key-observations-and-learnings'), 'Zorvyn')
  assert.equal(co('interview-experience-for-sde-1'), undefined) // "for SDE 1" isn't a company
  assert.equal(co('company-name-interview-experience-for-sde-intern'), undefined) // the author hid the company
  assert.equal(co('on-campus-placement-experience-for-sde-role'), undefined)
  assert.equal(co('my-experience-at-the-one-day-dsa-workshop-by-geeksforgeeks'), undefined)
})

test('LeetCode-style titles', () => {
  const x = classify('Google | L4 | Bangalore | Offer')
  assert.deepEqual([x.company, x.role, x.outcome], ['Google', 'SDE 2', 'selected'])
  const z = cleanLink({ url: 'https://leetcode.com/discuss/post/5551234/google-l4-bangalore-offer-by-anon/' })
  assert.deepEqual([z.company, z.role, z.outcome, z.source], ['Google', 'SDE 2', 'selected', 'leetcode'])
  const y = classify('Meta E5 onsite rejected (7 YOE)')
  assert.deepEqual([y.role, y.yoe, y.outcome], ['SDE 3 / Senior', 7, 'rejected'])
})

test('company names are grouped', () => {
  assert.equal(normalizeCompany('jp-morgan-chase'), 'JPMorgan')
  assert.equal(normalizeCompany('Facebook'), 'Meta')
  assert.equal(normalizeCompany('phonepe pvt ltd'), 'PhonePe')
  assert.equal(normalizeCompany('Microsoft IDC'), 'Microsoft')
  assert.equal(normalizeCompany('CommerceIQ'), 'CommerceIQ') // author's casing kept
  assert.equal(normalizeCompany('amazon web servicesaws'), 'Amazon') // a well-known parent wins
  assert.equal(normalizeCompany('Goldman Sachs Bengaluru'), 'Goldman Sachs')
  assert.equal(normalizeCompany('Morgan Stanley'), 'Morgan Stanley')
  assert.equal(normalizeCompany('Juspay Technologies'), 'Juspay')
})

test('YoE is never read from years like 2023', () => {
  assert.equal(yoeFrom('Amazon SDE 2 interview 2023'), null)
  assert.equal(yoeFrom('6 months experienced'), 0)
  assert.equal(yoeFrom('YOE: 3'), 3)
})

test('links without a company, or that are not http, are dropped', () => {
  assert.equal(cleanLink({ url: 'javascript:alert(1)', title: 'Amazon interview experience' }), null)
  assert.equal(cleanLink({ url: gfg('how-i-got-started-with-interviews') }), null)
})

test('explicit fields win over the guess, but only valid ones', () => {
  const x = cleanLink({ url: 'https://leetcode.com/discuss/post/123/x', title: 'My interview', company: 'Uber', role: 'Backend', yoe: '4', outcome: 'nope' })
  assert.deepEqual([x.company, x.role, x.yoe, x.outcome, x.source], ['Uber', 'Backend', 4, null, 'leetcode'])
  assert.equal(sourceOf('https://old.reddit.com/r/leetcode/x'), 'reddit')
})

test('a user experience needs a company and enough detail', () => {
  const bad = validateExperience({ company: '', body: 'short' })
  assert.ok(bad.errors.some((e) => e.includes('company')))
  assert.ok(bad.errors.some((e) => e.includes('at least')))
  const ok = validateExperience({
    company: 'swiggy', roleTitle: 'SDE-2 Backend', yoe: 3,
    rounds: [{ name: 'Machine coding', notes: 'Build a rate limiter in 90 minutes. '.repeat(8) }, { name: '', notes: '' }],
  })
  assert.deepEqual(ok.errors, [])
  assert.equal(ok.experience.company, 'Swiggy')
  assert.equal(ok.experience.role, 'SDE 2')
  assert.equal(ok.experience.rounds.length, 1)
  assert.equal(ok.experience.title, 'Swiggy | SDE-2 Backend | 3 YoE')
})

test('a search is understood as company / role / YoE / words', () => {
  assert.deepEqual(parseQuery('google sde 2 3 yoe bangalore'), { company: 'Google', companyKey: 'google', role: 'SDE 2', yoe: 3, terms: ['bangalore'] })
  assert.deepEqual(parseQuery('Goldman Sachs interview experience for freshers'), { company: 'Goldman Sachs', companyKey: 'goldman sachs', role: null, yoe: 0, terms: [] })
  assert.deepEqual(parseQuery('system design round'), { company: null, companyKey: null, role: null, yoe: null, terms: ['system', 'design', 'round'] })
  assert.equal(parseQuery('facebook e5').company, 'Meta')
  assert.equal(parseQuery('facebook e5').role, 'SDE 3 / Senior')
  // a company the site knows about, even if it isn't famous
  assert.equal(parseQuery('zorvyn backend', [{ name: 'Zorvyn', key: 'zorvyn' }]).company, 'Zorvyn')
  assert.equal(parseQuery('interview experience'), null)
})
