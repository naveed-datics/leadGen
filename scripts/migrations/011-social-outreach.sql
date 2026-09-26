-- Facebook outreach via the Chrome extension: per-agent settings + a job queue.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS social_messaging_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fb_daily_cap integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS extension_token_hash text;

CREATE TABLE IF NOT EXISTS social_outreach_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL
    REFERENCES users (id) ON DELETE CASCADE,
  search_business_id uuid NOT NULL
    REFERENCES search_businesses (id) ON DELETE CASCADE,
  lead_id uuid
    REFERENCES leads (id) ON DELETE SET NULL,
  campaign_id uuid
    REFERENCES campaigns (id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'facebook',
  target_url text NOT NULL,
  body text NOT NULL,
  -- queued | approved | sending | sent | failed | skipped | cancelled
  status text NOT NULL DEFAULT 'queued',
  reason text,
  attempts integer NOT NULL DEFAULT 0,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_outreach_jobs_agent_status_idx
  ON social_outreach_jobs (agent_id, status);

CREATE INDEX IF NOT EXISTS social_outreach_jobs_business_idx
  ON social_outreach_jobs (search_business_id);
