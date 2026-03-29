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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Missing authorization" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await createClient(SUPABASE_URL, SUPABASE_ANON_KEY).auth.getUser(token);
    if (authError || !user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { data: profile } = await supabase
      .from("doctor_profiles").select("user_id, full_name, email, is_active").eq("user_id", user.id).maybeSingle();
    if (!profile) return json({ ok: false, error: "Provider profile not found" }, 403);
    if (profile.is_active === false) return json({ ok: false, error: "Provider account is inactive" }, 403);

    const body = await req.json() as {
      confirmationId: string; documentUrl: string; documentLabel: string;
      docType?: string; providerNote?: string;
    };

    const { confirmationId, documentUrl, documentLabel, docType, providerNote } = body;
    if (!confirmationId || !documentUrl || !documentLabel) {
      return json({ ok: false, error: "confirmationId, documentUrl, and documentLabel are required" }, 400);
    }

    // Fetch the order with full contact + letter info for GHL
    const { data: order } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, first_name, last_name, phone, state, doctor_user_id, doctor_email, doctor_status, status, letter_type, addon_services, price")
      .eq("confirmation_id", confirmationId).maybeSingle();

    if (!order) return json({ ok: false, error: "Order not found" }, 404);

    // ── Authorization check ──────────────────────────────────────────────
    const matchesById = order.doctor_user_id === user.id;
    const matchesByEmail =
      !!order.doctor_email && !!profile.email &&
      order.doctor_email.toLowerCase() === profile.email.toLowerCase();

    if (!matchesById && !matchesByEmail) {
      return json({ ok: false, error: "Not authorized to update this order", debug: { orderDoctorUserId: order.doctor_user_id, orderDoctorEmail: order.doctor_email, authenticatedUserId: user.id, profileEmail: profile.email } }, 403);
    }

    if (!matchesById && matchesByEmail) {
      await supabase.from("orders").update({ doctor_user_id: user.id }).eq("id", order.id);
    }

    const { error: docError } = await supabase.from("order_documents").insert({
      order_id: order.id, confirmation_id: confirmationId, label: documentLabel,
      doc_type: docType ?? "esa_letter", file_url: documentUrl,
      notes: providerNote?.trim() || null, uploaded_by: profile.full_name,
      sent_to_customer: false, customer_visible: true,
    });

    if (docError) return json({ ok: false, error: `Failed to save document: ${docError.message}` }, 500);

    await supabase.from("orders").update({
      doctor_status: "patient_notified", status: "completed",
      signed_letter_url: documentUrl, patient_notification_sent_at: new Date().toISOString(),
      doctor_user_id: user.id,
    }).eq("id", order.id);

    const notifyRes = await fetch(`${SUPABASE_URL}/functions/v1/notify-patient-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ confirmationId, doctorMessage: providerNote?.trim() || null }),
    });

    let notifyResult: { ok?: boolean; error?: string } = {};
    try { notifyResult = await notifyRes.json() as typeof notifyResult; } catch { /* ignore */ }

    await supabase.from("doctor_notifications").insert({
      doctor_user_id: user.id, title: "Order Completed",
      message: `Documents submitted for order ${confirmationId}. Order marked as completed and patient has been notified.`,
      type: "letter_submitted", confirmation_id: confirmationId, order_id: order.id,
    });

    // ── Fire GHL update with "Letter Sent / Completed" status + full contact fields ──
    const isPSD = (order.letter_type as string) === "psd" || (confirmationId ?? "").toUpperCase().includes("-PSD");
    const addonServices = Array.isArray(order.addon_services) ? (order.addon_services as string[]) : [];

    fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({
        webhookType: "main",
        event: "order_completed",
        email: order.email,
        firstName: order.first_name ?? "",
        lastName: order.last_name ?? "",
        phone: order.phone ?? "",
        confirmationId,
        patientState: order.state ?? "",
        letterType: isPSD ? "psd" : "esa",
        addonServices,
        price: order.price,
        assignedDoctor: profile.full_name,
        leadStatus: isPSD ? "PSD — Letter Sent — Completed" : "ESA — Letter Sent — Completed",
        tags: ["Letter Sent", "Completed", isPSD ? "PSD Order" : "ESA Order"],
      }),
    }).catch(() => {});

    return json({
      ok: true, documentSaved: true, orderUpdated: true, patientNotified: notifyResult?.ok === true,
      message: notifyResult?.ok
        ? "Documents submitted successfully. Order marked as completed and patient has been notified by email."
        : "Documents saved and order completed. Patient notification may have been delayed — admin can resend.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return json({ ok: false, error: msg }, 500);
  }
});
