// POST { subject, body, page } -> records a support message and emails it on.
//
// Pro and Agency are sold with priority support. "Priority" is not a promise the
// customer can see, so the email says which plan the sender is on and the subject
// line is prefixed for the paid tiers: the triage has to be visible to whoever
// opens the inbox, or it does not happen.
import { preflight, json } from "../_shared/cors.ts";
import { getUser, adminClient } from "../_shared/google.ts";
import { sendEmail } from "../_shared/notify.ts";

const SUPPORT_INBOX = Deno.env.get("SUPPORT_INBOX") ?? "rezpona@gmail.com";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { subject, body, page } = await req.json().catch(() => ({}));
    const text = String(body ?? "").trim();
    if (text.length < 10) return json({ error: "Please write a little more so we can help." }, 400);
    if (text.length > 5000) return json({ error: "That message is too long (5000 characters max)." }, 400);

    const admin = adminClient();

    // Somebody who sends the same thing over and over is stuck, not malicious,
    // but the inbox should not fill up either.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin.from("support_messages")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id).gte("created_at", since);
    if ((count ?? 0) >= 5) {
      return json({ error: "You have sent several messages just now. We will reply to those first." }, 429);
    }

    // The plan comes from the database, not from the browser: it decides how the
    // message is triaged, so the sender does not get to set it.
    const { data: usage } = await admin.rpc("usage_status", { p_user: user.id });
    const u = Array.isArray(usage) ? usage[0] : null;
    const plan: string = u?.plan ?? "starter";
    const priority = plan === "pro" || plan === "agency";

    const subj = String(subject ?? "").trim().slice(0, 140) || "Support request";
    const where = String(page ?? "").trim().slice(0, 200);

    await admin.from("support_messages").insert({
      owner_id: user.id,
      email: user.email ?? "",
      plan,
      subject: subj,
      body: text,
      page: where || null,
    });

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#0b1120;line-height:1.7">
        <p style="margin:0 0 4px"><strong>${escapeHtml(user.email ?? "unknown")}</strong></p>
        <p style="margin:0 0 16px;color:#52617a">Plan: ${escapeHtml(plan)}${where ? " &middot; " + escapeHtml(where) : ""}</p>
        <div style="white-space:pre-wrap;border-left:3px solid #22a5d6;padding-left:14px;color:#111827">${escapeHtml(text)}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#9aa6ba">Hit reply to answer them directly.</p>
      </div>`;

    const sent = await sendEmail(
      SUPPORT_INBOX,
      (priority ? "[PRIORITY] " : "") + subj + " - " + (user.email ?? ""),
      html,
      // So hitting reply answers the customer rather than noreply@.
      user.email ?? undefined,
    );

    // The message is already stored, so a mail failure is not a lost message and
    // the sender should not be told to try again.
    if (!sent) console.error("support: message stored but email failed");

    return json({
      ok: true,
      priority,
      message: priority
        ? "Thanks. Your message is flagged as priority and we usually reply within a few hours."
        : "Thanks. We have got your message and will reply by email.",
    });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
