-- Applied on every boot; every statement is idempotent.
-- Ids are text (generated in Node) so the same schema runs on Postgres and PGlite.

CREATE TABLE IF NOT EXISTS users (
  id          text PRIMARY KEY,               -- "g_<google sub>" or "dev_<name>"
  email       text,
  name        text NOT NULL,
  picture     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_name_idx  ON users (lower(name));

-- One row per pair of people. pending = request sent, accepted = friends.
-- Rejecting or removing deletes the row, so people can re-request later.
CREATE TABLE IF NOT EXISTS friendships (
  id            text PRIMARY KEY,
  requester_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id  text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  CHECK (requester_id <> addressee_id)
);
-- A pair can only have one row, whichever direction it was sent in.
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_idx
  ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE TABLE IF NOT EXISTS challenges (
  id              text PRIMARY KEY,
  creator_id      text NOT NULL REFERENCES users(id),
  title           text NOT NULL,
  statement       text NOT NULL,
  category        text NOT NULL,
  difficulty      text NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
  format          text NOT NULL,
  mode            text NOT NULL CHECK (mode IN ('independent', 'collaborative')),
  time_limit_min  int  NOT NULL CHECK (time_limit_min BETWEEN 5 AND 240),
  status          text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  room_code       text,                       -- collaborative only
  started_at      timestamptz,                -- collaborative: shared timer
  deadline_at     timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Many participants per challenge (2 in V1, a whole group later: no schema change needed).
CREATE TABLE IF NOT EXISTS challenge_participants (
  challenge_id  text NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id),
  role          text NOT NULL CHECK (role IN ('creator', 'invitee')),
  state         text NOT NULL CHECK (state IN ('INVITED', 'ACCEPTED', 'DECLINED', 'IN_PROGRESS', 'SUBMITTED')),
  started_at    timestamptz,                  -- independent: personal timer
  deadline_at   timestamptz,
  submitted_at  timestamptz,
  responded_at  timestamptz,
  PRIMARY KEY (challenge_id, user_id)
);
CREATE INDEX IF NOT EXISTS participants_user_idx ON challenge_participants (user_id);
-- The deadline sweep only looks at attempts in progress.
CREATE INDEX IF NOT EXISTS participants_due_idx ON challenge_participants (deadline_at) WHERE state = 'IN_PROGRESS';

-- owner = a user id (independent) or 'team' (collaborative). Draft and final share the row;
-- is_final flips once and the row is never written again.
CREATE TABLE IF NOT EXISTS submissions (
  challenge_id  text NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  owner         text NOT NULL,
  content       jsonb NOT NULL,
  is_final      boolean NOT NULL DEFAULT false,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  submitted_at  timestamptz,
  PRIMARY KEY (challenge_id, owner)
);

CREATE TABLE IF NOT EXISTS reviews (
  challenge_id  text NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  reviewer_id   text NOT NULL REFERENCES users(id),
  reviewee_id   text NOT NULL REFERENCES users(id),
  scores        jsonb NOT NULL,
  good          text NOT NULL DEFAULT '',
  change        text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, reviewer_id, reviewee_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenge_id  text NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id       text NOT NULL REFERENCES users(id),
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_challenge_idx ON messages (challenge_id, id);

-- Rooms and their Yjs documents survive restarts and deploys.
CREATE TABLE IF NOT EXISTS rooms (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  created_by      text NOT NULL REFERENCES users(id),
  challenge_id    text REFERENCES challenges(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_active_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ydocs (
  name        text PRIMARY KEY,
  state       bytea NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Allowed answer formats. Dropped and re-added on boot so adding a format is a one-line change.
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_format_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_format_check CHECK (format IN ('code', 'design', 'lld', 'debug'));

-- ───────────────────────── Problem library ─────────────────────────
-- One table for every practice problem: seeded by us, or submitted by users.
-- A submitted problem goes:  pending ──► admin ──► published | rejected
-- (ai_status / ai_claimed_at / ai_review are from v1.3, when the AI reviewed problems. Unused since v1.4.)
-- Lists (constraints, follow-ups, checklist) are jsonb arrays of strings: they're always
-- read together with the problem and never queried on their own.
CREATE TABLE IF NOT EXISTS problems (
  id            text PRIMARY KEY,
  slug          text NOT NULL UNIQUE,            -- URL: /problems/<slug>
  title         text NOT NULL,
  statement     text NOT NULL,
  category      text NOT NULL,
  difficulty    text NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),  -- shown as Beginner / Intermediate / Advanced
  format        text NOT NULL,
  constraints   jsonb NOT NULL DEFAULT '[]',     -- scale / latency / consistency, shown on screen
  follow_ups    jsonb NOT NULL DEFAULT '[]',     -- what an interviewer asks next, in order
  checklist     jsonb NOT NULL DEFAULT '[]',     -- what a good answer covers (for reviewers)
  companies     text[] NOT NULL DEFAULT '{}',
  sources       jsonb NOT NULL DEFAULT '[]',     -- [{ url, label }]: links only, never copied content
  origin        text NOT NULL CHECK (origin IN ('seed', 'user')),
  created_by    text REFERENCES users(id),
  status        text NOT NULL CHECK (status IN ('pending', 'published', 'rejected')),
  ai_status     text NOT NULL DEFAULT 'waiting' CHECK (ai_status IN ('waiting', 'claimed', 'done', 'failed', 'skipped')),
  ai_claimed_at timestamptz,
  ai_review     jsonb,                           -- the worker's report (advisory only)
  admin_note    text,
  reviewed_by   text REFERENCES users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  published_at  timestamptz
);
CREATE INDEX IF NOT EXISTS problems_status_idx ON problems (status, created_at);
CREATE INDEX IF NOT EXISTS problems_creator_idx ON problems (created_by);

-- A challenge started from the library remembers its problem (but keeps its own copy of the statement,
-- so editing a problem later never changes a challenge that already happened).
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS problem_id text REFERENCES problems(id);
CREATE INDEX IF NOT EXISTS challenges_problem_idx ON challenges (problem_id);

-- ───────────────────────── Solution reviews (v1.4) ─────────────────────────
-- Feedback on one answer:
--   kind 'ai'    : the worker on your laptop (Ollama), asked for from the solve screen, usually on a draft
--   kind 'admin' : a person, asked for after you submit, on your final answer
-- The answer is copied in, so a review always matches what was reviewed even if the draft moves on.
--   waiting ──(worker claims / admin opens)──► claimed ──► done | failed
CREATE TABLE IF NOT EXISTS solution_reviews (
  id            text PRIMARY KEY,
  challenge_id  text NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  owner         text NOT NULL,                   -- whose answer: a user id, or 'team'
  requested_by  text NOT NULL REFERENCES users(id),
  kind          text NOT NULL CHECK (kind IN ('ai', 'admin')),
  status        text NOT NULL CHECK (status IN ('waiting', 'claimed', 'done', 'failed')),
  draft         boolean NOT NULL,                -- reviewed before the final submit
  content       jsonb NOT NULL,                  -- { language, fields }, same shape as submissions
  result        jsonb,
  reviewer_id   text REFERENCES users(id),
  claimed_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  done_at       timestamptz
);
CREATE INDEX IF NOT EXISTS solution_reviews_answer_idx ON solution_reviews (challenge_id, owner, created_at);
CREATE INDEX IF NOT EXISTS solution_reviews_queue_idx ON solution_reviews (kind, created_at) WHERE status IN ('waiting', 'claimed');
-- One admin review per answer, and one AI review in flight per answer.
CREATE UNIQUE INDEX IF NOT EXISTS solution_reviews_admin_once ON solution_reviews (challenge_id, owner) WHERE kind = 'admin';
CREATE UNIQUE INDEX IF NOT EXISTS solution_reviews_ai_running ON solution_reviews (challenge_id, owner) WHERE kind = 'ai' AND status IN ('waiting', 'claimed');

-- ───────────────────────── Interview experiences (v1.4) ─────────────────────────
-- Two kinds of rows, filtered by company / role / years of experience:
--   - from other sites (scraper or an admin adding a link): metadata + the LINK only. No copied text, ever.
--   - written here by a user: their own words in body/rounds. Goes pending ──► admin ──► published | rejected.
CREATE TABLE IF NOT EXISTS experiences (
  id           text PRIMARY KEY,
  source       text NOT NULL,                    -- 'user', or the site: gfg, leetcode, reddit, medium, web
  url          text UNIQUE,                      -- the original post; NULL for ones written here
  title        text NOT NULL,
  company      text NOT NULL,
  company_key  text NOT NULL,                    -- lower-case company, for filtering and grouping
  role         text NOT NULL,                    -- one of ROLES in modules/experiences/classify.js
  role_title   text NOT NULL DEFAULT '',         -- as written by the author, e.g. "SDE-1 (Payments)"
  yoe          int CHECK (yoe BETWEEN 0 AND 40), -- NULL = not stated
  tags         text[] NOT NULL DEFAULT '{}',     -- on-campus, off-campus, internship, referral
  outcome      text CHECK (outcome IN ('selected', 'rejected', 'pending')),
  rounds       jsonb NOT NULL DEFAULT '[]',      -- written here only: [{ name, notes }]
  body         text NOT NULL DEFAULT '',         -- written here only
  created_by   text REFERENCES users(id),
  anonymous    boolean NOT NULL DEFAULT false,   -- written here: hide the author's name
  status       text NOT NULL CHECK (status IN ('pending', 'published', 'rejected')),
  edited       boolean NOT NULL DEFAULT false,   -- an admin fixed it: the scraper won't overwrite it
  admin_note   text,
  posted_at    timestamptz,                      -- when the original was posted (if known)
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Added after the table first shipped: upgrade databases created before it.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS anonymous boolean NOT NULL DEFAULT false;
-- posted_at was estimated (from the post's place in the site's sitemap), not read from the post itself.
ALTER TABLE experiences ADD COLUMN IF NOT EXISTS posted_approx boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS experiences_list_idx ON experiences (status, (coalesce(posted_at, created_at)) DESC);
CREATE INDEX IF NOT EXISTS experiences_company_idx ON experiences (company_key) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS experiences_role_idx ON experiences (role) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS experiences_creator_idx ON experiences (created_by);

-- ─── v1.6: prep profile ──────────────────────────────────────────────────────────
-- What someone is preparing for. It personalises the home page (plan, problems, experiences).
CREATE TABLE IF NOT EXISTS prep_profiles (
  user_id         text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role            text,
  yoe             int,
  companies       text[] NOT NULL DEFAULT '{}',   -- display names, e.g. {"Amazon","Flipkart"}
  focus           text[] NOT NULL DEFAULT '{}',   -- problem categories to practise
  language        text,
  interview_date  date,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── v1.8: runnable test cases ───────────────────────────────────────────────────
-- Coding problems carry their test cases (format: client/src/lib/runner/harness.js).
-- The code runs in the browser, so the server only stores and serves them.
ALTER TABLE problems ADD COLUMN IF NOT EXISTS tests jsonb;

-- ─── v1.9: invite links ──────────────────────────────────────────────────────────
-- Every challenge with someone else in it gets a link (/join/<code>). Opening it signs the
-- person in, adds them to the challenge and makes them friends with the creator, so you can
-- challenge someone who isn't on CodeRoom yet. Solo practice has no code.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS invite_code text;
CREATE UNIQUE INDEX IF NOT EXISTS challenges_invite_idx ON challenges (invite_code) WHERE invite_code IS NOT NULL;

-- ─── v2.2: usernames and passwords ───────────────────────────────────────────────
-- The username is the public, unique handle (@asha). Email stays private: it's never sent to
-- other people and you can't search by it. Password accounts store a scrypt hash, never the password.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users (lower(username)) WHERE username IS NOT NULL;

-- ─── v2.2: groups ────────────────────────────────────────────────────────────────
-- A named group of friends. Anyone in it can send the whole group a challenge; everyone
-- answers on their own (Race), and the answers are compared side by side when it's done.
CREATE TABLE IF NOT EXISTS groups (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  owner_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id  text NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id   text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      text NOT NULL CHECK (role IN ('owner', 'member')),
  added_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON group_members (user_id);
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS group_id text REFERENCES groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS challenges_group_idx ON challenges (group_id) WHERE group_id IS NOT NULL;
