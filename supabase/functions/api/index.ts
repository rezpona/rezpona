// Public REST API (Agency plan).
//
//   GET  /api/venues
//   GET  /api/venues/:id/reviews?limit=50
//   POST /api/venues/:id/reply   { google_review_id, reply_text }
//   POST /api/draft              { rating, comment, venue, author }
//
// Auth: header "Authorization: Bearer rzp_live_...". Keys are stored as SHA-256
// digests, so a database dump does not hand anyone a working key. The plaintext
// is shown once, when the key is created in the dashboard.
import { preflight, json } from "../_shared/cors.ts";
import { adminClient, getVenueToken, gfetch } from "../_shared/google.ts";
import { generateReply } from "../_shared/reply.ts";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  const admin = adminClient();

  const auth = req.headers.get("authorization") ?? "";
  const key = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!key) return json({ error: "Missing API key" }, 401);

  const { data: row } = await admin.from("api_keys")
    .select("id, owner_id, revoked_at").eq("key_hash", await sha256(key)).maybeSingle();
  if (!row || row.revoked_at) return json({ error: "Invalid API key" }, 401);
  const owner: string = row.owner_id;

  // API access is an Agency feature, checked on every call rather than only when
  // the key is created: a downgrade has to take the access away too.
  const { data: sub } = await admin.from("subscriptions")
    .select("plan, status").eq("owner_id", owner).maybeSingle();
  if (sub?.plan !== "agency") return json({ error: "API access requires the Agency plan" }, 403);
  if (sub.status === "canceled") return json({ error: "Subscription is not active" }, 403);

  // Fire and forget: a failed timestamp update must not fail the request.
  admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(
    () => {}, () => {});

  const url = new URL(req.url);
  // Everything after the function name, so it works at both /api/... and
  // /functions/v1/api/...
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.lastIndexOf("api");
  const seg = i === -1 ? parts : parts.slice(i + 1);

  async function ownedVenue(id: string) {
    const { data } = await admin.from("venues")
      .select("id, name, type, brand_voice, google_location_id")
      .eq("id", id).eq("owner_id", owner).maybeSingle();
    return data;
  }

  try {
    // POST /draft â€” generate a reply without touching Google.
    if (req.method === "POST" && seg[0] === "draft") {
      const b = await req.json().catch(() => ({}));
      if (!b.comment) return json({ error: "comment required" }, 400);
      return json({
        reply: generateReply({
          rating: b.rating ?? null,
          comment: String(b.comment).slice(0, 5000),
          venue: b.venue ?? "restaurant",
          author: b.author ?? "",
        }),
      });
    }

    if (seg[0] !== "venues") return json({ error: "Not found" }, 404);

    // GET /venues
    if (req.method === "GET" && !seg[1]) {
      const { data } = await admin.from("venues")
        .select("id, name, type, autopilot, created_at").eq("owner_id", owner);
      return json({ venues: data ?? [] });
    }

    const venue = await ownedVenue(seg[1]);
    if (!venue) return json({ error: "Unknown venue" }, 404);

    // GET /venues/:id/reviews
    if (req.method === "GET" && seg[2] === "reviews") {
      const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      const { data } = await admin.from("reviews")
        .select("id, google_review_id, author_name, rating, text, sentiment, topics, review_created_at")
        .eq("venue_id", venue.id)
        .order("review_created_at", { ascending: false })
        .limit(limit);
      return json({ reviews: data ?? [] });
    }

    // POST /venues/:id/reply
    if (req.method === "POST" && seg[2] === "reply") {
      const b = await req.json().catch(() => ({}));
      if (!b.google_review_id) return json({ error: "google_review_id required" }, 400);

      const { data: usage } = await admin.rpc("usage_status", { p_user: owner });
      const u = Array.isArray(usage) ? usage[0] : null;
      if (u && Number(u.remaining) <= 0) return json({ error: "limit_reached", allowed: u.allowed }, 402);

      let text = b.reply_text;
      if (!text) {
        const { data: rv } = await admin.from("reviews")
          .select("rating, text, author_name")
          .eq("venue_id", venue.id).eq("google_review_id", b.google_review_id).maybeSingle();
        if (!rv) return json({ error: "Review not found. Pass reply_text, or sync reviews first." }, 404);
        text = generateReply({
          rating: rv.rating, comment: rv.text ?? "", venue: venue.type,
          author: rv.author_name ?? "", signature: venue.brand_voice ?? "",
        });
      }
      if (String(text).length > 4096) return json({ error: "Reply too long (max 4096)." }, 400);

      const token = await getVenueToken(admin, venue.id);
      const res = await gfetch(
        `https://mybusiness.googleapis.com/v4/${venue.google_location_id}/reviews/${b.google_review_id}/reply`,
        token, { method: "PUT", body: JSON.stringify({ comment: text }) },
      );
      if (!res.ok) return json({ error: "reply", detail: res.data }, res.status);

      const { data: review } = await admin.from("reviews").select("id")
        .eq("venue_id", venue.id).eq("google_review_id", b.google_review_id).maybeSingle();
      if (review) {
        const { data: ex } = await admin.from("replies").select("id").eq("review_id", review.id).maybeSingle();
        const rec = {
          review_id: review.id, venue_id: venue.id, final_text: text,
          status: "published", published_at: new Date().toISOString(),
        };
        if (ex) await admin.from("replies").update(rec).eq("id", ex.id);
        else await admin.from("replies").insert(rec);
      }
      return json({ ok: true, reply: text });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
