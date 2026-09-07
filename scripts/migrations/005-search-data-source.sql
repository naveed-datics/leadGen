-- Per-agent Google Places key + search data source, search audit fields,
-- and optional email on search businesses (for Businesses directory filters).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_places_api_key_enc text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS search_data_source text NOT NULL DEFAULT 'serpapi';

ALTER TABLE searches
  ADD COLUMN IF NOT EXISTS data_source text;

ALTER TABLE searches
  ADD COLUMN IF NOT EXISTS api_hits integer NOT NULL DEFAULT 0;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS email text;
