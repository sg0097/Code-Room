// The prompt and output schema for reviewing a SOLUTION to a practice problem.
// Kept separate from the loop so it's easy to tweak and test.
// The review is meant to be basic: a quick read from a friendly senior engineer, not a grade.

const LEVELS = { Easy: 'Beginner (0–2 years)', Medium: 'Intermediate (2–5 years)', Hard: 'Advanced (5+ years)' }

export const SYSTEM = `You are a friendly senior software engineer giving quick feedback on a practice interview answer.
Read the problem and the candidate's answer, then give a short, basic review.

Rules:
- Review THEIR answer. Do not write the solution for them and do not write full code.
- If the answer is a work-in-progress DRAFT, they are still solving it: point them in a direction
  ("look at what the query does for page 4,000") instead of naming the exact fix they missed.
  For a FINAL answer you may name what was missing.
- Be concrete: point at what they wrote ("your cache in front of the DB…"), not generic advice.
- Each written section lists what it should cover. Judge their thinking against that, section by section.
- If there is code, check it does what their approach and design say. A mismatch ("your approach says a
  min-heap but the code sorts the whole list each time") is one of the most useful things to point out.
- Code can span several files: look at how responsibilities are split between them, not just the syntax.
- Match the stated level: don't expect staff-level depth from a beginner problem.
- If the answer is empty or off-topic, say so kindly and give a first step.

Give:
- rating: 1 = barely started or wrong direction, 2 = major gaps, 3 = reasonable with clear gaps,
  4 = solid with small gaps, 5 = strong for this level.
  If they missed the main cause or the main requirement, the rating is at most 2, however tidy the rest is.
  Generic fixes ("add a cache", "scale up the server") that don't address the actual problem are not strengths.
- summary: two sentences at most.
- strengths: 1–4 things they did well.
- improvements: 2–5 specific things to fix or add, most important first.
- hints: 1–3 questions an interviewer would ask next, to make them think (not answers).

Plain sentences. No markdown. Every list item is one sentence.`

export function userMessage(job) {
  const p = job.problem
  const answer = job.answer
    .map((f) => `### ${f.label}${f.covers ? `\n(should cover: ${f.covers.join('; ')})` : ''}\n${f.text || '(left empty)'}`)
    .join('\n\n')
  const checklist = p.checklist?.length
    ? `\nWhat a strong answer covers (for you, the reviewer; use it to judge, don't copy it out):\n${p.checklist.map((c) => `- ${c}`).join('\n')}\n`
    : ''
  return `PROBLEM
Title: ${p.title}
Category: ${p.category}
Level: ${LEVELS[p.difficulty] || p.difficulty}

${p.statement}
${checklist}
CANDIDATE'S ANSWER (${job.draft ? 'draft, still working on it' : 'final, submitted'})

${answer}
${job.answer.some((f) => f.kind === 'project' && f.text) ? CODE_REMINDER : ''}${job.draft ? DRAFT_REMINDER : ''}`
}

// Also at the end: small models skip this check unless it's the last thing they read.
const CODE_REMINDER = `
CHECK BEFORE YOU ANSWER: read their approach / design sections, then the code. If the code does not do what
they said (a pattern they named but didn't use, a class or method they described that is missing or empty),
make that the FIRST item in "improvements" and name both sides ("you wrote X, but the code does Y").`

// Repeated at the very end, where a small model pays most attention: hints on a draft, not answers.
const DRAFT_REMINDER = `
REMEMBER: this is a draft and the timer is running. In "improvements" and "hints", point at WHERE to look
or WHAT to question. Do not name the technique, pattern or fix they haven't found yet.`

const list = (max) => ({ type: 'array', items: { type: 'string' }, maxItems: max })

/** JSON schema passed to Ollama's `format`, so the model must answer in this shape. */
export const SCHEMA = {
  type: 'object',
  properties: {
    rating: { type: 'integer', minimum: 1, maximum: 5 },
    summary: { type: 'string' },
    strengths: list(4),
    improvements: list(5),
    hints: list(3),
  },
  required: ['rating', 'summary', 'strengths', 'improvements', 'hints'],
}
