// issue-resume-token
//
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001
//
// Mints an expiring, order-bound, purpose-bound, environment-bound resume
// credential and returns the RAW token exactly once, to the SERVER-SIDE caller
// that is about to put it in an email/SMS link. The raw token is never stored,
// never logged, and never returned to a browser.
//
// Authorization: service-role capability ONLY, proven by CAPABILITY PROBE — we
// attempt a read that only service_role can perform. We deliberately do NOT
// compare the bearer against SUPABASE_SERVICE_ROLE_KEY: this project has both a
// legacy JWT and an `sb_secret_` style key in play, so a string compare is
// unreliable and would fail open or closed unpredictably.
//
// verify_jwt=true.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Bound into every token row so a TEST credential can never satisfy LIVE.
const TOKEN_ENVIRONMENT = (Deno.env.get("RESUME_TOKEN_ENVIRONMENT") ?? "test").toLowerCase();

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

/** Truncated reference for logs. A full confirmation id is never logged. */
function logRef(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  return s ? `${s.slice(0, 6)}…` : "(none)";
}

/**
 * 256 bits from a cryptographically secure source, base64url encoded.
 * NEVER Math.random, never a UUID, never derived from order data.
 */
function mintRawToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `rt_${b64}`;
}

/** sha256 hex of the raw token — the ONLY form that ever reaches the database. */
async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Capability probe: only service_role can read order_resume_tokens (RLS is on
 * with zero policies and every grant is revoked). A caller that can read it has
 * service-role capability; anyone else cannot, whatever their bearer looks like.
 */
async function callerHasServiceRole(authHeader: string): Promise<boolean> {
  if (!authHeader) return false;
  try {
    const probe = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { error } = await probe.from("order_resume_tokens").select("id", { head: true, count: "exact" });
    return !error;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!(await callerHasServiceRole(authHeader))) {
      // Generic — never reveals whether the order exists.
      return json({ ok: false, code: "forbidden" }, 403);
    }

    const body = await req.json() as {
      confirmationId?: string;
      purpose?: string;
      ttlMinutes?: number;
      createdBy?: string;
    };

    const confirmationId = (body.confirmationId ?? "").trim();
    const purpose = (body.purpose ?? "resume_checkout").trim();
    if (!confirmationId) return json({ ok: false, code: "invalid_request" }, 400);
    if (purpose !== "resume_checkout" && purpose !== "resume_assessment") {
      return json({ ok: false, code: "invalid_request" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (!order) {
      // Same generic shape as a non-resumable order — no existence oracle.
      return json({ ok: false, code: "not_issuable" }, 200);
    }

    const rawToken = mintRawToken();
    const tokenHash = await sha256Hex(rawToken);

    const { data: issued, error: issueErr } = await admin.rpc("issue_order_resume_token", {
      p_order_id: order.id,
      p_purpose: purpose,
      p_token_hash: tokenHash,
      p_environment: TOKEN_ENVIRONMENT,
      p_ttl_minutes: body.ttlMinutes ?? 1440, // default 24 h; RPC clamps to <= 72 h
      p_created_by: (body.createdBy ?? "system").slice(0, 64),
    });

    if (issueErr || !issued || (Array.isArray(issued) && issued.length === 0)) {
      // Order completed / cancelled / refunded / already paid → fail closed.
      console.warn(`[issue-resume-token] not issuable for ${logRef(confirmationId)}`);
      return json({ ok: false, code: "not_issuable" }, 200);
    }

    const row = Array.isArray(issued) ? issued[0] : issued;

    // The RAW token is returned to the server-side caller exactly once and is
    // NOT logged here or anywhere else.
    return json({
      ok: true,
      token: rawToken,
      expiresAt: row.expires_at,
      purpose,
    });
  } catch (err) {
    console.error("[issue-resume-token] error:", err instanceof Error ? err.name : "unknown");
    return json({ ok: false, code: "error" }, 500);
  }
});
