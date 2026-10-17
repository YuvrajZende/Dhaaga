-- 0000_init.sql
-- Extensions required for vector search and fuzzy matching
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub      text UNIQUE NOT NULL,
  email           text UNIQUE NOT NULL,
  name            text NOT NULL,
  avatar_url      text,
  sharing_enabled boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. Google Tokens (AES-256-GCM sealed)
CREATE TABLE IF NOT EXISTS google_tokens (
  user_id        uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token   bytea NOT NULL,
  refresh_token  bytea NOT NULL,
  scope          text NOT NULL,
  expires_at     timestamptz NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 3. Sources
CREATE TABLE IF NOT EXISTS sources (
  user_id        uuid REFERENCES users(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('contacts','gmail','calendar')),
  status         text NOT NULL DEFAULT 'disconnected'
                 CHECK (status IN ('disconnected','active','syncing','throttled','error')),
  cursor         jsonb,
  last_synced_at timestamptz,
  error          text,
  PRIMARY KEY (user_id, type)
);

-- 4. People Profiles
CREATE TABLE IF NOT EXISTS people (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name   text NOT NULL,
  given_name     text,
  family_name    text,
  primary_email  text,
  title          text,
  company        text,
  company_domain text,
  headline       text,
  avatar_url     text,
  source_refs    jsonb NOT NULL DEFAULT '[]',
  dedup_key      text NOT NULL,
  is_flagged_dup boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS people_owner_idx    ON people (owner_user_id);
CREATE INDEX IF NOT EXISTS people_company_idx  ON people (owner_user_id, company_domain);
CREATE INDEX IF NOT EXISTS people_name_trgm    ON people USING gin (display_name gin_trgm_ops);

-- 5. Contact Edges (Me -> Person)
CREATE TABLE IF NOT EXISTS contact_edges (
  user_id     uuid REFERENCES users(id) ON DELETE CASCADE,
  person_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  strength    smallint NOT NULL DEFAULT 0 CHECK (strength BETWEEN 0 AND 100),
  signals     jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, person_id)
);

CREATE INDEX IF NOT EXISTS contact_edges_strength ON contact_edges (user_id, strength DESC);

-- 6. Person Edges (Canonical person <-> person, a_id < b_id)
CREATE TABLE IF NOT EXISTS person_edges (
  a_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  b_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  weight smallint NOT NULL,
  basis  text NOT NULL DEFAULT 'shared_thread',
  PRIMARY KEY (a_id, b_id),
  CONSTRAINT chk_person_edges_order CHECK (a_id < b_id)
);

CREATE INDEX IF NOT EXISTS person_edges_b_idx ON person_edges (b_id, a_id, weight DESC);

-- 7. Embeddings (pgvector halfvec(384) with HNSW)
CREATE TABLE IF NOT EXISTS embeddings (
  person_id     uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  vec           halfvec(384) NOT NULL,
  model_version text NOT NULL,
  embedded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS embeddings_hnsw ON embeddings
  USING hnsw (vec halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS embeddings_owner_model ON embeddings (owner_user_id, model_version);

-- 8. Embedding Queue
CREATE TABLE IF NOT EXISTS embedding_queue (
  person_id     uuid PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  enqueued_at   timestamptz NOT NULL DEFAULT now()
);

-- 9. Sync Jobs
CREATE TABLE IF NOT EXISTS sync_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source       text NOT NULL,
  kind         text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial','incremental')),
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','running','throttled','done','error')),
  attempt      smallint NOT NULL DEFAULT 0,
  processed    int NOT NULL DEFAULT 0,
  total_hint   integer,
  heartbeat_at timestamptz,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_jobs_pending ON sync_jobs (status, created_at);

-- 10. Friendships
CREATE TABLE IF NOT EXISTS friendships (
  user_id      uuid REFERENCES users(id) ON DELETE CASCADE,
  friend_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  invited_code text,
  PRIMARY KEY (user_id, friend_id)
);

-- 11. Groups
CREATE TABLE IF NOT EXISTS groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  join_code  text UNIQUE NOT NULL,
  owner_id   uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- 12. Warm Intro Drafts
CREATE TABLE IF NOT EXISTS intro_drafts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_person_id uuid NOT NULL,
  mutual_person_id uuid,
  subject          text,
  body             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 13. Decomposition Cache
CREATE TABLE IF NOT EXISTS decomp_cache (
  norm_key   text PRIMARY KEY,
  plan       jsonb NOT NULL,
  model      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 14. LLM Circuit Breaker
CREATE TABLE IF NOT EXISTS llm_breaker (
  id          smallint PRIMARY KEY DEFAULT 1,
  failures    smallint NOT NULL DEFAULT 0,
  open_until  timestamptz
);

-- 15. Searches
CREATE TABLE IF NOT EXISTS searches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text text NOT NULL,
  norm_key   text,
  mode       text NOT NULL DEFAULT 'full' CHECK (mode IN ('fast','full','degraded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 16. Search Results
CREATE TABLE IF NOT EXISTS search_results (
  search_id   uuid REFERENCES searches(id) ON DELETE CASCADE,
  rank        smallint NOT NULL,
  person_id   uuid REFERENCES people(id) ON DELETE CASCADE,
  via_owner_id uuid,
  mutual_person_id uuid,
  score       real NOT NULL,
  rationale   text,
  PRIMARY KEY (search_id, rank)
);

CREATE TABLE IF NOT EXISTS import_rows (
  job_id      uuid REFERENCES sync_jobs(id) ON DELETE CASCADE,
  idx         integer NOT NULL,
  payload     jsonb NOT NULL,
  processed   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (job_id, idx)
);

CREATE INDEX IF NOT EXISTS import_rows_job_processed_idx ON import_rows (job_id, processed, idx);

