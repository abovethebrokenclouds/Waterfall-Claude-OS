-- Auto-Shorts backend schema.
-- Applied by ops before pointing the API at a Postgres instance
-- (DATABASE_URL). The repository upserts shorts and reads them back by id.

CREATE TABLE IF NOT EXISTS shorts (
  id          TEXT PRIMARY KEY,
  plan        JSONB NOT NULL,
  spec        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS render_jobs (
  id          TEXT PRIMARY KEY,
  short_id    TEXT NOT NULL REFERENCES shorts(id) ON DELETE CASCADE,
  spec        JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',
  output_url  TEXT,
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS render_jobs_short_id_idx ON render_jobs (short_id);
CREATE INDEX IF NOT EXISTS render_jobs_status_idx ON render_jobs (status);
