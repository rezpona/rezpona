// Paddle Billing webhook receiver.
//
// Paddle POSTs subscription events here. We verify the signature, map the Paddle
// price to one of our plans, and upsert the user's row in `subscriptions`.
//
// Configure in Paddle → Developer Tools → Notifications → destination:
//   https://<project>.supabase.co/functions/v1/paddle-webhook
//   events: subscription.created, subscription.updated, subscription.canceled,
//           subscription.paused, subscription.resumed
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PADDLE_WEBHOOK_SECRET") ?? "";

// Which Paddle price maps to which plan. Overridable via env without a redeploy.
const PRICE_TO_PLAN: Record<string, string> = {
  [Deno.env.get("PADDLE_PRICE_STARTER") ?? "pri_01m3ahqwz6z2z5aq9wm7y05c79"]: "starter",
  [Deno.env.get("PADDLE_PRICE_PRO") ?? "pri_01m3ahnqybjkv7pbr3y5rgck2d"]: "pro",
  [Deno.env.get("PADDLE_PRICE_AGENCY") ?? "pri_01m3aj18cxqa58m1ytpa5p9stp"]: "agency",
};

// Paddle status -> our subscription_status enum.
// Paddle also reports "paused"; our enum has no such value, and the effect for the
// customer is the same as canceled (no access), so we store it that way.
const STATUS_MAP: Record<string, string> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  paused: "canceled",
  canceled: "canceled",
};

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify Paddle's `Paddle-Signature: ts=...;h1=...` header.
// The signed payload is `${ts}:${rawBody}`, HMAC-SHA256 with the webhook secret.
async function verifySignature(header: string | null, rawBody: string): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;
  if (!header) return false;

  let ts = "", h1 = "";
  for (const part of header.split(";")) {
    const [k, v] = part.split("=");
    if (k === "ts") ts = v;
    else if (k === "h1") h1 = v;
  }
  if (!ts || !h1) return false;

  // Reject anything older than 5 minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  if (!Number.isFinite(age) || age > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time compare.
  if (expected.length !== h1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ h1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const ok = await verifySignature(req.headers.get("Paddle-Signature"), raw);
  if (!ok) {
    console.error("paddle-webhook: invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  const type: string = evt?.event_type ?? "";
  const d = evt?.data ?? {};

  // We only care about subscription lifecycle events.
  if (!type.startsWith("subscription.")) {
    return new Response(JSON.stringify({ ignored: type }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const db = admin();

  // Who is this? The checkout passes custom_data.user_id; fall back to matching
  // an existing row by subscription id, then by the customer's email.
  let userId: string | null = d?.custom_data?.user_id ?? null;

  if (!userId && d?.id) {
    const { data } = await db.from("subscriptions")
      .select("owner_id").eq("paddle_subscription_id", d.id).maybeSingle();
    userId = data?.owner_id ?? null;
  }
  if (!userId) {
    const email = d?.customer?.email ?? d?.billing_details?.email ?? null;
    if (email) {
      const { data } = await db.from("profiles")
        .select("id").eq("email", email).maybeSingle();
      userId = data?.id ?? null;
    }
  }
  if (!userId) {
    // Ack so Paddle stops retrying, but log loudly — this needs a human.
    console.error("paddle-webhook: could not map event to a user", { type, sub: d?.id });
    return new Response(JSON.stringify({ ok: false, reason: "user_not_found" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const priceId: string | null = d?.items?.[0]?.price?.id ?? null;
  const plan = (priceId && PRICE_TO_PLAN[priceId]) || "starter";
  const status = STATUS_MAP[d?.status] ?? "active";
  const periodEnd = d?.current_billing_period?.ends_at ?? null;

  // A cancellation that is still within the paid period keeps access until it ends;
  // Paddle sends status "canceled" only once access actually stops.
  const { error } = await db.from("subscriptions").upsert({
    owner_id: userId,
    plan,
    status,
    paddle_subscription_id: d?.id ?? null,
    paddle_customer_id: d?.customer_id ?? null,
    paddle_price_id: priceId,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id" });

  if (error) {
    console.error("paddle-webhook: db upsert failed", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`paddle-webhook: ${type} -> user ${userId} is ${plan}/${status}`);
  return new Response(JSON.stringify({ ok: true, plan, status }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
