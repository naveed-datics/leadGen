-- Adds demoGen's internal lead id to proposals (Edit Demo feature). The Edit
-- Demo proxy reuses the existing demo_webhook_api_key_enc credential, so no
-- separate API key column is needed here.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS demo_gen_lead_id text;
