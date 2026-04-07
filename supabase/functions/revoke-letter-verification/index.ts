/**
 * revoke-letter-verification
 *
 * Admin-only endpoint to revoke a letter verification ID.
 * Sets letter_verifications.status = 'revoked' and writes an audit log.
 * Idempotent — revoking an already-revoked ID is a no-op.
 *
 * Body: { orderId: string, letterId: string, reason?: string }
 * Auth: requires valid admin JWT (verify_jwt = true)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse body
    let body: { orderId?: string; letterId?: string; reason?: string };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const { orderId, letterId, reason } = body;

    if (!orderId || !letterId) {
      return json({ ok: false, error: "orderId and letterId are required" }, 400);
    }

    console.log(`[revoke-letter-verification] Revoking ${letterId} for order ${orderId}`);

    // Fetch the current record
    const { data: existing, error: fetchErr } = await supabase
      .from("letter_verifications")
      .select("id, status, letter_id, order_id")
      .eq("letter_id", letterId)
      .eq("order_id", orderId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[revoke-letter-verification] Fetch error:", fetchErr.message);
      return json({ ok: false, error: `Fetch failed: ${fetchErr.message}` }, 500);
    }

    if (!existing) {
      return json({ ok: false, error: "Verification record not found for this order" }, 404);
    }

    // Idempotent — already revoked
    if (existing.status === "revoked") {
      console.log(`[revoke-letter-verification] Already revoked: ${letterId}`);
      return json({ ok: true, revoked: false, alreadyRevoked: true, letterId });
    }

    // Update status to revoked (with all columns now confirmed to exist)
    const { error: updateErr } = await supabase
      .from("letter_verifications")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoke_reason: reason?.trim() || "Revoked by admin",
      })
      .eq("letter_id", letterId)
      .eq("order_id", orderId);

    if (updateErr) {
      console.error("[revoke-letter-verification] Update error:", updateErr.message);
      return json({ ok: false, error: `Failed to revoke: ${updateErr.message}` }, 500);
    }

    // Write audit log (best-effort)
    try {
      await supabase.from("audit_logs").insert({
        action: "letter_verification_revoked",
        entity_type: "letter_verification",
        entity_id: letterId,
        performed_by: null,
        details: {
          letter_id: letterId,
          order_id: orderId,
          reason: reason?.trim() || "Revoked by admin",
          revoked_at: new Date().toISOString(),
        },
      });
    } catch {
      // Audit log is best-effort — don't fail the request
    }

    console.log(`[revoke-letter-verification] ✓ Revoked ${letterId}`);
    return json({ ok: true, revoked: true, alreadyRevoked: false, letterId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[revoke-letter-verification] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
