// Shared CORS headers for all Rezpona Edge Functions.
// ALLOWED_ORIGIN can be set as a function secret; defaults to the production site.
const ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";

export const corsHeaders = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Handle the CORS preflight; returns a Response if it was a preflight, else null.
export function preflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
