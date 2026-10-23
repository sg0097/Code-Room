# CodeRoom (V2.5)

Challenge a friend with an unfamiliar engineering problem, solve it (alone or together), then compare, discuss and review.

## What's in V1

| Area | Features |
|---|---|
| Accounts | Google sign-in, profile with counts, sign out |
| Friends | Search (name prefix or exact email), request / accept / reject / cancel, remove, friends list |
| Challenges | Title, statement, category, difficulty, time limit, answer format, **Independent** or **Collaborative**, sent to a friend |
| Independent | Statement hidden until you press Start · personal server-enforced timer · autosaved drafts · locked submit · **reveal only when everyone submitted** · side-by-side compare · discussion · **blind** peer review |
| Collaborative | Opens a V0 room tied to the challenge: shared timer, one tab per answer field, live editor + video, team submit |
| Home (v1.6) | Says what CodeRoom is (first visit and sign-in page) · **Up next** problems picked from your prep goals · countdown to your interview · progress by area · new experiences from your target companies · invites, active challenges, practice room |
| Prep goals (v1.6) | On the profile: target role, YoE, companies, focus areas, interview date, preferred language. Drive the home page and the editor's starting language |
| History | All challenges, filterable by state |
| Feedback (v1.4) | **AI review** of your draft while solving (local Qwen, hints not answers) · **Submit for admin review** after you submit |
| Code editor (v1.5) | A real multi-file editor (file tree, folders, tabs, rename/delete) wherever code is written: solo, rooms (live, shows who's in which file), compare, admin, AI review |
| Approach (v1.5) | Each thinking section says what it should cover; the problem's constraints sit next to your approach; the AI checks the code matches what you said |
| Interview experiences (v1.4) | One page for experiences from GeeksforGeeks, LeetCode, Reddit… (as **links**) and ones written here · filter by **company, role, years of experience** |

Not built yet: groups (the schema already supports them), scheduling, notifications, leaderboards, running code against test cases.

---

## Problem library (v1.3)

LeetCode-style list at `/problems`: topic pills, level / status filters, search, "Pick one", a progress ring. Each problem opens in a split view: **Description · Follow-ups · What a good answer covers** on the left, **Practice solo / Challenge a friend** on the right.

- **Levels:** stored as `Easy / Medium / Hard`, shown as **Beginner / Intermediate / Advanced**.
- **12 original seed problems** (`server/modules/problems/seed.js`), 4 per level, across system design, backend, LLD and debugging. They're inserted at boot only if their slug is missing, so edits made in the app are never overwritten.
- **Practice solo** = an independent challenge with nobody invited. It completes as soon as you submit.
- **Challenge a friend** opens the normal new-challenge form, with the problem locked in.
- A challenge **copies** the statement and constraints, so editing a problem later never changes past challenges.
- **Follow-ups and the checklist unlock after you've submitted once.** Seeing them first would shape your answer. The API enforces this, not just the UI.

### Submitting a problem → admin

```
User submits ──► instant checks (server) ──► admin queue ──► published / rejected
                 lengths, links, spam,        edit, add follow-ups
                 near-duplicate titles        and checklist, note
```

- **Near-duplicates:** title word overlap (`checks.js`). The author sees the matches and can confirm "it's different".
- **Admins:** `ADMIN_EMAILS=you@gmail.com,sister@gmail.com`. With `DEV_LOGIN=true`, signing in as **admin** gives you admin rights locally.
- Until v1.3 the AI reviewed submitted problems. Since v1.4 it reviews *solutions* instead (below), and problems go straight to the admin. The old `ai_*` columns are left in the table, unused.

### Code layout

```
server/modules/problems/      routes.js · repo.js · checks.js (validation, duplicate titles) · seed.js · checks.test.mjs
server/modules/reviews/       routes.js · repo.js · clean.js (answer → text for the model, cleaning its report) · clean.test.mjs
server/modules/experiences/   routes.js · repo.js · classify.js (company / role / YoE from a title or URL) · classify.test.mjs
server/modules/admin/         routes.js (what's waiting, for the nav badge)
server/http.js · worker.js    shared route helpers · the WORKER_TOKEN check
worker/                       ai-review.mjs (loop) · prompt.mjs (prompt + schema) · fake-ollama.mjs (tests)
scraper/                      experiences.mjs (CLI) · sources/gfg.mjs · robots.mjs · classify-ai.mjs
client/src/features/problems/      ProblemsPage · ProblemPage · SubmitProblemPage · MyProblemsPage
client/src/features/reviews/       useSolutionReviews · ReviewCards · SolutionFeedback
client/src/features/experiences/   ExperiencesPage · ExperiencePage · ShareExperiencePage · MyExperiencesPage
client/src/features/admin/         AdminPage → SolutionQueue · ProblemQueue · ExperienceQueue
```

Unit tests: `npm test --prefix server`. New features go in `modules/<feature>/` and `features/<feature>/` like this. The older code (challenges, rooms, friends) moves over when we next touch it.

The UI uses a LeetCode-like dark theme. All colors are tokens at the top of `client/src/index.css`.

---

## Solution feedback (v1.4)

Two ways to get feedback on an answer, both shown on the challenge page:

| | When | Who | What you get |
|---|---|---|---|
| **✨ AI review** | While solving (the solve screen) or after submitting | Qwen on your laptop, through the worker | A 1–5 rating, what's good, what to improve, questions to think about. About 10–20 s. |
| **Submit for admin review** | After you submit, once per solution | An admin, in Review queue → Solutions | A 1–5 rating and two comments |

```
Solve screen ──"AI review"──► solution_reviews (kind ai, draft copy of the answer) ──► worker claims ──► Ollama ──► result
After submit ──"Submit for admin review"──► solution_reviews (kind admin, final answer) ──► admin queue ──► result
```

- **The review is private:** only the people whose answer it is (and admins) see it.
- **On a draft, the AI gives hints, not answers.** The prompt says so twice, the second time at the end, where an 8B model pays most attention. The reviewer checklist is not sent for drafts, so the AI can't leak what unlocks after you submit.
- **One AI review at a time per answer** (a unique index), and 8 per hour per person.
- **An admin who is solving the same challenge** doesn't see the other side's request until the challenge is complete, so the reveal rule holds for admins too.
- Whiteboards are sent to the model as text: the labelled boxes, which arrows connect them, and free notes (`describeDiagram`).
- AI review is for answers written on your own (independent and practice). Collaborative teams can ask for an admin review.

### The AI worker (Ollama, no API key)

The server never calls a model. A small worker on your laptop asks the server for work:

```bash
ollama pull qwen3:8b
# server: set WORKER_TOKEN=<random string> (openssl rand -hex 24)
SERVER_URL=https://your-app.onrender.com WORKER_TOKEN=<same string> node worker/ai-review.mjs
```

- It claims one review at a time (`FOR UPDATE SKIP LOCKED`, so two workers never get the same one), calls Ollama with a **JSON schema** (`worker/prompt.mjs`) and posts the result back. It checks every 5 s, since someone is usually waiting.
- If your laptop is off, requests wait as "Queued". A claim older than 10 minutes is handed out again. A failure shows on the page with **Try again**.
- Without `WORKER_TOKEN`, the AI review button is disabled and says why. Admin review still works.
- `worker/fake-ollama.mjs` is a stand-in model used by the tests.

---

## Interview experiences (v1.4)

`/experiences` (in the navbar) puts interview experiences from other sites and from people here in one list, searched by the three things people search by: **company** (prefix match, so "goldm" finds Goldman Sachs), **role** (Intern, SDE 1/2/3, Frontend, Data / ML…) and **years of experience** (Fresher, 1–2, 3–5, 6–9, 10+). There's also a title search, a source filter and top companies on the side.

**Search understands what you're looking for.** "google sde 2 3 yoe bangalore" is read as company Google, role SDE 2, about 3 YoE, plus the word "bangalore" (`parseQuery` in `classify.js`), and the results are **ranked** by how well they fit: the company you named +5, the role +2, YoE closeness up to +1.2, each other word in the title +0.8. A post has to match at least one of them. The page shows what it understood ("Best matches for Google · SDE 2"). Words no longer have to sit next to each other.

**Across the web (live).** With `BRAVE_API_KEY` set, the first page of a search also asks the Brave Search API for posts on LeetCode, Glassdoor, GeeksforGeeks, Reddit and Medium, classifies them the same way, drops the ones we already list, and **ranks them in with ours** (marked 🌐). They are shown, never saved: Brave's standard terms don't include storing results. A 15-minute in-memory cache and `BRAVE_DAILY_LIMIT` (default 200/day) keep the bill down; Brave charges about $5 per 1,000 searches, with a $5 monthly credit. Without a key the page works the same, minus those rows. (Scraping LeetCode or Glassdoor directly isn't possible: Cloudflare bot checks, and Glassdoor's terms forbid it.)

**Order.** *Most relevant* (the default) is for someone preparing now. Recency counts most: a post loses half its weight in about a year, and a post with no date counts as 3 years old. On top of that, a post gets a boost if it was written here, if it states the role, YoE or outcome, if it matches the exact company you typed, or if your search words are in its title (`RELEVANCE` in `experiences/repo.js`). *Newest first* sorts by date only, with undated posts last.

**From other sites we store the link only:** title, company, role, YoE, tags, date and URL. Never the post's text. Clicking one opens our page with "Read it on GeeksforGeeks ↗", and the author keeps the traffic and the credit.

**Written here:** a user shares rounds (name + what was asked) and notes, can post anonymously, or links a post they wrote elsewhere. It goes to Review queue → Interview experiences, and an admin publishes it.

### How things get sorted

`classify.js` reads the title (and the URL slug) the way people write them:

| Site habit | Example | → company · role · YoE |
|---|---|---|
| GfG slug | `amazon-interview-experience-set-269-1-year-experienced-for-sde-1` | Amazon · SDE 1 · 1 |
| GfG "campus" | `samsung-bangalore-srib-interview-experience-set-22-campus` | Samsung · SDE 1 · 0 (on-campus) |
| LeetCode | `Google \| L4 \| Bangalore \| Offer` | Google · SDE 2 · (selected) |

Company spellings are grouped ("JP Morgan", "jpmc" → JPMorgan; "Amazon Web Services" → Amazon). On 784 real GfG links: 98% kept, 281 companies. About a quarter have no role in the title at all ("Amazon Interview Experience | 262"); `AI=true` lets Qwen read those posts and fill in the role and YoE. An admin can fix any row, and the scraper never overwrites an admin's edit.

### The scraper

Runs on your laptop like the worker, with the same `WORKER_TOKEN`:

```bash
# links, newest first, each dated (fast: ~3 requests per sitemap for ~15–20k links)
SERVER_URL=https://your-app.onrender.com WORKER_TOKEN=<same string> node scraper/experiences.mjs

# + open each post for its real title and date (1 request/second: hours for everything)
PAGES=true ... node scraper/experiences.mjs

# + let Qwen fill company / role / YoE when the title doesn't say (only those posts; ~5–10 s each)
AI=true ... node scraper/experiences.mjs

# look first: print what would be sent, for the first 2 sitemaps
DRY_RUN=true MAX_SITEMAPS=2 node scraper/experiences.mjs
```

- **Polite:** obeys robots.txt (`robots.mjs`), one request per `DELAY_MS` (default 1000), backs off on 429/5xx, and says who it is in the User-Agent.
- **Newest first, with dates:** GfG numbers its sitemaps in posting order (1 is 2016, ~188 is this month), and each one covers a few weeks in date order. The scraper starts at the newest, opens only the first and last post of each sitemap, and spreads the dates in between (±2 weeks, shown as "~Sep 2026"). `PAGES=true` replaces these estimates with exact dates. An estimate never overwrites an exact date. `MAX_SITEMAPS=10` gives roughly the last year.
- **Incremental:** remembers each sitemap's `lastmod` in `scraper/.state.json` and only re-reads changed ones. Re-sending a link updates its details instead of duplicating it.
- With `AI=true` the post's text goes to Ollama on your machine and nowhere else. The server only receives the fields.

**Sources.** Only **GeeksforGeeks** is scraped: it publishes sitemaps and its robots.txt allows these pages. Exam and event stories it files in the same folder (JEE, GATE, workshops…) are skipped. **LeetCode** Discuss can only be listed through `/graphql`, which its robots.txt disallows, and its sitemap sits behind a Cloudflare bot check. **Reddit** blocks unauthenticated requests (it has an official API with a key). For those, an admin pastes links in Review queue → Interview experiences → **+ Add links**, and users can link their own posts. Each link is classified from its URL.

---

## Code editor and approach (v1.5)

**Code is a project, not a text box.** Every code field (the Code and LLD formats) is a file tree with folders, tabs, new file / new folder, rename and delete. LLD answers start in Java (`Main.java`), the others in the first language in the list.

- **Stored as JSON in the same answer field:** `{ "files": [{ "path": "src/Main.java", "content": "…" }], "folders": ["src"] }`, so drafts, autosave, the reveal rule, compare and history didn't change. `server/project.js` checks paths (no `..`, at most 6 folders deep) and limits (60 files, 300 KB). Answers from before v1.5 (plain code) open as one file.
- **Solo** (`components/project/ProjectEditor.jsx`): one Monaco model per file, so each file keeps its own undo history.
- **Rooms** (`CollabProjectEditor.jsx`): each file is its own shared `Y.Text` in `Y.Map('files:<field>')`, and empty folders sync through `Y.Map('folders:<field>')`. People can be in different files, and the tree shows a coloured dot where each person is. Team submit reads the maps into the same JSON (`rooms.js projectJson`). Older rooms' single shared text becomes `main.*`.
- **Read-only** (compare, admin queue): the same tree and tabs, with highlighted code.
- **The AI reads the whole project:** the file tree, then each file (smallest first, long files cut).

**Approach sections fit the format.** Code: *Approach* (before the code) → Code → *Complexity & edge cases*. LLD: *Requirements & assumptions* → Class diagram → Code → *Design decisions*. Each section lists what it should cover (`prompts` in `catalog.js`), and library problems show their constraints next to the first section ("Your approach should handle: …"). The AI reviewer gets the same lists, judges the thinking section by section, and is told to lead with any place where the **code doesn't do what the approach says** ("you wrote a State pattern, but Hold uses a String").

## Home, prep goals and the look (v1.6)

**One clear home.** The top bar has four places: Home, Problems, Experiences, Challenges (plus Review for admins). Friends, my problems, my experiences and sign out live in the avatar menu. The sign-in page and a new person's home explain what CodeRoom is in three steps and four tiles.

**Prep goals** (`server/modules/prep`, table `prep_profiles`), set on the profile page:

- `GET/PUT /api/prep`: role, YoE, up to 8 companies, focus areas (problem categories), language, interview date (today to a year ahead). All optional.
- `GET /api/prep/home`: days left, **up next** (4 unsolved problems: asked at a target company +3, in a focus area +2, difficulty that fits the time left, started-but-unfinished +1, each with the reason shown), solved/total per area, and the newest experiences from the target companies (same role first).
- The solve screen starts in your preferred language while nothing is written yet.

**Look.** A calm dark theme (indigo accent, Inter, softer borders) replaces the LeetCode orange/green; every colour is a token in `client/src/index.css :root`. Problems are cards with a progress strip instead of a striped table; experience rows show one quiet line of details instead of a row of chips; one search box leads the experiences page. Works down to phone width.

**Look (v1.7).** Inspired by modern coding-platform designs: a sidebar (Practice / Together / Admin, plus a "Challenge a friend" card) with a header search (⌘K, searches interview experiences); on phones the sidebar slides in from the menu button.
- **Home:** a gradient banner with your goal, "Continue practising" and a countdown ring; stat tiles (solved, day streak, challenges done, active days); problems picked for you with category icons; progress bars per area; a GitHub-style **practice heatmap** (each day you start or submit something); latest interviews from your target companies; practice room.
- **Sign-in page:** a landing page with a product picture (editor, a teammate's cursor, AI review, live room), live counts (`GET /api/landing`: experiences, companies, problems), feature tiles and "how it works".
- `GET /api/prep/home` also returns `activity` (practice per day, last 52 weeks) and `streak`.
- Icons are inline SVG (`components/Icon.jsx`), charts are plain SVG/CSS (`components/Charts.jsx`): no new dependencies.

## Groups (v2.2)

- **Make a group** (`/groups`): a name and some friends (up to 12 people). The owner can rename it, add friends and remove people; anyone can leave (the earliest member takes over if the owner leaves); the owner can delete it.
- **Challenge the group**: from the group page, or pick the group under "Who" on the home page. It goes to everyone in the group and is always a **race**: each person answers on their own, so every submission stays separate. When everyone is done, all the answers are compared side by side (the comparison scrolls sideways for big groups), with the discussion and reviews as usual.
- **Close early**: the sender, once they and at least one other person have submitted, can stop waiting for people who haven't started. Anyone still solving keeps their time.
- **Group page**: its challenges with "3/5 submitted", and a scoreboard per member (challenges done and sent).
- Server: `groups`, `group_members`, `challenges.group_id`; routes in `modules/groups/routes.js`; `POST /api/challenges { groupId }`; `POST /api/challenges/:id/close`.

## Forgot password with a one-time code (v2.4)

On the sign-in card: **Forgot password?** → enter your username or email → we email a **6-digit code** → type it with a new password → you're signed in. You can sign in with **username + password** or **email + password** (same box).

- **Email is now required at sign-up** (still private: nobody else sees it). Older accounts without one add it on the profile page ("Email for password reset", needs your current password).
- **Safety:** the code is random (`crypto.randomInt`), stored only as a keyed hash, works for **10 minutes**, once. **5 wrong guesses** throw it away. One email per minute and 3 per hour per account. The reply is the same whether or not the account exists, the email goes out in the background, and an unknown account makes the same number of database calls, so neither the answer nor its timing shows who has an account. A weak new password is refused without using up a guess.
- **Signing out everywhere (v2.5):** a reset signs out every other device, and so does the profile button **Sign out of all devices** (the device you use stays in). Every account has a `session_version` and every session token carries it; adding 1 kills all older tokens, for normal requests and for live rooms. The current version is cached for a minute per person, and this server updates its own cache at once, so with a single server instance it takes effect immediately. A tab that was signed out remotely goes to the sign-in page on its next action. (Run more than one server instance and a signed-out device could still work for up to a minute.)
- **Tests:** set `RATE_LIMIT_OFF=true` together with `DEV_LOGIN=true` to switch off rate limits on a local test server (it does nothing without `DEV_LOGIN`).

**Turn it on (production).** Set these on your host (Render → Environment). Any SMTP provider works:

| | Gmail | Brevo |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | `smtp-relay.brevo.com` |
| `SMTP_PORT` | `587` | `587` |
| `SMTP_USER` | your Gmail address | the SMTP login shown in Brevo |
| `SMTP_PASS` | a Google **App password** (needs 2-step verification) | your Brevo SMTP key |
| `MAIL_FROM` | `CodeRoom <you@gmail.com>` | a sender you verified in Brevo |

Without `SMTP_HOST` the "Forgot password?" link is hidden (`/api/config` says `passwordReset: false`). Locally (`DEV_LOGIN=true`) nothing is sent: emails are kept in memory and shown at `GET /api/dev/mail`, which only exists in dev. Gmail allows about 500 emails a day, Brevo's free plan 300.

## Accounts: username, email and password (v2.2)

- **Sign up** with a name, a **username**, an optional email and a password (8+ characters). **Sign in** with your username *or* email and password. Google sign-in still works.
- The **@username** is the public identity: unique (case-insensitive), 3–20 characters, letters, numbers, `_` and `.`. Friends search by @username or name. **Email is private**: it's never sent to other people, and you can't search by it.
- First-time Google sign-ins pick a username before anything else (with a suggestion); you can change it on your profile.
- Passwords are stored as scrypt hashes with a random salt, checked in constant time; "no such user" and "wrong password" give the same message and take the same time; sign-in and sign-up are rate-limited.
- Server: `users.username`, `users.password_hash`; `server/accounts.js` (rules, hashing, unit-tested); `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/username?u=`, `POST /api/me/username`.

## Challenge a friend, end to end (v1.9)

The main flow, all from the home page:

1. **Set your goal** in three taps: role, companies, when (`features/prep/GoalCard.jsx`). Edit it any time from the home page.
2. **Challenge a friend** (`features/challenge/QuickChallenge.jsx`): pick a problem (or 🎲 Random), **Race** (same problem, same timer, compare after) or **Together** (one live room), a time, and optionally friends.
3. **Send the link** (`/join/<code>`): copy, WhatsApp or the phone's share sheet. Anyone can open it: the sign-in page shows "Asha challenged you", one click signs them in, one click joins. Joining also makes you friends.
4. **Solve, then compare and discuss.** The challenge page keeps showing the link while you wait.

Server: `challenges.invite_code` (8 characters, no look-alikes) for every challenge with someone else in it; `GET /api/invites/:code` (public preview), `POST /api/invites/:code/join` (adds you, already accepted, and the friendship, in one transaction; refused when finished or full; joining twice is fine). A link challenge waits as INVITED until someone joins; you can start your own attempt before that.

"Write your own problem" is still there (`/challenges/custom`), and also works without friends.

**Look (v1.9).** CodeRoom's own colours: warm paper background, ink text, teal for actions and coral for "Challenge a friend"; a white top bar; Plus Jakarta Sans; short, plain wording.

**Look (v2.3): an engineer's notebook.** CodeRoom's own identity, so it doesn't look like a generated template:
- **Type:** Instrument Serif for headlines and problem titles; IBM Plex Mono for labels, buttons, tags and numbers; IBM Plex Sans for reading; Caveat only for small handwritten margin notes.
- **Surfaces:** graph-paper background, thin ink rules, small corner radii, hard offset ink shadows that press in when clicked; a highlighter mark instead of gradient text. No gradients, glows, glass, tilt, confetti or emoji in the interface.
- **Pieces:** a tear-off calendar for the interview countdown, a paper challenge ticket with a perforation and a rubber "SENT" stamp, numbered steps (01 Problem, 02 How…), a ledger line of numbers, a taped product picture with a sticky note, and a ruled "How it works" list.
- **Colours** stay the single teal + coral palette. **Copy** is written plainly, like a person would say it.

**Look (v2.0).** The light pages, mixed with the dark, lively parts of the older design:
- a dark glass top bar; a dark welcome area on Home with slowly moving colour glows, a grid, the countdown ring that fills in, and the goal card floating on it (new people also see the product picture);
- dark gradient headers on Problems and Experiences;
- **a live challenge ticket** next to the challenge form: it changes as you pick (problem, Race ⚔️ / Together 🤝, time, You vs your friend), tilts with the mouse, and gets confetti and a "SENT" stamp when the link is ready;
- numbers that count up, sections that fade in on scroll, cards that tilt with a spotlight under the mouse, problem rows with a sliding colour bar, a heatmap that tells you the day you hover (today is outlined);
- compact challenge rows in the home sidebar.
All motion is off for people who ask their system for reduced motion (`components/motion.jsx`).

## Running code against tests, for free (v1.8)

Code runs **in the user's browser**, so there's no judge server to pay for.

- **JavaScript:** a fresh Web Worker per run (killed after 5 s, so an infinite loop can't freeze the tab).
- **Python:** [Pyodide](https://pyodide.org) (CPython in WebAssembly) in a worker, loaded once from the jsDelivr CDN (~10 MB, cached by the browser; first run about 2–3 s, then well under a second; 10 s limit).
- **Other languages** (Java, C++, Go…) can still be written and reviewed, but not run yet: the panel says so.

**Test cases are written once for every language** (`client/src/lib/runner/harness.js`): function cases (`args` → `expected`, optionally order-insensitive) and class cases (a list of calls like `["new", 2], ["put", 1, 1], ["get", 1]`; Python calls the snake_case method). Samples show input, your output and expected output; hidden cases only pass/fail.

- **Where:** the room's 7 classic problems (`server/room-tests.js`) and 4 new real-world coding problems in the library (rate limiter, duplicate payment webhooks, top failing endpoints, meeting room booking: `server/modules/problems/coding-seed.js`, stored in `problems.tests`).
- **Solo:** the editor starts with the starter code; **Run code** (Ctrl+') runs the samples, **Run all tests** adds the hidden ones, and **Submit** runs everything and saves the score with the answer (shown in Compare).
- **Rooms:** whoever presses Run runs it in their browser and the result goes into the room's Yjs doc, so everyone sees the same output ("run by Asha").
- **Checked:** every case is verified against reference solutions in JavaScript and Python (`modules/problems/tests.test.mjs`), and the empty starters must fail.
- **Honest limits:** it's practice. Hidden cases are sent to the browser and the score is reported by the browser, so a determined user could cheat it. A server-side judge can be added later without changing the test format.

**Look (v1.8).** Light, in the spirit of HackerRank: a navy top bar with a green underline on the current page, white header bands with breadcrumbs, challenge rows with a "Solve Challenge" button, checkbox filters on the right (they fold into "Filters" on phones), green actions, a blue gradient banner on the home page, light editors and whiteboard.

## Workspaces by problem type

| Format | Workspace | Default for |
|---|---|---|
| `design` | **Whiteboard** + components/flow, APIs, data model, trade-offs | System Design, Backend, Database |
| `lld` | **Whiteboard** (class diagram) + **code** + design decisions | LLD |
| `code` | **Code** (C++, Java, Python, …) + approach & complexity | DSA, Frontend |
| `debug` | What's wrong / why / fix | Debugging, DevOps |

Fields are defined in `server/catalog.js` (`kind`: `diagram` | `code` | `text`). Adding a format is a catalog entry, plus one line in the `schema.sql` constraint.

### Whiteboard (Excalidraw, MIT)

- **Solo (independent):** the diagram is stored as a JSON string of Excalidraw elements in the `diagram` field. It autosaves with the rest of the draft, follows the same reveal rule, and is size-checked (1.5 MB) rather than silently truncated.
- **Shared (rooms):** `Y.Map('whiteboard')` in the room's Yjs document, mapping element id → element. That means **no new server, socket or table**: sync, persistence, reconnect and late joiners all come from the room setup that already exists. Our ~100-line connector (`client/src/components/whiteboard/Whiteboard.jsx`):
  - local → shared: writes only elements whose `version` moved, batched every 60 ms, **as copies** (Excalidraw mutates its objects in place during a drag)
  - shared → local: merged with Excalidraw's own `reconcileElements`, applied without polluting your undo history
  - others' pointers with names, through Yjs awareness
  - deletions sync as `isDeleted` edits; the team submit stores only live shapes, in z-order
- **Compare:** each person's diagram renders read-only, side by side.
- Quick rooms get a **Whiteboard** tab too.
- Excalidraw (~350 KB gzipped) loads only on screens that show a whiteboard. Its fonts are self-hosted: `client/scripts/copy-excalidraw-assets.mjs` runs before dev and build.
- Why not the `y-excalidraw` package: it requires Excalidraw 0.17 / React 18, and this app uses React 19.

## Architecture

```
Browser ── HTTPS /api/*        auth · friends · challenges · drafts · messages · reviews · rooms
        ── WS /sync/<code>     Yjs: shared editor, timer, "submitted" flag   (rooms only)
        ── WS /signal/<code>   WebRTC handshake                             (rooms only)
                     │
             Node server ──────► Postgres  (pg in production, PGlite locally: same SQL)
                     │             users, friendships, challenges, participants,
                     │             submissions, reviews, messages, rooms, ydocs
Browser ◄═══ audio/video peer-to-peer (never touches the server) ═══► Browser
```

| File | Responsibility |
|---|---|
| `server/db.js` | `query()` / `tx()` over Postgres (`DATABASE_URL`) or PGlite (no setup, `server/data/`) |
| `server/schema.sql` | All tables; applied idempotently at boot |
| `server/catalog.js` | Categories, formats and their fields, review criteria. Served at `/api/meta` |
| `server/challenges.js` | **State machine**, deadlines, reveal rule, discussion, reviews, profile |
| `server/friends.js` | Friend graph |
| `server/rooms.js` | Rooms + **Yjs persistence** (docs saved to `ydocs`), access rules, expiry |
| `client/src/pages/Challenge.jsx` | One page that renders the right view for your current state |
| `client/src/components/Workspace.jsx` | Independent solve UI with autosave |
| `client/src/components/Results.jsx` | Compare, discussion, peer review |

### Challenge model

```
challenges (the problem + mode + status)
  └── challenge_participants (one row per person: role, state, personal timer)   ← groups = more rows
  └── submissions (owner = user id, or 'team' for collaborative; draft → final)
  └── reviews (reviewer → reviewee)
  └── messages
  └── rooms (collaborative only) ── ydocs (the shared editor state)
```

### State machine

```
Challenge:     INVITED ──an invitee accepts──► ACTIVE ──everyone submitted──► COMPLETED
                  └────all invitees declined / creator cancels────► CANCELLED

Participant:   INVITED → ACCEPTED → IN_PROGRESS → SUBMITTED        (independent)
                  └→ DECLINED       ACCEPTED ──team submit──► SUBMITTED   (collaborative)
```

- Every transition runs in a transaction that **locks the challenge row** (`SELECT … FOR UPDATE`). Two people submitting at the same instant can't both miss the moment it completes.
- **Deadlines are enforced by the server.** Drafts after the deadline (plus a 30s grace period) are rejected. An overdue attempt is auto-submitted with its last draft, whenever anyone reads the challenge and in a 30-second sweep. Nothing relies on the browser being open.
- **The reveal rule lives in the API.** `GET /api/challenges/:id` never returns other people's answers before `COMPLETED`. Hiding them only in the UI wouldn't be enough.
- **Fair start:** an invitee can't see the statement until they press Start, so nobody gets extra thinking time.
- **Blind reviews:** you see someone's review of you only after you've submitted yours of them.

### Every format, one submission shape

`{ language, fields: { [key]: text } }`. Code has `code` + `explanation`, Design has `architecture`, `apis`, `database` and `tradeoffs`, and Debugging has `issue`, `cause` and `fix`. Compare, review and history work for all formats with no special cases. A collaborative room stores each field as its own Yjs text (`field:<key>`). On submit, the server reads the room document into the same shape.

### V0 issues fixed in this version

- Rooms and their code are **saved to the database**, so they survive restarts and deploys.
- A room that no longer exists shows "This room has ended" instead of reconnecting forever.
- Dropped calls are rebuilt automatically by the person who placed the call.
- Room and challenge creation are rate-limited, and WebSocket upgrades check `Origin` to block cross-site hijacking.

### Known limits

- One server instance (presence and signaling are in memory).
- Mesh video works for up to about 5 people.
- Polling (every 4–10s) instead of push notifications.
- Only friends can be challenged.
- The creator also solves independent challenges, even though they wrote them.

---

## Performance

**The rule:** the server does about 5 ms of work per request. Almost all of the time is spent waiting on the database, once per query. So the code minimizes **round trips**:

- One query loads a challenge with its participants, submissions and reviews (`json_agg` subqueries).
- Status is derived in JS from that snapshot (`deriveStatus`, a pure function), not re-queried.
- Multi-step writes are single statements using CTEs: create = friend check + challenge + participants; submit = state change + final answer; room = row + document + challenge link.
- Reads only open a transaction when a deadline has passed or the status needs updating.
- The connection pool keeps 2 connections warm. Opening a new one costs a TCP + TLS + auth handshake.

| Endpoint | Round trips before → after | At 40 ms DB latency |
|---|---|---|
| Open a challenge | 9 → **1** | 373 → **45 ms** |
| Autosave draft | 8 → **1** | 333 → **44 ms** |
| Dashboard list | 3 (+ sweep) → **1** | 133–263 → **44 ms** |
| Submit | 17 → **5** | 710 → **212 ms** |
| Create challenge | 6 → **1** | 250 → **46 ms** |
| Profile / room check / messages | 2–3 → **1** | 85–126 → **44 ms** |

**See it yourself:** every API response has a `Server-Timing` header (in DevTools, Network → a request → Timing). It shows DB time and the query count. Requests slower than `SLOW_REQUEST_MS` (default 300) are logged as `[slow]`.
To benchmark, run the server with `DEV_LOGIN=true` (and optionally `DB_SIMULATED_LATENCY_MS=40` to imitate a remote database), then run `node server/scripts/bench.mjs`.

**In production, latency is mostly about where things run:**

1. **Put the server and the database in the same region.** Each round trip costs the network delay between them, and across continents that's 100–250 ms. Pick a Neon region next to your Render region (e.g. both in Singapore, or both in Frankfurt).
2. **Neon's free tier suspends the database after about 5 idle minutes.** The first query after that takes roughly 0.5–1 s to wake it. Paid plans can turn this off.
3. **Render's free tier sleeps after about 15 idle minutes.** The first visit then takes 30–60 s.

---

## Run locally

Needs Node 22.9+. No database to install: PGlite stores data in `server/data/`.

```bash
npm run install:all
npm run dev:server     # API on :3001 with dev login (name only)
npm run dev:client     # UI on http://localhost:5173
```

To test with two people, use a normal window and an incognito window and sign in as two names. The same name always gets the same dev account, so you can befriend yourself across sessions. Delete `server/data/` to reset everything.

## Deploy (Render + Neon)

1. **Database:** create a free Postgres on https://neon.tech and copy the connection string.
2. **Google sign-in:** in Google Cloud Console, go to Credentials → OAuth client ID (Web). Add your site URL under *Authorized JavaScript origins*.
3. **Render → New Web Service** from your repo:
   - Build command: `npm run build`
   - Start command: `npm start`
   - Environment variables: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET` (`openssl rand -hex 32`), `NODE_ENV=production`
   - Optional: `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` for strict networks
   - Optional: `WORKER_TOKEN` (`openssl rand -hex 24`) to turn on AI solution review and the scraper upload, `ADMIN_EMAILS`, and `BRAVE_API_KEY` for live web results in the experience search

**Without `DATABASE_URL`, production falls back to PGlite files, and Render wipes them on every deploy.** The server logs a warning when this happens.

## Tested

The automated two-browser runs below passed against both PGlite and a real Postgres 16, before and after the performance rewrite:

- **Independent:** friend request → create → accept (statement hidden) → start → autosave, reload keeps the draft → submit (the API returns 0 other submissions before the reveal) → reveal for both → discussion both ways → blind reviews.
- **Collaborative:** create → accept → room → shared timer → both edit different tabs → team submit → both redirected to the team solution.
- **Persistence:** server restart mid-attempt keeps the draft.
- **Deadline:** an overdue attempt is auto-submitted with its last draft, and late edits are rejected.
- **V0 room regression:** sync, problem and language switch, video, capacity, errors.
- **Whiteboard:** solo drawing autosaves and survives a reload; compare shows both diagrams; in a collaborative LLD room both people draw, each sees the other's shapes live at full size and after a reload, and the team answer contains both shapes plus the code; the quick-room whiteboard syncs.
- **Library (v1.3, updated for v1.4):** list and filters → solo practice → follow-ups unlock → solved tick and progress → submit a problem (duplicate warning) → admin adds follow-ups and publishes → author sees the note → challenge a friend from the library (statement and follow-ups hidden for them).
- **v1.4 API (`server/scripts/e2e-v14-api.mjs`):** AI review on a draft (refused before start and when empty, one at a time, private, no checklist for drafts) → the real worker loop against the fake model → submit → admin review → author sees it; an admin solving the same challenge can't see or review the other side until it's complete; problems skip the AI; scraper upload (needs the token, de-dupes, never stores text) → company / role / YoE / search filters and counts; a user write-up and a user link → admin → published, anonymous; admin edits survive a re-scrape; bulk links; old problem-AI endpoints are gone.
- **v1.4 in the browser:** filters and prefix company search on 769 real GfG links → share a write-up → AI review on a draft appears without a reload → submit → admin review → admin publishes the experience and adds a LeetCode link → author sees the review. No horizontal scroll at 390 px wide.
- **v1.5:** search understanding and word matching, live web results (against a fake Brave, `server/scripts/fake-brave.mjs`) ranked in and never stored, in the API test and the browser; a solo LLD answer with a folder, a file and a folder rename, autosaved and shown read-only after submit; in a collaborative LLD room, one person's new folder and file appear for the other with its code, and the team answer contains both files. API test also on Postgres 16.
- **v1.6:** prep goal checks and the up-next ranking (unit tests); in the browser, a new user fills the goals form (role, YoE, date, language, two companies, two focus areas), saves, and the home shows the countdown, the goal, picks with reasons and experiences from those companies; avatar menu; phone width with no sideways scroll. Prep API also on Postgres 16. Library, room/whiteboard and API tests updated for the new layout and passing.
- **v2.5:** sign out everywhere: API: after a reset both older devices get 401 and `/api/me` shows signed out, the resetting device stays in, `logout-all` ends every older session and keeps this one, needs a session, the session number isn't sent to the browser, a signed-out session is refused by the live room (a real WebSocket) while a current one joins; browser: a second browser is sent to the sign-in page after a reset and after the profile button, while the acting browser stays signed in.
- **v2.4:** forgot password: unit tests for the code, hash, email and masking; API: same reply for real and unknown accounts, one email only, no second email within a minute, a weak password doesn't use a guess, 5 wrong guesses lock the code (the right one then fails too), a code works once, the old password stops working, new password works by email and by username, email change needs the current password and can't take someone else's; browser: sign up (email required) → sign out → forgot → code → wrong code refused → right code signs in → old password refused → email + new password works; the SMTP path against a local fake mail server; production without SMTP hides the feature (503) and the dev mail viewer returns 404.\n- **v2.2:** accounts: a new person signs up (live username check), signs out, a wrong password is refused, signs in with email and with @username, finds friends by @username; API: weak/reserved/duplicate username and email refused, same error for unknown user, no email in search results, can't search by email, username change. Groups: create with two friends, rename, challenge the group (ticket shows the group), a member accepts from home and submits, the owner submits and closes early, both separate answers compared, group page shows 2/2 and the scoreboard; API: only friends can be added, only the owner renames, outsiders can't see or send, groups are races, ownership passes on. Also on Postgres 16.
- **v1.9:** in the browser: a new user sets a goal in three taps, creates a Race challenge from home and gets a link; someone not on CodeRoom opens it, signs in and joins (and they're friends); both solve and submit, see both answers and discuss; then a Together challenge to the new friend is accepted from home and opens the live room. API test: preview, join, rejoin, complete, late joiner refused, bad code; also on Postgres 16. Fixed: the discussion crashed in current Chrome once it had a message (an effect returned scrollIntoView's new Promise).
- **v1.8:** test cases vs reference solutions in both languages (unit tests); in the browser: a room runs JavaScript (0/2 → 2/2 → 6/6 with hidden), the second person sees the result live, an infinite loop hits the time limit, Python via Pyodide passes 6/6; a library rate-limiter problem starts with Python starter code, fails, then passes 4/4 and the score shows after submit. Library, room/whiteboard and API tests updated and passing.
- **v1.7:** streak rule (unit test); walk-through on the sidebar layout: goals → home with countdown ring, streak 1 and today's heatmap square after starting a problem; phone width; library, whiteboard/room and API tests passing.
- **Real model:** the worker against the real `qwen3:8b` (about 10–17 s per review), and `AI=true` scraping on real GfG posts. The library, whiteboard and v1.4 runs above were on PGlite only.
- **Concurrency:** both people submitting at the same instant, 20 times. All 20 completed correctly, thanks to the row lock.
