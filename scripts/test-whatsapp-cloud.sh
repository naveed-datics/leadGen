#!/usr/bin/env bash
set -euo pipefail

# WhatsApp Cloud API quick test.
# Required env vars:
# - WA_CLOUD_TOKEN: Permanent/System User access token with whatsapp_business_messaging permission
# - WA_PHONE_NUMBER_ID: Phone Number ID (not the WABA ID)
# Optional:
# - WA_TO: E.164 digits-only or with + (default: 923334911930)
# - WA_TEXT: message body (default: "What can I help you with today?")
# - WA_GRAPH_VERSION: Graph API version (default: v25.0)

if [[ -z "${WA_CLOUD_TOKEN:-}" ]]; then
  echo "Missing env var: WA_CLOUD_TOKEN" >&2
  exit 2
fi

if [[ -z "${WA_PHONE_NUMBER_ID:-}" ]]; then
  echo "Missing env var: WA_PHONE_NUMBER_ID" >&2
  exit 2
fi

WA_TO="${WA_TO:-923334911930}"
WA_TEXT="${WA_TEXT:-What can I help you with today?}"
WA_GRAPH_VERSION="${WA_GRAPH_VERSION:-v25.0}"

curl -sS -i --request POST \
  --url "https://graph.facebook.com/${WA_GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/messages" \
  --header "Authorization: Bearer ${WA_CLOUD_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$(cat <<EOF
{
  "messaging_product": "whatsapp",
  "to": "${WA_TO}",
  "type": "text",
  "text": {
    "body": "${WA_TEXT}"
  }
}
EOF
)"

