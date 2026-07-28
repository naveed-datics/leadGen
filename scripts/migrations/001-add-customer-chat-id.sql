-- Required for inbound WhatsApp @lid matching (run once on production Neon DB)
ALTER TABLE whatsapp_conversations
ADD COLUMN IF NOT EXISTS customer_chat_id text;
