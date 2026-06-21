// POST { venue_id } -> fetches Google reviews for the venue (v4), upserts them into
// public.reviews, and returns them (with whether a reply already exists on Google).
import { preflight, json } from "../_shared/cors.ts";
import { getUser, adminClient, ownsVenue, getVenueToken, gfetch } from "../_shared/google.ts";

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

    const out: any[] = [];
    for (const rv of (r.data as any)?.reviews ?? []) {
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
        review_created_at: rv.createTime ?? null,
        fetched_at: new Date().toISOString(),
      }, { onConflict: "venue_id,google_review_id" }).select("id").single();

      const reviewUuid = up?.id;

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

    return json({ reviews: out });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
