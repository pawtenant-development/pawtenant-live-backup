import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json() as {
      confirmationId?: string;
      action?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      state?: string;
      deliverySpeed?: string;
      assessmentAnswers?: Record<string, unknown>;
      letterType?: string;
      status?: string;
      paymentIntentId?: string;
      price?: number;
      planType?: string;
      referredBy?: string;
    };

    const { confirmationId, action } = body;

    if (!confirmationId) {
      return new Response(
        JSON.stringify({ ok: false, error: "confirmationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UPSERT action: save/update order (service_role bypasses RLS) ──────
    if (action === "upsert") {
      const upsertPayload: Record<string, unknown> = {
        confirmation_id: confirmationId,
        user_id: null,
      };

      if (body.email !== undefined) upsertPayload.email = body.email;
      if (body.firstName !== undefined) upsertPayload.first_name = body.firstName;
      if (body.lastName !== undefined) upsertPayload.last_name = body.lastName;
      if (body.phone !== undefined) upsertPayload.phone = body.phone;
      if (body.state !== undefined) upsertPayload.state = body.state;
      if (body.deliverySpeed !== undefined) upsertPayload.delivery_speed = body.deliverySpeed;
      if (body.letterType !== undefined) upsertPayload.letter_type = body.letterType;
      if (body.status !== undefined) upsertPayload.status = body.status;
      if (body.assessmentAnswers !== undefined) upsertPayload.assessment_answers = body.assessmentAnswers;
      if (body.paymentIntentId !== undefined) upsertPayload.payment_intent_id = body.paymentIntentId;
      if (body.price !== undefined) upsertPayload.price = body.price;
      if (body.planType !== undefined) upsertPayload.plan_type = body.planType;
      // referred_by — accepts both spellings from ESA + PSD callers
      if (body.referredBy !== undefined && body.referredBy !== "") {
        upsertPayload.referred_by = body.referredBy;
      }

      const { error: upsertError } = await supabase
        .from("orders")
        .upsert(upsertPayload, { onConflict: "confirmation_id", ignoreDuplicates: false });

      if (upsertError) {
        console.error("[get-resume-order] upsert failed:", upsertError.message);
        return new Response(
          JSON.stringify({ ok: false, error: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Default GET action: fetch order for resume flow ───────────────────
    const { data, error } = await supabase
      .from("orders")
      .select(
        "confirmation_id, first_name, last_name, email, phone, state, delivery_speed, price, assessment_answers, payment_intent_id, status, plan_type, letter_type"
      )
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If order is already fully paid, signal that to the frontend
    const alreadyPaid = !!(data.payment_intent_id);

    // Return safe subset — never expose raw payment_intent_id
    const safeOrder = {
      confirmation_id: data.confirmation_id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      state: data.state,
      delivery_speed: data.delivery_speed,
      price: data.price,
      assessment_answers: data.assessment_answers,
      status: data.status,
      plan_type: data.plan_type,
      letter_type: data.letter_type,
      already_paid: alreadyPaid,
    };

    return new Response(
      JSON.stringify({ ok: true, order: safeOrder }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
