// Autopilot worker — run on a schedule (pg_cron). For every venue with autopilot=true,
// it fetches reviews and publishes a generated reply to any not-yet-answered review.
// Protect with header "x-cron-secret: <CRON_SECRET>".
import { preflight, json } from "../_shared/cors.ts";
import { adminClient, getVenueToken, gfetch } from "../_shared/google.ts";
import { generateReply } from "../_shared/reply.ts";

const STAR: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
const CRON_SECRET = Deno.env.get("CRON_SECRET");

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = adminClient();
  const summary: any[] = [];

  const { data: venues, error } = await admin.from("venues")
    .select("id, name, type, brand_voice, google_location_id, owner_id").eq("autopilot", true);
  if (error) return json({ error: error.message }, 500);

  // One usage lookup per owner, not per venue: an owner with several venues shares
  // a single monthly allowance, and autopilot must respect it or Starter becomes
  // unlimited for anyone who switches it on.
  const allowance = new Map<string, number>();
  async function remainingFor(owner: string): Promise<number> {
    if (allowance.has(owner)) return allowance.get(owner)!;
    const { data } = await admin.rpc("usage_status", { p_user: owner });
    const n = Array.isArray(data) && data[0] ? Number(data[0].remaining) : 0;
    allowance.set(owner, Number.isFinite(n) ? n : 0);
    return allowance.get(owner)!;
  }

  for (const v of venues ?? []) {
    let published = 0;
    try {
      if (v.owner_id && await remainingFor(v.owner_id) <= 0) {
        summary.push({ venue: v.name, skipped: "monthly reply limit reached" });
        continue;
      }
      const token = await getVenueToken(admin, v.id);
      const r = await gfetch(
        `https://mybusiness.googleapis.com/v4/${v.google_location_id}/reviews?pageSize=50&orderBy=updateTime%20desc`,
        token,
      );
      if (!r.ok) { summary.push({ venue: v.name, error: r.data }); continue; }

      for (const rv of (r.data as any)?.reviews ?? []) {
        if (rv.reviewReply) continue;
        if (v.owner_id && await remainingFor(v.owner_id) <= 0) break;
        const rating = STAR[rv.starRating] ?? 5;
        const gid = rv.reviewId ?? (rv.name?.split("/").pop());
        const reply = generateReply({
          rating,
          comment: rv.comment ?? "",
          venue: v.type,
          author: rv.reviewer?.displayName ?? "",
          signature: v.brand_voice ?? "",
        });

        const res = await gfetch(
          `https://mybusiness.googleapis.com/v4/${v.google_location_id}/reviews/${gid}/reply`,
          token, { method: "PUT", body: JSON.stringify({ comment: reply }) },
        );
        if (!res.ok) continue;
        published++;
        if (v.owner_id) allowance.set(v.owner_id, allowance.get(v.owner_id)! - 1);

        const { data: up } = await admin.from("reviews").upsert({
          venue_id: v.id, google_review_id: gid, author_name: rv.reviewer?.displayName ?? null,
          rating, text: rv.comment ?? null, review_created_at: rv.createTime ?? null,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "venue_id,google_review_id" }).select("id").single();
        if (up?.id) {
          const { data: ex } = await admin.from("replies").select("id").eq("review_id", up.id).maybeSingle();
          const row = { review_id: up.id, venue_id: v.id, draft_text: reply, final_text: reply, status: "published", published_at: new Date().toISOString() };
          if (ex) await admin.from("replies").update(row).eq("id", ex.id);
          else await admin.from("replies").insert(row);
        }
      }
    } catch (e) {
      summary.push({ venue: v.name, error: String((e as Error).message || e) });
      continue;
    }
    summary.push({ venue: v.name, published });
  }

  return json({ ok: true, processed: summary });
});
