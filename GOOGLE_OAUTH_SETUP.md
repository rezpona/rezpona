# Google OAuth ("Continue with Google") — setup

Rezpona is a **static site**, so the OAuth secret lives in Supabase, never in the repo.
The frontend only calls `supabase.auth.signInWithOAuth(...)`; Supabase does the token exchange.

## 1. Database
No migration needed — the project's existing schema already has the required tables
(`profiles`, `venues`, `google_connections`, `reviews`, `replies`, `subscriptions`).
OAuth tokens are stored per venue in `google_connections` by the `gbp-connect` Edge Function
(see `BUSINESS_PROFILE_API.md`).

## 2. Configure the Google provider in Supabase
Supabase Dashboard → **Authentication → Providers → Google** → Enable, then paste:
- **Client ID** — from Google Cloud Console
- **Client Secret** — from Google Cloud Console

> The secret stays here (server-side). Do **not** put it in any HTML/JS file or a deployed `.env`.

## 3. Allow the redirect URLs in Supabase
Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, add:
- `https://rezpona.com/auth/callback`  (production)
- `http://localhost:5500/auth/callback`  (local testing)

Set **Site URL** to `https://rezpona.com`.

## 4. Google Cloud Console (already done per your setup)
Authorized redirect URIs on the OAuth Client must include:
- `https://upepsbyqqefdaygmjxie.supabase.co/auth/v1/callback`  (Google → Supabase)

> Note: Google redirects to **Supabase**, then Supabase redirects to our `/auth/callback`.
> You do **not** add `localhost` to Google — only to Supabase's Redirect URLs (step 3).

## How it works
1. `login.html` → "Continue with Google" calls `signInWithOAuth` with
   scope `https://www.googleapis.com/auth/business.manage` and
   `access_type=offline` + `prompt=consent` (so Google returns a **refresh token**).
2. Google → Supabase → `https://rezpona.com/auth/callback?code=...` (PKCE).
3. `auth/callback/index.html` exchanges the code, reads `provider_token` +
   `provider_refresh_token` from the session, upserts them into `google_credentials`,
   then redirects to `/dashboard.html`.

## Token notes
- `provider_token` (Google access token) is short-lived (~1h).
- `provider_refresh_token` is returned **only on first consent** — the callback keeps any
  previously stored refresh token instead of overwriting it with `null`.
- Refreshing the Google access token later (using the refresh token) should be done
  server-side (e.g. a Supabase Edge Function) so the Google client secret is never exposed.
