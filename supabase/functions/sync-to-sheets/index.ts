import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Secrets loaded from Supabase Edge Function secrets (never hardcoded) ──
const GOOGLE_SHEETS_WEBHOOK_URL = Deno.env.get("GOOGLE_SHEETS_WEBHOOK_URL") ?? "";
const SHEETS_SECRET = Deno.env.get("SHEETS_SECRET") ?? "";

// ── Sheet name — must match exactly what's in your Google Sheet tab ──
const SHEET_NAME = "PawTenant Leads";

/**
 * Canonical ordered column list — sent with every sync so the Apps Script
 * can keep the sheet header row in sync automatically.
 */
const COLUMNS: string[] = [
  "timestamp",
  "confirmation_id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "state",
  "letter_type",
  "order_status",
  "payment_status",
  "order_amount",
  "channel",
  "source_detail",
  "traffic_source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "referrer",
  "referred_by",
  "landing_url",
  "attribution_json",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function derivePaymentStatus(o: Record<string, unknown>): string {
  if (o.refunded_at) return "Refunded";
  if (o.dispute_id) return "Disputed";
  const status = str(o.status);
  if (["processing", "completed", "letter_sent", "review", "approved"].includes(status) && o.payment_intent_id)
    return "Paid";
  if (status === "cancelled") return "Cancelled";
  if (status === "lead") return "Unpaid";
  if (o.payment_intent_id) return "Paid";
  return "Unpaid";
}

function deriveOrderStatus(o: Record<string, unknown>): string {
  const status = str(o.status);
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
  if (o.refunded_at) return "Refunded";
  if (o.dispute_id) return "Disputed";
  return map[status] ?? status;
}

function deriveTrafficSource(o: Record<string, unknown>): string {
  const utmSrc = str(o.utm_source).toLowerCase();
  const utmMed = str(o.utm_medium).toLowerCase();
  const gclid = str(o.gclid);
  const fbclid = str(o.fbclid);
  const referred = str(o.referred_by).toLowerCase();

  if (gclid) return "Google Ads";
  if (utmSrc === "google" && ["cpc", "paid", "ppc", "paidsearch"].includes(utmMed)) return "Google Ads";
  if (fbclid) return "Facebook / Instagram";
  if (utmSrc === "facebook") return "Facebook";
  if (utmSrc === "instagram") return "Instagram";
  if (utmSrc === "tiktok") return "TikTok";
  if (utmSrc === "google" || utmMed === "organic") return "Google Organic";

  if (referred.includes("google")) return "Google";
  if (referred.includes("tiktok")) return "TikTok";
  if (referred.includes("facebook") || referred.includes("instagram")) return "Facebook";
  if (referred.includes("seo") || referred.includes("organic")) return "Google Organic";
  if (referred) return referred;

  return "Direct / Unknown";
}

function deriveChannel(o: Record<string, unknown>): string {
  const utmSrc = str(o.utm_source).toLowerCase();
  const utmMed = str(o.utm_medium).toLowerCase();
  const gclid = str(o.gclid);
  const fbclid = str(o.fbclid);

  if (gclid) return "Google Ads";
  if (utmSrc === "google" && ["cpc", "paid", "ppc", "paidsearch"].includes(utmMed)) return "Google Ads";
  if (fbclid && utmSrc === "instagram") return "Instagram";
  if (fbclid) return "Facebook / Instagram";
  if (utmSrc === "facebook") return "Facebook";
  if (utmSrc === "instagram") return "Instagram";
  if (utmSrc === "tiktok") return "TikTok";
  if (utmSrc === "google" && (utmMed === "organic" || utmMed === "")) return "Google Organic";
  if (utmMed === "organic") return "Google Organic";

  const attrJson = o.attribution_json as Record<string, unknown> | null;
  const referrer = str(attrJson?.referrer ?? "");
  if (referrer && !referrer.includes("getpetsa") && !referrer.includes("localhost")) return "Referral";

  return "Direct / Unknown";
}

function deriveSourceDetail(o: Record<string, unknown>): string {
  const utmSrc = str(o.utm_source);
  const utmMed = str(o.utm_medium);
  const utmCmp = str(o.utm_campaign);
  const gclid = str(o.gclid);
  const fbclid = str(o.fbclid);

  const parts: string[] = [];
  if (utmSrc) parts.push(utmSrc);
  if (utmMed) parts.push(utmMed);
  if (utmCmp) parts.push(utmCmp);
  if (parts.length > 0) return parts.join(" / ");
  if (gclid) return "Google Ads (gclid)";
  if (fbclid) return "Facebook / Instagram (fbclid)";

  const referred = str(o.referred_by);
  if (referred) return referred;

  return "";
}

// ─── Row builder ─────────────────────────────────────────────────────────────

function buildRow(o: Record<string, unknown>): Record<string, string> {
  const attrJson = o.attribution_json as Record<string, unknown> | null;
  const referrer = str(attrJson?.referrer ?? "");

  // price is stored in dollars as an integer in the orders table
  const rawPrice = o.price as number | null;
  const orderAmount = rawPrice != null && rawPrice > 0 ? `$${Number(rawPrice).toFixed(2)}` : "";

  return {
    timestamp: o.created_at
      ? new Date(o.created_at as string).toLocaleString("en-US", { timeZone: "America/Chicago" })
      : "",
    confirmation_id: str(o.confirmation_id),
    first_name: str(o.first_name),
    last_name: str(o.last_name),
    email: str(o.email),
    phone: str(o.phone),
    state: str(o.state),
    letter_type: str(o.letter_type) || "ESA",
    order_status: deriveOrderStatus(o),
    payment_status: derivePaymentStatus(o),
    order_amount: orderAmount,

    channel: deriveChannel(o),
    source_detail: deriveSourceDetail(o),
    traffic_source: deriveTrafficSource(o),

    utm_source: str(o.utm_source),
    utm_medium: str(o.utm_medium),
    utm_campaign: str(o.utm_campaign),
    utm_term: str(o.utm_term),
    utm_content: str(o.utm_content),

    gclid: str(o.gclid),
    fbclid: str(o.fbclid),

    referrer,
    referred_by: str(o.referred_by),
    landing_url: str(o.landing_url),
    attribution_json: attrJson ? JSON.stringify(attrJson) : "",
  };
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Guard: fail fast if secrets are not configured
  if (!GOOGLE_SHEETS_WEBHOOK_URL || !SHEETS_SECRET) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing GOOGLE_SHEETS_WEBHOOK_URL or SHEETS_SECRET secret. Set them in Supabase Edge Function secrets." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: orders, error } = await supabase
      .from("orders")
      .select(
        `confirmation_id, first_name, last_name, email, phone, state,
         letter_type, status, payment_intent_id, refunded_at, dispute_id,
         referred_by, created_at, subscription_id, price,
         gclid, fbclid,
         utm_source, utm_medium, utm_campaign, utm_term, utm_content,
         landing_url, attribution_json`
      )
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const rows = (orders ?? []).map((o: Record<string, unknown>) => buildRow(o));

    const res = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: SHEETS_SECRET,
        action: "full_sync",
        sheetName: SHEET_NAME,
        columns: COLUMNS,
        rows,
      }),
    });

    const responseText = await res.text();
    let parsed: Record<string, unknown> = { ok: true };
    try { parsed = JSON.parse(responseText); } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ ok: true, synced: rows.length, columns: COLUMNS.length, sheetName: SHEET_NAME, sheetsResponse: parsed }),
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
