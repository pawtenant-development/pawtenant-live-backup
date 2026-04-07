/**
 * issue-letter-verification
 *
 * Generates and assigns a public-safe Verification ID for a finalized ESA/PSD letter.
 * Fully idempotent — safe against double-clicks, retries, and duplicate submissions.
 * Auth: service-role only (called server-to-server from provider-submit-letter).
 *
 * IMPORTANT:
 *   - DB RPC parameter is named p_state (not state)
 *   - letter_verifications.provider_id references doctor_profiles.id (row PK),
 *     NOT doctor_user_id (auth UUID) — must resolve before inserting
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** Resolve doctor_profiles.id (row PK) from auth user_id. Returns null if not found. */
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

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || token !== SERVICE_ROLE_KEY) {
      console.error("[issue-letter-verification] Unauthorized — token mismatch");
      return json({ ok: false, error: "Unauthorized — service role required" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json() as { orderId: string; confirmationId: string };
    const { orderId, confirmationId } = body;

    if (!orderId || !confirmationId) {
      return json({ ok: false, error: "orderId and confirmationId are required" }, 400);
    }

    console.log(`[issue-letter-verification] Processing for order ${confirmationId} (${orderId})`);

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, confirmation_id, state, letter_type, doctor_user_id, letter_id, status, doctor_status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderErr) {
      console.error("[issue-letter-verification] Order fetch error:", orderErr.message);
      return json({ ok: false, error: `Order fetch failed: ${orderErr.message}` }, 500);
    }
    if (!order) {
      return json({ ok: false, error: "Order not found" }, 404);
    }

    // Idempotency: check if letter_id already set on order
    if (order.letter_id) {
      const { data: existing } = await supabase
        .from("letter_verifications")
        .select("*")
        .eq("order_id", orderId)
        .maybeSingle();

      if (existing) {
        console.log(`[issue-letter-verification] Idempotent return — letter_id: ${order.letter_id}`);
        return json({ ok: true, issued: false, reused: true, letterId: order.letter_id as string, verification: existing });
      }
    }

    // Belt-and-suspenders: check letter_verifications directly
    const { data: existingByOrder } = await supabase
      .from("letter_verifications")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existingByOrder) {
      if (!order.letter_id) {
        await supabase.from("orders").update({ letter_id: existingByOrder.letter_id }).eq("id", orderId);
      }
      console.log(`[issue-letter-verification] Found existing verification for ${confirmationId}: ${existingByOrder.letter_id}`);
      return json({ ok: true, issued: false, reused: true, letterId: existingByOrder.letter_id as string, verification: existingByOrder });
    }

    const state = ((order.state as string) ?? "").toUpperCase().trim().slice(0, 2);
    if (!state || state.length !== 2) {
      console.error(`[issue-letter-verification] Invalid state: '${order.state}'`);
      return json({ ok: false, error: `Cannot issue verification ID — invalid state: '${order.state}'` }, 422);
    }

    const rawLetterType = (order.letter_type as string | null) ?? "";
    const letterType: "esa" | "psd" =
      rawLetterType === "psd" || (confirmationId ?? "").toUpperCase().includes("-PSD") ? "psd" : "esa";

    // Resolve doctor_profiles.id — FK requires row PK, not auth UUID
    const profileId = await resolveProfileId(supabase, order.doctor_user_id as string | null);

    // Generate unique letter_id via Postgres RPC — parameter named p_state
    const { data: genResult, error: genErr } = await supabase
      .rpc("generate_letter_verification_id", { p_state: state });

    if (genErr || !genResult) {
      console.error("[issue-letter-verification] RPC error:", genErr?.message);
      return json({ ok: false, error: `Failed to generate verification ID: ${genErr?.message ?? "unknown"}` }, 500);
    }

    const letterId = genResult as string;
    console.log(`[issue-letter-verification] Generated letterId: ${letterId} for ${confirmationId}`);

    const { data: verification, error: insertErr } = await supabase
      .from("letter_verifications")
      .insert({
        letter_id: letterId,
        order_id: orderId,
        provider_id: profileId,   // doctor_profiles.id row PK (nullable)
        state,
        letter_type: letterType,
        issued_at: new Date().toISOString(),
        status: "valid",
        expires_at: null,
      })
      .select()
      .maybeSingle();

    if (insertErr) {
      if (insertErr.code === "23505") {
        const { data: raceRecord } = await supabase
          .from("letter_verifications")
          .select("*")
          .eq("order_id", orderId)
          .maybeSingle();
        if (raceRecord) {
          await supabase.from("orders").update({ letter_id: raceRecord.letter_id }).eq("id", orderId);
          return json({ ok: true, issued: false, reused: true, letterId: raceRecord.letter_id as string, verification: raceRecord });
        }
      }
      console.error("[issue-letter-verification] Insert error:", insertErr.message);
      return json({ ok: false, error: `Failed to insert verification record: ${insertErr.message}` }, 500);
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({ letter_id: letterId })
      .eq("id", orderId);

    if (updateErr) {
      await supabase.from("letter_verifications").delete().eq("letter_id", letterId);
      console.error("[issue-letter-verification] Orders update error:", updateErr.message);
      return json({ ok: false, error: `Failed to link verification ID to order: ${updateErr.message}` }, 500);
    }

    await supabase.from("audit_logs").insert({
      actor_name: "System", actor_role: "system",
      object_type: "letter_verification", object_id: confirmationId,
      action: "verification_issued",
      description: `Verification ID issued for order ${confirmationId}: ${letterId}`,
      metadata: { order_id: orderId, confirmation_id: confirmationId, letter_id: letterId, provider_id: profileId, issued: true, timestamp: new Date().toISOString() },
    });

    console.log(`[issue-letter-verification] ✓ Issued ${letterId} for ${confirmationId}`);
    return json({ ok: true, issued: true, reused: false, letterId, verification });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[issue-letter-verification] Unexpected error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
