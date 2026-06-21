# Google Business Profile integration — deploy & test

Architecture: the static site calls **Supabase Edge Functions**, which hold the Google
secret, refresh the access token, and call Google. Nothing sensitive is in the browser.

```
dashboard.html ──Bearer user JWT──► Edge Function ──refresh token + secret──► Google API
                                         │
                                         └── reads/writes venues, google_connections,
                                             reviews, replies (service role)
```

## Database
No new migrations — the integration uses the **existing schema** already in this project:
`profiles`, `venues`, `google_connections`, `reviews`, `replies`, `subscriptions`.
Key columns used:
- `venues(id, owner_id, name, type, google_location_id, brand_voice, autopilot)`
- `google_connections(venue_id, access_token, refresh_token, expires_at, google_email)` — tokens, **no client RLS** (Edge Functions only)
- `reviews(venue_id, google_review_id, author_name, rating, text, sentiment, …)`
- `replies(review_id, venue_id, draft_text, final_text, status, published_at)`

## 0. Google Cloud  ⚠️ required before anything returns data
1. Enable: *Business Profile Account Management API*, *Business Information API*, *My Business API* (v4 — reviews/replies).
2. Request access via the Business Profile APIs form (project `rezpona`) and wait for approval.
   A verified business is **not** the same as approved API access.

## 1. Deploy the Edge Functions
```bash
supabase login
supabase link --project-ref upepsbyqqefdaygmjxie

supabase secrets set GOOGLE_CLIENT_ID="639644381747-0nqreuuppk70ubv135vgnta5811po57s.apps.googleusercontent.com"
supabase secrets set GOOGLE_CLIENT_SECRET="<secret from Supabase Dashboard / Google Cloud>"
supabase secrets set ALLOWED_ORIGIN="https://rezpona.com"
supabase secrets set CRON_SECRET="<any long random string>"
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

supabase functions deploy gbp-connect
supabase functions deploy gbp-reviews
supabase functions deploy gbp-reply
supabase functions deploy gbp-autopilot
```

## 2. Autopilot scheduling (background replies)
The dashboard toggle stores `venues.autopilot` and replies while open. For replies even
when no one is on the dashboard, schedule `gbp-autopilot` with **pg_cron**:
```sql
select cron.schedule('rezpona-autopilot', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://upepsbyqqefdaygmjxie.supabase.co/functions/v1/gbp-autopilot',
    headers := jsonb_build_object('x-cron-secret', '<same CRON_SECRET>'),
    body := '{}'::jsonb);
$$);
```
(Enable `pg_cron` + `pg_net` under Database → Extensions.)

## Flow
- **Connect**: `login.html` / dashboard "Connect Google" → OAuth consent (`business.manage`).
  `auth/callback` then calls **gbp-connect**, which lists locations and creates a `venue`
  + `google_connection` for each.
- **Reviews**: **gbp-reviews** `{venue_id}` pulls reviews (v4) into `reviews` and returns them.
  Each unreplied one gets a generated draft (`/assets/reply-engine.js`).
- **Approve mode**: edit draft → "Approve & publish" → **gbp-reply** `{venue_id, google_review_id, reply_text}` posts to Google and writes `replies`.
- **Autopilot**: `venues.autopilot = true` → drafts auto-published for new reviews
  (in-browser when open, and via scheduled `gbp-autopilot` otherwise).

## Notes
- Access tokens are short-lived; `getVenueToken()` refreshes them with the stored refresh
  token + client secret (server-side only) and caches the result in `google_connections`.
- Reviews live on the **legacy v4** API and require Google approval; until then those calls return 403.
