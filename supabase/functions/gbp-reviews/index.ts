// POST { venue_id } -> fetches Google reviews for the venue (v4), upserts them into
// public.reviews, and returns them (with whether a reply already exists on Google).
import { preflight, json } from "../_shared/cors.ts";
import { getUser, adminClient, ownsVenue, getVenueToken, gfetch } from "../_shared/google.ts";
import { topicsOf } from "../_shared/topics.ts";
import { sendEmail, sendSlack, newReviewsEmail, type ReviewLite } from "../_shared/notify.ts";

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
function sentimentOf(r: number | null) {
  if (r == null) return null;
  return r >= 4 ? "positive" : r === 3 ? "neutral" : "negative";
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { venue_id } = await req.json().catch(() => ({}));
    if (!venue_id) return json({ error: "venue_id required" }, 400);

    const admin = adminClient();
    const venue = await ownsVenue(admin, user.id, venue_id);
    if (!venue) return json({ error: "Unknown venue for this user" }, 403);

    const token = await getVenueToken(admin, venue_id);

    const r = await gfetch(
      `https://mybusiness.googleapis.com/v4/${venue.google_location_id}/reviews?pageSize=50&orderBy=updateTime%20desc`,
      token,
    );
    if (!r.ok) return json({ error: "reviews", detail: r.data }, r.status);

    const fetched = (r.data as any)?.reviews ?? [];

    // Which of these have we seen before? Asked once, up front, because after the
    // upsert every row looks equally old and we would have no way to tell a new
    // review from one we already notified about.
    const gids: string[] = fetched
      .map((rv: any) => rv.reviewId ?? rv.name?.split("/").pop())
      .filter(Boolean);
    const known = new Set<string>();
    if (gids.length) {
      const { data: prev } = await admin.from("reviews")
        .select("google_review_id").eq("venue_id", venue_id).in("google_review_id", gids);
      (prev ?? []).forEach((p: any) => known.add(p.google_review_id));
    }
    const fresh: ReviewLite[] = [];

    const out: any[] = [];
    for (const rv of fetched) {
      const gid = rv.reviewId ?? (rv.name?.split("/").pop());
      const rating = STAR[rv.starRating] ?? null;
      const replied = !!rv.reviewReply;

      // upsert the review (unique on venue_id + google_review_id)
      const { data: up } = await admin.from("reviews").upsert({
        venue_id,
        google_review_id: gid,
        author_name: rv.reviewer?.displayName ?? "Google user",
        rating,
        text: rv.comment ?? null,
        sentiment: sentimentOf(rating),
        topics: topicsOf(rv.comment ?? ""),
        review_created_at: rv.createTime ?? null,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "venue_id,google_review_id" }).select("id").single();

      const reviewUuid = up?.id;
      if (gid && !known.has(gid)) {
        fresh.push({
          author_name: rv.reviewer?.displayName ?? "Google user",
          rating,
          text: rv.comment ?? "",
          review_created_at: rv.createTime ?? null,
        });
      }

      // if Google already has a reply, make sure we have a published replies row
      if (replied && reviewUuid) {
        const { data: ex } = await admin.from("replies").select("id").eq("review_id", reviewUuid).maybeSingle();
        if (!ex) {
          await admin.from("replies").insert({
            review_id: reviewUuid, venue_id, final_text: rv.reviewReply.comment ?? "",
            status: "published", published_at: rv.reviewReply.updateTime ?? new Date().toISOString(),
          });
        }
      }

      out.push({
        review_uuid: reviewUuid,
        google_review_id: gid,
        author_name: rv.reviewer?.displayName ?? "Google user",
        rating,
        text: rv.comment ?? "",
        review_created_at: rv.createTime ?? null,
        replied,
        existing_reply: rv.reviewReply?.comment ?? null,
      });
    }

    // Notify about genuinely new reviews. Best-effort on purpose: the dashboard
    // must still get its reviews back even if Resend or Slack is having a bad day.
    if (fresh.length) {
      const v = venue as any;
      const wanted = v.notify_only_bad ? fresh.filter((f) => (f.rating ?? 5) <= 3) : fresh;
      if (wanted.length) {
        const name = v.name || "your venue";
        try {
          if (v.notify_email !== false) {
            const to = v.notify_email_to || user.email;
            if (to) {
              await sendEmail(
                to,
                `${wanted.length} new review${wanted.length === 1 ? "" : "s"} for ${name}`,
                // Only white-label when branding is actually configured; otherwise
                // the mail keeps the Rezpona header.
                newReviewsEmail(name, wanted, 0, (v.brand_logo_url || v.brand_color)
                  ? { logo: v.brand_logo_url, color: v.brand_color, name: v.name }
                  : undefined),
              );
            }
          }
          if (v.slack_webhook_url) await sendSlack(v.slack_webhook_url, name, wanted);
          await admin.from("venues").update({ last_notified_at: new Date().toISOString() }).eq("id", venue_id);
        } catch (e) {
          console.error("notify failed:", e);
        }
      }
    }

    return json({ reviews: out, new_count: fresh.length });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
