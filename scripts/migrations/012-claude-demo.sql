-- Claude demo mode: per-user routine endpoint/token + active demo provider,
-- and per-proposal bookkeeping for demos cloned straight from the WP plugin.
ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_routine_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_routine_token_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_beta_header text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_provider text NOT NULL DEFAULT 'demoapp';
ALTER TABLE users ADD COLUMN IF NOT EXISTS claude_dry_run boolean NOT NULL DEFAULT true;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS demo_provider text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS claude_job_id text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS wp_site_id integer;
