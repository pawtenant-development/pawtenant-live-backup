import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * newsletter-subscribe
 *
 * Replaces the third-party Readdy footer newsletter form POST. Accepts an
 * email from the site-wide footer signup and writes a row to
 * public.newsletter_subscribers (RLS blocks anon inserts — service role only).
 *
 * Deliberately minimal: NO third-party submission, NO generic Readdy email,
 * NO broad newsletter automation. The row is authoritative; the client just
 * shows an on-page success message.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_EMAIL = 320;
const MAX_SOURCE = 100;
const MAX_PAGE = 500;

interface SubscribePayload {
  email?: string;
  source?: string | null;
  page_url?: string | null;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trimOrNull(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: SubscribePayload;
  try {
    payload = (await req.json()) as SubscribePayload;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const email = trimOrNull(payload.email, MAX_EMAIL);
  const source = trimOrNull(payload.source, MAX_SOURCE) ?? "footer_newsletter";
  const pageUrl = trimOrNull(payload.page_url, MAX_PAGE);

  if (!email) return json(400, { ok: false, error: "Email is required" });
  if (!isValidEmail(email)) {
    return json(400, { ok: false, error: "Invalid email address" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Upsert on lower(email) so a repeat signup is a no-op refresh, not an error.
  const { error: upsertErr } = await supabase
    .from("newsletter_subscribers")
    .upsert(
      {
        email: email.toLowerCase(),
        source,
        page_url: pageUrl,
        status: "subscribed",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email", ignoreDuplicates: false },
    );

  if (upsertErr) {
    // Fallback path: the unique index is on lower(email); if the upsert target
    // can't be inferred, try a plain insert and treat a duplicate as success.
    const { error: insErr } = await supabase
      .from("newsletter_subscribers")
      .insert({
        email: email.toLowerCase(),
        source,
        page_url: pageUrl,
        status: "subscribed",
      });
    const isDuplicate = (insErr?.code === "23505") ||
      (insErr?.message ?? "").toLowerCase().includes("duplicate");
    if (insErr && !isDuplicate) {
      console.error("[newsletter-subscribe] insert failed:", insErr.message);
      return json(500, { ok: false, error: "Failed to record subscription" });
    }
  }

  return json(200, { ok: true });
});
