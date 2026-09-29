// Shared helpers: authenticate the caller, and get a fresh Google access token per venue.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// Service-role client (bypasses RLS) for token reads/writes server-side.
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify the caller's Supabase JWT (Authorization header) and return the user.
export async function getUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await adminClient().auth.getUser(token);
  return data?.user ?? null;
}

const VENUE_COLUMNS =
  "id, name, owner_id, google_location_id, notify_email, notify_email_to, " +
  "slack_webhook_url, notify_only_bad, last_notified_at, brand_logo_url, brand_color";

/* Can this user reach this venue, and in what capacity?
 *
 * RLS does not apply to the service role, so every function has to ask this for
 * itself. Ownership alone is not the answer: the Agency plan sells team access,
 * and a venue an owner shared with a manager has to be reachable by that manager
 * or the feature does not exist.
 *
 * `need` is the weakest role that may perform the action: "viewer" to read,
 * "editor" to publish a reply.
 */
const RANK: Record<string, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };

export async function venueFor(
  admin: SupabaseClient,
  userId: string,
  venueId: string,
  need: "viewer" | "editor" = "viewer",
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  const { data } = await admin.from("venues")
    .select(VENUE_COLUMNS).eq("id", venueId).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const venue = data as any;
  if (!venue) return null;

  if (venue.owner_id === userId) return venue;

  const { data: member } = await admin.from("venue_members")
    .select("role").eq("venue_id", venueId).eq("user_id", userId).maybeSingle();
  if (!member) return null;
  if ((RANK[member.role] ?? 0) < RANK[need]) return null;

  return venue;
}

// Kept for callers that only ever want the owner.
export async function ownsVenue(admin: SupabaseClient, userId: string, venueId: string) {
  const { data } = await admin.from("venues")
    .select(VENUE_COLUMNS).eq("id", venueId).eq("owner_id", userId).maybeSingle();
  return data ?? null;
}

// Refresh a Google access token from a refresh token.
export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tok = await resp.json();
  if (!resp.ok || !tok.access_token) {
    throw new Error("Google token refresh failed: " + (tok.error_description || tok.error || resp.status));
  }
  return { accessToken: tok.access_token as string, expiresIn: (tok.expires_in as number) ?? 3600 };
}

// Get a valid access token for a venue, refreshing + caching if needed.
export async function getVenueToken(admin: SupabaseClient, venueId: string): Promise<string> {
  const { data: conn } = await admin.from("google_connections")
    .select("access_token, refresh_token, expires_at").eq("venue_id", venueId).maybeSingle();
  if (!conn) throw new Error("NO_CONNECTION: this venue is not connected to Google.");

  const stillValid = conn.access_token && conn.expires_at &&
    (new Date(conn.expires_at).getTime() - Date.now() > 60_000);
  if (stillValid) return conn.access_token as string;

  if (!conn.refresh_token) throw new Error("NO_REFRESH_TOKEN: please reconnect Google.");
  const { accessToken, expiresIn } = await refreshAccessToken(conn.refresh_token);
  await admin.from("google_connections").update({
    access_token: accessToken,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("venue_id", venueId);
  return accessToken;
}

// Small fetch wrapper for Google APIs with bearer auth + JSON parsing.
export async function gfetch(url: string, accessToken: string, init: RequestInit = {}) {
  const resp = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await resp.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: resp.ok, status: resp.status, data };
}
