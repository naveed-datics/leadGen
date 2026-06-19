#!/usr/bin/env bash
set -euo pipefail

: "${WAHA_BASE_URL:?Set WAHA_BASE_URL}"
: "${WA_TO:?Set WA_TO (digits only, no +)}"
: "${WA_TEXT:?Set WA_TEXT}"

SESSION="${WAHA_SESSION:-default}"
CHAT_ID="${WA_TO}@c.us"

HEADERS=(-H "Content-Type: application/json")
if [[ -n "${WAHA_API_KEY:-}" ]]; then
  HEADERS+=(-H "X-Api-Key: ${WAHA_API_KEY}")
fi

echo "Checking ${WA_TO} on session ${SESSION}..."
curl -sS "${HEADERS[@]}" \
  "${WAHA_BASE_URL%/}/api/contacts/check-exists?phone=${WA_TO}&session=${SESSION}"

echo
echo "Sending text to ${CHAT_ID}..."
curl -sS "${HEADERS[@]}" -X POST "${WAHA_BASE_URL%/}/api/sendText" \
  -d "{\"session\":\"${SESSION}\",\"chatId\":\"${CHAT_ID}\",\"text\":\"${WA_TEXT}\"}"
echo
