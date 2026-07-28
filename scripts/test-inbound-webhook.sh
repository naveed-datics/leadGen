#!/usr/bin/env bash
set -euo pipefail

# Simulate a WAHA inbound message against your local LeadGen dev server.
#
# Prerequisites:
# 1. npm run dev is running
# 2. You already sent an outbound WhatsApp to WA_TO from a search lead
#
# Usage:
#   WA_TO=15551234567 WA_TEXT="Hello back" ./scripts/test-inbound-webhook.sh
#
# Optional:
#   LEADGEN_URL=http://localhost:3000
#   AGENT_ID=uuid   — use /api/whatsapp/webhook/{agentId} (same as production)
#   WAHA_WEBHOOK_SECRET=secret

LEADGEN_URL="${LEADGEN_URL:-http://localhost:3000}"
: "${WA_TO:?Set WA_TO (digits only, e.g. 15551234567)}"
WA_TEXT="${WA_TEXT:-Test inbound reply from script}"
MSG_ID="script-test-$(date +%s)"

PAYLOAD=$(cat <<EOF
{
  "event": "message",
  "session": "${WAHA_SESSION:-default}",
  "payload": {
    "id": "${MSG_ID}",
    "from": "${WA_TO}@c.us",
    "fromMe": false,
    "body": "${WA_TEXT}"
  }
}
EOF
)

HEADERS=(-H "Content-Type: application/json")
if [[ -n "${WAHA_WEBHOOK_SECRET:-}" ]]; then
  HEADERS+=(-H "X-Webhook-Secret: ${WAHA_WEBHOOK_SECRET}")
fi

if [[ -n "${AGENT_ID:-}" ]]; then
  WEBHOOK_URL="${LEADGEN_URL%/}/api/whatsapp/webhook/${AGENT_ID}"
else
  WEBHOOK_URL="${LEADGEN_URL%/}/api/whatsapp/waha/webhook"
fi

echo "POST ${WEBHOOK_URL}"
curl -sS "${HEADERS[@]}" -X POST "${WEBHOOK_URL}" -d "${PAYLOAD}"
echo
echo
echo "Tip: open ${LEADGEN_URL}/leads (log in as agent) or run with sync:"
echo "  curl -b cookies.txt '${LEADGEN_URL}/api/leads/inbound?sync=1'"
