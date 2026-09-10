-- Store the complete unmodified B2B Leads Finder record per contact.

ALTER TABLE business_contacts
  ADD COLUMN IF NOT EXISTS raw_json jsonb;
