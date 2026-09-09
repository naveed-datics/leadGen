-- Social profile URLs (comma-separated) and future website health status on leads.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS socials text;

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS website_status text;
