import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ── Rate limiter: max 10 requests per IP per 60s window ───────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Periodic GC for rate limit map
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 120_000);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Strict allowlist of fields that may be returned to the public ─────────────
// provider_phone and provider_email are intentionally excluded.
// No patient name, email, diagnosis, or any PHI is ever included.
const PUBLIC_ALLOWED_FIELDS = new Set([
  "found",
  "status",
  "letter_id",
  "issued_at",
  "expires_at",
  "state",
  "letter_type",
  "provider_name",
  "provider_title",
  "provider_npi",
  "provider_license",
  "provider_state_licenses",
  "message",
]);

type PublicVerifyResult = {
  found: boolean;
  status?: "valid" | "revoked" | "expired" | "not_found" | "rate_limited";
  letter_id?: string;
  issued_at?: string;
  expires_at?: string | null;
  state?: string;
  letter_type?: string;
  provider_name?: string | null;
  provider_title?: string | null;
  provider_npi?: string | null;
  provider_license?: string | null;
  provider_state_licenses?: Record<string, string> | null;
  message?: string;
};

/**
 * Strips any field not in PUBLIC_ALLOWED_FIELDS from the RPC result.
 * This is a defence-in-depth measure — the RPC itself no longer returns
 * phone/email, but this ensures nothing leaks even if the RPC is ever
 * modified without updating this function.
 */
function applyAllowlist(raw: Record<string, unknown>): PublicVerifyResult {
  const safe: Record<string, unknown> = {};
  for (const key of PUBLIC_ALLOWED_FIELDS) {
    if (key in raw) safe[key] = raw[key];
  }
  return safe as PublicVerifyResult;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";

  // Rate limit check
  if (!checkRateLimit(ip)) {
    return new Response(
      JSON.stringify({ found: false, status: "rate_limited", message: "Too many requests. Please try again in a moment." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let letterId = "";
  try {
    const body = await req.json() as { letter_id?: string };
    letterId = (body.letter_id ?? "").trim().toUpperCase();
  } catch {
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: "Verification ID not found." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!letterId) {
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: "Verification ID not found." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Call the secure RPC
  const { data, error } = await supabase.rpc("verify_letter_id", { p_letter_id: letterId });

  if (error) {
    console.error("[verify-letter] RPC error:", error.message);
    return new Response(
      JSON.stringify({ found: false, status: "not_found", message: "Verification ID not found." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Apply strict allowlist — strips any field not explicitly permitted
  const result = applyAllowlist(data as Record<string, unknown>);

  // Audit log — no PHI, just letter_id + outcome + masked IP
  try {
    const ipMasked = ip === "unknown" ? "unknown" : ip.replace(/\.\d+$/, ".xxx");
    await supabase.from("audit_logs").insert({
      action: "landlord_verification_lookup",
      entity_type: "letter_verification",
      entity_id: letterId,
      performed_by: null,
      details: {
        letter_id: letterId,
        result: result.found ? (result.status ?? "found") : "not_found",
        ip_masked: ipMasked,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Logging is best-effort — never block the response
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
