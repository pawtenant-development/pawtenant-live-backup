// manual-run-lead-followup-sequence
//
// Admin-only wrapper around `lead-followup-sequence`. Used by the Settings tab
// "Run Email Sequences Now" button so an authenticated admin can trigger the
// sequence on demand without exposing the service role key to the browser.
//
// Behavior:
//   1. Verify the caller is an authenticated admin (doctor_profiles.is_admin)
//   2. Invoke the existing lead-followup-sequence Edge Function server-side
//      using the service role key (NEVER from the frontend)
//   3. Forward the standard result JSON back to the UI
//   4. Write an audit_logs row for traceability (who clicked, what happened)
//
// IMPORTANT — does NOT duplicate sequence logic:
//   All eligibility, dedupe, opt-out, paid-order safety, expiry handling, and
//   per-stage timing gates live in lead-followup-sequence/index.ts. This
//   function ONLY proxies the call. If TEST has SEQUENCE_DRY_RUN=true, no real
//   Resend emails go out — that toggle is honoured by the underlying function.
//
// Reference: SEQ-AUTOMATION-MANUAL-RUN-SETTINGS-BUTTON

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SequenceResults {
  step1_30min?: number;
  step2_24h?: number;
  step3_3day?: number;
  skipped?: number;
  opted_out?: number;
  expired?: number;
  dedup_skipped?: number;
}

interface SequenceResponse {
  ok: boolean;
  processed?: number;
  results?: SequenceResults;
  error?: string;
}

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

    // ── Step 2: invoke lead-followup-sequence server-side via service role ───
    // We forward the same body shape (none — empty POST runs the sequence).
    const targetUrl = `${SUPABASE_URL}/functions/v1/lead-followup-sequence`;
    const startedAt = new Date().toISOString();

    let seqResponse: SequenceResponse;
    let seqStatus = 0;
    try {
      const seqRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          apikey: SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      seqStatus = seqRes.status;
      const text = await seqRes.text();
      try {
        seqResponse = JSON.parse(text) as SequenceResponse;
      } catch {
        seqResponse = { ok: false, error: `Sequence returned non-JSON (status ${seqStatus}): ${text.slice(0, 200)}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      seqResponse = { ok: false, error: `Failed to invoke lead-followup-sequence: ${msg}` };
    }

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
          target_function: "lead-followup-sequence",
          sequence_status: seqStatus,
          sequence_response_ok: seqResponse.ok,
          processed: seqResponse.processed ?? 0,
          results: seqResponse.results ?? null,
          error: seqResponse.error ?? null,
        },
      });
    } catch (logErr) {
      // Audit failure must not break the response — just log to console.
      const msg = logErr instanceof Error ? logErr.message : String(logErr);
      console.error("[manual-run-lead-followup-sequence] audit_logs insert failed:", msg);
    }

    console.log(
      `[manual-run-lead-followup-sequence] Triggered by ${triggeredBy.email ?? triggeredBy.user_id} — ` +
      `seq status=${seqStatus} ok=${seqResponse.ok} processed=${seqResponse.processed ?? 0} ` +
      `results=${JSON.stringify(seqResponse.results ?? {})}`
    );

    if (!seqResponse.ok) {
      return json(
        {
          ok: false,
          error: seqResponse.error ?? `lead-followup-sequence returned status ${seqStatus}`,
          processed: seqResponse.processed ?? 0,
          results: seqResponse.results ?? {},
          triggered_by: triggeredBy,
          started_at: startedAt,
          finished_at: finishedAt,
        },
        200,
      );
    }

    return json({
      ok: true,
      processed: seqResponse.processed ?? 0,
      results: seqResponse.results ?? {},
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
