/**
 * repair-order-letter-id
 *
 * Two modes:
 * 1. Bulk backfill — no body or { all: true } — requires service role key
 * 2. Single order  — { confirmationId: "PT-XXX" } — accepts admin JWT OR service role key
 *
 * Auth:
 *   - Service role key in Authorization header → always allowed (both modes)
 *   - Admin JWT (is_admin=true in doctor_profiles) → allowed for single-order mode
 *
 * IMPORTANT:
 *   - DB RPC parameter is named p_state (not state)
 *   - letter_verifications.provider_id references doctor_profiles.id (NOT doctor_user_id)
 *     so we must resolve the profile row id before inserting
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyVerificationPrefix } from "../_shared/letterType.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resolve doctor_profiles.id from doctor_user_id (auth UUID). Returns null if not found. */
async function resolveProfileId(
  supabase: ReturnType<typeof createClient>,
  doctorUserId: string | null
): Promise<string | null> {
  if (!doctorUserId) return null;
  const { data } = await supabase
    .from("doctor_profiles")
    .select("id")
    .eq("user_id", doctorUserId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const isServiceRole = token === SERVICE_ROLE_KEY;

  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      const text = await req.text();
      if (text.trim()) body = JSON.parse(text);
    }
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const confirmationId = body.confirmationId as string | undefined;
  const isSingleOrder = !!confirmationId;

  // Auth check
  if (!isServiceRole) {
    if (!isSingleOrder) {
      return json({ ok: false, error: "Bulk repair requires service role key" }, 401);
    }
    if (!token) {
      return json({ ok: false, error: "Authorization required" }, 401);
    }
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) {
      return json({ ok: false, error: "Invalid or expired token" }, 401);
    }
    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("is_admin, is_active")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!profile?.is_admin || !profile?.is_active) {
      return json({ ok: false, error: "Admin access required" }, 403);
    }
  }

  // ── SINGLE ORDER MODE ──────────────────────────────────────────────────────
  if (isSingleOrder) {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, confirmation_id, state, letter_type, doctor_user_id, letter_id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (orderErr || !order) {
      return json({ ok: false, error: `Order not found: ${confirmationId}` }, 404);
    }

    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);
    if (!state || state.length !== 2) {
      return json({ ok: false, error: `Invalid state on order: ${order.state}` }, 400);
    }

    const isPSD = (order.letter_type as string) === "psd" || (order.confirmation_id as string).toUpperCase().includes("-PSD");
    const letterType = isPSD ? "psd" : "esa";

    // Resolve doctor_profiles.id from doctor_user_id — FK requires the profile row id, not auth uuid
    const profileId = await resolveProfileId(supabase, order.doctor_user_id as string | null);

    let letterId = order.letter_id as string | null;

    if (!letterId) {
      const { data: existing } = await supabase
        .from("letter_verifications")
        .select("letter_id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (existing?.letter_id) {
        letterId = existing.letter_id as string;
        await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
      } else {
        const { data: genResult, error: genErr } = await supabase.rpc("generate_letter_verification_id", { p_state: state });
        if (genErr || !genResult) {
          return json({ ok: false, error: `Failed to generate ID: ${genErr?.message}` }, 500);
        }
        letterId = genResult as string;

        const { error: insertErr } = await supabase.from("letter_verifications").insert({
          letter_id: letterId,
          order_id: order.id,
          provider_id: profileId,   // doctor_profiles.id (row PK), not auth uuid
          state,
          letter_type: letterType,
          issued_at: new Date().toISOString(),
          status: "valid",
          expires_at: null,
        });

        if (insertErr && insertErr.code !== "23505") {
          return json({ ok: false, error: `Failed to save verification: ${insertErr.message}` }, 500);
        }

        if (insertErr?.code === "23505") {
          const { data: raceRec } = await supabase.from("letter_verifications").select("letter_id").eq("order_id", order.id).maybeSingle();
          if (raceRec?.letter_id) letterId = raceRec.letter_id as string;
        }

        await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
      }
    }

    return json({ ok: true, letterId, documentsProcessed: 0,
      message: `Verification ID ${letterId} is available in the customer portal; no PDF was modified` });
  }

  // ── BULK MODE (service role only) ──────────────────────────────────────────
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("id, confirmation_id, state, letter_type, doctor_user_id, letter_id")
    .in("doctor_status", ["patient_notified", "letter_sent"])
    .is("letter_id", null);

  if (ordersErr) return json({ ok: false, error: ordersErr.message }, 500);
  if (!orders || orders.length === 0) return json({ ok: true, message: "No orders need repair", fixed: 0 });

  console.log(`[repair] Found ${orders.length} orders needing repair`);

  const results: Array<{ confirmationId: string; letterId: string | null; docsFixed: number; errors: string[] }> = [];

  for (const order of orders) {
    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);
    if (!state || state.length !== 2) {
      results.push({ confirmationId: order.confirmation_id as string, letterId: null, docsFixed: 0, errors: [`Invalid state: ${order.state}`] });
      continue;
    }

    const isPSD = (order.letter_type as string) === "psd" || (order.confirmation_id as string).toUpperCase().includes("-PSD");
    const letterType = isPSD ? "psd" : "esa";

    // Resolve doctor_profiles.id from doctor_user_id
    const profileId = await resolveProfileId(supabase, order.doctor_user_id as string | null);

    let letterId: string | null = null;
    const { data: existing } = await supabase
      .from("letter_verifications")
      .select("letter_id")
      .eq("order_id", order.id)
      .maybeSingle();

    if (existing?.letter_id) {
      letterId = existing.letter_id as string;
      await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
    } else {
      const { data: genResult, error: genErr } = await supabase.rpc("generate_letter_verification_id", { p_state: state });
      if (genErr || !genResult) {
        results.push({ confirmationId: order.confirmation_id as string, letterId: null, docsFixed: 0, errors: [`RPC failed: ${genErr?.message}`] });
        continue;
      }
      letterId = genResult as string;

      const { error: insertErr } = await supabase.from("letter_verifications").insert({
        letter_id: letterId,
        order_id: order.id,
        provider_id: profileId,   // doctor_profiles.id (row PK), not auth uuid
        state,
        letter_type: letterType,
        issued_at: new Date().toISOString(),
        status: "valid",
        expires_at: null,
      });

      if (insertErr && insertErr.code !== "23505") {
        results.push({ confirmationId: order.confirmation_id as string, letterId: null, docsFixed: 0, errors: [`Insert failed: ${insertErr.message}`] });
        continue;
      }

      if (insertErr?.code === "23505") {
        const { data: raceRec } = await supabase.from("letter_verifications").select("letter_id").eq("order_id", order.id).maybeSingle();
        if (raceRec?.letter_id) letterId = raceRec.letter_id as string;
      }

      await supabase.from("orders").update({ letter_id: letterId }).eq("id", order.id);
    }

    results.push({ confirmationId: order.confirmation_id as string, letterId, docsFixed: 0, errors: [] });
  }

  const totalFixed = results.filter((r) => r.letterId).length;
  const totalDocs = results.reduce((sum, r) => sum + r.docsFixed, 0);

  return json({
    ok: true,
    message: `Repaired ${totalFixed} order verification IDs; modified ${totalDocs} PDFs`,
    results,
  });
});
