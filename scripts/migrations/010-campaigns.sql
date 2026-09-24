-- Campaigns: filtered collections of businesses, with a lifecycle
-- (draft -> active -> completed/archived) and per-business membership.

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL
    REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL
    REFERENCES campaigns (id) ON DELETE CASCADE,
  search_business_id uuid NOT NULL
    REFERENCES search_businesses (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campaign_businesses_business_idx
  ON campaign_businesses (search_business_id);

CREATE INDEX IF NOT EXISTS campaign_businesses_campaign_idx
  ON campaign_businesses (campaign_id);
