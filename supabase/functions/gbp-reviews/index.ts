// POST { venue_id } -> fetches Google reviews for the venue (v4), upserts them into
// public.reviews, and returns them (with whether a reply already exists on Google).
import { preflight, json } from "../_shared/cors.ts";
import { getUser, adminClient, venueFor, getVenueToken, gfetch } from "../_shared/google.ts";
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
    const venue = await venueFor(admin, user.id, venue_id, "viewer");
    if (!venue) return json({ error: "Unknown venue for this user" }, 403);

    const token = await getVenueToken(admin, venue_id);

    /* Read every page, not just the first fifty.
     *
     * One page was enough to show the newest reviews, but it made the sync
     * unable to tell a deleted review from one further down the list: anything
     * past the first page looked missing. So a venue with more than fifty could
     * not have its deletions noticed at all.
     *
     * Capped so a venue with an enormous history cannot make one sync run for
     * ever. Hitting the cap means we did not see everything, and the code below
     * only marks reviews as gone when it did. */
    const PAGE = 50;
    const MAX_PAGES = 20;          // 1000 reviews, then we stop and say so
    const fetched: any[] = [];
    let pageToken = "";
    let pages = 0;
    let first: any = null;

    while (pages < MAX_PAGES) {
      const url = `https://mybusiness.googleapis.com/v4/${venue.google_location_id}/reviews` +
        `?pageSize=${PAGE}&orderBy=updateTime%20desc` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

      const r = await gfetch(url, token);
      if (!r.ok) {
        // A later page failing should not throw away the pages that worked.
        if (pages === 0) return json({ error: "reviews", detail: r.data }, r.status);
        console.error("gbp-reviews: page", pages, "failed:", r.data);
        break;
      }

      if (!first) first = r.data;
      const batch = (r.data as any)?.reviews ?? [];
      fetched.push(...batch);
      pages++;

      pageToken = (r.data as any)?.nextPageToken ?? "";
      if (!pageToken || batch.length === 0) break;
    }

    // We saw the whole list only if Google stopped handing us page tokens.
    const sawEverything = !pageToken;

    // Which of these have we seen before? Asked once, up front, because after the
    // upsert every row looks equally old and we would have no way to tell a new
    // review from one we already notified about.
    const gids: string[] = fetched
      .map((rv: any) => rv.reviewId ?? rv.name?.split("/").pop())
      .filter(Boolean);
    /* Read the ids we already hold for this venue in one go, rather than asking
       about the fetched ones by name: with a thousand reviews that list does not
       fit in a URL. */
    const known = new Set<string>();
    {
      const { data: prev } = await admin.from("reviews")
        .select("google_review_id").eq("venue_id", venue_id);
      (prev ?? []).forEach((p: any) => known.add(p.google_review_id));
    }
    const fresh: ReviewLite[] = [];
    let unpublished = 0;

    /* Google's own headline numbers, straight from the same response. Maps shows
     * the public view and filters some reviews out of it, while this API gives
     * the owner everything, so the two counts legitimately differ. Storing both
     * means the owner can see the difference instead of wondering which of two
     * numbers to believe. */
    const gRating = first?.averageRating ?? null;
    const gCount = first?.totalReviewCount ?? null;
    if (gCount !== null) {
      await admin.from("venues")
        .update({ google_rating: gRating, google_review_count: gCount })
        .eq("id", venue_id);
    }

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
        removed_at: null,          // it is back, or never left
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

      /* Keep our record of the reply in step with Google, in both directions.
       *
       * It only ever learned that a reply existed. Delete one on Google and we
       * went on counting it: the reply rate sat at 100% for a venue with nothing
       * answered, and the month's allowance stayed spent on a reply that is no
       * longer there. Google is the source of truth for what is published. */
      if (reviewUuid) {
        const { data: ex } = await admin.from("replies")
          .select("id, status").eq("review_id", reviewUuid).maybeSingle();

        if (replied) {
          const row = {
            review_id: reviewUuid, venue_id,
            final_text: rv.reviewReply.comment ?? "",
            status: "published",
            published_at: rv.reviewReply.updateTime ?? new Date().toISOString(),
          };
          if (ex) { if (ex.status !== "published") await admin.from("replies").update(row).eq("id", ex.id); }
          else await admin.from("replies").insert(row);
        } else if (ex && ex.status === "published") {
          /* The reply was taken down on Google. Keep the text as a draft so the
             owner can put it back, and stop counting it as answered.
             published_at stays: it records that the reply did go out, which is
             what the monthly allowance is counting. Clearing it would hand the
             allowance back and let someone publish, delete, and publish again. */
          await admin.from("replies")
            .update({ status: "draft" })
            .eq("id", ex.id);
          unpublished++;
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

    /* Account for what Google no longer returns.
     *
     * A review its author deletes, or that Google filters out, used to sit in our
     * table for ever: the venue read five reviews at 3.8 while Google showed four
     * at 3.5, and the owner had no way to tell which number was wrong.
     *
     * Only when we read the whole list. If Google was still offering pages when
     * we stopped, the rest are not missing, only unseen, and marking them gone
     * would erase real history.
     *
     * The difference is worked out here rather than pushed into the query: with
     * a thousand reviews, listing every id in a URL is a request no server will
     * accept.
     */
    let removed = 0;
    if (sawEverything) {
      const live = new Set(gids);
      const { data: stored } = await admin.from("reviews")
        .select("id, google_review_id").eq("venue_id", venue_id).is("removed_at", null);

      const goneIds = (stored ?? [])
        .filter((s: any) => !live.has(s.google_review_id))
        .map((s: any) => s.id);

      const stamp = new Date().toISOString();
      for (let i = 0; i < goneIds.length; i += 200) {
        await admin.from("reviews")
          .update({ removed_at: stamp })
          .in("id", goneIds.slice(i, i + 200));
      }
      removed = goneIds.length;
      if (removed) console.log(`gbp-reviews: ${removed} review(s) no longer on Google for ${venue_id}`);
    } else {
      console.log(`gbp-reviews: stopped at ${pages} pages for ${venue_id}, deletions not checked`);
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

    return json({
      reviews: out,
      new_count: fresh.length,
      removed_count: removed,
      unpublished_count: unpublished,
      google: { rating: gRating, total: gCount },
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
