// POST { access_token, refresh_token, google_email }
// Called once right after Google OAuth (from /auth/callback). Lists the user's Business
// Profile locations and saves each as a `venue` + a `google_connection` (tokens per venue).
//
// Returns a diagnostic payload so the dashboard can tell the user exactly what happened
// instead of silently showing an empty state.
import { preflight, json } from "../_shared/cors.ts";
import { getUser, adminClient, gfetch } from "../_shared/google.ts";

const VENUE_TYPE: Record<string, string> = {
  restaurant: "restaurant", cafe: "cafe", coffee: "cafe", bar: "cafe",
  hotel: "hotel", lodging: "hotel", motel: "hotel",
};
function guessType(primaryCategory?: string): string {
  const c = (primaryCategory || "").toLowerCase();
  for (const k in VENUE_TYPE) if (c.includes(k)) return VENUE_TYPE[k];
  return "restaurant";
}

// Turn a raw Google API error into something a venue owner can act on.
function explain(status: number, data: unknown): string {
  const msg = (data as any)?.error?.message || (data as any)?.error?.status || "";
  const text = typeof data === "string" ? data : msg;
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(text)) {
    return "Google Business Profile API is not enabled for this project yet. Enable it in Google Cloud Console, then reconnect.";
  }
  if (status === 403 && /quota|rate/i.test(text)) {
    return "Google is rate-limiting Business Profile requests (quota). Try again in a few minutes.";
  }
  if (status === 403) {
    return "Google denied access to this Business Profile. Make sure this Google account manages the business.";
  }
  if (status === 401) {
    return "Google sign-in expired. Please reconnect your Google account.";
  }
  return text || `Google API error (HTTP ${status}).`;
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { access_token, refresh_token, google_email } = await req.json().catch(() => ({}));
    if (!access_token) return json({ error: "access_token required" }, 400);

    const admin = adminClient();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    // 1) accounts the signed-in Google user can manage
    const acc = await gfetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", access_token);
    if (!acc.ok) {
      return json({
        ok: false,
        stage: "accounts",
        venues: 0,
        message: explain(acc.status, acc.data),
        detail: acc.data,
      }, 200); // 200 so the browser can read the message instead of a generic fetch failure
    }

    const accounts = (acc.data as any)?.accounts ?? [];
    if (accounts.length === 0) {
      return json({
        ok: true,
        stage: "accounts",
        venues: 0,
        accounts: 0,
        message: "This Google account doesn't manage any Business Profile. Sign in with the account that owns your business listing, or create a profile at business.google.com.",
      }, 200);
    }

    let count = 0;
    let locationsSeen = 0;
    const problems: string[] = [];

    for (const a of accounts) {
      const readMask = "name,title,categories";
      const locResp = await gfetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=${readMask}&pageSize=100`,
        access_token,
      );
      if (!locResp.ok) {
        problems.push(explain(locResp.status, locResp.data));
        continue;
      }

      const locations = (locResp.data as any)?.locations ?? [];
      locationsSeen += locations.length;

      for (const l of locations) {
        const googleLocationId = `${a.name}/${l.name}`; // accounts/x/locations/y  (needed by v4 reviews)
        const type = guessType(l.categories?.primaryCategory?.displayName);

        // upsert venue by (owner_id, google_location_id) — no DB unique, so do it manually
        const { data: existing } = await admin.from("venues")
          .select("id").eq("owner_id", user.id).eq("google_location_id", googleLocationId).maybeSingle();

        let venueId = existing?.id;
        if (venueId) {
          await admin.from("venues").update({ name: l.title ?? "(unnamed)", type }).eq("id", venueId);
        } else {
          const { data: ins, error } = await admin.from("venues").insert({
            owner_id: user.id, name: l.title ?? "(unnamed)", type, google_location_id: googleLocationId,
          }).select("id").single();
          if (error) { problems.push(`Could not save venue "${l.title ?? "(unnamed)"}": ${error.message}`); continue; }
          venueId = ins.id;
        }

        // upsert the token for this venue
        const { error: tokErr } = await admin.from("google_connections").upsert({
          venue_id: venueId,
          access_token,
          // keep an existing refresh token if Google didn't return a new one
          ...(refresh_token ? { refresh_token } : {}),
          expires_at: expiresAt,
          google_email: google_email ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "venue_id" });
        if (tokErr) { problems.push(`Could not store Google token: ${tokErr.message}`); continue; }
        count++;
      }
    }

    let message: string | null = null;
    if (count === 0) {
      message = problems[0]
        ?? (locationsSeen === 0
          ? "Your Google account is connected, but it has no business locations yet. Add a location at business.google.com, then reconnect."
          : "We found your business but couldn't import it. Please try reconnecting.");
    }

    return json({
      ok: true,
      venues: count,
      accounts: accounts.length,
      locationsSeen,
      ...(message ? { message } : {}),
      ...(problems.length ? { problems } : {}),
    });
  } catch (e) {
    return json({ ok: false, venues: 0, message: String((e as Error).message || e) }, 500);
  }
});
