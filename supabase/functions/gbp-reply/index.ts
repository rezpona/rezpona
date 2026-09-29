// POST { venue_id, google_review_id, reply_text } -> publishes the reply to Google (v4)
// and records it in public.replies (status 'published').
import { preflight, json } from "../_shared/cors.ts";
import { getUser, adminClient, venueFor, getVenueToken, gfetch } from "../_shared/google.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { venue_id, google_review_id, reply_text } = await req.json().catch(() => ({}));
    if (!venue_id || !google_review_id || !reply_text) {
      return json({ error: "venue_id, google_review_id and reply_text are required" }, 400);
    }
    if (String(reply_text).length > 4096) return json({ error: "Reply too long (max 4096)." }, 400);

    const admin = adminClient();
    // Publishing needs at least "editor"; a viewer may look but not answer.
    const venue = await venueFor(admin, user.id, venue_id, "editor");
    if (!venue) return json({ error: "You do not have permission to reply for this venue." }, 403);

    // Starter is sold as "up to 30 replies per month". Enforced here rather than in
    // the browser, because the browser is not where the decision can be trusted.
    // Against the OWNER's allowance, not the person clicking: a manager invited to
    // a venue spends the account's quota, and has no plan of their own.
    const { data: usage } = await admin.rpc("usage_status", { p_user: venue.owner_id });
    const u = Array.isArray(usage) ? usage[0] : null;
    if (u && Number(u.remaining) <= 0) {
      return json({
        error: "limit_reached",
        message: `You have used all ${u.allowed} replies on your ${u.plan} plan this month.`,
        plan: u.plan, used: u.used, allowed: u.allowed,
      }, 402);
    }

    const token = await getVenueToken(admin, venue_id);

    const res = await gfetch(
      `https://mybusiness.googleapis.com/v4/${venue.google_location_id}/reviews/${google_review_id}/reply`,
      token,
      { method: "PUT", body: JSON.stringify({ comment: reply_text }) },
    );
    if (!res.ok) return json({ error: "reply", detail: res.data }, res.status);

    // record in replies (find our review row first)
    const { data: review } = await admin.from("reviews").select("id")
      .eq("venue_id", venue_id).eq("google_review_id", google_review_id).maybeSingle();
    if (review) {
      const { data: existing } = await admin.from("replies").select("id").eq("review_id", review.id).maybeSingle();
      const row = {
        review_id: review.id, venue_id, final_text: reply_text,
        status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      if (existing) await admin.from("replies").update(row).eq("id", existing.id);
      else await admin.from("replies").insert(row);
    }

    return json({ ok: true, reply: (res.data as any)?.comment ?? reply_text });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
