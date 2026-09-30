// Monthly performance report. Run by pg_cron at 08:00 on the 1st of each month.
// Protect with header "x-cron-secret: <CRON_SECRET>".
//
// Covers the month that just ended, one email per owner, all their venues in one
// table. report_log has a unique (owner_id, period), so a retry after a partial
// run cannot send anybody a second copy.
import { preflight, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/google.ts";
import { sendEmail, monthlyReportEmail } from "../_shared/notify.ts";

const CRON_SECRET = Deno.env.get("CRON_SECRET");

interface Row { name: string; total: number; avg: number; positive: number; negative: number; replied: number; rate: number }

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return json({ error: "Forbidden" }, 403);
  }

  const admin = adminClient();

  // The month that just ended.
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const period = start.toISOString().slice(0, 10);
  const label = start.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  const { data: venues, error } = await admin.from("venues")
    .select("id, name, owner_id, notify_email, notify_email_to");
  if (error) return json({ error: error.message }, 500);

  // Group venues by owner so each person gets exactly one email.
  const byOwner = new Map<string, any[]>();
  for (const v of venues ?? []) {
    if (!v.owner_id || v.notify_email === false) continue;
    if (!byOwner.has(v.owner_id)) byOwner.set(v.owner_id, []);
    byOwner.get(v.owner_id)!.push(v);
  }

  let sent = 0, skipped = 0;
  for (const [owner, list] of byOwner) {
    // Monthly reports are listed under Pro, not Starter. Checked here rather than
    // when the cron fires, so a downgrade stops the reports from the next month.
    const { data: usage } = await admin.rpc("usage_status", { p_user: owner });
    const plan = (Array.isArray(usage) && usage[0]) ? usage[0].plan : "starter";
    if (plan === "starter") { skipped++; continue; }

    // Claim the slot first. If this row already exists the report went out
    // already, and we move on without touching the mail provider.
    const { error: claimErr } = await admin.from("report_log").insert({ owner_id: owner, period });
    if (claimErr) { skipped++; continue; }

    const rows: Row[] = [];
    for (const v of list) {
      const { data: reviews } = await admin.from("reviews")
        .select("id, rating")
        .eq("venue_id", v.id)
        .gte("review_created_at", start.toISOString())
        .lt("review_created_at", end.toISOString());

      const total = reviews?.length ?? 0;
      if (!total) { rows.push({ name: v.name, total: 0, avg: 0, positive: 0, negative: 0, replied: 0, rate: 0 }); continue; }

      const rated = reviews!.filter((r: any) => r.rating != null);
      const avg = rated.length
        ? Math.round((rated.reduce((s: number, r: any) => s + r.rating, 0) / rated.length) * 100) / 100
        : 0;

      const ids = reviews!.map((r: any) => r.id);
      const { count: replied } = await admin.from("replies")
        .select("id", { count: "exact", head: true })
        .in("review_id", ids).eq("status", "published");

      rows.push({
        name: v.name,
        total,
        avg,
        positive: rated.filter((r: any) => r.rating >= 4).length,
        negative: rated.filter((r: any) => r.rating <= 2).length,
        replied: replied ?? 0,
        rate: Math.round(100 * (replied ?? 0) / total),
      });
    }

    // Nothing happened last month: no email. A report full of zeros is noise.
    if (!rows.some((r) => r.total > 0)) { skipped++; continue; }

    const { data: prof } = await admin.from("profiles").select("email, full_name").eq("id", owner).maybeSingle();
    const to = list.find((v: any) => v.notify_email_to)?.notify_email_to || prof?.email;
    if (!to) { skipped++; continue; }

    const ok = await sendEmail(to, `Your ${label} Rezpona report`, monthlyReportEmail(prof?.full_name ?? "", label, rows));
    if (ok) sent++;
    else {
      // The mail never left, so release the claim and let the next run retry.
      await admin.from("report_log").delete().eq("owner_id", owner).eq("period", period);
      skipped++;
    }
  }

  return json({ ok: true, period, sent, skipped });
});
