#!/usr/bin/env bash
# Deploy the Rezpona Edge Functions to Supabase and set their secrets.
#
# Usage (from this folder):
#   SUPABASE_ACCESS_TOKEN=sbp_xxx \
#   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \
#   GOOGLE_CLIENT_SECRET=GOCSPX-xxx \
#   bash deploy-functions.sh
#
# Nothing is written to disk — the secrets are passed straight to Supabase.

set -euo pipefail

PROJECT_REF="upepsbyqqefdaygmjxie"
FUNCTIONS=(gbp-connect gbp-reviews gbp-reply gbp-autopilot)

for v in SUPABASE_ACCESS_TOKEN GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  if [ -z "${!v:-}" ]; then echo "Missing required env var: $v" >&2; exit 1; fi
done

# A random shared secret so only our scheduler can trigger the autopilot run.
CRON_SECRET="${CRON_SECRET:-$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)}"

echo "==> Setting function secrets"
npx --yes supabase secrets set \
  --project-ref "$PROJECT_REF" \
  GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  ALLOWED_ORIGIN="https://rezpona.com" \
  CRON_SECRET="$CRON_SECRET"

echo
echo "==> Deploying functions"
for fn in "${FUNCTIONS[@]}"; do
  echo "--- $fn"
  # --no-verify-jwt: these functions authenticate the caller themselves (getUser / CRON_SECRET),
  # and the browser sends the user's JWT in the Authorization header.
  npx --yes supabase functions deploy "$fn" \
    --project-ref "$PROJECT_REF" \
    --no-verify-jwt
done

echo
echo "==> Verifying"
for fn in "${FUNCTIONS[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS \
    "https://$PROJECT_REF.supabase.co/functions/v1/$fn" --max-time 10)
  if [ "$code" = "404" ]; then echo "  $fn -> NOT DEPLOYED (404)"; else echo "  $fn -> OK ($code)"; fi
done

echo
echo "Done. CRON_SECRET (save this for the autopilot scheduler):"
echo "  $CRON_SECRET"
