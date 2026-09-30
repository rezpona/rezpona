// Notifications: email (Resend) and Slack.
//
// Both are best-effort. A failed notification must never break the job that
// triggered it, so every function here swallows its errors and reports back
// with a boolean instead of throwing.

const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("NOTIFY_FROM") ?? "Rezpona <noreply@rezpona.com>";

export interface ReviewLite {
  author_name?: string | null;
  rating?: number | null;
  text?: string | null;
  review_created_at?: string | null;
}

function stars(n?: number | null): string {
  const r = Math.max(0, Math.min(5, n ?? 0));
  return "★".repeat(r) + "☆".repeat(5 - r);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/* ---------------------------------------------------------------- email */

/**
 * @param replyTo where a reply should go. Without it a reply goes to the sending
 *   address, which is noreply@, so support mail looked answerable and was not.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  replyTo?: string,
): Promise<boolean> {
  if (!RESEND_KEY || !to) return false;
  try {
    const payload: Record<string, unknown> = { from: FROM, to: [to], subject, html };
    if (replyTo) payload.reply_to = replyTo;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) console.error("resend:", resp.status, await resp.text());
    return resp.ok;
  } catch (e) {
    console.error("resend threw:", e);
    return false;
  }
}

export interface Brand {
  logo?: string | null;   // brand_logo_url
  color?: string | null;  // brand_color, used for the button
  name?: string | null;   // shown instead of the Rezpona wordmark
}

// White-label header. Agency customers put their own agency or venue brand at the
// top; everyone else gets the Rezpona wordmark. Only a hex colour is accepted, so
// a stored value cannot inject style or markup into the email.
function brandHeader(b?: Brand): string {
  if (b?.logo && /^https:\/\//.test(b.logo)) {
    return `<img src="${escapeHtml(b.logo)}" alt="${escapeHtml(b.name || "")}" style="height:30px;width:auto;display:block;">`;
  }
  if (b?.name) {
    return `<div style="font-size:22px;font-weight:700;color:#0b1120;letter-spacing:-.5px;">${escapeHtml(b.name)}</div>`;
  }
  return `<div style="font-size:22px;font-weight:700;color:#0b1120;letter-spacing:-.5px;">Rez<span style="color:#22a5d6;">pona</span></div>`;
}
function brandButton(b?: Brand): string {
  const c = b?.color && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : null;
  return c ? `background:${c};` : "background:linear-gradient(135deg,#3b82f6,#22d3ee);";
}

/** Email for a batch of new reviews on one venue. */
export function newReviewsEmail(venueName: string, reviews: ReviewLite[], draftedCount: number, brand?: Brand): string {
  const rows = reviews.slice(0, 5).map((r) => {
    const rating = r.rating ?? 0;
    const colour = rating >= 4 ? "#0f9d58" : rating === 3 ? "#f4b400" : "#d93025";
    const who = escapeHtml(r.author_name || "A guest");
    const body = escapeHtml((r.text || "").slice(0, 240)) + ((r.text || "").length > 240 ? "…" : "");
    return `
      <tr><td style="padding:14px 0;border-bottom:1px solid #eef1f6;">
        <div style="font-size:14px;font-weight:600;color:#0b1120;">${who}
          <span style="color:${colour};font-weight:400;margin-left:8px;">${stars(rating)}</span>
        </div>
        <div style="font-size:14px;color:#52617a;line-height:1.6;margin-top:4px;">${body || "<em>No comment</em>"}</div>
      </td></tr>`;
  }).join("");

  const more = reviews.length > 5 ? `<p style="font-size:13px;color:#8a96aa;">and ${reviews.length - 5} more</p>` : "";

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:18px;overflow:hidden;">
   <tr><td style="padding:32px 36px 8px;">
     ${brandHeader(brand)}
   </td></tr>
   <tr><td style="padding:16px 36px 0;">
     <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">
       ${reviews.length} new review${reviews.length === 1 ? "" : "s"} for ${escapeHtml(venueName)}</h1>
     <p style="margin:0 0 4px;font-size:14px;color:#52617a;line-height:1.6;">
       ${draftedCount > 0
         ? `${draftedCount} ${draftedCount === 1 ? "reply is" : "replies are"} already drafted and waiting for your approval.`
         : "Open your dashboard to reply."}
     </p>
   </td></tr>
   <tr><td style="padding:8px 36px 0;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table>${more}</td></tr>
   <tr><td align="center" style="padding:24px 36px 8px;">
     <a href="https://rezpona.com/dashboard.html"
        style="display:inline-block;${brandButton(brand)}color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 32px;border-radius:100px;">
        Review and publish &rarr;</a>
   </td></tr>
   <tr><td style="padding:20px 36px 32px;">
     <p style="margin:0;font-size:12px;color:#9aa6ba;line-height:1.6;">
       You are getting this because notifications are on for ${escapeHtml(venueName)}.
       Turn them off any time in your dashboard settings.
     </p>
   </td></tr>
  </table>
 </td></tr>
</table>`;
}

/* ---------------------------------------------------------------- slack */

export async function sendSlack(webhookUrl: string, venueName: string, reviews: ReviewLite[]): Promise<boolean> {
  if (!webhookUrl) return false;
  // Only accept real Slack webhooks, so a stored value cannot be used to make
  // the server post to somewhere it should not.
  if (!/^https:\/\/hooks\.slack\.com\//.test(webhookUrl)) {
    console.error("slack: refused non-Slack webhook URL");
    return false;
  }

  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: `${reviews.length} new review${reviews.length === 1 ? "" : "s"} · ${venueName}` } },
  ];
  reviews.slice(0, 5).forEach((r) => {
    const txt = (r.text || "_No comment_").slice(0, 300);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${r.author_name || "A guest"}*  ${stars(r.rating)}\n${txt}` },
    });
  });
  blocks.push({
    type: "actions",
    elements: [{
      type: "button",
      text: { type: "plain_text", text: "Open Rezpona" },
      url: "https://rezpona.com/dashboard.html",
    }],
  });

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${reviews.length} new review(s) for ${venueName}`, blocks }),
    });
    return resp.ok;
  } catch (e) {
    console.error("slack threw:", e);
    return false;
  }
}

/* ------------------------------------------------------------- reports */

export function monthlyReportEmail(
  ownerName: string,
  period: string,
  venues: Array<{ name: string; total: number; avg: number; positive: number; negative: number; replied: number; rate: number }>,
): string {
  const rows = venues.map((v) => `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #eef1f6;font-size:14px;color:#0b1120;font-weight:600;">${escapeHtml(v.name)}</td>
      <td style="padding:12px 0;border-bottom:1px solid #eef1f6;font-size:14px;color:#52617a;text-align:right;">${v.total}</td>
      <td style="padding:12px 0;border-bottom:1px solid #eef1f6;font-size:14px;color:#52617a;text-align:right;">${v.avg || "-"}</td>
      <td style="padding:12px 0;border-bottom:1px solid #eef1f6;font-size:14px;color:#52617a;text-align:right;">${v.rate}%</td>
    </tr>`).join("");

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
 <tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:18px;overflow:hidden;">
   <tr><td style="padding:32px 36px 8px;">
     <div style="font-size:22px;font-weight:700;color:#0b1120;letter-spacing:-.5px;">Rez<span style="color:#22a5d6;">pona</span></div>
   </td></tr>
   <tr><td style="padding:16px 36px 0;">
     <h1 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#111827;">Your ${escapeHtml(period)} report</h1>
     <p style="margin:0 0 16px;font-size:14px;color:#52617a;line-height:1.6;">Here is how your reviews went last month.</p>
   </td></tr>
   <tr><td style="padding:0 36px;">
     <table width="100%" cellpadding="0" cellspacing="0">
       <tr>
         <th align="left"  style="padding:8px 0;font-size:12px;color:#8a96aa;text-transform:uppercase;letter-spacing:.06em;">Venue</th>
         <th align="right" style="padding:8px 0;font-size:12px;color:#8a96aa;text-transform:uppercase;letter-spacing:.06em;">Reviews</th>
         <th align="right" style="padding:8px 0;font-size:12px;color:#8a96aa;text-transform:uppercase;letter-spacing:.06em;">Avg</th>
         <th align="right" style="padding:8px 0;font-size:12px;color:#8a96aa;text-transform:uppercase;letter-spacing:.06em;">Replied</th>
       </tr>
       ${rows}
     </table>
   </td></tr>
   <tr><td align="center" style="padding:28px 36px 8px;">
     <a href="https://rezpona.com/analytics.html"
        style="display:inline-block;background:linear-gradient(135deg,#3b82f6,#22d3ee);color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 32px;border-radius:100px;">
        See full analytics &rarr;</a>
   </td></tr>
   <tr><td style="padding:20px 36px 32px;">
     <p style="margin:0;font-size:12px;color:#9aa6ba;line-height:1.6;">
       Monthly reports are part of your Rezpona plan. You can turn them off in your dashboard settings.
     </p>
   </td></tr>
  </table>
 </td></tr>
</table>`;
}
