// POST { access_token, refresh_token, google_email }
// Called once right after Google OAuth (from /auth/callback). Lists the user's Business
// Profile locations and saves each as a `venue` + a `google_connection` (tokens per venue).
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

    // 1) accounts
    const acc = await gfetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", access_token);
    if (!acc.ok) return json({ error: "accounts", detail: acc.data }, acc.status);
    const accounts = (acc.data as any)?.accounts ?? [];

    let count = 0;
    for (const a of accounts) {
      const readMask = "name,title,categories";
      const locResp = await gfetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=${readMask}&pageSize=100`,
        access_token,
      );
      if (!locResp.ok) continue;
      for (const l of (locResp.data as any)?.locations ?? []) {
        const googleLocationId = `${a.name}/${l.name}`; // accounts/x/locations/y  (needed by v4 reviews)
        const type = guessType(l.categories?.primaryCategory?.displayName);

        // upsert venue by (owner_id, google_location_id) — no DB unique, so do it manually
        const { data: existing } = await admin.from("venues")
          .select("id").eq("owner_id", user.id).eq("google_location_id", googleLocationId).maybeSingle();

        let venueId = existing?.id;
        if (venueId) {
          await admin.from("venues").update({ name: l.title ?? "(unnamed)", type })
            .eq("id", venueId);
        } else {
          const { data: ins, error } = await admin.from("venues").insert({
            owner_id: user.id, name: l.title ?? "(unnamed)", type, google_location_id: googleLocationId,
          }).select("id").single();
          if (error) continue;
          venueId = ins.id;
        }

        // upsert the token for this venue
        await admin.from("google_connections").upsert({
          venue_id: venueId,
          access_token,
          // keep an existing refresh token if Google didn't return a new one
          ...(refresh_token ? { refresh_token } : {}),
          expires_at: expiresAt,
          google_email: google_email ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "venue_id" });
        count++;
      }
    }

    return json({ ok: true, venues: count });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
