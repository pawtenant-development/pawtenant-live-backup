import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;

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

// Allowed provider-side status transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending_review: ["in_review"],
  in_review: ["pending_review"], // allow going back
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(token);
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify provider profile
    const { data: profile } = await supabase
      .from("doctor_profiles")
      .select("user_id, full_name, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) return json({ ok: false, error: "Provider profile not found" }, 403);
    if (profile.is_active === false) return json({ ok: false, error: "Account inactive" }, 403);

    const body = await req.json() as { confirmationId: string; newDoctorStatus: string };
    const { confirmationId, newDoctorStatus } = body;

    if (!confirmationId || !newDoctorStatus) {
      return json({ ok: false, error: "confirmationId and newDoctorStatus are required" }, 400);
    }

    // Fetch the order and verify ownership
    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, doctor_user_id, doctor_status")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (!order) return json({ ok: false, error: "Order not found" }, 404);
    if (order.doctor_user_id !== user.id) {
      return json({ ok: false, error: "Not authorized to update this order" }, 403);
    }

    // Validate transition
    const currentStatus = order.doctor_status ?? "pending_review";
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newDoctorStatus)) {
      return json({ ok: false, error: `Cannot transition from '${currentStatus}' to '${newDoctorStatus}'` }, 400);
    }

    // Update doctor_status
    const { error: updateErr } = await supabase
      .from("orders")
      .update({ doctor_status: newDoctorStatus })
      .eq("id", order.id);

    if (updateErr) return json({ ok: false, error: updateErr.message }, 500);

    return json({ ok: true, confirmationId, newDoctorStatus });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: msg }, 500);
  }
});
