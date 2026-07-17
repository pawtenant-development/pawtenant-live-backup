/**
 * revoke-letter-verification
 *
 * Admin-only endpoint to revoke a letter verification ID.
 * Sets letter_verifications.status = 'revoked' and writes an audit log.
 * Idempotent — revoking an already-revoked ID is a no-op.
 *
 * Body: { orderId: string, letterId: string, reason?: string }
 * Auth: admin bearer (doctor_profiles.is_admin) or the service-role key.
 *
 * LETTER-VERIFICATION-REVOKE-AUDIT-FIX-001
 * ----------------------------------------
 * Revoking a verification ID is a CUSTOMER-FACING, effectively irreversible act:
 * the landlord checking pawtenant.com/verify/<id> is told the letter is invalid.
 * It must never happen without a durable record of WHO did it and WHY.
 *
 * Three defects are fixed here:
 *
 *  1. THE AUDIT INSERT COULD NEVER SUCCEED. It wrote entity_type / entity_id /
 *     performed_by / details — four columns that do not exist on audit_logs
 *     (proven: `42703: column "entity_type" of relation "audit_logs" does not
 *     exist`). The real schema is object_type / object_id / actor_id /
 *     actor_name / actor_role / description / old_values / new_values /
 *     metadata, and object_type is NOT NULL. Consequence: every manual revoke
 *     ever performed is unaudited — LIVE has 1 revoked verification and 0
 *     matching audit rows.
 *
 *  2. THE FAILURE WAS INVISIBLE — TWICE OVER. supabase-js returns `{ error }`
 *     rather than throwing, so the old `try { await insert(...) } catch {}`
 *     never even ran its catch: the error object was simply discarded. The
 *     result is now inspected, logged to edge monitoring, and reported back to
 *     the caller as auditLogged:false + auditError.
 *
 *  3. THERE WAS NO AUTHORIZATION CHECK, and no actor. The header claimed
 *     "admin-only" but nothing enforced it: verify_jwt=true only proves the JWT
 *     is *valid*, not that the caller is an admin — any signed-in customer could
 *     revoke a verification ID. `performed_by` was hardcoded null, so even a
 *     working insert would have recorded nobody. The caller is now resolved from
 *     the bearer and gated on doctor_profiles.is_admin (same pattern as
 *     admin-upload-document), and that identity is what gets recorded.
 *
 * The audit row shape matches the existing verification writers exactly
 * (verification_issued / letter_verification_restored): object_type
 * 'letter_verification', object_id = the CONFIRMATION id, letter_id carried in
 * description + metadata.
 *
 * PII: records only the actor's staff identity and the order's confirmation id.
 * No customer name, email, phone, address or clinical detail is written.
 * Sends nothing — no email, SMS, chat, GHL or provider notification.
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
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // ── Authorization ────────────────────────────────────────────────────────
    // verify_jwt=true only guarantees a *valid* JWT — it does NOT prove the
    // caller is staff. Resolve the caller and gate on doctor_profiles.is_admin,
    // mirroring admin-upload-document. A service-role bearer (internal tooling)
    // is inherently trusted and bypasses the user lookup.
    const authHeader = req.headers.get("authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!bearer) return json({ ok: false, error: "Missing bearer token" }, 401);

    let actorId: string | null = null;
    let actorName = "System";
    let actorRole = "system";

    if (bearer === SERVICE_ROLE_KEY) {
      actorName = "Service role";
      actorRole = "service_role";
    } else {
      const { data: userResp, error: userErr } = await supabase.auth.getUser(bearer);
      if (userErr || !userResp?.user) {
        return json({ ok: false, error: "Invalid token" }, 401);
      }
      const { data: profile } = await supabase
        .from("doctor_profiles")
        .select("is_admin, full_name, email, role")
        .eq("user_id", userResp.user.id)
        .maybeSingle();

      const p = profile as
        | { is_admin?: boolean; full_name?: string | null; email?: string | null; role?: string | null }
        | null;

      if (!p?.is_admin) {
        console.warn(
          `[revoke-letter-verification] DENIED non-admin caller ${userResp.user.id}`,
        );
        return json({ ok: false, error: "Admin only" }, 403);
      }

      actorId = userResp.user.id;
      actorName = p.full_name?.trim() || p.email?.trim() || userResp.user.email || "Unknown admin";
      actorRole = p.role?.trim() || "admin";
    }

    // ── Body ─────────────────────────────────────────────────────────────────
    let body: { orderId?: string; letterId?: string; reason?: string };
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const { orderId, letterId } = body;
    const reason = body.reason?.trim() || "Revoked by admin";

    if (!orderId || !letterId) {
      return json({ ok: false, error: "orderId and letterId are required" }, 400);
    }

    console.log(`[revoke-letter-verification] Revoking ${letterId} for order ${orderId}`);

    // Fetch the current record. revoked_at / revoke_reason are read so the audit
    // row can record the true previous state rather than an assumed one.
    const { data: existing, error: fetchErr } = await supabase
      .from("letter_verifications")
      .select("id, status, letter_id, order_id, revoked_at, revoke_reason, confirmation_id")
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

    const prev = existing as {
      status: string;
      revoked_at: string | null;
      revoke_reason: string | null;
      confirmation_id: string | null;
    };

    // Idempotent — already revoked. No state change ⇒ no audit row (auditing a
    // no-op would fabricate a second revocation event that never happened).
    if (prev.status === "revoked") {
      console.log(`[revoke-letter-verification] Already revoked: ${letterId}`);
      return json({ ok: true, revoked: false, alreadyRevoked: true, letterId });
    }

    // object_id matches the sibling verification writers: the CONFIRMATION id.
    let confirmationId = prev.confirmation_id ?? null;
    if (!confirmationId) {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("confirmation_id")
        .eq("id", orderId)
        .maybeSingle();
      confirmationId = (orderRow as { confirmation_id?: string } | null)?.confirmation_id ?? null;
    }

    const revokedAt = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("letter_verifications")
      .update({ status: "revoked", revoked_at: revokedAt, revoke_reason: reason })
      .eq("letter_id", letterId)
      .eq("order_id", orderId);

    if (updateErr) {
      console.error("[revoke-letter-verification] Update error:", updateErr.message);
      return json({ ok: false, error: `Failed to revoke: ${updateErr.message}` }, 500);
    }

    // ── Audit ────────────────────────────────────────────────────────────────
    // Canonical audit_logs schema. NOT best-effort: the result is inspected and
    // any failure is escalated to edge monitoring AND returned to the caller, so
    // a revoke can never again appear to succeed while leaving no trace.
    const { error: auditErr } = await supabase.from("audit_logs").insert({
      action: "letter_verification_revoked",
      object_type: "letter_verification",
      object_id: confirmationId ?? letterId,
      actor_id: actorId,
      actor_name: actorName,
      actor_role: actorRole,
      description:
        `Verification ID ${letterId} revoked for order ${confirmationId ?? orderId} by ${actorName}: ${reason}`,
      old_values: {
        status: prev.status,
        revoked_at: prev.revoked_at,
        revoke_reason: prev.revoke_reason,
      },
      new_values: {
        status: "revoked",
        revoked_at: revokedAt,
        revoke_reason: reason,
      },
      metadata: {
        letter_id: letterId,
        order_id: orderId,
        confirmation_id: confirmationId,
        reason,
        revoked_at: revokedAt,
        task_id: "LETTER-VERIFICATION-REVOKE-AUDIT-FIX-001",
      },
    });

    if (auditErr) {
      // The revoke itself DID happen — returning 500 would be a lie. Instead
      // surface the audit gap loudly: edge logs for monitoring, and an explicit
      // flag the admin UI renders as a warning.
      console.error(
        `[revoke-letter-verification] AUDIT WRITE FAILED for ${letterId} (revoke DID apply) — ${auditErr.message}`,
      );
      return json({
        ok: true,
        revoked: true,
        alreadyRevoked: false,
        letterId,
        auditLogged: false,
        auditError: auditErr.message,
      });
    }

    console.log(
      `[revoke-letter-verification] ✓ Revoked ${letterId} by ${actorName} (${actorRole}) — audit written`,
    );
    return json({ ok: true, revoked: true, alreadyRevoked: false, letterId, auditLogged: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[revoke-letter-verification] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
