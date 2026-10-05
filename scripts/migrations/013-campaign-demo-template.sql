-- Per-campaign WordPress template used when cloning demo sites.
ALTER TABLE users ADD COLUMN IF NOT EXISTS wp_plugin_api_key_enc text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS demo_template text;
