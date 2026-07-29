-- Agent-owned industries catalog + per-agent search uniqueness key

CREATE TABLE IF NOT EXISTS industries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_normalized text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industries_agent_name_normalized_uidx
  ON industries (agent_id, name_normalized);

ALTER TABLE searches
  ADD COLUMN IF NOT EXISTS search_key text;

CREATE UNIQUE INDEX IF NOT EXISTS searches_agent_search_key_uidx
  ON searches (agent_id, search_key);
