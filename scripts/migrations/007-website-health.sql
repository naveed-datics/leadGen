-- Website health check + homepage copyright scrape results on search_businesses.

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS website_http_status integer;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS website_check_state text;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS website_checked_at timestamptz;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS copyright_text text;

ALTER TABLE search_businesses
  ADD COLUMN IF NOT EXISTS copyright_year integer;
