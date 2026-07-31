-- WhatsApp delivery / read tracking for proposals (WAHA message.ack)
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS outbound_wa_message_id text;

CREATE INDEX IF NOT EXISTS whatsapp_messages_wa_message_id_idx
  ON whatsapp_messages (wa_message_id);
