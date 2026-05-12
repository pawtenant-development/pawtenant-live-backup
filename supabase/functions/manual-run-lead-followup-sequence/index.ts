// manual-run-lead-followup-sequence
//
// Admin-only wrapper around the lead-followup sequence engine. Used by the
// Settings tab "Run Email Sequences Now" button so an authenticated admin
// can trigger the sequence on demand without exposing the service role key
// to the browser.
//
// Auth flow:
//   1. Verify the caller is an authenticated admin (doctor_profiles.is_admin
//      OR role in {owner, admin_manager}).
//   2. Run the sequence IN-PROCESS by calling runLeadFollowupSequence from
//      the shared core module (../lead-followup-sequence/core.ts).
//      NO inter-function HTTP roundtrip — this is the fix for the prior
//      "lead-followup-sequence returned status 401" symptom, which was
//      Supabase platform `verify_jwt` rejecting the wrapper's call to the
//      engine. By calling the core logic in-process, there is no second
//      auth boundary to misconfigure.
//   3. Write an audit_logs row for traceability (who clicked, what happened).
//
// IMPORTANT — does NOT duplicate sequence logic:
//   All eligibility, dedupe, opt-out, paid-order safety, expiry handling,
//   and per-stage timing gates live in ../lead-followup-sequence/core.ts.
//   This wrapper only handles admin auth + audit.
//
// Reference: SEQ-AUTOMATION-MANUAL-RUN-SETTINGS-BUTTON

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runLeadFollowupSequence } from "../lead-followup-sequence/core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Step 1: verify the caller is an authenticated admin ──────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ ok: false, error: "Unauthorized — missing token" }, 401);

    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ ok: false, error: "Unauthorized — invalid token" }, 401);
    }

    const { data: profile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin, is_active, role, full_name, email")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    const role = (profile?.role as string | null) ?? "";
    const isAdmin = !!(profile?.is_admin && profile?.is_active);
    const isOwnerOrAdminMgr = ["owner", "admin_manager"].includes(role);

    if (!isAdmin && !isOwnerOrAdminMgr) {
      return json({ ok: false, error: "Admin access required" }, 403);
    }

    const triggeredBy = {
      user_id: userData.user.id,
      email: (profile?.email as string | null) ?? userData.user.email ?? null,
      full_name: (profile?.full_name as string | null) ?? null,
      role,
    };

    // ── Step 2: run the sequence IN-PROCESS (no inter-function HTTP) ─────────
    // invocationSource='manual' so the sequence_automation_status heartbeat
    // is tagged correctly and the admin Settings panel can distinguish manual
    // recovery runs from automatic cron runs.
    const startedAt = new Date().toISOString();
    const seqResult = await runLeadFollowupSequence(adminClient, {
      invocationSource: "manual",
    });
    const finishedAt = new Date().toISOString();

    // ── Step 3: write audit_logs row with the result and who triggered it ────
    try {
      await adminClient.from("audit_logs").insert({
        actor_name: triggeredBy.full_name ?? triggeredBy.email ?? "Admin",
        actor_role: role || (isAdmin ? "admin" : "system"),
        object_type: "sequence",
        object_id: "manual_run",
        action: "seq_manual_run",
        description: `Manual sequence run triggered by ${triggeredBy.email ?? triggeredBy.user_id}`,
        metadata: {
          triggered_by: triggeredBy,
          started_at: startedAt,
          finished_at: finishedAt,
          target_function: "lead-followup-sequence (in-process)",
          sequence_response_ok: seqResult.ok,
          processed: seqResult.processed,
          results: seqResult.results,
          error: seqResult.error ?? null,
        },
      });
    } catch (logErr) {
      // Audit failure must not break the response — just log to console.
      const msg = logErr instanceof Error ? logErr.message : String(logErr);
      console.error("[manual-run-lead-followup-sequence] audit_logs insert failed:", msg);
    }

    console.log(
      `[manual-run-lead-followup-sequence] Triggered by ${triggeredBy.email ?? triggeredBy.user_id} — ` +
      `ok=${seqResult.ok} processed=${seqResult.processed} ` +
      `results=${JSON.stringify(seqResult.results)}`,
    );

    if (!seqResult.ok) {
      return json(
        {
          ok: false,
          error: seqResult.error ?? "lead-followup-sequence run failed",
          processed: seqResult.processed,
          results: seqResult.results,
          triggered_by: triggeredBy,
          started_at: startedAt,
          finished_at: finishedAt,
        },
        200,
      );
    }

    return json({
      ok: true,
      processed: seqResult.processed,
      results: seqResult.results,
      triggered_by: triggeredBy,
      started_at: startedAt,
      finished_at: finishedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[manual-run-lead-followup-sequence] Error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
