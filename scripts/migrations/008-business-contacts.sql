-- B2B Leads Finder contact-person lookup results.

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS contacts_verified_at timestamptz;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS contacts_found integer;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS contacts_status text;

CREATE TABLE IF NOT EXISTS business_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_business_id uuid NOT NULL
    REFERENCES search_businesses (id) ON DELETE CASCADE,
  name text NOT NULL,
  job_title text,
  linkedin_url text,
  email text,
  email_confidence text,
  email_pattern text,
  phone text,
  phone_source text,
  source text,
  scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS business_contacts_business_idx
  ON business_contacts (search_business_id);
