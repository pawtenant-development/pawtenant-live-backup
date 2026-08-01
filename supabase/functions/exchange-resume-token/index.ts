// exchange-resume-token
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001
//
// Exchanges a raw resume token for the MINIMUM context needed to resume that
// one order. The customer clicking a link in their own mailbox is anonymous, so
// this runs with verify_jwt=false — possession of the token IS the factor, and
// it is only ever delivered to the email/phone already on the order.
//
// Why that is a real credential and a confirmation id is not:
//   • 256 bits of CSPRNG entropy vs a short human-readable reference;
//   • single-use, so a replayed link is inert;
//   • expiring (<= 72 h, 24 h default);
//   • revocable, and superseded automatically when a newer link is issued;
//   • bound to ONE order, ONE purpose and ONE environment;
//   • stored only as sha256(raw) — a database leak yields no usable link.
//
// PURPOSE-SCOPED RELEASE. `resume_checkout` (what every recovery email uses)
// deliberately does NOT return assessment_answers: finishing payment never
// needs the medical intake. Only `resume_assessment` releases it.
//
// The raw token is never logged, never written to audit_logs, and never echoed
// back in the response.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientIp, consumeRateLimit, RESUME_SUBJECT_LIMITS } from "../_shared/rateLimit.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN_ENVIRONMENT = (Deno.env.get("RESUME_TOKEN_ENVIRONMENT") ?? "test").toLowerCase();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  // Belt and braces: even though the token arrives in a POST body by the time it
  // reaches us, make sure nothing downstream forwards a full URL to third parties.
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Every failure returns this identical body. Expired, revoked, already-used,
 * malformed, wrong-order, wrong-purpose, wrong-environment and simply-unknown
 * all look the same, so the endpoint answers no questions about what exists.
 */
function invalid(): Response {
  return json({ ok: false, code: "invalid_or_expired" }, 200);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as { token?: string; purpose?: string };
    const rawToken = (body.token ?? "").trim();
    const purpose = (body.purpose ?? "resume_checkout").trim();

    // Shape check only — never log or echo the value.
    if (!rawToken || rawToken.length < 20 || rawToken.length > 200) return invalid();
    if (purpose !== "resume_checkout" && purpose !== "resume_assessment") return invalid();

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const tokenHash = await sha256Hex(rawToken);

    // ── Rate limit (§I) ──────────────────────────────────────────────────
    // Two buckets: the caller's IP, and the token DIGEST (never the raw
    // token — the digest is already the only form the database ever sees).
    // A throttled caller gets the IDENTICAL `invalid_or_expired` body as every
    // other failure, so throttling is not an oracle either.
    const ipAllowed = await consumeRateLimit(admin, "exchange", clientIp(req));
    const tokenAllowed = await consumeRateLimit(
      admin, "exchange", tokenHash, RESUME_SUBJECT_LIMITS.perToken);
    if (!ipAllowed || !tokenAllowed) return invalid();

    // ATOMIC single-use consume. The RPC is one UPDATE ... WHERE used_at IS NULL,
    // so under concurrency exactly one caller can ever win the row.
    const { data: consumed, error: consumeErr } = await admin.rpc("consume_order_resume_token", {
      p_token_hash: tokenHash,
      p_purpose: purpose,
      p_environment: TOKEN_ENVIRONMENT,
    });

    if (consumeErr) {
      console.error("[exchange-resume-token] consume failed:", consumeErr.code ?? "unknown");
      return invalid();
    }
    const row = Array.isArray(consumed) ? consumed[0] : consumed;
    if (!row?.order_id) return invalid();

    // ── Purpose-scoped projection. Built by hand; never spread the order row. ──
    const baseCols =
      "confirmation_id, first_name, last_name, email, phone, state, delivery_speed, price, status, plan_type, letter_type, package_key, billing_plan, paid_at";
    const cols = purpose === "resume_assessment" ? `${baseCols}, assessment_answers` : baseCols;

    const { data: order } = await admin
      .from("orders").select(cols).eq("id", row.order_id).maybeSingle();

    if (!order) return invalid();

    const o = order as Record<string, unknown>;

    const resume: Record<string, unknown> = {
      // Display reference only — never a credential.
      confirmationId: o.confirmation_id ?? null,
      status: o.status ?? null,
      alreadyPaid: !!o.paid_at,
      // Needed to render and price the correct unfinished checkout step.
      letterType: o.letter_type ?? null,
      packageKey: o.package_key ?? null,
      billingPlan: o.billing_plan ?? null,
      deliverySpeed: o.delivery_speed ?? null,
      price: o.price ?? null,
      planType: o.plan_type ?? null,
      state: o.state ?? null,
      // Contact prefill for the customer's own checkout form.
      firstName: o.first_name ?? null,
      lastName: o.last_name ?? null,
      email: o.email ?? null,
      phone: o.phone ?? null,
    };

    // Medical intake is released ONLY for an assessment resume.
    if (purpose === "resume_assessment") {
      resume.assessmentAnswers = o.assessment_answers ?? null;
    }

    // Deliberately never returned: payment_intent_id, checkout_session_id,
    // subscription id, provider/doctor fields, letter_url, internal notes,
    // audit data, coupon internals, order UUID.
    return json({ ok: true, purpose, resume });
  } catch (err) {
    console.error("[exchange-resume-token] error:", err instanceof Error ? err.name : "unknown");
    return invalid();
  }
});
