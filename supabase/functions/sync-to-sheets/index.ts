import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_SHEETS_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbx04WIFe4-Fg2GqofuS9lrNWuFcA-IUNtQ_gK07x7Uz8Mjtk4ZTGBmSnSYfKki7NJrfIg/exec";

const SHEETS_SECRET = "pt-esa-2026-xK9m";

function derivePaymentStatus(order: Record<string, unknown>): string {
  if (order.refunded_at) return "Refunded";
  if (order.dispute_id) return "Disputed";
  const status = (order.status as string) ?? "";
  if (["processing", "completed", "letter_sent", "review", "approved"].includes(status) && order.payment_intent_id)
    return "Paid";
  if (status === "cancelled") return "Cancelled";
  if (status === "lead") return "Unpaid";
  if (order.payment_intent_id) return "Paid";
  return "Unpaid";
}

function deriveOrderStatus(order: Record<string, unknown>): string {
  const status = (order.status as string) ?? "";
  const map: Record<string, string> = {
    lead: "Lead – Checkout Not Completed",
    processing: "Processing – Pending Review",
    review: "In Review",
    approved: "Approved – Letter Pending",
    completed: "Completed – Letter Sent",
    letter_sent: "Completed – Letter Sent",
    cancelled: "Cancelled",
    refunded: "Refunded",
  };
  if (order.refunded_at) return "Refunded";
  if (order.dispute_id) return "Disputed";
  return map[status] ?? status;
}

function deriveTrafficSource(order: Record<string, unknown>): string {
  const referred = ((order.referred_by as string) ?? "").toLowerCase();
  if (referred.includes("google")) return "Google";
  if (referred.includes("facebook") || referred.includes("instagram")) return "Facebook";
  if (referred.includes("tiktok")) return "TikTok";
  if (referred.includes("seo") || referred.includes("organic")) return "SEO";
  if (referred) return referred;
  return "Direct / Unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all orders (no limit — admin tool)
    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        "confirmation_id, first_name, last_name, email, phone, state, letter_type, status, payment_intent_id, refunded_at, dispute_id, referred_by, created_at, subscription_id"
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (orders ?? []).map((o: Record<string, unknown>) => ({
      timestamp: o.created_at
        ? new Date(o.created_at as string).toLocaleString("en-US", { timeZone: "America/Chicago" })
        : "",
      confirmationId: o.confirmation_id ?? "",
      firstName: o.first_name ?? "",
      lastName: o.last_name ?? "",
      email: o.email ?? "",
      phone: o.phone ?? "",
      state: o.state ?? "",
      letterType: (o.letter_type as string) ?? "ESA",
      orderStatus: deriveOrderStatus(o),
      paymentStatus: derivePaymentStatus(o),
      landingUrl: "",
      trafficSource: deriveTrafficSource(o),
    }));

    // Send to Google Apps Script as full_sync
    const res = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: SHEETS_SECRET,
        action: "full_sync",
        rows,
      }),
    });

    const responseText = await res.text();
    let parsed: Record<string, unknown> = { ok: true };
    try { parsed = JSON.parse(responseText); } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ ok: true, synced: rows.length, sheetsResponse: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
